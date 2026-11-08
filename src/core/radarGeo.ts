// Radar beam geometry with the standard 4/3 effective-earth-radius refraction model (Doviak & Zrnic).

export const EARTH_R_KM = 6371
/** Effective earth radius (4/3 model), km. */
export const KE_R = (EARTH_R_KM * 4) / 3
const D2R = Math.PI / 180

/** Height (km above the radar) of the beam center at slant range `rKm` and elevation `elDeg`. */
export function beamHeightKm(rKm: number, elDeg: number): number {
  const s = Math.sin(elDeg * D2R)
  return Math.sqrt(rKm * rKm + KE_R * KE_R + 2 * rKm * KE_R * s) - KE_R
}

/** Distance along the ground (km, great-circle on the effective sphere) under the beam at slant range `rKm`. */
export function groundRangeKm(rKm: number, elDeg: number): number {
  const el = elDeg * D2R
  const h = beamHeightKm(rKm, elDeg)
  return KE_R * Math.asin((rKm * Math.cos(el)) / (KE_R + h))
}

/** Inverse: elevation angle (deg) and slant range (km) of a point `hKm` above the radar at ground range `sKm`. */
export function elevationAndRange(sKm: number, hKm: number): { el: number; r: number } {
  const a = sKm / KE_R
  const R = KE_R + hKm
  const x = R * Math.sin(a)
  const y = R * Math.cos(a) - KE_R
  return { el: Math.atan2(y, x) / D2R, r: Math.hypot(x, y) }
}

/** Polar (azimuth deg clockwise from north, elevation deg, slant range km) to km east/north/up of the radar. */
export function polarToLocal(
  azDeg: number,
  elDeg: number,
  rKm: number,
): { e: number; n: number; up: number } {
  const s = groundRangeKm(rKm, elDeg)
  const az = azDeg * D2R
  return { e: s * Math.sin(az), n: s * Math.cos(az), up: beamHeightKm(rKm, elDeg) }
}
