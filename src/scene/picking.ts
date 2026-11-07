import type * as THREE from 'three'
import type { AircraftView } from './aircraftView'
import { PICK_MIN_PX, PICK_RADIUS_PX } from './constants'
import { projectToScreen, type ScreenPoint } from './projection'

const sp: ScreenPoint = { x: 0, y: 0, behind: false }

/** Nearest aircraft to a screen point (CSS px) within PICK_RADIUS_PX, or null. */
export function pickNearest(
  views: Iterable<AircraftView>,
  camera: THREE.Camera,
  w: number,
  h: number,
  mx: number,
  my: number,
): string | null {
  let best: string | null = null
  let bd = Infinity
  const fov = (camera as THREE.PerspectiveCamera).fov ?? 40
  const focal = h / (2 * Math.tan((fov * Math.PI) / 360))
  for (const v of views) {
    projectToScreen(camera, w, h, v.x, v.y, v.z, sp)
    if (sp.behind) continue
    // Pick radius follows the drawn size (half the projected length), within sane limits.
    const r = Math.min(
      PICK_RADIUS_PX,
      Math.max(PICK_MIN_PX, (0.5 * v.scale * focal) / Math.max(v.camDist, 1e-3)),
    )
    const d = Math.hypot(sp.x - mx, sp.y - my)
    if (d < r && d < bd) {
      bd = d
      best = v.id
    }
  }
  return best
}
