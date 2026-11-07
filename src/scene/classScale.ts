import type { AircraftClass } from '../types'
import {
  CLASS_SIZE,
  CLASS_SIZE_FLOOR,
  MIN_SIZE_FADE_KM,
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
export function effectiveSize(
  distKm: number,
  trueKm: number,
  exaggeratedKm: number,
  minKm = 0,
): number {
  const t = Math.min(
    1,
    Math.max(0, (distKm - TRUE_SIZE_NEAR_KM) / (TRUE_SIZE_FAR_KM - TRUE_SIZE_NEAR_KM)),
  )
  const len = trueKm + (exaggeratedKm - trueKm) * t * t * (3 - 2 * t)
  // On-screen floor, faded out below MIN_SIZE_FADE_KM so close views keep real size.
  const f = Math.min(
    1,
    Math.max(0, (distKm - MIN_SIZE_FADE_KM[0]) / (MIN_SIZE_FADE_KM[1] - MIN_SIZE_FADE_KM[0])),
  )
  return Math.max(len, minKm * f)
}
