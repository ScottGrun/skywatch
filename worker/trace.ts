import { TtlCache } from './ttlCache.ts'
import { emptyTrack, type TrackBody, type TrackPoint } from './track.ts'
import type { FetchFn } from './opensky.ts'
import { USER_AGENT } from './adsblol.ts'

export const TRACE_BASE = 'https://adsb.lol/data/traces'
const GAP_S = 20 * 60
const MAX_POINTS = 600
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

type P = TrackPoint & { newLeg: boolean }

/**
 * Parse a readsb trace file ({timestamp, trace: [[secAfter, lat, lon, alt|"ground", gs, track,
 * flags, ...]]}) into the last flight: split on gaps > 20 min or leg-start flags, then take the
 * last airborne run plus the ground point before it (takeoff) and after it (landing).
 */
export function parseTrace(icao24: string, raw: unknown): TrackBody {
  const o = (raw ?? {}) as { timestamp?: unknown; trace?: unknown }
  if (!isNum(o.timestamp) || !Array.isArray(o.trace)) return emptyTrack(icao24)
  const pts: P[] = []
  for (const w of o.trace as unknown[][]) {
    if (!Array.isArray(w) || !isNum(w[0]) || !isNum(w[1]) || !isNum(w[2])) continue
    const ground = w[3] === 'ground'
    pts.push({
      t: Math.round(o.timestamp + w[0]),
      lat: w[1],
      lon: w[2],
      altFt: ground ? 0 : isNum(w[3]) ? w[3] : 0,
      onGround: ground,
      newLeg: isNum(w[6]) && (w[6] & 2) !== 0,
    })
  }
  // Last continuous segment.
  let start = 0
  for (let i = 1; i < pts.length; i++)
    if (pts[i].t - pts[i - 1].t > GAP_S || pts[i].newLeg) start = i
  const seg = pts.slice(start)
  // Last airborne run.
  let end = seg.length - 1
  while (end >= 0 && seg[end].onGround) end--
  if (end < 0) return emptyTrack(icao24)
  let first = end
  while (first > 0 && !seg[first - 1].onGround) first--
  const from = first > 0 ? first - 1 : first
  const to = end + 1 < seg.length ? end + 1 : end
  let path: TrackPoint[] = seg
    .slice(from, to + 1)
    .map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, altFt: p.altFt, onGround: p.onGround }))
  if (path.length > MAX_POINTS) {
    const step = Math.ceil(path.length / MAX_POINTS)
    path = path.filter((_, i) => i % step === 0 || i === path.length - 1)
  }
  if (path.length < 2) return emptyTrack(icao24)
  return { icao24, startTime: path[0].t, endTime: path[path.length - 1].t, path }
}

type Raw = { timestamp?: unknown; trace?: unknown }

/** trace_full lags by several minutes; append the newer points from trace_recent. */
export function mergeTraces(full: unknown, recent: unknown): unknown {
  const f = (full ?? {}) as Raw
  const r = (recent ?? {}) as Raw
  if (!isNum(f.timestamp) || !Array.isArray(f.trace)) return recent
  if (!isNum(r.timestamp) || !Array.isArray(r.trace)) return full
  const last = f.trace[f.trace.length - 1] as unknown[] | undefined
  const lastAbs = last && isNum(last[0]) ? f.timestamp + last[0] : -Infinity
  const shift = r.timestamp - f.timestamp
  const extra = (r.trace as unknown[][])
    .filter(
      (w) =>
        Array.isArray(w) && isNum(w[0]) && (r.timestamp as number) + (w[0] as number) > lastAbs,
    )
    .map((w) => [(w[0] as number) + shift, ...w.slice(1)])
  return { ...f, trace: [...f.trace, ...extra] }
}

export interface TraceResult {
  status: number
  body: TrackBody | { error: string }
}

export function createTraceClient(opts: { fetch: FetchFn; now?: () => number }) {
  const now = opts.now ?? Date.now
  const cache = new TtlCache<TrackBody>(60_000, 100)
  const inflight = new Map<string, Promise<TraceResult>>()
  let backoffUntil = 0

  const get = (icao24: string, kind: 'full' | 'recent'): Promise<Response> =>
    opts.fetch(`${TRACE_BASE}/${icao24.slice(-2)}/trace_${kind}_${icao24}.json`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })

  async function load(icao24: string): Promise<TraceResult> {
    if (now() < backoffUntil) {
      const old = cache.peek(icao24)
      return old
        ? { status: 200, body: old }
        : { status: 503, body: { error: 'rate limited, no cached data' } }
    }
    try {
      let res = await get(icao24, 'full')
      if (res.status === 404) {
        const body = emptyTrack(icao24)
        cache.set(icao24, body, now())
        return { status: 200, body }
      }
      if (res.status === 429) {
        backoffUntil = now() + 30_000
        return { status: 503, body: { error: 'rate limited' } }
      }
      let isFull = true
      if (!res.ok) {
        isFull = false
        res = await get(icao24, 'recent')
      }
      if (!res.ok) return { status: 502, body: { error: `upstream ${res.status}` } }
      const main = await res.json()
      let merged = main
      if (isFull) {
        const rec = await get(icao24, 'recent').catch(() => null)
        if (rec?.ok) merged = mergeTraces(main, await rec.json().catch(() => null))
      }
      const body = parseTrace(icao24, merged)
      cache.set(icao24, body, now())
      return { status: 200, body }
    } catch {
      return { status: 502, body: { error: 'upstream unreachable' } }
    }
  }

  return {
    async getTrack(icao24: string): Promise<TraceResult> {
      const fresh = cache.get(icao24, now())
      if (fresh) return { status: 200, body: fresh }
      let p = inflight.get(icao24)
      if (!p) {
        p = load(icao24).finally(() => inflight.delete(icao24))
        inflight.set(icao24, p)
      }
      return p
    },
  }
}
