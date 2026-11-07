// Pure helpers: height of a rendered tile mesh (triangulated grid), not of the underlying DEM.
import type { LatLon } from '../core/geo'
import { latToTileY, lonToTileX, tileXToLon, tileYToLat } from './tileMath'

/** A block of equal tiles at zoom `z`, each subdivided into `segs` x `segs` cells (tile indices inclusive). */
export interface GridLayer {
  z: number
  segs: number
  x0: number
  x1: number
  y0: number
  y1: number
  /** Added to every vertex height (km, x1 scale). */
  lift: number
}

/**
 * Height on a cell split along the tile mesh's diagonal (v+S .. v+1): corners `h00` (i,j), `h10`
 * (i+1,j), `h01` (i,j+1), `h11` (i+1,j+1); `fu` runs along i, `fv` along j (both 0..1).
 */
export function cellHeight(
  h00: number,
  h10: number,
  h01: number,
  h11: number,
  fu: number,
  fv: number,
): number {
  if (fu + fv <= 1) return h00 + fu * (h10 - h00) + fv * (h01 - h00)
  return h11 + (1 - fu) * (h01 - h11) + (1 - fv) * (h10 - h11)
}

/** Rendered height of `layer` at a lat/lon, or null outside it. `h` samples the DEM at a lat/lon. */
export function layerHeight(
  layer: GridLayer,
  p: LatLon,
  h: (lat: number, lon: number) => number,
): number | null {
  const gu = lonToTileX(p.lon, layer.z) * layer.segs
  const gv = latToTileY(p.lat, layer.z) * layer.segs
  if (
    gu < layer.x0 * layer.segs ||
    gu >= (layer.x1 + 1) * layer.segs ||
    gv < layer.y0 * layer.segs ||
    gv >= (layer.y1 + 1) * layer.segs
  )
    return null
  const i = Math.floor(gu)
  const j = Math.floor(gv)
  const at = (a: number, b: number): number =>
    h(tileYToLat(b / layer.segs, layer.z), tileXToLon(a / layer.segs, layer.z))
  return (
    cellHeight(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), gu - i, gv - j) + layer.lift
  )
}
