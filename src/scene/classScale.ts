import type { AircraftClass } from '../types'
import { CLASS_SIZE, CLASS_SIZE_FLOOR } from './constants'

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
