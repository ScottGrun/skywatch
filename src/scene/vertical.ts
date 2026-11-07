// Runtime vertical exaggeration k and the terrain relief blend, shared by geometry, shaders and logic.
import { VSCALE_DEFAULT, VSCALE_MAX, VSCALE_MIN } from './constants'

/** Current (eased) exaggeration. `uniform` mirrors it for shaders. */
export const vscale = { k: VSCALE_DEFAULT, uniform: { value: VSCALE_DEFAULT } }

export function setVScale(k: number): void {
  vscale.k = k
  vscale.uniform.value = k
}

export const clampVScale = (k: number): number =>
  Math.min(VSCALE_MAX, Math.max(VSCALE_MIN, Number.isFinite(k) ? k : VSCALE_DEFAULT))

/** 1 = terrain relief, 0 = flat (shared by every ground material and by groundY()). */
export const terrainBlend = { value: 0 }
