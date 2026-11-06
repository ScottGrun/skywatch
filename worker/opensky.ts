import { TtlCache } from './ttlCache.ts'

export const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
export const STATES_URL = 'https://opensky-network.org/api/states/all'

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface StateOut {
  icao24: string
  callsign: string
  lat: number
  lon: number
  altM: number
  velMs: number
  track: number
  vrMs: number
  onGround: boolean
}
export interface StatesBody {
  time: number
  states: StateOut[]
  pollMs: number
}
export interface Bbox {
  lamin: number
  lomin: number
  lamax: number
  lomax: number
}
export interface StatesResult {
  status: number
  body: StatesBody | { error: string }
  stale: boolean
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** Map OpenSky `states` arrays to the compact shape; rows without position are skipped. */
export function mapStates(raw: { time?: number; states?: unknown[][] | null }): {
  time: number
  states: StateOut[]
} {
  const states: StateOut[] = []
  for (const r of raw.states ?? []) {
    const lon = r[5]
    const lat = r[6]
    if (typeof lon !== 'number' || typeof lat !== 'number') continue
    states.push({
      icao24: String(r[0] ?? '').toLowerCase(),
      callsign: String(r[1] ?? '').trim(),
      lat,
      lon,
      altM: num(r[7], num(r[13])),
      velMs: num(r[9]),
      track: num(r[10]),
      vrMs: num(r[11]),
      onGround: r[8] === true,
    })
  }
  return { time: num(raw.time), states }
}

/** Round outward to 0.1 degrees so nearby requests share a cache entry. */
export function roundBbox(b: Bbox): Bbox {
  const lo = (v: number) => Math.floor(v * 10 + 1e-9) / 10
  const hi = (v: number) => Math.ceil(v * 10 - 1e-9) / 10
  return { lamin: lo(b.lamin), lomin: lo(b.lomin), lamax: hi(b.lamax), lomax: hi(b.lomax) }
}

export interface ClientOpts {
  fetch: FetchFn
  now?: () => number
  clientId?: string
  clientSecret?: string
  ttlMs?: number
}

export function createOpenSkyClient(opts: ClientOpts) {
  const now = opts.now ?? Date.now
  const ttl = opts.ttlMs ?? 8000
  const hasCreds = Boolean(opts.clientId && opts.clientSecret)
  const pollMs = hasCreds ? 5000 : 10000
  const cache = new TtlCache<StatesBody>(ttl, 200)
  const inflight = new Map<string, Promise<StatesResult>>()
  let backoffUntil = 0
  let token: { value: string; exp: number } | null = null

  async function getToken(): Promise<string | null> {
    if (!hasCreds) return null
    if (token && token.exp > now()) return token.value
    const res = await opts.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: opts.clientId!,
        client_secret: opts.clientSecret!,
      }).toString(),
    })
    if (!res.ok) return null // fall back to anonymous
    const j = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!j.access_token) return null
    token = { value: j.access_token, exp: now() + Math.max(0, num(j.expires_in, 300) - 30) * 1000 }
    return token.value
  }

  function stale(key: string): StatesResult {
    const body = cache.peek(key)
    return body
      ? { status: 200, body, stale: true }
      : { status: 503, body: { error: 'rate limited, no cached data' }, stale: false }
  }

  function failure(key: string, status: number, error: string): StatesResult {
    const s = stale(key)
    return s.status === 200 ? s : { status, body: { error }, stale: false }
  }

  async function load(key: string, b: Bbox): Promise<StatesResult> {
    if (now() < backoffUntil) return stale(key)
    const qs = new URLSearchParams({
      lamin: String(b.lamin),
      lomin: String(b.lomin),
      lamax: String(b.lamax),
      lomax: String(b.lomax),
    })
    try {
      const tk = await getToken()
      const res = await opts.fetch(
        `${STATES_URL}?${qs}`,
        tk ? { headers: { authorization: `Bearer ${tk}` } } : {},
      )
      if (res.status === 429) {
        const secs = Number(res.headers.get('X-Rate-Limit-Retry-After-Seconds'))
        backoffUntil = now() + (Number.isFinite(secs) && secs > 0 ? secs : 60) * 1000
        return stale(key)
      }
      if (res.status === 401 || res.status === 403) token = null
      if (!res.ok) return failure(key, 502, `upstream ${res.status}`)
      const body: StatesBody = { ...mapStates(await res.json()), pollMs }
      cache.set(key, body, now())
      return { status: 200, body, stale: false }
    } catch {
      return failure(key, 502, 'upstream unreachable')
    }
  }

  return {
    pollMs,
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
