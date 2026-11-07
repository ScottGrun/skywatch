import * as THREE from 'three'
import { toLocal } from '../core/geo'
import type { Airport } from '../types'
import {
  BG,
  TILE_FAR_DROP,
  TILE_R,
  TILE_R_FAR,
  TILE_TINT,
  TILE_TINT_CUSTOM,
  TILE_TINT_ESRI,
  TILE_ZOOM,
  TILE_ZOOM_FAR,
} from './constants'
import { applyRadialFog } from './radialFog'
import { runwayGeoms } from './runways'
import { loadTerrain, sceneY, terrainSource, tileBox, type Seg } from './terrain'
import { buildTileGeometry, createTerrainMaterial, type TileSpec } from './terrainMesh'
import { attributionFor, latToTileY, lonToTileX, tileUrl } from './tileMath'

const token = (): string | undefined => import.meta.env.VITE_MAPBOX_TOKEN || undefined
const style = (): string | undefined => import.meta.env.VITE_MAPBOX_STYLE || undefined

/** Mesh subdivisions per tile side (detailed ring / outer ring). */
export const SEGS_INNER = 48
export const SEGS_OUTER = 24
const BATCH_MS = 8
/** Outer ring stops this far inside the detailed ring's edge so they overlap (hides seams). */
const HOLE_INSET_KM = 0.3

/** Attribution string matching the active tile provider (for the UI to display). */
export function mapAttribution(): string {
  return attributionFor(token())
}

export interface TilesStats {
  triangles: number
  /** ms from setAirport to terrain geometry complete (set when done). */
  terrainMs: number | null
}

/**
 * Adds the tile mosaic (detailed ring + low-zoom outer ring) and backing plane to `group`, flat at
 * first. Elevation then loads in the background; `onTerrain` fires once heights are available
 * (before the tile meshes are rebuilt, a few per frame).
 */
export function buildTiles(
  group: THREE.Group,
  ap: Airport,
  maxAniso: number,
  onTerrain: () => void,
  onReady: () => void,
): TilesStats {
  const stats: TilesStats = { triangles: 0, terrainMs: null }
  const t0 = performance.now()
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    applyRadialFog(new THREE.MeshBasicMaterial({ color: BG })),
  )
  base.rotation.x = -Math.PI / 2
  base.position.y = Math.min(-0.14, sceneY(0, ap.elevationFt) - 0.2)
  group.add(base)

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')
  const tk = token()
  const abort = new AbortController()
  let alive = true
  group.userData.onDispose = () => {
    alive = false
    abort.abort()
  }
  const tint = tk ? (style() ? TILE_TINT_CUSTOM : TILE_TINT) : TILE_TINT_ESRI

  // Rectangle (world xz) covered by the detailed ring; the outer ring discards inside it.
  const ib = tileBox(ap, TILE_ZOOM, TILE_R)
  const sw = toLocal(ap, ib.latMin, ib.lonMin)
  const ne = toLocal(ap, ib.latMax, ib.lonMax)
  const nw = toLocal(ap, ib.latMax, ib.lonMin)
  const se = toLocal(ap, ib.latMin, ib.lonMax)
  const holeBox: [number, number, number, number] = [
    Math.max(sw.e, nw.e) + HOLE_INSET_KM,
    -(Math.min(nw.n, ne.n) - HOLE_INSET_KM),
    Math.min(se.e, ne.e) - HOLE_INSET_KM,
    -(Math.max(sw.n, se.n) + HOLE_INSET_KM),
  ]

  const jobs: { mesh: THREE.Mesh; spec: TileSpec; d: number }[] = []
  const layer = (z: number, R: number, segs: number, dropY: number): void => {
    const N = 2 ** z
    const cx = Math.floor(lonToTileX(ap.lon, z))
    const cy = Math.floor(latToTileY(ap.lat, z))
    for (let tx = cx - R; tx <= cx + R; tx++) {
      for (let ty = cy - R; ty <= cy + R; ty++) {
        if (ty < 0 || ty >= N) continue
        const wx = ((tx % N) + N) % N
        const { mat, hole } = createTerrainMaterial(dropY)
        if (dropY < 0) hole.set(...holeBox)
        const spec: TileSpec = { ap, z, tx, ty, segs, dropY }
        const mesh = new THREE.Mesh(buildTileGeometry({ ...spec, segs: 1 }), mat)
        group.add(mesh)
        jobs.push({ mesh, spec, d: Math.hypot(tx - cx, ty - cy) * 2 ** (10 - z) })
        loader.load(tileUrl(z, wx, ty, tk, style()), (tex) => {
          if (!alive) {
            tex.dispose()
            return
          }
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = maxAniso
          mat.map = tex
          mat.color.setRGB(...tint)
          mat.needsUpdate = true
        })
      }
    }
  }
  layer(TILE_ZOOM_FAR, TILE_R_FAR, SEGS_OUTER, -TILE_FAR_DROP)
  layer(TILE_ZOOM, TILE_R, SEGS_INNER, 0)

  const segsList: Seg[] = runwayGeoms(ap).map((g) => ({
    ax: g.a.e,
    an: g.a.n,
    bx: g.b.e,
    bn: g.b.n,
  }))
  void loadTerrain(ap, segsList, tk, abort.signal).then(async () => {
    if (!alive) return
    const tLoaded = performance.now()
    onTerrain()
    jobs.sort((a, b) => a.d - b.d)
    let i = 0
    while (i < jobs.length && alive) {
      const end = performance.now() + BATCH_MS
      do {
        const j = jobs[i++]
        j.mesh.geometry.dispose()
        j.mesh.geometry = buildTileGeometry(j.spec)
        stats.triangles += j.spec.segs * j.spec.segs * 2 + 8 * j.spec.segs
      } while (i < jobs.length && performance.now() < end)
      await new Promise((r) => setTimeout(r))
    }
    if (!alive) return
    stats.terrainMs = performance.now() - t0
    onReady()
    console.info(
      `[terrain] ${terrainSource()} ${Math.round(stats.terrainMs)} ms (elevation ${Math.round(tLoaded - t0)} ms), ${stats.triangles} triangles`,
    )
  })
  return stats
}

/** Dispose geometries, materials and textures under `obj` (skips geometries flagged shared). */
export function disposeObject(obj: THREE.Object3D): void {
  const cb = obj.userData.onDispose as (() => void) | undefined
  cb?.()
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      ;(x as THREE.MeshBasicMaterial).map?.dispose()
      x.dispose()
    }
  })
}
