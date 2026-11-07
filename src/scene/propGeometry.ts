import * as THREE from 'three'
import type { AircraftClass } from '../types'
import { box, coneZ, cylZ, ellipsoid, fin, fuselage, mergeParts, wing } from './geoParts'

export interface RotorSpec {
  geo: THREE.BufferGeometry
  pos: readonly [number, number, number]
  axis: 'x' | 'y' | 'z'
  rate: number // rad/s
}

/** Blade cross + faint disc in the XY plane (spin about Z). */
function propGeo(r: number): THREE.BufferGeometry {
  return mergeParts([
    new THREE.BoxGeometry(r * 2, r * 0.16, 0.008),
    new THREE.BoxGeometry(r * 0.16, r * 2, 0.008),
    new THREE.CircleGeometry(r, 16),
  ])
}

/** Main rotor in the XZ plane (spin about Y). */
function mainRotorGeo(r: number): THREE.BufferGeometry {
  const disc = new THREE.CircleGeometry(r, 20)
  disc.rotateX(-Math.PI / 2)
  return mergeParts([
    new THREE.BoxGeometry(r * 2, 0.008, r * 0.14),
    new THREE.BoxGeometry(r * 0.14, 0.008, r * 2),
    disc,
  ])
}

/** Tail rotor in the ZY plane (spin about X). */
function tailRotorGeo(r: number): THREE.BufferGeometry {
  const g = propGeo(r)
  g.rotateY(Math.PI / 2)
  return g
}

const rotorGeoCache = new Map<string, THREE.BufferGeometry>()

/** Shared spinner geometry for a baked model's rotor (axis = spin axis, radius in model units). */
export function rotorGeometry(axis: 'x' | 'y' | 'z', radius: number): THREE.BufferGeometry {
  const key = axis + radius.toFixed(3)
  let g = rotorGeoCache.get(key)
  if (!g) {
    g = axis === 'y' ? mainRotorGeo(radius) : axis === 'x' ? tailRotorGeo(radius) : propGeo(radius)
    rotorGeoCache.set(key, g)
  }
  return g
}

const rotorCache = new Map<AircraftClass, RotorSpec[]>()

export function rotorsFor(cls: AircraftClass): RotorSpec[] {
  let r = rotorCache.get(cls)
  if (r) return r
  if (cls === 'turboprop') {
    const g = propGeo(0.1)
    r = [
      { geo: g, pos: [0.15, 0.02, -0.355], axis: 'z', rate: 30 },
      { geo: g, pos: [-0.15, 0.02, -0.355], axis: 'z', rate: 30 },
    ]
  } else if (cls === 'piston') {
    r = [{ geo: propGeo(0.13), pos: [0, 0, -0.52], axis: 'z', rate: 34 }]
  } else if (cls === 'heli') {
    r = [
      { geo: mainRotorGeo(0.46), pos: [0, 0.17, -0.12], axis: 'y', rate: 14 },
      { geo: tailRotorGeo(0.08), pos: [0.03, 0.1, 0.47], axis: 'x', rate: 26 },
    ]
  } else r = []
  rotorCache.set(cls, r)
  return r
}

function buildTurboprop(): THREE.BufferGeometry {
  const fr = 0.045
  const parts = fuselage(fr, 0.14, 0.24)
  parts.push(wing(0.52, 0.0, 0.2, 0.0, fr * 0.7, 0.02, 0.8))
  for (const x of [0.15, -0.15]) {
    parts.push(cylZ(0.036, 0.03, 0.26, -0.22, x, 0.02))
    parts.push(coneZ(0.036, 0.04, -0.37, true, 0.02))
  }
  parts.push(fin(0.28, 0.44, 0.4, 0.5, 0.15, fr * 0.5, 0.016))
  parts.push(wing(0.17, -0.44, 0.1, 0.02, fr * 0.5 + 0.15, 0.012))
  return mergeParts(parts)
}

function buildPiston(): THREE.BufferGeometry {
  const fr = 0.075
  return mergeParts([
    cylZ(fr * 0.95, fr * 0.5, 0.8, -0.05, 0, 0, 8),
    coneZ(fr * 0.5, 0.1, 0.45, false, 0, 8),
    ellipsoid(0.06, 0.06, 0.1, 0, 0.0, -0.42, 8), // cowl
    coneZ(0.02, 0.06, -0.5, true, 0, 6), // spinner
    wing(0.62, -0.05, 0.2, 0.0, fr * 0.8, 0.02, 0.85),
    fin(0.3, 0.42, 0.38, 0.5, 0.17, fr * 0.2, 0.02),
    wing(0.22, -0.43, 0.11, 0.0, fr * 0.1, 0.014, 0.7),
    box(0.02, 0.1, 0.03, 0.05, -0.1, -0.2), // gear stubs
    box(0.02, 0.1, 0.03, -0.05, -0.1, -0.2),
  ])
}

function buildHeli(): THREE.BufferGeometry {
  return mergeParts([
    ellipsoid(0.1, 0.095, 0.24, 0, 0, -0.26, 10), // cabin
    cylZ(0.04, 0.018, 0.55, 0.22, 0, 0.03, 8), // tail boom
    fin(0.4, 0.5, 0.46, 0.51, 0.13, 0.03, 0.014),
    wing(0.09, -0.46, 0.06, 0.0, 0.05, 0.01),
    box(0.04, 0.1, 0.04, 0, 0.12, -0.12), // mast
    box(0.012, 0.012, 0.36, 0.085, -0.12, -0.25), // skids
    box(0.012, 0.012, 0.36, -0.085, -0.12, -0.25),
    box(0.012, 0.06, 0.012, 0.075, -0.09, -0.15),
    box(0.012, 0.06, 0.012, -0.075, -0.09, -0.15),
    box(0.012, 0.06, 0.012, 0.075, -0.09, -0.35),
    box(0.012, 0.06, 0.012, -0.075, -0.09, -0.35),
  ])
}

function buildDart(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, 0.5)
  s.lineTo(0.26, -0.42)
  s.lineTo(0, -0.28)
  s.lineTo(-0.26, -0.42)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -0.02, 0)
  return mergeParts([g])
}

export function buildProp(cls: AircraftClass): THREE.BufferGeometry {
  if (cls === 'turboprop') return buildTurboprop()
  if (cls === 'piston') return buildPiston()
  if (cls === 'heli') return buildHeli()
  return buildDart()
}
