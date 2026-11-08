import { describe, expect, it, vi } from 'vitest'
import {
  bboxToCircle,
  createAdsbLolClient,
  mapAdsbAircraft,
  mapAdsbStates,
  MAX_RADIUS_NM,
} from './adsblol.ts'
import { createTraceClient, mergeTraces, parseTrace } from './trace.ts'

const BBOX = { lamin: 47.7, lomin: -125.2, lamax: 50.7, lomax: -121.2 }
const ac = (over: Record<string, unknown> = {}) => ({
  hex: 'C05EDD',
  flight: 'ACA221  ',
  r: 'c-gjya',
  t: 'bcs3',
  category: 'A3',
  alt_baro: 4050,
  gs: 183.2,
  track: 238.39,
  baro_rate: -800,
  lat: 49.3,
  lon: -123.4,
  seen_pos: 0.1,
  ...over,
})
const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers })

describe('bboxToCircle', () => {
  it('centers on the box and covers its corners', () => {
    const c = bboxToCircle({ lamin: 47.69, lomin: -125.18, lamax: 50.69, lomax: -121.18 })
    expect(c.lat).toBeCloseTo(49.19, 5)
    expect(c.lon).toBeCloseTo(-123.18, 5)
    // half-diagonal: 90 NM north-south, ~78 NM east-west at 49N
    expect(c.distNm).toBeGreaterThanOrEqual(119)
    expect(c.distNm).toBeLessThanOrEqual(122)
  })
  it('caps at the API maximum', () => {
    expect(bboxToCircle({ lamin: 30, lomin: -130, lamax: 60, lomax: -100 }).distNm).toBe(
      MAX_RADIUS_NM,
    )
  })
})

describe('mapAdsbAircraft', () => {
  it('converts units and passes type, registration, category through', () => {
    const s = mapAdsbAircraft(ac())!
    expect(s).toMatchObject({
      icao24: 'c05edd',
      callsign: 'ACA221',
      lat: 49.3,
      lon: -123.4,
      track: 238.39,
      onGround: false,
      category: 'A3',
      t: 'BCS3',
      r: 'C-GJYA',
    })
    expect(s.altM).toBeCloseTo(4050 / 3.28084, 1)
    expect(s.velMs).toBeCloseTo(183.2 / 1.943844, 1)
    expect(s.vrMs).toBeCloseTo(-800 / 196.85, 1)
  })
  it('handles ground, ~ hex, heading and rate fallbacks', () => {
    const s = mapAdsbAircraft(
      ac({
        hex: '~abc123',
        alt_baro: 'ground',
        track: undefined,
        true_heading: 90,
        baro_rate: undefined,
        geom_rate: 300,
      }),
    )!
    expect(s.icao24).toBe('abc123')
    expect(s.onGround).toBe(true)
    expect(s.altM).toBe(0)
    expect(s.track).toBe(90)
    expect(s.vrMs).toBeCloseTo(300 / 196.85, 1)
    expect(mapAdsbAircraft(ac({ track: undefined, mag_heading: 45 }))!.track).toBe(45)
  })
  it('drops no-position, stale and malformed entries; omits empty optionals', () => {
    expect(mapAdsbAircraft(ac({ lat: undefined }))).toBeNull()
    expect(mapAdsbAircraft(ac({ seen_pos: 61 }))).toBeNull()
    expect(mapAdsbAircraft(ac({ hex: 'zz' }))).toBeNull()
    const s = mapAdsbAircraft(
      ac({ t: undefined, r: undefined, category: undefined, flight: undefined }),
    )!
    expect(s).not.toHaveProperty('t')
    expect(s).not.toHaveProperty('r')
    expect(s).not.toHaveProperty('category')
    expect(s.callsign).toBe('')
  })
  it('mapAdsbStates filters to the bbox and tags the source', () => {
    const b = mapAdsbStates({ now: 5000, ac: [ac(), ac({ hex: 'aaaaaa', lat: 10 })] }, BBOX, 0)
    expect(b.states).toHaveLength(1)
    expect(b).toMatchObject({ time: 5, pollMs: 8000, source: 'adsblol' })
  })
})

describe('adsb.lol client', () => {
  it('calls the point endpoint with a User-Agent and caches ~4 s', async () => {
    let t = 0
    const f = vi.fn(async (_u: string, _i?: RequestInit) => ok({ ac: [ac()] }))
    const c = createAdsbLolClient({ fetch: f, now: () => t })
    const r = await c.getStates(BBOX)
    expect(r.status).toBe(200)
    const [url, init] = f.mock.calls[0]
    expect(url).toMatch(/^https:\/\/api\.adsb\.lol\/v2\/lat\/49\.2000\/lon\/-123\.2000\/dist\/\d+$/)
    expect((init!.headers as Record<string, string>)['user-agent']).toMatch(/tracon/)
    t = 3000
    await c.getStates(BBOX)
    expect(f).toHaveBeenCalledTimes(1)
    t = 5000
    await c.getStates(BBOX)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('backs off on 429 serving stale, then 503 with nothing cached', async () => {
    let t = 0
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok({ ac: [ac()] }))
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '20' } }))
    const c = createAdsbLolClient({ fetch: f, now: () => t })
    await c.getStates(BBOX)
    t = 5000
    const r = await c.getStates(BBOX)
    expect(r).toMatchObject({ status: 200, stale: true })
    t = 10_000
    await c.getStates(BBOX)
    expect(f).toHaveBeenCalledTimes(2) // still backing off
    const other = await c.getStates({ ...BBOX, lamin: 40 })
    expect(other.status).toBe(503)
  })
  it('returns 502 on 5xx or network error with nothing cached', async () => {
    const c = createAdsbLolClient({ fetch: async () => new Response('', { status: 500 }) })
    expect((await c.getStates(BBOX)).status).toBe(502)
    const d = createAdsbLolClient({
      fetch: async () => {
        throw new Error('x')
      },
    })
    expect((await d.getStates(BBOX)).status).toBe(502)
  })
})

// [secAfter, lat, lon, alt, gs, track, flags]
const T0 = 1_000_000
const pt = (s: number, alt: number | 'ground', flags = 0) => [
  s,
  49 + s / 1e4,
  -123,
  alt,
  100,
  90,
  flags,
]
const alts = (r: ReturnType<typeof parseTrace>) => r.path.map((p) => p.altFt)

describe('parseTrace', () => {
  it('keeps the last flight: takeoff ground point through airborne points', () => {
    const trace = [
      pt(0, 'ground'),
      pt(10, 1000),
      pt(20, 'ground'), // earlier flight lands
      pt(30, 'ground'),
      pt(40, 'ground'), // takeoff point
      pt(50, 500),
      pt(60, 3000),
    ]
    const r = parseTrace('abc123', { timestamp: T0, trace })
    expect(r.path.map((p) => p.t - T0)).toEqual([40, 50, 60])
    expect(r.path[0]).toMatchObject({ onGround: true, altFt: 0 })
    expect(r.path[2]).toMatchObject({ onGround: false, altFt: 3000 })
    expect(r.startTime).toBe(T0 + 40)
    expect(r.endTime).toBe(T0 + 60)
  })
  it('splits on gaps over 20 minutes and on leg flags', () => {
    const gap = [pt(0, 1000), pt(10, 1100), pt(2000, 5000), pt(2010, 5100)]
    expect(alts(parseTrace('a', { timestamp: T0, trace: gap }))).toEqual([5000, 5100])
    const leg = [pt(0, 1000), pt(10, 1100), pt(20, 7000, 2), pt(30, 7100)]
    expect(alts(parseTrace('a', { timestamp: T0, trace: leg }))).toEqual([7000, 7100])
  })
  it('includes the landing point and ignores trailing taxi', () => {
    const trace = [pt(0, 2000), pt(10, 500), pt(20, 'ground'), pt(30, 'ground')]
    expect(parseTrace('a', { timestamp: T0, trace }).path.map((p) => p.t - T0)).toEqual([0, 10, 20])
  })
  it('gives an empty path for ground-only, garbage and short traces', () => {
    const ground = [pt(0, 'ground'), pt(5, 'ground')]
    expect(parseTrace('a', { timestamp: T0, trace: ground }).path).toEqual([])
    expect(parseTrace('a', null).path).toEqual([])
    expect(parseTrace('a', { timestamp: T0, trace: [[1, null, 2], pt(0, 100)] }).path).toEqual([])
  })
  it('decimates long traces but keeps the last point', () => {
    const trace = Array.from({ length: 2000 }, (_, i) => pt(i, 5000))
    const r = parseTrace('a', { timestamp: T0, trace })
    expect(r.path.length).toBeLessThan(700)
    expect(r.path[r.path.length - 1].t).toBe(T0 + 1999)
  })
})

describe('trace client', () => {
  const body = { timestamp: T0, trace: [pt(0, 1000), pt(10, 2000)] }
  it('fetches trace_full by last two hex chars, caches 60 s', async () => {
    let t = 0
    const f = vi.fn(async (_u: string) => ok(body))
    const c = createTraceClient({ fetch: f, now: () => t })
    const r = await c.getTrack('c05edd')
    expect(r.status).toBe(200)
    expect(f.mock.calls[0][0]).toBe('https://adsb.lol/data/traces/dd/trace_full_c05edd.json')
    t = 30_000
    await c.getTrack('c05edd')
    expect(f.mock.calls[1][0]).toContain('trace_recent_c05edd')
    expect(f).toHaveBeenCalledTimes(2)
    t = 61_000
    await c.getTrack('c05edd')
    // Refresh fetches only trace_recent, not trace_full again.
    expect(f).toHaveBeenCalledTimes(3)
    expect(f.mock.calls[2][0]).toContain('trace_recent_c05edd')
    t = 11 * 60_000
    await c.getTrack('c05edd')
    expect(f.mock.calls[3][0]).toContain('trace_full_c05edd')
    expect(f).toHaveBeenCalledTimes(5)
  })
  it('incremental refresh appends newer recent points to the kept full trace', async () => {
    let t = 0
    const full = { timestamp: T0, trace: [pt(0, 1000), pt(100, 2000)] }
    const recents = [
      { timestamp: T0 + 100, trace: [pt(0, 2000), pt(10, 2100)] },
      { timestamp: T0 + 110, trace: [pt(0, 2100), pt(10, 2200), pt(20, 2300)] },
    ]
    let n = 0
    const f = vi.fn(async (u: string) =>
      ok(u.includes('trace_full') ? full : recents[Math.min(n++, recents.length - 1)]),
    )
    const c = createTraceClient({ fetch: f, now: () => t })
    const a = await c.getTrack('c05edd')
    expect(a.body).toMatchObject({ path: expect.any(Array) })
    t = 61_000
    const b = await c.getTrack('c05edd')
    const alt = (r: typeof b) => (r.body as { path: { altFt: number }[] }).path.map((p) => p.altFt)
    expect(alt(a)).toEqual([1000, 2000, 2100])
    expect(alt(b)).toEqual([1000, 2000, 2100, 2200, 2300])
  })
  it('404 gives an empty path; 500 on full falls back to recent', async () => {
    const c = createTraceClient({ fetch: async () => new Response('', { status: 404 }) })
    expect(await c.getTrack('aaaaaa')).toMatchObject({ status: 200, body: { path: [] } })
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(ok(body))
    const d = createTraceClient({ fetch: f })
    const r = await d.getTrack('bbbbbb')
    expect(r.status).toBe(200)
    expect(f.mock.calls[1][0]).toContain('trace_recent_bbbbbb')
  })
})

describe('mergeTraces', () => {
  it('appends newer points from trace_recent, shifted to the full timestamp frame', () => {
    const full = { timestamp: T0, trace: [pt(0, 1000), pt(100, 2000)] }
    const recent = { timestamp: T0 + 90, trace: [pt(0, 1900), pt(20, 2100), pt(30, 2200)] }
    const m = parseTrace('a', mergeTraces(full, recent))
    expect(m.path.map((p) => p.t - T0)).toEqual([0, 100, 110, 120])
    expect(mergeTraces(full, null)).toBe(full)
    expect(mergeTraces(null, recent)).toBe(recent)
  })
})
