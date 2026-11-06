import { aircraftClassFor } from '../core/aircraftClass.ts'
import type { AircraftClass } from '../types.ts'

export interface AircraftMeta {
  typeCode: string
  aircraftClass: AircraftClass
  operator: string
}
export interface RouteMeta {
  origin: string // IATA preferred, else ICAO, else ""
  dest: string
}

type FetchFn = typeof fetch
type Slot<T> = { value: T | null; retryAt: number; pending: boolean }

const MAX_CONCURRENT = 4
const MAX_QUEUE = 600
const RETRY_MS = 60_000
const FLIGHT_CALLSIGN = /^[A-Z]{3}\d[A-Z0-9]{0,4}$/

const pick = (e: { iata?: string; icao?: string } | null | undefined): string =>
  e?.iata || e?.icao || ''

/** Lazy, throttled, in-memory-cached lookups against /api/aircraft and /api/route. */
export function createEnricher(fetchFn: FetchFn, now: () => number = Date.now) {
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

  function ensure<T>(
    map: Map<string, Slot<T>>,
    key: string,
    url: string,
    convert: (j: unknown) => T,
  ): void {
    const s = map.get(key)
    if (s && (s.value || s.pending || s.retryAt > now())) return
    if (queue.length >= MAX_QUEUE) return
    const slot: Slot<T> = s ?? { value: null, retryAt: 0, pending: false }
    slot.pending = true
    map.set(key, slot)
    queue.push(async () => {
      try {
        const r = await fetchFn(url)
        if (!r.ok) throw new Error(String(r.status))
        slot.value = convert(await r.json())
      } catch {
        slot.retryAt = now() + RETRY_MS
      } finally {
        slot.pending = false
      }
    })
    pump()
  }

  return {
    /** Kick off lookups (no-op if already cached/pending). */
    request(id: string, callsign: string): void {
      ensure(aircraft, id, `/api/aircraft/${id}`, (j) => {
        const o = j as { typeCode?: string; operator?: string }
        const typeCode = (o.typeCode ?? '').toUpperCase()
        return { typeCode, aircraftClass: aircraftClassFor(typeCode), operator: o.operator ?? '' }
      })
      const cs = callsign.trim().toUpperCase()
      if (FLIGHT_CALLSIGN.test(cs)) {
        ensure(routes, cs, `/api/route/${cs}`, (j) => {
          const o = j as {
            origin?: { iata?: string; icao?: string }
            dest?: { iata?: string; icao?: string }
          }
          return { origin: pick(o.origin), dest: pick(o.dest) }
        })
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
