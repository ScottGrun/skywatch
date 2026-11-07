import { describe, expect, it } from 'vitest'
import { decodeHeight, elevationUrl } from './elevationTiles'

describe('elevation decoding', () => {
  it('decodes Mapbox Terrain-RGB', () => {
    expect(decodeHeight('mapbox', 1, 134, 160)).toBeCloseTo(0, 0) // 0 m
    expect(decodeHeight('mapbox', 0, 0, 0)).toBe(-10000)
    expect(decodeHeight('mapbox', 1, 134, 160 + 10)).toBeCloseTo(1, 5)
  })
  it('decodes Terrarium', () => {
    expect(decodeHeight('terrarium', 128, 0, 0)).toBe(0)
    expect(decodeHeight('terrarium', 128, 144, 128)).toBeCloseTo(144.5, 5)
  })
  it('builds provider URLs', () => {
    expect(elevationUrl('mapbox', 9, 82, 178, 'tk')).toBe(
      'https://api.mapbox.com/v4/mapbox.terrain-rgb/9/82/178.pngraw?access_token=tk',
    )
    expect(elevationUrl('terrarium', 9, 82, 178)).toContain('/terrarium/9/82/178.png')
  })
})
