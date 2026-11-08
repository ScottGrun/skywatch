import * as THREE from 'three'
import { toLocal } from '../core/geo'
import type { Airport, Theme } from '../types'
import type { LodRing } from './lodRings'
import { PALETTES } from './theme'
import { nextFrame } from './frameYield'
import type { TileCuller } from './tileCull'
import type { TileSlot, TileLoader } from './tileLoader'
import { buildTileGeometry, createTerrainMaterial, type TileSpec } from './terrainMesh'
import { patchTileRange, tileXToLon, tileYToLat } from './tileMath'

const BATCH_MS = 5

export interface RingStats {
  slots: TileSlot[]
  /** Tiles in the ring (for reporting). */
  count: number
  triangles: number
  culler: TileCuller
}

/**
 * Adds one LOD ring of tiles above the base tiles. Tiles are created nearest-first a few per frame
 * and their textures requested in that order, so the area around the airport sharpens first.
 * Call after terrain heights are available. Resolves once every tile was created; `alive` stops
 * the work once the airport was switched.
 */
export async function buildLodRing(
  group: THREE.Group,
  ap: Airport,
  tiles: TileLoader,
  theme: Theme,
  ring: LodRing,
  order: number,
  alive: () => boolean,
  out: RingStats,
): Promise<void> {
  const { z, halfKm, segs, fadeKm, lift } = ring
  const r = patchTileRange(ap.lat, ap.lon, z, halfKm)
  const nw = toLocal(ap, tileYToLat(r.y0, z), tileXToLon(r.x0, z))
  const se = toLocal(ap, tileYToLat(r.y1 + 1, z), tileXToLon(r.x1 + 1, z))
  const box = [nw.e, -nw.n, se.e, -se.n] as const
  const jobs: { x: number; y: number; d: number }[] = []
  for (let x = r.x0; x <= r.x1; x++) {
    for (let y = r.y0; y <= r.y1; y++) {
      const c = toLocal(ap, tileYToLat(y + 0.5, z), tileXToLon(x + 0.5, z))
      jobs.push({ x, y, d: Math.hypot(c.e, c.n) })
    }
  }
  jobs.sort((a, b) => a.d - b.d)
  out.count += jobs.length

  let i = 0
  while (i < jobs.length && alive()) {
    const end = performance.now() + BATCH_MS
    do {
      const { x, y } = jobs[i++]
      const { mat } = createTerrainMaterial(lift, PALETTES[theme].bg, { box, widthKm: fadeKm })
      const spec: TileSpec = { ap, z, tx: x, ty: y, segs, dropY: lift }
      const mesh = new THREE.Mesh(buildTileGeometry(spec), mat)
      mesh.renderOrder = order
      group.add(mesh)
      out.culler.add(mesh)
      out.triangles += segs * segs * 2 + 8 * segs
      const slot: TileSlot = { mat, z, x, y, ver: 0, lowRes: true }
      out.slots.push(slot)
      tiles.load(slot, theme)
    } while (i < jobs.length && performance.now() < end)
    await nextFrame()
  }
}
