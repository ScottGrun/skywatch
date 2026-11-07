import * as THREE from 'three'
import { toLocal } from '../core/geo'
import type { Airport, Theme } from '../types'
import { DETAIL_FADE_KM, DETAIL_HALF_KM, DETAIL_LIFT, DETAIL_SEGS, DETAIL_ZOOM } from './constants'
import { PALETTES } from './theme'
import type { TileSlot, TileLoader } from './tileLoader'
import { buildTileGeometry, createTerrainMaterial, type TileSpec } from './terrainMesh'
import { patchTileRange, tileXToLon, tileYToLat } from './tileMath'

const BATCH_MS = 6

export interface DetailPatch {
  slots: TileSlot[]
  /** Tiles in the patch (for reporting). */
  count: number
}

/**
 * Adds the zoom-15 detail patch (~8 km square around the airport) above the base tiles. Tiles are
 * created nearest-first a few per frame and their textures requested in that order, so the area
 * around the runways sharpens first. Call after terrain heights are available. `alive` stops the
 * work once the airport was switched.
 */
export function buildDetailPatch(
  group: THREE.Group,
  ap: Airport,
  tiles: TileLoader,
  theme: Theme,
  alive: () => boolean,
): DetailPatch {
  const r = patchTileRange(ap.lat, ap.lon, DETAIL_ZOOM, DETAIL_HALF_KM)
  const nw = toLocal(ap, tileYToLat(r.y0, DETAIL_ZOOM), tileXToLon(r.x0, DETAIL_ZOOM))
  const se = toLocal(ap, tileYToLat(r.y1 + 1, DETAIL_ZOOM), tileXToLon(r.x1 + 1, DETAIL_ZOOM))
  const box = [nw.e, -nw.n, se.e, -se.n] as const
  const jobs: { x: number; y: number; d: number }[] = []
  for (let x = r.x0; x <= r.x1; x++) {
    for (let y = r.y0; y <= r.y1; y++) {
      const c = toLocal(ap, tileYToLat(y + 0.5, DETAIL_ZOOM), tileXToLon(x + 0.5, DETAIL_ZOOM))
      jobs.push({ x, y, d: Math.hypot(c.e, c.n) })
    }
  }
  jobs.sort((a, b) => a.d - b.d)
  const patch: DetailPatch = { slots: [], count: jobs.length }

  void (async () => {
    let i = 0
    while (i < jobs.length && alive()) {
      const end = performance.now() + BATCH_MS
      do {
        const { x, y } = jobs[i++]
        const { mat } = createTerrainMaterial(DETAIL_LIFT, PALETTES[theme].bg, {
          box,
          widthKm: DETAIL_FADE_KM,
        })
        const spec: TileSpec = {
          ap,
          z: DETAIL_ZOOM,
          tx: x,
          ty: y,
          segs: DETAIL_SEGS,
          dropY: DETAIL_LIFT,
        }
        const mesh = new THREE.Mesh(buildTileGeometry(spec), mat)
        mesh.renderOrder = 1
        group.add(mesh)
        const slot: TileSlot = { mat, z: DETAIL_ZOOM, x, y, ver: 0, lowRes: true }
        patch.slots.push(slot)
        tiles.load(slot, theme)
      } while (i < jobs.length && performance.now() < end)
      await new Promise((res) => setTimeout(res))
    }
  })()
  return patch
}
