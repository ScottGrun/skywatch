import * as THREE from 'three'
import { toLocal } from '../core/geo'
import type { Airport, Airspace, AirspaceLimit } from '../types'
import { FT_TO_KM } from './constants'
import { fmtLimit, limitFt, airspaceStyle } from './airspaceStyle'
import { createAirspaceLabels, type LabelCand, type Rect } from './airspaceLabels'
import type { ScreenPoint } from './projection'
import { radialFog, applyRadialFog } from './radialFog'
import { terrainY } from './terrain'
import { vscale } from './vertical'
import { disposeObject } from './tiles'

/** Visual ceiling (ft MSL): keeps tall/unbounded shelves from dwarfing the traffic view. */
const MAX_FT = 25000
const FILL_OPACITY = 0.05
const LINE_OPACITY = 0.45
/** Geometry is built at x1 vertical scale (the parent group scales Y), so heights use plain FT_TO_KM. */
const K = FT_TO_KM

interface Buf {
  fill: number[]
  line: number[]
}

export interface AirspaceHandle {
  group: THREE.Group
  /** Position the volume labels (decluttered against `occupied`); call once per frame. */
  place(
    camera: THREE.Camera,
    w: number,
    h: number,
    sp: ScreenPoint,
    occupied: readonly Rect[],
  ): void
  dispose(): void
}

function areaKm2(pts: { x: number; z: number }[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.z - q.x * p.z
  }
  return Math.abs(a) / 2
}

/** Scene Y for one limit at local (e, n) km. */
function limitY(l: AirspaceLimit, e: number, n: number, elevFt: number): number {
  const { ft, agl } = limitFt(l)
  if (!agl) return (Math.min(ft, MAX_FT) - elevFt) * K
  return Math.min(terrainY(e, n) + ft * K, (MAX_FT - elevFt) * K) + (ft === 0 ? 0.013 : 0)
}

function addVolume(
  a: Airspace,
  ap: Airport,
  buf: Buf,
): { cx: number; cz: number; y: number; area: number; ring: { x: number; z: number }[] } | null {
  let ring = a.polygon
  const f = ring[0]
  const l = ring[ring.length - 1]
  if (f[0] === l[0] && f[1] === l[1]) ring = ring.slice(0, -1)
  if (ring.length < 3) return null
  const loc = ring.map(([lon, lat]) => {
    const p = toLocal(ap, lat, lon)
    return { x: p.e, z: -p.n, e: p.e, n: p.n }
  })
  const lo = loc.map((p) => limitY(a.lower, p.e, p.n, ap.elevationFt))
  const hi = loc.map((p, i) => Math.max(limitY(a.upper, p.e, p.n, ap.elevationFt), lo[i] + 0.017))
  const nPts = loc.length
  const { fill, line } = buf
  const tri = (i: number, j: number, k: number, ys: number[]) => {
    for (const v of [i, j, k]) fill.push(loc[v].x, ys[v], loc[v].z)
  }
  for (let i = 0; i < nPts; i++) {
    const j = (i + 1) % nPts
    const p = loc[i]
    const q = loc[j]
    fill.push(p.x, lo[i], p.z, q.x, lo[j], q.z, q.x, hi[j], q.z)
    fill.push(p.x, lo[i], p.z, q.x, hi[j], q.z, p.x, hi[i], p.z)
    line.push(p.x, hi[i], p.z, q.x, hi[j], q.z)
    line.push(p.x, lo[i], p.z, q.x, lo[j], q.z)
  }
  const idx = THREE.ShapeUtils.triangulateShape(
    loc.map((p) => new THREE.Vector2(p.x, p.z)),
    [],
  )
  const skipBottom = a.lower.ref === 'SFC' || (a.lower.ref === 'AGL' && a.lower.value === 0)
  for (const [i, j, k] of idx) {
    tri(i, j, k, hi)
    if (!skipBottom) tri(i, j, k, lo)
  }
  const cx = loc.reduce((s, p) => s + p.x, 0) / nPts
  const cz = loc.reduce((s, p) => s + p.z, 0) / nPts
  return { cx, cz, y: Math.max(...hi), area: areaKm2(loc), ring: loc }
}

function material(color: number, dashed: boolean): THREE.LineBasicMaterial {
  const p = { color, transparent: true, opacity: LINE_OPACITY, depthWrite: false }
  return applyRadialFog(
    dashed
      ? new THREE.LineDashedMaterial({ ...p, dashSize: 0.7, gapSize: 0.5 })
      : new THREE.LineBasicMaterial(p),
  )
}

/** Translucent extruded volumes (walls + caps) with brighter top/bottom outlines and class·limits labels. */
export function buildAirspace(
  list: readonly Airspace[],
  ap: Airport,
  overlay: HTMLElement,
): AirspaceHandle {
  const group = new THREE.Group()
  const bufs = new Map<string, Buf>()
  const cands: LabelCand[] = []

  for (const a of list) {
    const style = airspaceStyle(a.class)
    const key = a.class
    const buf = bufs.get(key) ?? { fill: [], line: [] }
    bufs.set(key, buf)
    const info = addVolume(a, ap, buf)
    if (!info) continue
    cands.push({
      key: `${a.name}|${a.class}|${fmtLimit(a.lower)}|${fmtLimit(a.upper)}`,
      text: `${a.class} · ${fmtLimit(a.lower)}–${fmtLimit(a.upper)}`,
      css: style.css,
      area: info.area,
      cx: info.cx,
      cz: info.cz,
      y: info.y,
      ring: info.ring,
    })
  }

  for (const [cls, buf] of bufs) {
    const style = airspaceStyle(cls)
    const fg = new THREE.BufferGeometry()
    fg.setAttribute('position', new THREE.Float32BufferAttribute(buf.fill, 3))
    const fm = applyRadialFog(
      new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: FILL_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    const mesh = new THREE.Mesh(fg, fm)
    mesh.renderOrder = -2
    mesh.frustumCulled = false
    group.add(mesh)

    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.Float32BufferAttribute(buf.line, 3))
    const lines = new THREE.LineSegments(lg, material(style.color, style.dashed))
    if (style.dashed) lines.computeLineDistances()
    lines.renderOrder = -1
    lines.frustumCulled = false
    group.add(lines)
  }

  const labels = createAirspaceLabels(overlay, cands)
  return {
    group,
    place(camera, w, h, sp, occupied) {
      const { center, near } = radialFog
      labels.place(
        camera,
        w,
        h,
        sp,
        occupied,
        vscale.k,
        { x: center.value.x, z: center.value.y },
        near.value,
      )
    },
    dispose() {
      disposeObject(group)
      labels.dispose()
    },
  }
}
