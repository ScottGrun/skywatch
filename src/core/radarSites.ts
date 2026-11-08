import { distanceNm, KM_PER_NM, type LatLon } from './geo.ts'

export interface RadarSite extends LatLon {
  id: string
  /** Antenna site elevation, m MSL (NOAA NEXRAD station table). */
  elevM: number
}

// Spike: Seattle only. US-wide would bake the full ~160 station table (NOAA WSR-88D list).
export const RADAR_SITES: readonly RadarSite[] = [
  { id: 'KATX', lat: 48.19461, lon: -122.49569, elevM: 161 },
]

/** Max airport distance from a radar for it to be offered. */
export const RADAR_RANGE_KM = 200

export function radarFor(p: LatLon): RadarSite | null {
  let best: RadarSite | null = null
  let bd = RADAR_RANGE_KM
  for (const s of RADAR_SITES) {
    const d = distanceNm(p, s) * KM_PER_NM
    if (d <= bd) {
      bd = d
      best = s
    }
  }
  return best
}
