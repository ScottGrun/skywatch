import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTraffic } from './traffic.ts'
import type { Airport } from '../types.ts'

const AP: Airport = {
  icao: 'CYVR',
  iata: 'YVR',
  name: 'Vancouver',
  city: 'Vancouver',
  country: 'CA',
  lat: 49.19,
  lon: -123.18,
  elevationFt: 14,
  runways: [],
}
const state = (over = {}) => ({
  icao24: 'abc123',
  callsign: 'ACA123',
  lat: 49.4,
  lon: -123.18,
  altM: 3048,
  velMs: 100,
  track: 180,
  vrMs: -5,
  onGround: false,
  ...over,
})
const json = (b: unknown, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: 200, headers: h })

function makeFetch(opts: { states: () => unknown[]; fail?: () => boolean; stale?: () => boolean }) {
  const fn = vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    if (u.startsWith('/api/states')) {
      if (opts.fail?.()) return new Response('', { status: 503 })
      return json(
        { time: 1, states: opts.states(), pollMs: 10000 },
        opts.stale?.() ? { 'x-stale': '1' } : {},
      )
    }
    if (u.startsWith('/api/aircraft/'))
      return json({ typeCode: 'B789', operator: 'Some Lessor', registration: 'C-X' })
    if (u.startsWith('/api/route/'))
      return json({ origin: { iata: 'NRT', icao: 'RJAA' }, dest: { iata: 'YVR', icao: 'CYVR' } })
    return new Response('', { status: 404 })
  })
  return fn as unknown as typeof fetch & typeof fn
}

describe('createTraffic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it('polls the bbox, converts units, derives fields, enriches', async () => {
    const f = makeFetch({ states: () => [state()] })
    const t = createTraffic(AP, { fetch: f })
    expect(t.status()).toBe('connecting')
    await vi.advanceTimersByTimeAsync(10)
    expect(t.status()).toBe('live')
    const url = String(f.mock.calls[0][0])
    expect(url).toContain('lamin=47.69')
    expect(url).toContain('lomax=-121.18')
    await vi.advanceTimersByTimeAsync(10) // let enrichment resolve
    const [a] = t.snapshot(Date.now())
    expect(a.id).toBe('abc123')
    expect(a.altFt).toBeCloseTo(10000, -1)
    expect(a.gsKt).toBeCloseTo(194.4, 0)
    expect(a.vsFpm).toBeCloseTo(-984, 0)
    expect(a.typeCode).toBe('B789')
    expect(a.aircraftClass).toBe('wide')
    expect(a.airline).toBe('Air Canada')
    expect(a.origin).toBe('NRT')
    expect(a.dest).toBe('YVR')
    expect(a.category).toBe('ARR')
    expect(a.n).toBeGreaterThan(20)
    expect(a.distNm).toBeGreaterThan(10)
    // dead reckoning moves it south (toward the airport) over time
    const later = t.snapshot(Date.now() + 5000)[0]
    expect(later.n).toBeLessThan(a.n)
    t.dispose()
  })

  it('removes aircraft after 60 s without updates', async () => {
    let on = true
    const f = makeFetch({ states: () => (on ? [state()] : []) })
    const t = createTraffic(AP, { fetch: f })
    await vi.advanceTimersByTimeAsync(10)
    expect(t.snapshot(Date.now())).toHaveLength(1)
    on = false
    await vi.advanceTimersByTimeAsync(30_000)
    expect(t.snapshot(Date.now())).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(40_000)
    expect(t.snapshot(Date.now())).toHaveLength(0)
    t.dispose()
  })

  it('goes offline after 3 failures and recovers; reports delayed on x-stale', async () => {
    let fail = false
    let stale = false
    const f = makeFetch({ states: () => [state()], fail: () => fail, stale: () => stale })
    const t = createTraffic(AP, { fetch: f })
    const seen: string[] = []
    t.subscribeStatus((s) => seen.push(s))
    await vi.advanceTimersByTimeAsync(10)
    stale = true
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.status()).toBe('delayed')
    stale = false
    fail = true
    await vi.advanceTimersByTimeAsync(300_000)
    expect(t.status()).toBe('offline')
    fail = false
    await vi.advanceTimersByTimeAsync(120_000)
    expect(t.status()).toBe('live')
    expect(seen).toEqual(['live', 'delayed', 'offline', 'live'])
    t.dispose()
  })

  it('stops polling after dispose', async () => {
    const f = makeFetch({ states: () => [] })
    const t = createTraffic(AP, { fetch: f })
    await vi.advanceTimersByTimeAsync(10)
    t.dispose()
    const n = f.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.mock.calls.length).toBe(n)
  })
})
