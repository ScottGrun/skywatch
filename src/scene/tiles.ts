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
import { attributionFor, latToTileY, lonToTileX, tileUrl, tileXToLon, tileYToLat } from './tileMath'

const token = (): string | undefined => import.meta.env.VITE_MAPBOX_TOKEN || undefined
const style = (): string | undefined => import.meta.env.VITE_MAPBOX_STYLE || undefined

/** Attribution string matching the active tile provider (for the UI to display). */
export function mapAttribution(): string {
  return attributionFor(token())
}

/** Adds the tile mosaic (detailed ring + low-zoom outer ring) and backing plane to `group`. */
export function buildTiles(group: THREE.Group, ap: Airport, maxAniso: number): void {
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    applyRadialFog(new THREE.MeshBasicMaterial({ color: BG })),
  )
  base.rotation.x = -Math.PI / 2
  base.position.y = -0.4
  group.add(base)

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')
  const tk = token()
  let alive = true
  group.userData.onDispose = () => {
    alive = false
  }
  const tint = tk ? (style() ? TILE_TINT_CUSTOM : TILE_TINT) : TILE_TINT_ESRI

  const layer = (z: number, R: number, y: number): void => {
    const N = 2 ** z
    const cx = Math.floor(lonToTileX(ap.lon, z))
    const cy = Math.floor(latToTileY(ap.lat, z))
    for (let tx = cx - R; tx <= cx + R; tx++) {
      for (let ty = cy - R; ty <= cy + R; ty++) {
        if (ty < 0 || ty >= N) continue
        const wx = ((tx % N) + N) % N
        const p0 = toLocal(ap, tileYToLat(ty, z), tileXToLon(tx, z))
        const p1 = toLocal(ap, tileYToLat(ty + 1, z), tileXToLon(tx + 1, z))
        const mat = applyRadialFog(new THREE.MeshBasicMaterial({ color: BG }))
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p1.e - p0.e, p0.n - p1.n), mat)
        mesh.rotation.x = -Math.PI / 2
        mesh.position.set((p0.e + p1.e) / 2, y, -(p0.n + p1.n) / 2)
        group.add(mesh)
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
  layer(TILE_ZOOM_FAR, TILE_R_FAR, -TILE_FAR_DROP)
  layer(TILE_ZOOM, TILE_R, 0)
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
