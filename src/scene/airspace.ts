import * as THREE from 'three'
import { toLocal } from '../core/geo'
import type { Airport, Airspace, AirspaceLimit } from '../types'
import { ALT_EXAG, FT_TO_KM } from './constants'
import { fmtLimit, limitFt, airspaceStyle } from './airspaceStyle'
import { projectToScreen, type ScreenPoint } from './projection'
import { radialFog, applyRadialFog } from './radialFog'
import { groundY } from './terrain'
import { disposeObject } from './tiles'

/** Visual ceiling (ft MSL): keeps tall/unbounded shelves from dwarfing the traffic view. */
const MAX_FT = 25000
const FILL_OPACITY = 0.05
const LINE_OPACITY = 0.45
const MAX_LABELS = 12
const FONT = "'IBM Plex Mono',monospace"
const K = FT_TO_KM * ALT_EXAG

interface Buf {
  fill: number[]
  line: number[]
}

interface Label {
  x: number
  y: number
  z: number
  el: HTMLDivElement
  shown: boolean
}

export interface AirspaceHandle {
  group: THREE.Group
  /** Project and position the volume labels; call once per frame. */
  place(camera: THREE.Camera, w: number, h: number, sp: ScreenPoint): void
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
  return Math.min(groundY(e, n) + ft * K, (MAX_FT - elevFt) * K) + (ft === 0 ? 0.04 : 0)
}

function addVolume(
  a: Airspace,
  ap: Airport,
  buf: Buf,
): { cx: number; cz: number; y: number; area: number } | null {
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
  const hi = loc.map((p, i) => Math.max(limitY(a.upper, p.e, p.n, ap.elevationFt), lo[i] + 0.05))
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
  return { cx, cz, y: Math.max(...hi), area: areaKm2(loc) }
}

function labelEl(overlay: HTMLElement, text: string, css: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText =
    `position:absolute;left:0;top:0;white-space:nowrap;will-change:transform;display:none;` +
    `font:500 9px/1 ${FONT};letter-spacing:.04em;color:${css};opacity:.75;text-shadow:0 0 3px #050608`
  el.textContent = text
  overlay.appendChild(el)
  return el
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
  const cands: (Label & { text: string; area: number; css: string })[] = []

  for (const a of list) {
    const style = airspaceStyle(a.class)
    const key = a.class
    const buf = bufs.get(key) ?? { fill: [], line: [] }
    bufs.set(key, buf)
    const info = addVolume(a, ap, buf)
    if (!info) continue
    cands.push({
      x: info.cx,
      y: info.y,
      z: info.cz,
      el: null as unknown as HTMLDivElement,
      shown: false,
      text: `${a.class} · ${fmtLimit(a.lower)}–${fmtLimit(a.upper)}`,
      area: info.area,
      css: style.css,
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

  // Largest volume wins per identical label text; cap the total so the view stays calm.
  const seen = new Set<string>()
  const labels: Label[] = []
  for (const c of cands.sort((p, q) => q.area - p.area)) {
    if (seen.has(c.text) || labels.length >= MAX_LABELS) continue
    seen.add(c.text)
    labels.push({ x: c.x, y: c.y, z: c.z, el: labelEl(overlay, c.text, c.css), shown: false })
  }

  return {
    group,
    place(camera, w, h, sp) {
      const reach = radialFog.far.value * 0.85
      for (const l of labels) {
        const far =
          Math.hypot(l.x - radialFog.center.value.x, l.z - radialFog.center.value.y) > reach
        projectToScreen(camera, w, h, l.x, l.y, l.z, sp)
        const hide = far || sp.behind || sp.x < -40 || sp.x > w + 40 || sp.y < -20 || sp.y > h + 20
        if (hide) {
          if (l.shown) l.el.style.display = 'none'
          l.shown = false
          continue
        }
        if (!l.shown) l.el.style.display = 'block'
        l.shown = true
        l.el.style.transform = `translate(${sp.x.toFixed(1)}px,${sp.y.toFixed(1)}px) translate(-50%,-120%)`
      }
    },
    dispose() {
      disposeObject(group)
      labels.forEach((l) => l.el.remove())
    },
  }
}
