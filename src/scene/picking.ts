import type * as THREE from 'three'
import type { AircraftView } from './aircraftView'
import { PICK_RADIUS_PX } from './constants'
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
  let bd = PICK_RADIUS_PX
  for (const v of views) {
    projectToScreen(camera, w, h, v.x, v.y, v.z, sp)
    if (sp.behind) continue
    const d = Math.hypot(sp.x - mx, sp.y - my)
    if (d < bd) {
      bd = d
      best = v.id
    }
  }
  return best
}
