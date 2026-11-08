import type { Aircraft, Airport } from '../types.ts'
import { approachRunway } from './approach.ts'

export type ArrivalKind = 'route' | 'final' | 'landed'
export interface ArrivalRow {
  a: Aircraft
  kind: ArrivalKind
  runway?: string
}

/** Aircraft that were inbound, id -> last time (ms) they qualified. */
export type ArrivalMemory = ReadonlyMap<string, number>
export const LANDED_KEEP_MS = 5 * 60_000
const LANDED_MAX_NM = 5

/**
 * Arrivals board: airborne aircraft whose looked-up route ends here, plus aircraft observably on
 * final to one of its runways, nearest first; then recently landed ones (previously inbound,
 * now on the ground at the field) for a few minutes.
 */
export function buildArrivals(
  list: readonly Aircraft[],
  ap: Pick<Airport, 'iata' | 'icao' | 'elevationFt' | 'runways'>,
  prev: ArrivalMemory,
  nowMs: number,
): { rows: ArrivalRow[]; memory: ArrivalMemory } {
  const memory = new Map<string, number>()
  for (const [id, t] of prev) if (nowMs - t <= LANDED_KEEP_MS) memory.set(id, t)
  const air: ArrivalRow[] = []
  const landed: ArrivalRow[] = []
  for (const a of list) {
    if (a.onGround) {
      if (memory.has(a.id) && a.distNm <= LANDED_MAX_NM) landed.push({ a, kind: 'landed' })
      continue
    }
    if (isInboundTo(a, ap)) {
      air.push({ a, kind: 'route' })
      memory.set(a.id, nowMs)
      continue
    }
    const runway = approachRunway(a, ap)
    if (runway) {
      air.push({ a, kind: 'final', runway })
      memory.set(a.id, nowMs)
    }
  }
  air.sort((x, y) => x.a.distNm - y.a.distNm)
  landed.sort((x, y) => x.a.distNm - y.a.distNm)
  return { rows: [...air, ...landed], memory }
}

/** True when the aircraft's real route destination (IATA or ICAO) is this airport. */
export function isInboundTo(a: Aircraft, ap: Pick<Airport, 'iata' | 'icao'>): boolean {
  const d = a.dest.trim().toUpperCase()
  return (
    d !== '' && (d === ap.icao.toUpperCase() || (ap.iata !== '' && d === ap.iata.toUpperCase()))
  )
}
