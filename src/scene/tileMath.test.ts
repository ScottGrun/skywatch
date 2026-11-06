import { describe, expect, it } from 'vitest'
import {
  attributionFor,
  parseMapboxStyle,
  latToTileY,
  lonToTileX,
  tileUrl,
  tileXToLon,
  tileYToLat,
} from './tileMath'

describe('tileMath', () => {
  it('round-trips lon/lat through tile coordinates', () => {
    const x = lonToTileX(-123.18, 10)
    const y = latToTileY(49.19, 10)
    expect(tileXToLon(x, 10)).toBeCloseTo(-123.18, 6)
    expect(tileYToLat(y, 10)).toBeCloseTo(49.19, 6)
  })
  it('places the equator/prime meridian at the centre tile', () => {
    expect(lonToTileX(0, 3)).toBeCloseTo(4)
    expect(latToTileY(0, 3)).toBeCloseTo(4)
  })
  it('builds provider urls and attribution', () => {
    expect(tileUrl(10, 1, 2, undefined)).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/10/2/1',
    )
    expect(tileUrl(10, 1, 2, 'tok')).toContain(
      'mapbox/dark-v11/tiles/512/10/1/2@2x?access_token=tok',
    )
    expect(attributionFor('tok')).toContain('Mapbox')
    expect(attributionFor(undefined)).toContain('Esri')
  })
  it('parses mapbox style forms', () => {
    const want = { user: 'me', id: 'abc' }
    expect(parseMapboxStyle('mapbox://styles/me/abc')).toEqual(want)
    expect(parseMapboxStyle('me/abc')).toEqual(want)
    expect(parseMapboxStyle('https://api.mapbox.com/styles/v1/me/abc?access_token=x')).toEqual(want)
    expect(parseMapboxStyle(undefined)).toEqual({ user: 'mapbox', id: 'dark-v11' })
    expect(tileUrl(1, 2, 3, 't', 'mapbox://styles/me/abc')).toContain(
      '/styles/v1/me/abc/tiles/512/1/2/3@2x',
    )
  })
})
