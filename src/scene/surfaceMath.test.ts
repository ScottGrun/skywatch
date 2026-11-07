import { describe, expect, it } from 'vitest'
import { cellHeight, layerHeight, type GridLayer } from './surfaceMath'
import { latToTileY, lonToTileX, tileXToLon, tileYToLat } from './tileMath'

describe('cellHeight', () => {
  it('reproduces a plane exactly', () => {
    const f = (u: number, v: number) => 2 + 3 * u - 1 * v
    for (const [u, v] of [
      [0.2, 0.3],
      [0.8, 0.7],
      [0.5, 0.5],
      [0, 1],
    ])
      expect(cellHeight(f(0, 0), f(1, 0), f(0, 1), f(1, 1), u, v)).toBeCloseTo(f(u, v))
  })
  it('matches corners', () => {
    expect(cellHeight(1, 2, 3, 4, 0, 0)).toBe(1)
    expect(cellHeight(1, 2, 3, 4, 1, 1)).toBe(4)
  })
})

describe('layerHeight', () => {
  const z = 10
  const layer: GridLayer = { z, segs: 4, x0: 100, x1: 100, y0: 200, y1: 200, lift: 0.01 }
  const lat = tileYToLat(200.3, z)
  const lon = tileXToLon(100.3, z)

  it('is null outside the block', () => {
    expect(layerHeight(layer, { lat: tileYToLat(202, z), lon }, () => 0)).toBeNull()
  })
  it('lies below a DEM peak between vertices (the mesh cuts the corner)', () => {
    // Peak 1 km high at one mesh vertex only; DEM has a narrow spike in between.
    const vLon = tileXToLon(100.25, z)
    const vLat = tileYToLat(200.25, z)
    const peak = (la: number, lo: number): number =>
      Math.abs(la - vLat) < 1e-9 && Math.abs(lo - vLon) < 1e-9 ? 1 : 0
    const near = layerHeight(
      layer,
      { lat: tileYToLat(200.26, z), lon: tileXToLon(100.26, z) },
      peak,
    )
    expect(near).not.toBeNull()
    expect(near as number).toBeLessThan(1.01)
    expect(near as number).toBeGreaterThan(0.01)
  })
  it('adds the lift and follows a flat DEM', () => {
    expect(layerHeight(layer, { lat, lon }, () => 0.5)).toBeCloseTo(0.51)
    expect(lonToTileX(lon, z)).toBeCloseTo(100.3)
    expect(latToTileY(lat, z)).toBeCloseTo(200.3)
  })
})
