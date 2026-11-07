import * as THREE from 'three'
import { toLocal } from '../core/geo'
import { nearbyLights } from '../core/lightLayout'
import type { Airport } from '../types'
import { FT_TO_KM, RUNWAY_MIN_WIDTH_KM } from './constants'
import { buildLightsFrom, LIGHT_LIFT, type LightsHandle } from './lights'
import { buildPavement, drapedY, type PavementRunway } from './pavement'
import type { Seg } from './terrain'

/** Runways of neighbouring airports in the selected airport's local km frame. */
function pavementOf(origin: Airport, aps: readonly Airport[]): PavementRunway[] {
  return aps.flatMap((ap) =>
    ap.runways.map((r) => ({
      a: toLocal(origin, r.le.lat, r.le.lon),
      b: toLocal(origin, r.he.lat, r.he.lon),
      widthKm: Math.max(RUNWAY_MIN_WIDTH_KM, r.widthFt * FT_TO_KM),
      idents: [r.le.ident, r.he.ident] as const,
    })),
  )
}

/** Terrain pins: each neighbour's runways flatten the ground to that airport's own elevation. */
export function nearbySegs(origin: Airport, aps: readonly Airport[]): Seg[] {
  return aps.flatMap((ap) =>
    ap.runways.map((r) => {
      const a = toLocal(origin, r.le.lat, r.le.lon)
      const b = toLocal(origin, r.he.lat, r.he.lon)
      return { ax: a.e, an: a.n, bx: b.e, bn: b.n, elevFt: ap.elevationFt }
    }),
  )
}

export interface NearbyHandle {
  root: THREE.Group
  lights: LightsHandle | null
  lightCount: number
  setLit(lit: boolean): void
  setLightsVisible(on: boolean): void
  /** Per frame: put pavement and lights on the drawn detail patch (see `drapedY`). */
  place(vk: number, b: number): void
}

/** Pavement (+ sparse edge/threshold/end lights when `dark`) for neighbouring airports, built into `parent`. */
export function buildNearby(
  parent: THREE.Group,
  origin: Airport,
  aps: readonly Airport[],
  aniso: number,
  dark: boolean,
): NearbyHandle {
  const root = new THREE.Group()
  const paved = buildPavement(pavementOf(origin, aps), aniso)
  root.add(paved.group)
  const lights = dark ? buildLightsFrom(nearbyLights(aps, origin, RUNWAY_MIN_WIDTH_KM)) : null
  if (lights) root.add(lights.root)
  parent.add(root)
  console.info(
    `[nearby] ${aps.length} airports (${aps.map((a) => a.icao).join(' ')}), ${lights?.count ?? 0} lights`,
  )
  return {
    root,
    lights,
    lightCount: lights?.count ?? 0,
    setLit: paved.setLit,
    setLightsVisible(on) {
      if (lights) lights.root.visible = on
    },
    place(vk, b) {
      paved.group.position.y = drapedY(vk, b)
      if (lights) lights.root.position.y = drapedY(vk, b, LIGHT_LIFT)
    },
  }
}
