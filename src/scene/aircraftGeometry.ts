import * as THREE from 'three'
import type { AircraftClass } from '../types'
import { box, coneZ, cylZ, ellipsoid, fin, fuselage, mergeParts, wing } from './geoParts'
import { buildProp, type RotorSpec, rotorsFor } from './propGeometry'

// Procedural low-poly airframes (nose = -Z, length 1). Real relative size is applied
// per class in the view (classScale). Each class is ONE shared merged geometry.
interface JetSpec {
  fr: number
  span: number
  sweep: number
  noseLen: number
  tailLen: number
  wingF: number // forward position of wing centre
  chord: number
  eng: ReadonlyArray<readonly [number, number, number]>
  er: number
  engLen: number
  ttail?: boolean
  hump?: boolean
}

const JET: Partial<Record<AircraftClass, JetSpec>> = {
  narrow: {
    fr: 0.05,
    span: 0.5,
    sweep: 0.18,
    noseLen: 0.14,
    tailLen: 0.2,
    wingF: 0.02,
    chord: 0.22,
    eng: [
      [0.16, -0.06, -0.06],
      [-0.16, -0.06, -0.06],
    ],
    er: 0.03,
    engLen: 0.16,
  },
  wide: {
    fr: 0.068,
    span: 0.6,
    sweep: 0.24,
    noseLen: 0.14,
    tailLen: 0.2,
    wingF: 0.0,
    chord: 0.26,
    eng: [
      [0.21, -0.08, -0.08],
      [-0.21, -0.08, -0.08],
    ],
    er: 0.048,
    engLen: 0.2,
  },
  quad: {
    fr: 0.074,
    span: 0.68,
    sweep: 0.26,
    noseLen: 0.13,
    tailLen: 0.2,
    wingF: 0.0,
    chord: 0.27,
    eng: [
      [0.17, -0.085, -0.08],
      [-0.17, -0.085, -0.08],
      [0.35, -0.075, 0.02],
      [-0.35, -0.075, 0.02],
    ],
    er: 0.036,
    engLen: 0.18,
    hump: true,
  },
  regional: {
    fr: 0.042,
    span: 0.4,
    sweep: 0.1,
    noseLen: 0.13,
    tailLen: 0.22,
    wingF: -0.02,
    chord: 0.2,
    eng: [
      [0.085, 0.015, 0.27],
      [-0.085, 0.015, 0.27],
    ],
    er: 0.03,
    engLen: 0.15,
    ttail: true,
  },
  bizjet: {
    fr: 0.05,
    span: 0.38,
    sweep: 0.16,
    noseLen: 0.2,
    tailLen: 0.24,
    wingF: -0.04,
    chord: 0.2,
    eng: [
      [0.088, 0.02, 0.24],
      [-0.088, 0.02, 0.24],
    ],
    er: 0.034,
    engLen: 0.16,
    ttail: true,
  },
}

function buildJet(P: JetSpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = fuselage(P.fr, P.noseLen, P.tailLen)
  parts.push(wing(P.span, P.wingF, P.chord, P.sweep, -P.fr * 0.45, 0.016))
  if (P.hump) parts.push(ellipsoid(P.fr * 0.8, P.fr * 0.55, 0.2, 0, P.fr * 0.7, -0.3, 10))
  const finH = P.ttail ? 0.15 : 0.13
  parts.push(fin(0.28, 0.43, 0.4, 0.5, finH, P.fr * 0.55, 0.016))
  const stabY = P.ttail ? P.fr * 0.55 + finH : P.fr * 0.1
  parts.push(wing(P.span * 0.36, -0.43, 0.11, P.sweep * 0.5, stabY, 0.012))
  for (const [x, y, z] of P.eng) {
    parts.push(cylZ(P.er, P.er * 0.8, P.engLen, z, x, y))
    if (z > 0.1) parts.push(box(P.er * 1.4, 0.01, 0.08, x * 0.6, y - P.er * 0.2, z)) // pylon stub
  }
  return mergeParts(parts)
}

function build(cls: AircraftClass): THREE.BufferGeometry {
  const j = JET[cls]
  return j ? buildJet(j) : buildProp(cls)
}

const cache = new Map<AircraftClass, THREE.BufferGeometry>()

/** Shared merged geometry for a class. */
export function aircraftGeometry(cls: AircraftClass): THREE.BufferGeometry {
  let g = cache.get(cls)
  if (!g) {
    g = build(cls)
    cache.set(cls, g)
  }
  return g
}

/** Spinning parts (props / rotors) for a class, shared geometry. */
export function aircraftRotors(cls: AircraftClass): readonly RotorSpec[] {
  return rotorsFor(cls)
}

export type { RotorSpec }

export function disposeAircraftGeometries(): void {
  cache.forEach((g) => g.dispose())
  cache.clear()
}

// Referenced to keep tree-shaking honest if a future class needs it.
void coneZ
