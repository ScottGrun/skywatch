// Height of the surface as actually drawn (tile mesh triangles), so aircraft never sink into it.
import { toLatLon, toLocal } from '../core/geo'
import type { Airport } from '../types'
import { TILE_FAR_DROP, TILE_R, TILE_R_FAR, TILE_ZOOM, TILE_ZOOM_FAR } from './constants'
import { activeRings } from './lodRings'
import { SEGS_INNER, SEGS_OUTER } from './tiles'
import { isTerrainLoaded, terrainOrigin, terrainY } from './terrain'
import { layerHeight, type GridLayer } from './surfaceMath'
import { latToTileY, lonToTileX, patchTileRange } from './tileMath'

const block = (ap: Airport, z: number, R: number, segs: number, lift: number): GridLayer => {
  const cx = Math.floor(lonToTileX(ap.lon, z))
  const cy = Math.floor(latToTileY(ap.lat, z))
  return { z, segs, x0: cx - R, x1: cx + R, y0: Math.max(0, cy - R), y1: cy + R, lift }
}

let cachedFor: Airport | null = null
let cachedRings: readonly unknown[] = []
let layers: GridLayer[] = []

function layersFor(ap: Airport): GridLayer[] {
  if (cachedFor !== ap || cachedRings !== activeRings()) {
    cachedFor = ap
    cachedRings = activeRings()
    layers = [
      block(ap, TILE_ZOOM_FAR, TILE_R_FAR, SEGS_OUTER, -TILE_FAR_DROP),
      block(ap, TILE_ZOOM, TILE_R, SEGS_INNER, 0),
      ...activeRings().map((r) => ({
        z: r.z,
        segs: r.segs,
        ...patchTileRange(ap.lat, ap.lon, r.z, r.halfKm),
        lift: r.lift,
      })),
    ]
  }
  return layers
}

/**
 * Highest drawn surface at local km east/north, x1 scale (km relative to airport elevation): the
 * max of every tile layer's triangulated height and the exact DEM height there.
 */
export function surfaceY(e: number, n: number): number {
  const ap = terrainOrigin()
  const exact = terrainY(e, n)
  if (!ap) return exact
  const p = toLatLon(ap, e, n)
  let top = exact
  for (const l of layersFor(ap)) {
    const y = layerHeight(l, p, (lat, lon) => {
      const q = toLocal(ap, lat, lon)
      return terrainY(q.e, q.n)
    })
    if (y !== null && y > top) top = y
  }
  return top
}

/** Re-sample the surface only after moving this far (km); mesh cells are 40 m to several km. */
const PROBE_MOVE_KM = 0.1

/** Per-aircraft cache of `surfaceY`: recomputed only when the aircraft moved noticeably. */
export class SurfaceProbe {
  private e = NaN
  private n = NaN
  private y = 0
  private loaded = false

  invalidate(): void {
    this.e = NaN
  }

  /** x1 surface height (km) at local km east/north. */
  at(e: number, n: number): number {
    const loaded = isTerrainLoaded()
    if (loaded !== this.loaded || !(Math.hypot(e - this.e, n - this.n) < PROBE_MOVE_KM)) {
      this.loaded = loaded
      this.e = e
      this.n = n
      this.y = surfaceY(e, n)
    }
    return this.y
  }
}
