import { aircraftClassFor } from '../core/aircraftClass.ts'
import type { AircraftClass } from '../types.ts'
import type { AircraftDb } from './aircraftDb.ts'
import { isAirlineCallsign, type RouteStore } from './routeStore.ts'

export interface AircraftMeta {
  typeCode: string
  aircraftClass: AircraftClass
  operator: string
  registration: string
}
/** Type/registration reported by the traffic feed itself; beats any lookup. */
export interface FeedHint {
  typeCode?: string
  registration?: string
}
export interface RouteMeta {
  origin: string // IATA preferred, else ICAO, else ""
  dest: string
}

type FetchFn = typeof fetch
type Slot<T> = { value: T | null; retryAt: number; pending: boolean }

const MAX_CONCURRENT = 4
const MAX_QUEUE = 600
const RETRY_MS = 120_000 // after a 503/network failure; empty results are never stored as final

const pick = (e: { iata?: string; icao?: string } | null | undefined): string =>
  e?.iata || e?.icao || ''

/** Lazy, throttled, in-memory-cached lookups against /api/aircraft and /api/route. */
export function createEnricher(fetchFn: FetchFn, now: () => number = Date.now,
  db?: AircraftDb,
  routeStore?: RouteStore,
) {
  const aircraft = new Map<string, Slot<AircraftMeta>>()
  const routes = new Map<string, Slot<RouteMeta>>()
  const queue: Array<() => Promise<void>> = []
  let active = 0
  let disposed = false

  function pump(): void {
    while (!disposed && active < MAX_CONCURRENT && queue.length > 0) {
      const job = queue.shift()!
      active++
      job().finally(() => {
        active--
        pump()
      })
    }
  }

  function ensure<T>(map: Map<string, Slot<T>>, key: string, load: () => Promise<T>): void {
    const s = map.get(key)
    if (s && (s.value || s.pending || s.retryAt > now())) return
    if (queue.length >= MAX_QUEUE) return
    const slot: Slot<T> = s ?? { value: null, retryAt: 0, pending: false }
    slot.pending = true
    map.set(key, slot)
    queue.push(async () => {
      try {
        slot.value = await load()
      } catch {
        slot.retryAt = now() + RETRY_MS
      } finally {
        slot.pending = false
      }
    })
    pump()
  }

  async function getJson(url: string): Promise<unknown> {
    const r = await fetchFn(url)
    if (!r.ok) throw new Error(String(r.status))
    return r.json()
  }

  /** Baked DB first (no callsign needed), then adsbdb via the worker. Throws on transient failure. */
  async function loadAircraft(id: string, hint?: FeedHint): Promise<AircraftMeta> {
    const make = async (typeCode: string, operator: string, registration: string) => {
      const code = typeCode.toUpperCase()
      const info = code && db ? await db.type(code) : null
      return { typeCode: code, aircraftClass: aircraftClassFor(code, info), operator, registration }
    }
    if (hint?.typeCode) return make(hint.typeCode, '', hint.registration ?? '')
    const hit = db ? await db.lookup(id) : null
    if (hit) return make(hit.typeCode, '', hit.registration)
    const o = (await getJson(`/api/aircraft/${id}`)) as {
      typeCode?: string
      operator?: string
      registration?: string
    }
    return make(o.typeCode ?? '', o.operator ?? '', o.registration ?? '')
  }

  return {
    /** Kick off lookups (no-op if already cached/pending). */
    request(id: string, callsign: string, hint?: FeedHint): void {
      ensure(aircraft, id, () => loadAircraft(id, hint))
      const cs = callsign.trim().toUpperCase()
      if (isAirlineCallsign(cs)) {
        if (!routes.get(cs)?.value) {
          const stored = routeStore?.get(cs)
          if (stored) {
            routes.set(cs, { value: stored, retryAt: 0, pending: false })
            return
          }
        }
        ensure(routes, cs, () =>
          getJson(`/api/route/${cs}`).then((j) => {
            const o = j as {
              origin?: { iata?: string; icao?: string }
              dest?: { iata?: string; icao?: string }
            }
            const r = { origin: pick(o.origin), dest: pick(o.dest) }
            routeStore?.set(cs, r)
            return r
          }),
        )
      }
    },
    aircraft: (id: string): AircraftMeta | null => aircraft.get(id)?.value ?? null,
    route: (callsign: string): RouteMeta | null =>
      routes.get(callsign.trim().toUpperCase())?.value ?? null,
    dispose(): void {
      disposed = true
      queue.length = 0
    },
  }
}
