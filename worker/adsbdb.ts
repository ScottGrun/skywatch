import { TtlCache } from './ttlCache.ts'
import type { FetchFn } from './opensky.ts'

const BASE = 'https://api.adsbdb.com/v0'

export interface AircraftInfo {
  typeCode: string
  operator: string
  registration: string
  /** adsbdb manufacturer + type, e.g. "Airbus A320-214"; "" unknown. */
  fullType: string
  /** airport-data.com photo URLs (full / thumbnail); "" when none. */
  photo: string
  photoThumb: string
}
export interface RouteEnd {
  iata: string
  icao: string
}
export interface RouteInfo {
  origin: RouteEnd | null
  dest: RouteEnd | null
}

type Obj = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' ? (v as Obj) : undefined)

/** Joins manufacturer and model without repeating the manufacturer ("Airbus" + "A320-214"). */
export function fullTypeName(manufacturer: string, type: string): string {
  const m = manufacturer.trim()
  const t = type.trim()
  if (!m) return t
  if (!t) return m
  return t.toLowerCase().startsWith(m.toLowerCase()) ? t : `${m} ${t}`
}

const httpsUrl = (u: string): string => (/^https?:\/\//.test(u) ? u.replace(/^http:/, 'https:') : '')

export function mapAircraft(j: unknown): AircraftInfo {
  const a = obj(obj(obj(j)?.response)?.aircraft)
  return {
    typeCode: str(a?.icao_type),
    operator: str(a?.registered_owner),
    registration: str(a?.registration),
    fullType: fullTypeName(str(a?.manufacturer), str(a?.type)),
    photo: httpsUrl(str(a?.url_photo)),
    photoThumb: httpsUrl(str(a?.url_photo_thumbnail)),
  }
}

function mapEnd(e: unknown): RouteEnd | null {
  const o = obj(e)
  if (!o) return null
  const iata = str(o.iata_code)
  const icao = str(o.icao_code)
  return iata || icao ? { iata, icao } : null
}

export function mapRoute(j: unknown): RouteInfo {
  const r = obj(obj(obj(j)?.response)?.flightroute)
  return { origin: mapEnd(r?.origin), dest: mapEnd(r?.destination) }
}

/** Empty results returned because upstream failed (429/5xx/network), as opposed to a real 404. */
export const transientResults = new WeakSet<object>()

export function createAdsbdb(opts: { fetch: FetchFn; now?: () => number }) {
  const now = opts.now ?? Date.now
  const aircraftCache = new TtlCache<AircraftInfo>(24 * 3600_000, 5000)
  const routeCache = new TtlCache<RouteInfo>(6 * 3600_000, 5000)

  const transient = <T>(v: T): T => {
    if (v && typeof v === 'object') transientResults.add(v)
    return v
  }

  async function lookup<T>(
    cache: TtlCache<T>,
    key: string,
    url: string,
    map: (j: unknown) => T,
  ): Promise<T> {
    const hit = cache.get(key, now())
    if (hit) return hit
    const empty = map(null)
    try {
      const res = await opts.fetch(url)
      if (res.status === 404) {
        cache.set(key, empty, now())
        return empty
      }
      if (!res.ok) return transient(empty)
      const v = map(await res.json().catch(() => null))
      cache.set(key, v, now())
      return v
    } catch {
      return transient(empty)
    }
  }

  return {
    aircraft: (icao24: string) =>
      lookup(aircraftCache, icao24, `${BASE}/aircraft/${encodeURIComponent(icao24)}`, mapAircraft),
    route: (callsign: string) =>
      lookup(routeCache, callsign, `${BASE}/callsign/${encodeURIComponent(callsign)}`, mapRoute),
  }
}
