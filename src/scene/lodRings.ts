import { DETAIL_FADE_KM, DETAIL_HALF_KM, DETAIL_LIFT, DETAIL_SEGS, DETAIL_ZOOM } from './constants'

/**
 * Tiered basemap rings between the z10 base mesh and the airport. Each ring is a square of tiles
 * (zoom `z`, half-size `halfKm`) draped on the terrain, edge-faded into the layer below, nearest
 * tile first. `lift` (km, x1 scale) stacks the rings: higher zoom sits higher, the top one is
 * DETAIL_LIFT (pavement and lights are placed against it).
 */
export interface LodRing {
  z: number
  halfKm: number
  /** Mesh subdivisions per tile side; cells never coarser than the layer below (no poke-through). */
  segs: number
  fadeKm: number
  lift: number
  /** Only with the keyless 256px provider: Mapbox z10@2x is already as sharp as z12 there. */
  esriOnly?: boolean
}

export const LOD_RINGS: readonly LodRing[] = [
  { z: 12, halfKm: 40, segs: 24, fadeKm: 4, lift: 0.003, esriOnly: true },
  { z: 13, halfKm: 15, segs: 16, fadeKm: 2, lift: 0.0045 },
  {
    z: DETAIL_ZOOM,
    halfKm: DETAIL_HALF_KM,
    segs: DETAIL_SEGS,
    fadeKm: DETAIL_FADE_KM,
    lift: DETAIL_LIFT,
  },
]

let active: readonly LodRing[] = LOD_RINGS

/** Rings in use for the current airport (depends on the tile provider); read by the surface clamp. */
export const activeRings = (): readonly LodRing[] => active

export function selectRings(mapbox: boolean): readonly LodRing[] {
  active = LOD_RINGS.filter((r) => !(mapbox && r.esriOnly))
  return active
}
