import { describe, expect, it } from 'vitest'
import {
  attributionFor,
  parseMapboxStyle,
  latToTileY,
  lonToTileX,
  patchTileRange,
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
  it('picks light basemaps', () => {
    expect(tileUrl(10, 1, 2, undefined, undefined, 'light')).toContain('World_Light_Gray_Base')
    expect(tileUrl(10, 1, 2, 'tok', undefined, 'light')).toContain('mapbox/light-v11/')
    expect(tileUrl(10, 1, 2, 'tok', 'me/abc', 'light')).toContain('/styles/v1/me/abc/')
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

describe('patchTileRange', () => {
  it('covers the point and about 8 km of z15 tiles around KSEA', () => {
    const r = patchTileRange(47.45, -122.31, 15, 4)
    const x = Math.floor(lonToTileX(-122.31, 15))
    const y = Math.floor(latToTileY(47.45, 15))
    expect(r.x0).toBeLessThanOrEqual(x)
    expect(r.x1).toBeGreaterThanOrEqual(x)
    expect(r.y0).toBeLessThanOrEqual(y)
    expect(r.y1).toBeGreaterThanOrEqual(y)
    const nx = r.x1 - r.x0 + 1
    expect(nx).toBeGreaterThanOrEqual(9)
    expect(nx).toBeLessThanOrEqual(11)
  })
  it('clamps to valid rows', () => {
    const r = patchTileRange(85, 0, 15, 4)
    expect(r.y0).toBeGreaterThanOrEqual(0)
  })
})
