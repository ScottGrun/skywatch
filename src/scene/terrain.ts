// Terrain state + height lookup. Heights come from elevation raster tiles (see elevationTiles.ts).
import { FT_PER_M, toLatLon } from '../core/geo'
import type { Airport } from '../types'
import { D2R, FT_TO_KM, TILE_R, TILE_R_FAR, TILE_ZOOM, TILE_ZOOM_FAR } from './constants'
import {
  loadHeightField,
  type ElevSource,
  type HeightField,
  type LatLonBox,
} from './elevationTiles'
import { terrainBlend, vscale } from './vertical'
import { latToTileY, lonToTileX, tileXToLon, tileYToLat } from './tileMath'

const INNER_ELEV_ZOOM = 9
const OUTER_ELEV_ZOOM = 6
/** Terrain within this distance of a runway is pinned to airport elevation (DEM bumps). */
const FLAT_KM = 0.35
const BLEND_KM = 1.2
/** Width of the cross-fade between the detailed and outer elevation fields, inside the detailed box. */
const SEAM_KM = 12

export interface Seg {
  ax: number
  an: number
  bx: number
  bn: number
}

interface Data {
  ap: Airport
  inner: HeightField
  outer: HeightField
  innerBox: LatLonBox
  segs: Seg[]
  source: ElevSource
}

let data: Data | null = null

/** Lat/lon rectangle covered by the (2R+1)² tile block centred on the airport at zoom `z`. */
export function tileBox(ap: Airport, z: number, R: number): LatLonBox {
  const cx = Math.floor(lonToTileX(ap.lon, z))
  const cy = Math.floor(latToTileY(ap.lat, z))
  return {
    lonMin: tileXToLon(cx - R, z),
    lonMax: tileXToLon(cx + R + 1, z),
    latMax: tileYToLat(Math.max(0, cy - R), z),
    latMin: tileYToLat(Math.min(2 ** z, cy + R + 1), z),
  }
}

export function isTerrainLoaded(): boolean {
  return data !== null
}
export function terrainSource(): ElevSource | null {
  return data?.source ?? null
}
export function clearTerrain(): void {
  data = null
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function segDist(s: Seg, e: number, n: number): number {
  const dx = s.bx - s.ax
  const dn = s.bn - s.an
  const l2 = dx * dx + dn * dn || 1e-9
  const t = Math.min(1, Math.max(0, ((e - s.ax) * dx + (n - s.an) * dn) / l2))
  return Math.hypot(e - (s.ax + dx * t), n - (s.an + dn * t))
}

/** Ground height in metres (water clamped to sea level, flattened around runways). */
export function heightM(e: number, n: number): number {
  const d = data
  if (!d) return 0
  const { lat, lon } = toLatLon(d.ap, e, n)
  const b = d.innerBox
  const inside = lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax
  let h = Math.max(0, d.outer.sample(lat, lon))
  if (inside) {
    // Fade from the coarse outer field to the detailed inner one over SEAM_KM so the rings join without a step.
    const km = 111.2
    const edge = Math.min(
      (lat - b.latMin) * km,
      (b.latMax - lat) * km,
      (lon - b.lonMin) * km * Math.cos(lat * D2R),
      (b.lonMax - lon) * km * Math.cos(lat * D2R),
    )
    const w = smooth(0, SEAM_KM, edge)
    h += (Math.max(0, d.inner.sample(lat, lon)) - h) * w
  }
  let md = Infinity
  for (const s of d.segs) md = Math.min(md, segDist(s, e, n))
  if (md < BLEND_KM) {
    const apM = d.ap.elevationFt / FT_PER_M
    h += (apM - h) * (1 - smooth(FLAT_KM, BLEND_KM, md))
  }
  return h
}

/** Height (km, x1 vertical scale, relative to airport elevation) for a height in metres. */
export function sceneY(heightMeters: number, elevationFt: number): number {
  return (heightMeters * FT_PER_M - elevationFt) * FT_TO_KM
}

/** Terrain surface Y at local km east/north at x1 scale (for static geometry inside the scaled group). */
export function terrainY(e: number, n: number): number {
  return data ? sceneY(heightM(e, n), data.ap.elevationFt) : 0
}

/** Ground Y in the world as drawn now: x1 height times the current vertical scale and relief blend. */
export function groundY(e: number, n: number): number {
  return data ? terrainY(e, n) * vscale.k * terrainBlend.value : 0
}

let mapboxFailed = false

/** Loads elevation for `ap`. Tries Mapbox Terrain-RGB when a token is given, else/after failure AWS Terrarium. */
export async function loadTerrain(
  ap: Airport,
  segs: Seg[],
  token: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const ib = tileBox(ap, TILE_ZOOM, TILE_R)
  const ob = tileBox(ap, TILE_ZOOM_FAR, TILE_R_FAR)
  // AWS Terrarium is free and keyless, so it's the default. Mapbox Terrain-RGB is opt-in
  // (VITE_TERRAIN_SOURCE=mapbox): it bills against the Mapbox token and returned 429 for ours.
  const wantMapbox = import.meta.env.VITE_TERRAIN_SOURCE === 'mapbox' && !!token && !mapboxFailed
  const order: ElevSource[] = wantMapbox ? ['mapbox', 'terrarium'] : ['terrarium']
  for (const source of order) {
    try {
      const [inner, outer] = await Promise.all([
        loadHeightField(source, token, INNER_ELEV_ZOOM, ib, signal),
        loadHeightField(source, token, OUTER_ELEV_ZOOM, ob, signal),
      ])
      if (signal.aborted) return
      data = { ap, inner, outer, innerBox: ib, segs, source }
      return
    } catch (err) {
      if (signal.aborted) return
      console.warn(`terrain: ${source} failed`, err)
      if (source === 'mapbox') mapboxFailed = true // don't retry it this session
    }
  }
}

/** Airport the loaded terrain is centred on (null until loaded). */
export function terrainOrigin(): Airport | null {
  return data?.ap ?? null
}
