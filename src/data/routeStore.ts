/** Persistent (localStorage) callsign -> route cache with per-entry TTL and LRU bound. */
export interface StoredRoute {
  origin: string
  dest: string
}

export const ROUTE_STORE_KEY = 'tracon3d.routes.v1'
export const FOUND_TTL_MS = 6 * 3600_000
export const MISSING_TTL_MS = 30 * 60_000
export const MAX_ROUTES = 2000

const FLIGHT_CALLSIGN = /^[A-Z]{3}\d[A-Z0-9]{0,4}$/

/**
 * ICAO airline flight ids (3 letters + digit + up to 4 alphanumerics, e.g. UAL123, DLH4AB).
 * adsbdb only knows scheduled flights under these; N-numbers, registrations and blanks never match.
 */
export function isAirlineCallsign(callsign: string): boolean {
  return FLIGHT_CALLSIGN.test(callsign.trim().toUpperCase())
}

type Entry = { o: string; d: string; exp: number }

export interface RouteStore {
  get(callsign: string): StoredRoute | undefined
  /** Stores a result; an empty origin and dest counts as "not found" (shorter TTL). */
  set(callsign: string, r: StoredRoute): void
  flush(): void
}

export function createRouteStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  now: () => number = Date.now,
  max = MAX_ROUTES,
): RouteStore {
  // Map insertion order is the LRU order (oldest first).
  const map = new Map<string, Entry>()
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const raw = storage?.getItem(ROUTE_STORE_KEY)
    const rows = raw ? (JSON.parse(raw) as unknown) : []
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (!Array.isArray(r) || typeof r[0] !== 'string' || typeof r[3] !== 'number') continue
        if (r[3] <= now()) continue
        map.set(r[0], { o: String(r[1] ?? ''), d: String(r[2] ?? ''), exp: r[3] })
      }
      while (map.size > max) map.delete(map.keys().next().value as string)
    }
  } catch {
    map.clear()
  }

  const flush = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    try {
      const rows = [...map].map(([k, v]) => [k, v.o, v.d, v.exp])
      storage?.setItem(ROUTE_STORE_KEY, JSON.stringify(rows))
    } catch {
      /* quota or disabled storage: stay memory-only */
    }
  }

  return {
    get(callsign) {
      const e = map.get(callsign)
      if (!e) return undefined
      if (e.exp <= now()) {
        map.delete(callsign)
        return undefined
      }
      map.delete(callsign)
      map.set(callsign, e)
      return { origin: e.o, dest: e.d }
    },
    set(callsign, r) {
      const found = !!(r.origin || r.dest)
      map.delete(callsign)
      map.set(callsign, {
        o: r.origin,
        d: r.dest,
        exp: now() + (found ? FOUND_TTL_MS : MISSING_TTL_MS),
      })
      while (map.size > max) map.delete(map.keys().next().value as string)
      if (!timer && storage) timer = setTimeout(flush, 2000)
    },
    flush,
  }
}
