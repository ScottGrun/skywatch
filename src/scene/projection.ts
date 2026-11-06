import * as THREE from 'three'

export interface ScreenPoint {
  x: number
  y: number
  /** true when the point is behind the camera / beyond far plane */
  behind: boolean
}

const tmp = new THREE.Vector3()

/** Project a world point to CSS pixels in a w*h viewport. Writes into `out` (no allocation). */
export function projectToScreen(
  camera: THREE.Camera,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  out: ScreenPoint,
): ScreenPoint {
  tmp.set(x, y, z).project(camera)
  out.behind = tmp.z > 1
  out.x = ((tmp.x + 1) / 2) * w
  out.y = ((1 - tmp.y) / 2) * h
  return out
}
