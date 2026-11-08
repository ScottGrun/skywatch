import type { Aircraft, Airport } from '../types.ts'
import { KM_PER_NM, toLocal } from './geo.ts'

/** Observable-approach limits: the aircraft must be lined up with a runway, low, and coming down. */
export const APPROACH = {
  maxTrackDiffDeg: 15,
  maxCrossNm: 1.5,
  maxFinalNm: 15, // along the extended centerline, measured from the threshold
  maxAglFt: 5000,
  minGsKt: 50,
  descendingFpm: -200, // at or below this counts as descending
  veryLowAglFt: 800, // below this, level flight still counts (flare / short final)
} as const

/** Runway ident the aircraft is established on final for at `ap`, or null when there is no such evidence. */
export function approachRunway(
  a: Pick<Aircraft, 'lat' | 'lon' | 'altFt' | 'trackDeg' | 'gsKt' | 'vsFpm' | 'onGround'>,
  ap: Pick<Airport, 'elevationFt' | 'runways'>,
): string | null {
  if (a.onGround || a.gsKt < APPROACH.minGsKt) return null
  const agl = a.altFt - ap.elevationFt
  if (agl > APPROACH.maxAglFt) return null
  if (a.vsFpm > APPROACH.descendingFpm && agl > APPROACH.veryLowAglFt) return null
  let best: { ident: string; cross: number } | null = null
  for (const rw of ap.runways) {
    if (rw.closed) continue
    for (const end of [rw.le, rw.he]) {
      let diff = Math.abs(a.trackDeg - end.headingDeg) % 360
      if (diff > 180) diff = 360 - diff
      if (diff > APPROACH.maxTrackDiffDeg) continue
      // Aircraft position in km east/north of the threshold; the approach side is behind the landing heading.
      const p = toLocal({ lat: end.lat, lon: end.lon }, a.lat, a.lon)
      const h = (end.headingDeg * Math.PI) / 180
      const along = -(p.e * Math.sin(h) + p.n * Math.cos(h)) / KM_PER_NM // NM before the threshold
      const cross = Math.abs(p.e * Math.cos(h) - p.n * Math.sin(h)) / KM_PER_NM
      if (along < -0.3 || along > APPROACH.maxFinalNm || cross > APPROACH.maxCrossNm) continue
      if (!best || cross < best.cross) best = { ident: end.ident, cross }
    }
  }
  return best?.ident ?? null
}
