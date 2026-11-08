import { expect, test } from 'vitest'
import { buildGrid, GRID } from './radarGrid'
import type { Radial, Volume } from './nexrad/level2'
import { polarToLocal } from './radarGeo'

/** One 0.5-degree sweep: a 40 dBZ blob at 60 km range due east, 10 dBZ elsewhere. */
function volume(lon = 0): Volume {
  const radials: Radial[] = []
  for (let a = 0; a < 720; a++) {
    const gates = new Uint8Array(400)
    for (let g = 0; g < 400; g++) {
      const rKm = (g * 250 + 125) / 1000
      const inBlob = Math.abs(a / 2 - 90) < 3 && Math.abs(rKm - 60) < 3
      gates[g] = (inBlob ? 40 : 10) * 2 + 66 // raw = dBZ * scale + offset
    }
    radials.push({ az: a / 2, el: 0.5, first: 125, size: 250, scale: 2, offset: 66, gates })
  }
  return {
    site: 'TEST',
    lat: 0,
    lon,
    heightM: 0,
    timeMs: 0,
    sweeps: [{ elevNum: 1, el: 0.5, radials }],
  }
}

const idx = (i: number, j: number, k: number) => (k * GRID.ny + j) * GRID.nx + i

test('grid has the documented size', () => {
  expect(buildGrid(volume(), { lat: 0, lon: 0 }).length).toBe(240 * 240 * 24)
})

test('echo lands at the beam height above the right ground position', () => {
  const g = buildGrid(volume(), { lat: 0, lon: 0 })
  const p = polarToLocal(90, 0.5, 60)
  const i = Math.floor(GRID.half + p.e)
  const j = Math.floor(GRID.half + p.n)
  const k = Math.floor(p.up / GRID.dz)
  expect(g[idx(i, j, k)]).toBe(40)
  expect(g[idx(i, j, 20)]).toBe(0) // far above the only cut
  expect(g[idx(GRID.half - 30, GRID.half + 30, k)]).toBeLessThanOrEqual(10)
})

test('a radar offset from the grid center shifts the echo', () => {
  // radar 0.1 deg of longitude east of the center = ~11.13 km
  const g = buildGrid(volume(0.1), { lat: 0, lon: 0 })
  const p = polarToLocal(90, 0.5, 60)
  const i = Math.floor(GRID.half + p.e + 11.13)
  expect(g[idx(i, GRID.half, Math.floor(p.up / GRID.dz))]).toBe(40)
})
