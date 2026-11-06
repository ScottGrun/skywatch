export const KM_PER_NM = 1.852
export const FT_PER_M = 3.28084
export const KT_PER_MS = 1.943844
export const FPM_PER_MS = 196.850394

const D2R = Math.PI / 180

export interface LatLon {
  lat: number
  lon: number
}
export interface LocalKm {
  e: number
  n: number
}

const kx = (lat: number) => 111.32 * Math.cos(lat * D2R)
const ky = 110.574

/** Lat/lon to km east/north of `origin` (equirectangular, fine within ~200 km). */
export function toLocal(origin: LatLon, lat: number, lon: number): LocalKm {
  return { e: (lon - origin.lon) * kx(origin.lat), n: (lat - origin.lat) * ky }
}

/** Inverse of `toLocal`. */
export function toLatLon(origin: LatLon, e: number, n: number): LatLon {
  return { lat: origin.lat + n / ky, lon: origin.lon + e / kx(origin.lat) }
}

/** Great-circle distance in nautical miles. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * D2R
  const dLon = (b.lon - a.lon) * D2R
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2
  return (2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)))) / KM_PER_NM
}

/** Initial great-circle bearing from a to b, degrees 0..360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const p1 = a.lat * D2R
  const p2 = b.lat * D2R
  const dl = (b.lon - a.lon) * D2R
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (Math.atan2(y, x) / D2R + 360) % 360
}

/** Smallest absolute difference between two headings, 0..180. */
export function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
