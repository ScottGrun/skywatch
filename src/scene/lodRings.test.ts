import { describe, expect, it } from 'vitest'
import { DETAIL_LIFT } from './constants'
import { LOD_RINGS, selectRings } from './lodRings'

describe('LOD rings', () => {
  it('stack by zoom: growing zoom, shrinking extent, rising lift, top = DETAIL_LIFT', () => {
    for (let i = 1; i < LOD_RINGS.length; i++) {
      expect(LOD_RINGS[i].z).toBeGreaterThan(LOD_RINGS[i - 1].z)
      expect(LOD_RINGS[i].halfKm).toBeLessThan(LOD_RINGS[i - 1].halfKm)
      expect(LOD_RINGS[i].lift).toBeGreaterThan(LOD_RINGS[i - 1].lift)
    }
    expect(LOD_RINGS[LOD_RINGS.length - 1].lift).toBe(DETAIL_LIFT)
  })

  it('drops Esri-only rings when Mapbox works', () => {
    expect(selectRings(true).some((r) => r.esriOnly)).toBe(false)
    expect(selectRings(false)).toHaveLength(LOD_RINGS.length)
  })
})
