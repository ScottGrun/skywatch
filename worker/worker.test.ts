import { describe, expect, it, vi } from 'vitest'
import { createOpenSkyClient, mapStates, roundBbox, TOKEN_URL } from './opensky.ts'
import { createAdsbdb, mapAircraft, mapRoute } from './adsbdb.ts'

const BBOX = { lamin: 47.69, lomin: -125.18, lamax: 50.71, lomax: -121.18 }
const row = (over: Record<number, unknown> = {}) => {
  const r: unknown[] = new Array(17).fill(null)
  Object.assign(r, {
    0: 'ABC123',
    1: 'ACA123  ',
    5: -123,
    6: 49,
    7: 1000,
    8: false,
    9: 100,
    10: 90,
    11: 2,
  })
  Object.assign(r, over)
  return r
}
const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers })

describe('mapStates', () => {
  it('maps fields, trims callsign, skips rows without position, falls back to geo alt', () => {
    const out = mapStates({
      time: 5,
      states: [row(), row({ 5: null }), row({ 0: 'def456', 7: null, 13: 777 })],
    })
    expect(out.time).toBe(5)
    expect(out.states).toHaveLength(2)
    expect(out.states[0]).toEqual({
      icao24: 'abc123',
      callsign: 'ACA123',
      lat: 49,
      lon: -123,
      altM: 1000,
      velMs: 100,
      track: 90,
      vrMs: 2,
      onGround: false,
    })
    expect(out.states[1].altM).toBe(777)
  })
  it('handles null states', () => {
    expect(mapStates({ time: 1, states: null }).states).toEqual([])
  })
})

describe('roundBbox', () => {
  it('rounds outward to 0.1', () => {
    expect(roundBbox({ lamin: 47.69, lomin: -125.18, lamax: 50.71, lomax: -121.18 })).toEqual({
      lamin: 47.6,
      lomin: -125.2,
      lamax: 50.8,
      lomax: -121.1,
    })
  })
})

describe('opensky client', () => {
  it('caches for ttl then refetches', async () => {
    let t = 0
    const f = vi.fn(async () => ok({ time: 1, states: [row()] }))
    const c = createOpenSkyClient({ fetch: f, now: () => t })
    const a = await c.getStates(BBOX)
    expect(a.status).toBe(200)
    expect((a.body as { pollMs: number }).pollMs).toBe(10000)
    await c.getStates(BBOX)
    expect(f).toHaveBeenCalledTimes(1)
    t = 9000
    await c.getStates(BBOX)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('on 429 serves stale and backs off using the header', async () => {
    let t = 0
    let n = 0
    const f = vi.fn(async () => {
      n++
      if (n === 1) return ok({ time: 1, states: [row()] })
      return new Response('', {
        status: 429,
        headers: { 'X-Rate-Limit-Retry-After-Seconds': '30' },
      })
    })
    const c = createOpenSkyClient({ fetch: f, now: () => t })
    await c.getStates(BBOX)
    t = 9000
    const r = await c.getStates(BBOX)
    expect(r.stale).toBe(true)
    expect(r.status).toBe(200)
    expect(f).toHaveBeenCalledTimes(2)
    t = 20000 // still inside backoff, no upstream call
    const r2 = await c.getStates(BBOX)
    expect(r2.stale).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
    t = 40000 // backoff over
    n = 0
    const r3 = await c.getStates(BBOX)
    expect(r3.stale).toBe(false)
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('returns 503 on 429 with nothing cached', async () => {
    const f = vi.fn(async () => new Response('', { status: 429 }))
    const c = createOpenSkyClient({ fetch: f, now: () => 0 })
    expect((await c.getStates(BBOX)).status).toBe(503)
  })

  it('uses OAuth bearer token and caches it until expiry', async () => {
    let t = 0
    const f = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === TOKEN_URL) return ok({ access_token: 'tok', expires_in: 300 })
      return ok({ time: 1, states: [] })
    })
    const c = createOpenSkyClient({ fetch: f, now: () => t, clientId: 'id', clientSecret: 's' })
    expect(c.pollMs).toBe(5000)
    await c.getStates(BBOX)
    t = 9000
    await c.getStates(BBOX)
    const tokenCalls = f.mock.calls.filter((c) => c[0] === TOKEN_URL)
    expect(tokenCalls).toHaveLength(1)
    const stateCall = f.mock.calls.find((c) => c[0] !== TOKEN_URL)!
    expect(stateCall[1]!.headers).toEqual({ authorization: 'Bearer tok' })
    t = 400_000
    await c.getStates(BBOX)
    expect(f.mock.calls.filter((c) => c[0] === TOKEN_URL)).toHaveLength(2)
  })
})

describe('adsbdb', () => {
  it('maps aircraft and route, tolerating unknowns', () => {
    expect(
      mapAircraft({
        response: {
          aircraft: { icao_type: 'A320', registered_owner: 'Air Canada', registration: 'C-FABC' },
        },
      }),
    ).toEqual({ typeCode: 'A320', operator: 'Air Canada', registration: 'C-FABC' })
    expect(mapAircraft({ response: 'unknown aircraft' })).toEqual({
      typeCode: '',
      operator: '',
      registration: '',
    })
    expect(
      mapRoute({
        response: {
          flightroute: {
            origin: { iata_code: 'YVR', icao_code: 'CYVR' },
            destination: { iata_code: 'LAX', icao_code: 'KLAX' },
          },
        },
      }),
    ).toEqual({ origin: { iata: 'YVR', icao: 'CYVR' }, dest: { iata: 'LAX', icao: 'KLAX' } })
    expect(mapRoute({ response: 'unknown callsign' })).toEqual({ origin: null, dest: null })
  })

  it('caches results and treats 404 as empty', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 404 }))
    const a = createAdsbdb({ fetch: f, now: () => 0 })
    expect(await a.aircraft('abc123')).toEqual({ typeCode: '', operator: '', registration: '' })
    await a.aircraft('abc123')
    expect(f).toHaveBeenCalledTimes(1)
    expect(await a.route('ACA1')).toEqual({ origin: null, dest: null })
  })
})
