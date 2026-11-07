import * as THREE from 'three'
import { KM_PER_NM } from '../core/geo'
import {
  COMPASS_RADIUS_KM,
  DECOR_LIFT,
  D2R,
  GRID_COLOR,
  GRID_OPACITY,
  RING_COLOR,
  RING_LABEL_BEARING,
  RING_LABEL_COLOR,
  RING_NM,
} from './constants'
import { applyRadialFog } from './radialFog'
import { groundY } from './terrain'

/** A fixed text marker positioned in world space (e/n km, ground level). */
export interface StaticLabelDef {
  e: number
  n: number
  text: string
  css: string
}

const FONT = "'IBM Plex Mono',monospace"

const RING_STEPS = 360
const GRID_HALF = 400
const GRID_SPACING = 10
const GRID_STEP = 2.5

/** Square grid whose lines follow the terrain surface. */
function terrainGrid(): THREE.LineSegments {
  const pts: number[] = []
  const line = (fixed: number, alongE: boolean): void => {
    for (let s = -GRID_HALF; s < GRID_HALF; s += GRID_STEP) {
      for (const t of [s, s + GRID_STEP]) {
        const e = alongE ? t : fixed
        const n = alongE ? fixed : t
        pts.push(e, groundY(e, n) + DECOR_LIFT, -n)
      }
    }
  }
  for (let k = -GRID_HALF; k <= GRID_HALF; k += GRID_SPACING) {
    line(k, true)
    line(k, false)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: GRID_COLOR }))
}

function circle(r: number): THREE.Line {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= RING_STEPS; i++) {
    const a = (i / RING_STEPS) * Math.PI * 2
    const e = Math.sin(a) * r
    const n = Math.cos(a) * r
    pts.push(new THREE.Vector3(e, groundY(e, n) + DECOR_LIFT, -n))
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    applyRadialFog(
      new THREE.LineBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.9 }),
    ),
  )
}

/** Grid + range rings added to `group`; returns label definitions for the overlay. */
export function buildRings(group: THREE.Group): StaticLabelDef[] {
  const grid = terrainGrid()
  const gm = applyRadialFog(grid.material as THREE.Material)
  gm.transparent = true
  gm.opacity = GRID_OPACITY
  group.add(grid)

  const labels: StaticLabelDef[] = []
  const b = RING_LABEL_BEARING * D2R
  for (const nm of RING_NM) {
    const r = nm * KM_PER_NM
    group.add(circle(r))
    labels.push({
      e: Math.sin(b) * r,
      n: Math.cos(b) * r,
      text: `${nm} NM`,
      css: `font:500 10px/1 ${FONT};color:${RING_LABEL_COLOR}`,
    })
  }
  const dirs: Array<[string, number]> = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['W', 270],
  ]
  for (const [t, deg] of dirs) {
    labels.push({
      e: Math.sin(deg * D2R) * COMPASS_RADIUS_KM,
      n: Math.cos(deg * D2R) * COMPASS_RADIUS_KM,
      text: t,
      css: `font:600 11px/1 ${FONT};color:${RING_LABEL_COLOR}`,
    })
  }
  return labels
}
