// Pure Web Mercator tile helpers.
import { D2R } from './constants'

export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z
}

export function latToTileY(lat: number, z: number): number {
  const r = lat * D2R
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180
}

export function tileYToLat(y: number, z: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / D2R
}

/** Tile URL. Mapbox 512px tiles cover the same extent as standard 256px tiles at the same z. */
export function tileUrl(z: number, x: number, y: number, token: string | undefined): string {
  if (token) {
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/512/${z}/${x}/${y}@2x?access_token=${token}`
  }
  // CARTO's free basemaps now return an "API KEY REQUIRED" placeholder; Esri Dark Gray is keyless.
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`
}

export function attributionFor(token: string | undefined): string {
  return token
    ? '© Mapbox © OpenStreetMap'
    : 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors'
}
