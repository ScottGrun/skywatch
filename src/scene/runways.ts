import * as THREE from 'three'
import { angleDiffDeg, toLocal } from '../core/geo'
import type { Aircraft, Airport } from '../types'
import {
  ACTIVE_REFRESH_MS,
  APPROACH_LEN_KM,
  APPROACH_OPACITY,
  D2R,
  FT_TO_KM,
  RUNWAY_COLOR,
  RUNWAY_MIN_WIDTH_KM,
} from './constants'
import { applyRadialFog } from './radialFog'
import { terrainY } from './terrain'

const APPROACH_STEP_KM = 0.5

/** A landing threshold: position (km east/north of airport) and landing heading. */
export interface Threshold {
  e: number
  n: number
  headingDeg: number
}

interface RunwayGeom {
  a: Threshold
  b: Threshold
  widthKm: number
}

export interface RunwaysHandle {
  thresholds: readonly Threshold[]
  /** Runway slabs: the scene counter-scales this group so they keep a constant world thickness. */
  slabs: THREE.Group
  /** Re-pick active landing ends from arriving traffic (throttled internally). */
  updateActive(aircraft: readonly Aircraft[], nowMs: number): void
}

/** Real runways from airport data, or the design's generic two-runway layout. */
export function runwayGeoms(ap: Airport): RunwayGeom[] {
  const open = ap.runways.filter((r) => !r.closed)
  const list = open.length ? open : ap.runways
  if (list.length) {
    return list.map((r) => {
      const a = toLocal(ap, r.le.lat, r.le.lon)
      const b = toLocal(ap, r.he.lat, r.he.lon)
      return {
        a: { ...a, headingDeg: r.le.headingDeg },
        b: { ...b, headingDeg: r.he.headingDeg },
        widthKm: Math.max(RUNWAY_MIN_WIDTH_KM, r.widthFt * FT_TO_KM),
      }
    })
  }
  const h = 90
  const o = (h + 90) * D2R
  const mk = (len: number, e: number, n: number): RunwayGeom => {
    const de = Math.sin(h * D2R)
    const dn = Math.cos(h * D2R)
    return {
      a: { e: e - (de * len) / 2, n: n - (dn * len) / 2, headingDeg: h },
      b: { e: e + (de * len) / 2, n: n + (dn * len) / 2, headingDeg: (h + 180) % 360 },
      widthKm: RUNWAY_MIN_WIDTH_KM,
    }
  }
  return [mk(3.2, 0, 0), mk(2.8, 0.9 * Math.sin(o), 0.9 * Math.cos(o))]
}

/** How many arrivals are lined up on the approach to `t`. */
function arrivalsOn(t: Threshold, aircraft: readonly Aircraft[]): number {
  const de = Math.sin(t.headingDeg * D2R)
  const dn = Math.cos(t.headingDeg * D2R)
  let c = 0
  for (const ac of aircraft) {
    if (ac.category !== 'ARR' || angleDiffDeg(ac.trackDeg, t.headingDeg) > 25) continue
    const re = ac.e - t.e
    const rn = ac.n - t.n
    const along = re * de + rn * dn
    if (along > 0 || along < -45) continue
    if (Math.abs(re * dn - rn * de) < 6) c++
  }
  return c
}

export function buildRunways(group: THREE.Group, ap: Airport): RunwaysHandle {
  const geoms = runwayGeoms(ap)
  const thresholds: Threshold[] = []
  const lines: THREE.Line[] = []
  const slabs = new THREE.Group()
  group.add(slabs)

  for (const g of geoms) {
    const dx = g.b.e - g.a.e
    const dn = g.b.n - g.a.n
    const len = Math.hypot(dx, dn) || 0.1
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(g.widthKm, 0.04, len),
      applyRadialFog(new THREE.MeshBasicMaterial({ color: RUNWAY_COLOR })),
    )
    m.position.set((g.a.e + g.b.e) / 2, 0, -(g.a.n + g.b.n) / 2)
    m.rotation.y = Math.atan2(dx, -dn)
    slabs.add(m)
    thresholds.push(g.a, g.b)
  }

  for (const t of thresholds) {
    const de = Math.sin(t.headingDeg * D2R)
    const dn = Math.cos(t.headingDeg * D2R)
    // Draped on the terrain so the final stays visible over hills.
    const pts: THREE.Vector3[] = []
    for (let d = 0; d <= APPROACH_LEN_KM + 1e-6; d += APPROACH_STEP_KM) {
      const e = t.e - de * d
      const n = t.n - dn * d
      pts.push(new THREE.Vector3(e, Math.max(0, terrainY(e, n)), -n))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const line = new THREE.Line(
      geo,
      applyRadialFog(
        new THREE.LineDashedMaterial({
          color: 0xffffff,
          dashSize: 0.8,
          gapSize: 0.8,
          transparent: true,
          opacity: APPROACH_OPACITY,
        }),
      ),
    )
    line.computeLineDistances()
    line.visible = false
    group.add(line)
    lines.push(line)
  }

  const setActive = (idx: Set<number>): void => {
    lines.forEach((l, i) => (l.visible = idx.has(i)))
  }
  // Until traffic says otherwise: first end of the first two runways (design default).
  setActive(new Set([0, 2].filter((i) => i < thresholds.length)))

  let lastMs = -Infinity
  return {
    thresholds,
    slabs,
    updateActive(aircraft, nowMs) {
      if (nowMs - lastMs < ACTIVE_REFRESH_MS) return
      lastMs = nowMs
      const active = new Set<number>()
      thresholds.forEach((t, i) => {
        if (arrivalsOn(t, aircraft) > 0) active.add(i)
      })
      if (active.size) setActive(active)
    },
  }
}
