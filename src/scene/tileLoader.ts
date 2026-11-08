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
  const images = new THREE.ImageLoader()
  images.setCrossOrigin('anonymous')
  let alive = true

  /** Esri: base canvas + its transparent label ("_Reference") layer, composited into one texture. */
  function loadEsri(url: string, onTex: (t: THREE.Texture) => void, onErr: () => void): void {
    let base: HTMLImageElement | null = null
    let ref: HTMLImageElement | null = null
    let pending = 2
    const done = () => {
      if (--pending > 0) return
      if (!base) return onErr()
      const c = document.createElement('canvas')
      c.width = base.naturalWidth || 256
      c.height = base.naturalHeight || 256
      const g = c.getContext('2d')!
      g.drawImage(base, 0, 0, c.width, c.height)
      if (ref) g.drawImage(ref, 0, 0, c.width, c.height)
      onTex(new THREE.CanvasTexture(c))
    }
    images.load(url, (im) => ((base = im), done()), undefined, done)
    images.load(url.replace('_Base/', '_Reference/'), (im) => ((ref = im), done()), undefined, done)
  }
  const api = {
    load(slot: TileSlot, theme: Theme): void {
      const ver = ++slot.ver
      const tk = token()
      const url = tileUrl(slot.z, slot.x, slot.y, tk, styleFor(theme), theme, !slot.lowRes)
      const onTex = (tex: THREE.Texture) => {
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
      }
      if (!tk) {
        loadEsri(url, onTex, () => {})
        return
      }
      loader.load(url, onTex, undefined, () => {
        if (!alive || ver !== slot.ver) return
        onMapboxFail()
        if (!token()) api.load(slot, theme)
      })
    },
    dispose(): void {
      alive = false
    },
  }
  return api
}
