import * as THREE from 'three'
import type { ViewPreset } from '../types'
import {
  EASE,
  EASE_FOLLOW,
  FOLLOW_PHI,
  FOLLOW_R,
  FOV,
  HOME,
  PHI_MAX,
  PHI_MIN,
  R_MAX,
  R_MIN,
  SIDE,
  TOP,
} from './constants'

interface Pose {
  theta: number
  phi: number
  r: number
  tx: number
  ty: number
  tz: number
}

const HOME_POSE: Pose = { ...HOME, tx: 0, ty: 0, tz: 0 }

/** Orbit camera around a target, eased toward a goal pose. */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 2000)
  private cam: Pose = { ...HOME_POSE }
  private goal: Pose = { ...HOME_POSE }
  following = false

  /** Current (eased) orbit target on the ground plane and orbit distance. */
  get orbitState(): { x: number; z: number; r: number } {
    return { x: this.cam.tx, z: this.cam.tz, r: this.cam.r }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Go to the default view; `snap` skips easing. */
  reset(snap = false): void {
    Object.assign(this.goal, HOME_POSE)
    if (snap) Object.assign(this.cam, HOME_POSE)
  }

  preset(v: ViewPreset): void {
    Object.assign(this.goal, HOME_POSE)
    if (v === 'top') Object.assign(this.goal, TOP)
    if (v === 'side') Object.assign(this.goal, SIDE)
  }

  /** Enable/disable follow-cam. Distance/tilt are tightened on enable; target returns to ground on disable. */
  setFollowing(on: boolean): void {
    this.following = on
    if (on) {
      this.goal.r = Math.min(this.goal.r, FOLLOW_R)
      this.goal.phi = Math.min(this.goal.phi, FOLLOW_PHI)
    } else {
      this.goal.ty = 0
    }
  }

  orbit(dx: number, dy: number): void {
    this.goal.theta -= dx * 0.005
    this.goal.phi = Math.min(PHI_MAX, Math.max(PHI_MIN, this.goal.phi - dy * 0.004))
  }

  /** Pan the target in the ground plane relative to the current heading. */
  pan(dx: number, dy: number): void {
    const g = this.goal
    const k = g.r * 0.0016
    const st = Math.sin(g.theta)
    const ct = Math.cos(g.theta)
    g.tx += -ct * dx * k - st * dy * k
    g.tz += st * dx * k - ct * dy * k
  }

  zoom(deltaY: number): void {
    this.goal.r = Math.min(R_MAX, Math.max(R_MIN, this.goal.r * Math.exp(deltaY * 0.0012)))
  }

  /** Advance easing and place the camera. `target` is the follow point (world coords) or null. */
  update(dt: number, target: { x: number; y: number; z: number } | null): void {
    const g = this.goal
    const c = this.cam
    if (this.following && target) {
      g.tx = target.x
      g.ty = target.y
      g.tz = target.z
    }
    const k = 1 - Math.exp(-dt * EASE)
    const kt = this.following ? 1 - Math.exp(-dt * EASE_FOLLOW) : k
    c.theta += (g.theta - c.theta) * k
    c.phi += (g.phi - c.phi) * k
    c.r += (g.r - c.r) * k
    c.tx += (g.tx - c.tx) * kt
    c.ty += (g.ty - c.ty) * kt
    c.tz += (g.tz - c.tz) * kt
    const sp = Math.sin(c.phi)
    this.camera.position.set(
      c.tx + c.r * sp * Math.sin(c.theta),
      c.ty + c.r * Math.cos(c.phi),
      c.tz + c.r * sp * Math.cos(c.theta),
    )
    this.camera.lookAt(c.tx, c.ty, c.tz)
    this.camera.updateMatrixWorld()
  }
}
