import { describe, expect, it, vi } from 'vitest'
import {
  createRouteStore,
  FOUND_TTL_MS,
  isAirlineCallsign,
  MISSING_TTL_MS,
  ROUTE_STORE_KEY,
} from './routeStore.ts'
import { createEnricher } from './enrich.ts'

function mem(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  } as Storage
}

describe('isAirlineCallsign', () => {
  it('accepts ICAO airline flight ids', () => {
    for (const c of ['UAL123', 'dlh4ab', ' BAW9 ', 'SWA1234', 'EZY12AB'])
      expect(isAirlineCallsign(c)).toBe(true)
  })
  it('rejects N-numbers, registrations, blanks and odd shapes', () => {
    for (const c of [
      'N123AB',
      'N1',
      'C-GABC',
      'GABCD',
      '',
      '   ',
      'UA123',
      'UALABC',
      'UAL12345678',
    ])
      expect(isAirlineCallsign(c)).toBe(false)
  })
})

describe('route store', () => {
  it('expires found routes after 6 h and missing after 30 min', () => {
    let t = 0
    const s = createRouteStore(null, () => t)
    s.set('UAL1', { origin: 'SFO', dest: 'SEA' })
    s.set('UAL2', { origin: '', dest: '' })
    t = MISSING_TTL_MS + 1
    expect(s.get('UAL1')).toEqual({ origin: 'SFO', dest: 'SEA' })
    expect(s.get('UAL2')).toBeUndefined()
    t = FOUND_TTL_MS + 1
    expect(s.get('UAL1')).toBeUndefined()
  })
  it('evicts least recently used beyond the bound', () => {
    const s = createRouteStore(null, () => 0, 3)
    for (const c of ['A', 'B', 'C']) s.set(c, { origin: 'X', dest: 'Y' })
    s.get('A') // refresh A, so B is oldest
    s.set('D', { origin: 'X', dest: 'Y' })
    expect(s.get('B')).toBeUndefined()
    expect(s.get('A')).toBeDefined()
    expect(s.get('D')).toBeDefined()
  })
  it('persists, reloads, drops expired rows and survives corrupt/throwing storage', () => {
    const st = mem()
    let t = 0
    const a = createRouteStore(st, () => t)
    a.set('UAL1', { origin: 'SFO', dest: 'SEA' })
    a.set('UAL2', { origin: '', dest: '' })
    a.flush()
    t = MISSING_TTL_MS + 1
    const b = createRouteStore(st, () => t)
    expect(b.get('UAL1')).toEqual({ origin: 'SFO', dest: 'SEA' })
    expect(b.get('UAL2')).toBeUndefined()
    st.setItem(ROUTE_STORE_KEY, '{bad')
    expect(() => createRouteStore(st).get('x')).not.toThrow()
    const bad = {
      getItem: () => {
        throw new Error('x')
      },
      setItem: () => {
        throw new Error('x')
      },
    }
    const c = createRouteStore(bad)
    c.set('UAL1', { origin: 'A', dest: 'B' })
    expect(() => c.flush()).not.toThrow()
  })
})

describe('enricher with route store', () => {
  it('skips the network for stored and non-airline callsigns', async () => {
    const store = createRouteStore(null)
    store.set('UAL1', { origin: 'SFO', dest: 'SEA' })
    const f = vi.fn(
      async () => new Response(JSON.stringify({ origin: { iata: 'LAX' }, dest: { iata: 'JFK' } })),
    )
    const e = createEnricher(f as unknown as typeof fetch, Date.now, undefined, store)
    e.request('aaaaaa', 'UAL1')
    e.request('bbbbbb', 'N123AB')
    expect(e.route('UAL1')).toEqual({ origin: 'SFO', dest: 'SEA' })
    await vi.waitFor(() => expect(f).toHaveBeenCalled())
    expect(
      f.mock.calls.map((c) => (c as unknown[])[0]).some((u) => String(u).includes('/api/route')),
    ).toBe(false)
    e.request('cccccc', 'DAL9')
    await vi.waitFor(() => expect(e.route('DAL9')).toEqual({ origin: 'LAX', dest: 'JFK' }))
    expect(store.get('DAL9')).toEqual({ origin: 'LAX', dest: 'JFK' })
    e.dispose()
  })
})
