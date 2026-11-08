import * as THREE from 'three'
import type { Theme } from '../types'
import { tileUrl } from './tileMath'

/** One tile mesh's material plus the slippy-map address of its texture. */
export interface TileSlot {
  mat: THREE.MeshBasicMaterial
  z: number
  x: number
  y: number
  ver: number
  /** Standard-resolution Mapbox tile (no @2x, 512px): used by the many-tile detail patch. */
  lowRes?: boolean
}

export type TileLoader = ReturnType<typeof createTileLoader>

/**
 * Loads tile textures into slots. Reloading a slot (theme change) keeps the old texture until the
 * new one has arrived, then swaps and disposes it; stale or late results are discarded.
 */
export function createTileLoader(
  token: () => string | undefined,
  maxAniso: number,
  styleFor: (t: Theme) => string | undefined,
  tintFor: (t: Theme) => readonly [number, number, number],
  /** Called when a Mapbox tile fails; the slot is then retried (token() should now be undefined). */
  onMapboxFail: () => void,
) {
  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')
  let alive = true
  const api = {
    load(slot: TileSlot, theme: Theme): void {
      const ver = ++slot.ver
      const tk = token()
      loader.load(
        tileUrl(slot.z, slot.x, slot.y, tk, styleFor(theme), theme, !slot.lowRes),
        (tex) => {
          if (!alive || ver !== slot.ver) {
            tex.dispose()
            return
          }
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = maxAniso
          const old = slot.mat.map
          slot.mat.map = tex
          slot.mat.color.setRGB(...tintFor(theme))
          if (!old) slot.mat.needsUpdate = true
          old?.dispose()
        },
        undefined,
        () => {
          if (!tk || !alive || ver !== slot.ver) return
          onMapboxFail()
          if (!token()) api.load(slot, theme)
        },
      )
    },
    dispose(): void {
      alive = false
    },
  }
  return api
}
