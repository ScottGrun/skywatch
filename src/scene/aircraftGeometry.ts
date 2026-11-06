import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { AircraftClass } from '../types'

// Placeholder low-poly airframes (nose = -Z), ported from design geos().
// Each class is merged into ONE shared geometry so an aircraft costs a single draw call.
interface Spec {
  len: number
  fr: number
  span: number
  sweep: number
  eng: ReadonlyArray<readonly [number, number, number]>
  er: number
  ttail?: boolean
  high?: boolean
  prop?: boolean
}

const SPEC: Record<AircraftClass, Spec> = {
  narrow: {
    len: 1,
    fr: 0.055,
    span: 0.55,
    sweep: 0.2,
    eng: [
      [0.19, -0.06, -0.06],
      [-0.19, -0.06, -0.06],
    ],
    er: 0.03,
  },
  wide: {
    len: 1.25,
    fr: 0.075,
    span: 0.74,
    sweep: 0.26,
    eng: [
      [0.26, -0.08, -0.1],
      [-0.26, -0.08, -0.1],
    ],
    er: 0.048,
  },
  quad: {
    len: 1.3,
    fr: 0.085,
    span: 0.8,
    sweep: 0.28,
    er: 0.04,
    eng: [
      [0.24, -0.085, -0.1],
      [-0.24, -0.085, -0.1],
      [0.46, -0.07, 0],
      [-0.46, -0.07, 0],
    ],
  },
  regional: {
    len: 0.82,
    fr: 0.045,
    span: 0.42,
    sweep: 0.13,
    eng: [
      [0.085, 0.03, 0.24],
      [-0.085, 0.03, 0.24],
    ],
    er: 0.028,
    ttail: true,
  },
  prop: {
    len: 0.75,
    fr: 0.042,
    span: 0.5,
    sweep: 0.02,
    eng: [
      [0.15, 0.035, -0.1],
      [-0.15, 0.035, -0.1],
    ],
    er: 0.028,
    high: true,
    prop: true,
  },
}

function wing(span: number, f0: number, c: number, sweep: number, y: number, th: number) {
  const s = new THREE.Shape()
  const le = f0 + c / 2
  const te = f0 - c / 2
  const tle = le - sweep
  const tte = tle - c * 0.38
  s.moveTo(0, le)
  s.lineTo(span, tle)
  s.lineTo(span, tte)
  s.lineTo(0, te)
  s.lineTo(-span, tte)
  s.lineTo(-span, tle)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y, 0)
  return g
}

function build(cls: AircraftClass): THREE.BufferGeometry {
  const P = SPEC[cls]
  const L = P.len
  const parts: THREE.BufferGeometry[] = []

  const fus = new THREE.CylinderGeometry(P.fr, P.fr, L * 0.78, 12)
  fus.rotateX(Math.PI / 2)
  parts.push(fus)
  const nose = new THREE.ConeGeometry(P.fr, L * 0.14, 12)
  nose.rotateX(-Math.PI / 2)
  nose.translate(0, 0, -L * 0.46)
  parts.push(nose)
  const tail = new THREE.ConeGeometry(P.fr, L * 0.2, 12)
  tail.rotateX(Math.PI / 2)
  tail.translate(0, P.fr * 0.2, L * 0.49)
  parts.push(tail)

  const finH = L * 0.2
  parts.push(
    wing(P.span, L * 0.02, L * 0.24, P.sweep * L, P.high ? P.fr * 0.8 : -P.fr * 0.45, 0.014),
  )
  parts.push(
    wing(
      P.span * 0.36,
      -L * 0.44,
      L * 0.12,
      P.sweep * L * 0.5,
      P.ttail ? P.fr * 0.6 + finH * 0.95 : P.fr * 0.1,
      0.01,
    ),
  )

  const fs = new THREE.Shape()
  fs.moveTo(-L * 0.3, 0)
  fs.lineTo(-L * 0.45 - P.sweep * L * 0.3, finH)
  fs.lineTo(-L * 0.53 - P.sweep * L * 0.3, finH)
  fs.lineTo(-L * 0.52, 0)
  fs.closePath()
  const fin = new THREE.ExtrudeGeometry(fs, { depth: 0.012, bevelEnabled: false })
  fin.translate(0, 0, -0.006)
  fin.rotateY(Math.PI / 2)
  fin.translate(0, P.fr * 0.6, 0)
  parts.push(fin)

  for (const [x, y, z] of P.eng) {
    const e = new THREE.CylinderGeometry(P.er, P.er * 0.85, L * 0.18, 10)
    e.rotateX(Math.PI / 2)
    e.translate(x, y, z)
    parts.push(e)
    if (P.prop) {
      const b = new THREE.BoxGeometry(0.2, 0.012, 0.006)
      b.translate(x, y, z - L * 0.1)
      parts.push(b)
    }
  }

  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    if (n !== g) g.dispose()
    return n
  })
  const merged = mergeGeometries(flat)
  flat.forEach((g) => g.dispose())
  merged.userData.shared = true
  return merged
}

const cache = new Map<AircraftClass, THREE.BufferGeometry>()

/** Shared merged stand-in geometry for a class (swap for GLB later). */
export function aircraftGeometry(cls: AircraftClass): THREE.BufferGeometry {
  let g = cache.get(cls)
  if (!g) {
    g = build(cls)
    cache.set(cls, g)
  }
  return g
}

export function disposeAircraftGeometries(): void {
  cache.forEach((g) => g.dispose())
  cache.clear()
}
