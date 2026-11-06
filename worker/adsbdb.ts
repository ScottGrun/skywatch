import { TtlCache } from './ttlCache.ts'
import type { FetchFn } from './opensky.ts'

const BASE = 'https://api.adsbdb.com/v0'

export interface AircraftInfo {
  typeCode: string
  operator: string
  registration: string
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

export function mapAircraft(j: unknown): AircraftInfo {
  const a = obj(obj(obj(j)?.response)?.aircraft)
  return {
    typeCode: str(a?.icao_type),
    operator: str(a?.registered_owner),
    registration: str(a?.registration),
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

export function createAdsbdb(opts: { fetch: FetchFn; now?: () => number }) {
  const now = opts.now ?? Date.now
  const aircraftCache = new TtlCache<AircraftInfo>(24 * 3600_000, 5000)
  const routeCache = new TtlCache<RouteInfo>(6 * 3600_000, 5000)

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
      if (!res.ok) return empty
      const v = map(await res.json().catch(() => null))
      cache.set(key, v, now())
      return v
    } catch {
      return empty
    }
  }

  return {
    aircraft: (icao24: string) =>
      lookup(aircraftCache, icao24, `${BASE}/aircraft/${encodeURIComponent(icao24)}`, mapAircraft),
    route: (callsign: string) =>
      lookup(routeCache, callsign, `${BASE}/callsign/${encodeURIComponent(callsign)}`, mapRoute),
  }
}
