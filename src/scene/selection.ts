import * as THREE from 'three'
import { angleDiffDeg } from '../core/geo'
import type { Aircraft } from '../types'
import type { AircraftView } from './aircraftView'
import {
  D2R,
  ROUTE_DASH,
  ROUTE_EXTEND_KM,
  ROUTE_GAP,
  ROUTE_OPACITY,
  SELECT_COLOR,
} from './constants'
import type { Threshold } from './runways'

export interface SelectionHandle {
  update(
    view: AircraftView | null,
    ac: Aircraft | null,
    camera: THREE.Camera,
    nowMs: number,
    thresholds: readonly Threshold[],
  ): void
  dispose(): void
}

/** Landing threshold to aim an arrival at: nearest of those roughly aligned with its track. */
export function pickThreshold(ac: Aircraft, ts: readonly Threshold[]): Threshold | null {
  let best: Threshold | null = null
  let bd = Infinity
  for (const aligned of [true, false]) {
    for (const t of ts) {
      if (aligned && angleDiffDeg(ac.trackDeg, t.headingDeg) > 45) continue
      const d = Math.hypot(t.e - ac.e, t.n - ac.n)
      if (d < bd) {
        bd = d
        best = t
      }
    }
    if (best) return best
  }
  return null
}

export function createSelection(scene: THREE.Scene): SelectionHandle {
  const rg = new THREE.BufferGeometry()
  const pos = new THREE.BufferAttribute(new Float32Array(6), 3)
  rg.setAttribute('position', pos)
  const route = new THREE.Line(
    rg,
    new THREE.LineDashedMaterial({
      color: SELECT_COLOR,
      dashSize: ROUTE_DASH,
      gapSize: ROUTE_GAP,
      transparent: true,
      opacity: ROUTE_OPACITY,
    }),
  )
  route.frustumCulled = false
  route.visible = false
  scene.add(route)

  return {
    update(view, ac, camera, nowMs, thresholds) {
      if (!view || !ac) {
        route.visible = false
        return
      }

      let ex: number
      let ey = view.y
      let ez: number
      const t = ac.category === 'ARR' && !ac.onGround ? pickThreshold(ac, thresholds) : null
      if (t) {
        ex = t.e
        ey = 0.06
        ez = -t.n
      } else {
        ex = ac.e + Math.sin(ac.trackDeg * D2R) * ROUTE_EXTEND_KM
        ez = -(ac.n + Math.cos(ac.trackDeg * D2R) * ROUTE_EXTEND_KM)
      }
      const a = pos.array as Float32Array
      a[0] = view.x
      a[1] = view.y
      a[2] = view.z
      a[3] = ex
      a[4] = ey
      a[5] = ez
      pos.needsUpdate = true
      route.computeLineDistances()
      route.visible = true
    },
    dispose() {
      scene.remove(route)
      rg.dispose()
      ;(route.material as THREE.Material).dispose()
    },
  }
}
