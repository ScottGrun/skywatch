import { TtlCache } from './ttlCache.ts'
import {
  roundBbox,
  type Bbox,
  type FetchFn,
  type StateOut,
  type StatesBody,
  type StatesResult,
} from './opensky.ts'

export const ADSBLOL_BASE = 'https://api.adsb.lol/v2'
export const USER_AGENT = 'tracon-flight-tracker/0.1 (open-source ADS-B viewer; Cloudflare Worker)'
export const MAX_RADIUS_NM = 250
export const POLL_MS = 8000
const MAX_POS_AGE_S = 60
const FT_PER_M = 3.28084
const KT_PER_MS = 1.943844
const FPM_PER_MS = 196.850394
const NM_M = 1852

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const r2 = (v: number): number => Math.round(v * 100) / 100

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return (2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)))) / NM_M
}

/** Circle covering the box corners (ceil'd, +1 NM margin), radius capped at the API maximum. */
export function bboxToCircle(b: Bbox): { lat: number; lon: number; distNm: number } {
  const lat = (b.lamin + b.lamax) / 2
  const lon = (b.lomin + b.lomax) / 2
  let d = 0
  for (const la of [b.lamin, b.lamax])
    for (const lo of [b.lomin, b.lomax]) d = Math.max(d, haversineNm(lat, lon, la, lo))
  return { lat, lon, distNm: Math.min(MAX_RADIUS_NM, Math.max(1, Math.ceil(d) + 1)) }
}

/** Map one adsb.lol/readsb aircraft object; null when it has no usable fresh position. */
export function mapAdsbAircraft(a: Record<string, unknown>): StateOut | null {
  if (!isNum(a.lat) || !isNum(a.lon)) return null
  if (isNum(a.seen_pos) && a.seen_pos > MAX_POS_AGE_S) return null
  // A leading '~' marks a non-ICAO (e.g. TIS-B) address; keep it, minus the marker.
  const hex = str(a.hex).replace(/^~/, '').toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(hex)) return null
  const onGround = a.alt_baro === 'ground'
  const altFt = onGround ? 0 : isNum(a.alt_baro) ? a.alt_baro : isNum(a.alt_geom) ? a.alt_geom : 0
  const heading = [a.track, a.true_heading, a.mag_heading].find(isNum) ?? 0
  const rate = [a.baro_rate, a.geom_rate].find(isNum) ?? 0
  const out: StateOut = {
    icao24: hex,
    callsign: str(a.flight),
    lat: a.lat,
    lon: a.lon,
    altM: r2(altFt / FT_PER_M),
    velMs: isNum(a.gs) ? r2(a.gs / KT_PER_MS) : 0,
    track: heading,
    vrMs: r2(rate / FPM_PER_MS),
    onGround,
  }
  const cat = str(a.category)
  if (cat) out.category = cat
  const t = str(a.t)
  if (t) out.t = t.toUpperCase()
  const r = str(a.r)
  if (r) out.r = r.toUpperCase()
  return out
}

export function mapAdsbStates(raw: unknown, b: Bbox, nowMs: number): StatesBody {
  const o = (raw ?? {}) as { ac?: unknown; aircraft?: unknown; now?: unknown }
  const list = Array.isArray(o.ac) ? o.ac : Array.isArray(o.aircraft) ? o.aircraft : []
  const states: StateOut[] = []
  for (const a of list) {
    if (!a || typeof a !== 'object') continue
    const s = mapAdsbAircraft(a as Record<string, unknown>)
    if (!s || s.lat < b.lamin || s.lat > b.lamax || s.lon < b.lomin || s.lon > b.lomax) continue
    states.push(s)
  }
  // `now` is epoch ms in the v2 API.
  const time = isNum(o.now) ? Math.round(o.now / 1000) : Math.round(nowMs / 1000)
  return { time, states, pollMs: POLL_MS, source: 'adsblol' }
}

export interface AdsbLolOpts {
  fetch: FetchFn
  now?: () => number
  ttlMs?: number
}

export function createAdsbLolClient(opts: AdsbLolOpts) {
  const now = opts.now ?? Date.now
  const cache = new TtlCache<StatesBody>(opts.ttlMs ?? 4000, 200)
  const inflight = new Map<string, Promise<StatesResult>>()
  let backoffUntil = 0

  const stale = (key: string): StatesResult => {
    const body = cache.peek(key)
    return body
      ? { status: 200, body, stale: true }
      : { status: 503, body: { error: 'rate limited, no cached data' }, stale: false }
  }
  const failure = (key: string, status: number, error: string): StatesResult => {
    const s = stale(key)
    return s.status === 200 ? s : { status, body: { error }, stale: false }
  }

  async function load(key: string, b: Bbox): Promise<StatesResult> {
    if (now() < backoffUntil) return stale(key)
    const c = bboxToCircle(b)
    const url = `${ADSBLOL_BASE}/lat/${c.lat.toFixed(4)}/lon/${c.lon.toFixed(4)}/dist/${c.distNm}`
    try {
      const res = await opts.fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.status === 429 || res.status >= 500) {
        const secs = Number(res.headers.get('Retry-After'))
        backoffUntil = now() + (Number.isFinite(secs) && secs > 0 ? secs : 30) * 1000
        return failure(key, res.status === 429 ? 503 : 502, `upstream ${res.status}`)
      }
      if (!res.ok) return failure(key, 502, `upstream ${res.status}`)
      const body = mapAdsbStates(await res.json(), b, now())
      cache.set(key, body, now())
      return { status: 200, body, stale: false }
    } catch {
      return failure(key, 502, 'upstream unreachable')
    }
  }

  return {
    pollMs: POLL_MS,
    async getStates(bbox: Bbox): Promise<StatesResult> {
      const b = roundBbox(bbox)
      const key = `${b.lamin},${b.lomin},${b.lamax},${b.lomax}`
      const fresh = cache.get(key, now())
      if (fresh) return { status: 200, body: fresh, stale: false }
      let p = inflight.get(key)
      if (!p) {
        p = load(key, b).finally(() => inflight.delete(key))
        inflight.set(key, p)
      }
      return p
    },
  }
}
