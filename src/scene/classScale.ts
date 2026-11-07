import type { AircraftClass } from '../types'
import {
  CLASS_SIZE,
  CLASS_SIZE_FLOOR,
  TRUE_LENGTH_M,
  TRUE_SIZE_FAR_KM,
  TRUE_SIZE_NEAR_KM,
} from './constants'

const A320_LENGTH_M = 37.6

/** Relative model size for a class: real-ish length ratio, never below the visibility floor. */
export function classScale(cls: AircraftClass): number {
  return Math.max(CLASS_SIZE[cls] ?? 1, CLASS_SIZE_FLOOR)
}

/** Relative size of a baked model: real length vs an A320, on the narrowbody class size. */
export function modelScale(lengthM: number): number {
  return Math.max(((CLASS_SIZE.narrow ?? 1) * lengthM) / A320_LENGTH_M, CLASS_SIZE_FLOOR)
}

/** Spin angle after dt seconds, wrapped so it never loses float precision. */
export function advanceSpin(angle: number, rate: number, dt: number): number {
  return (angle + rate * dt) % (Math.PI * 2)
}

/** True airframe length in km for a class (procedural models). */
export function trueLengthKm(cls: AircraftClass): number {
  return (TRUE_LENGTH_M[cls] ?? 35) / 1000
}

/**
 * Drawn length (km) from camera distance: true size up close, the exaggerated
 * size far away, smoothstep between TRUE_SIZE_NEAR_KM and TRUE_SIZE_FAR_KM.
 */
export function effectiveSize(distKm: number, trueKm: number, exaggeratedKm: number): number {
  const t = Math.min(
    1,
    Math.max(0, (distKm - TRUE_SIZE_NEAR_KM) / (TRUE_SIZE_FAR_KM - TRUE_SIZE_NEAR_KM)),
  )
  return trueKm + (exaggeratedKm - trueKm) * t * t * (3 - 2 * t)
}
