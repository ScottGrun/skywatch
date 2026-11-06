import * as THREE from 'three'
import { KM_PER_NM } from '../core/geo'
import {
  COMPASS_RADIUS_KM,
  D2R,
  GRID_COLOR,
  GRID_OPACITY,
  RING_COLOR,
  RING_LABEL_BEARING,
  RING_LABEL_COLOR,
  RING_NM,
} from './constants'
import { applyRadialFog } from './radialFog'

/** A fixed text marker positioned in world space (e/n km, ground level). */
export interface StaticLabelDef {
  e: number
  n: number
  text: string
  css: string
}

const FONT = "'IBM Plex Mono',monospace"

function circle(r: number): THREE.Line {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.sin(a) * r, 0.05, Math.cos(a) * r))
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    applyRadialFog(new THREE.LineBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.9 })),
  )
}

/** Grid + range rings added to `group`; returns label definitions for the overlay. */
export function buildRings(group: THREE.Group): StaticLabelDef[] {
  const grid = new THREE.GridHelper(800, 80, GRID_COLOR, GRID_COLOR)
  const gm = applyRadialFog(grid.material as THREE.Material)
  gm.transparent = true
  gm.opacity = GRID_OPACITY
  grid.position.y = 0.02
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
