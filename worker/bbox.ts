import type { Bbox } from './opensky.ts'

/** Largest box the client ever asks for is 3 deg x 4 deg; outward 0.5 deg quantizing adds up to 0.5 more. */
export const MAX_LAT_SPAN = 3.5
export const MAX_LON_SPAN = 4.5
export const BBOX_STEP = 0.5

const lo = (v: number) => Math.floor(v / BBOX_STEP + 1e-9) * BBOX_STEP
const hi = (v: number) => Math.ceil(v / BBOX_STEP - 1e-9) * BBOX_STEP

/**
 * Validates `/api/states` query params. Returns null for missing/non-finite/inverted/out-of-range/oversized
 * boxes (the caller answers 400), else the box quantized outward to 0.5 deg so nearby requests share a cache key.
 */
export function parseStatesBbox(q: URLSearchParams): Bbox | null {
  const v = ['lamin', 'lomin', 'lamax', 'lomax'].map((k) => {
    const s = q.get(k)
    return s === null || s.trim() === '' ? NaN : Number(s)
  })
  if (!v.every(Number.isFinite)) return null
  const [lamin, lomin, lamax, lomax] = v
  if (lamin >= lamax || lomin >= lomax) return null
  if (lamax - lamin > MAX_LAT_SPAN || lomax - lomin > MAX_LON_SPAN) return null
  return {
    lamin: Math.max(-90, lo(lamin)),
    lomin: Math.max(-180, lo(lomin)),
    lamax: Math.min(90, hi(lamax)),
    lomax: Math.min(180, hi(lomax)),
  }
}

/** Stable cache-key URL for a quantized box. */
export function statesCacheUrl(origin: string, b: Bbox): string {
  return `${origin}/api/states?lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}`
}
