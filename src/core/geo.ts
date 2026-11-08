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

/** Wraps a longitude difference (or longitude) into [-180, 180]. */
export function wrapLon(d: number): number {
  if (d >= -180 && d <= 180) return d
  const w = ((((d + 180) % 360) + 360) % 360) - 180
  return w === -180 && d > 0 ? 180 : w
}

/**
 * Lat/lon to km east/north of `origin` (equirectangular, fine within ~200 km). Longitude difference is
 * wrapped across the antimeridian. Pass `out` to avoid an allocation in per-frame code.
 */
export function toLocal(origin: LatLon, lat: number, lon: number, out?: LocalKm): LocalKm {
  const e = wrapLon(lon - origin.lon) * kx(origin.lat)
  const n = (lat - origin.lat) * ky
  if (!out) return { e, n }
  out.e = e
  out.n = n
  return out
}

/** Inverse of `toLocal`; the longitude is wrapped into [-180, 180]. */
export function toLatLon(origin: LatLon, e: number, n: number): LatLon {
  return { lat: origin.lat + n / ky, lon: wrapLon(origin.lon + e / kx(origin.lat)) }
}

export const BBOX_STEP_DEG = 0.5

/**
 * `/api/states` box around `c`, padded and snapped outward to 0.5 deg (matches the Worker, so cache keys
 * collapse). Clamped to +-180 / +-90: near the antimeridian the far side is not requested (aircraft within
 * the pad on the other side stay invisible) rather than splitting into two requests.
 */
export function statesBbox(c: LatLon, latPad: number, lonPad: number) {
  const lo = (v: number) => Math.floor(v / BBOX_STEP_DEG + 1e-9) * BBOX_STEP_DEG
  const hi = (v: number) => Math.ceil(v / BBOX_STEP_DEG - 1e-9) * BBOX_STEP_DEG
  return {
    lamin: Math.max(-90, lo(c.lat - latPad)),
    lomin: Math.max(-180, lo(c.lon - lonPad)),
    lamax: Math.min(90, hi(c.lat + latPad)),
    lomax: Math.min(180, hi(c.lon + lonPad)),
  }
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
