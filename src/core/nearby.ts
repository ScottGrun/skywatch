// Picks the airports whose runways are drawn around the selected one. Pure.
import type { Airport, Runway } from '../types'
import { toLocal } from './geo'

/** Airports within this distance (km) of the selected one are drawn (about the z10 tile ring's inner reach). */
export const NEARBY_RADIUS_KM = 60
/** At most this many neighbours, nearest first. */
export const NEARBY_MAX = 40
/** Runways shorter than this (ft) are skipped (tiny strips are invisible at this scale). */
export const NEARBY_MIN_FT = 1500

/** Heliport pads ("H1"), water lanes ("NE"/"SW"/"W") and other non-numbered idents are not drawn. */
const isLandRunway = (r: Runway): boolean => /^\d{1,2}[LCRW]?$/.test(r.le.ident)

export const drawable = (r: Runway): boolean =>
  !r.closed && r.lengthFt >= NEARBY_MIN_FT && isLandRunway(r)

/**
 * Neighbours of `sel` from the loaded list, nearest first, each reduced to its drawable runways.
 * Airports left with no drawable runway are dropped.
 */
export function nearbyAirports(
  all: readonly Airport[],
  sel: Airport,
  radiusKm = NEARBY_RADIUS_KM,
  max = NEARBY_MAX,
): Airport[] {
  const out: { d: number; ap: Airport }[] = []
  for (const ap of all) {
    if (ap.icao === sel.icao) continue
    const p = toLocal(sel, ap.lat, ap.lon)
    const d = Math.hypot(p.e, p.n)
    if (d > radiusKm) continue
    const runways = ap.runways.filter(drawable)
    if (runways.length) out.push({ d, ap: { ...ap, runways } })
  }
  out.sort((a, b) => a.d - b.d)
  return out.slice(0, max).map((x) => x.ap)
}
