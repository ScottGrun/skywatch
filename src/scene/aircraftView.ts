import * as THREE from 'three'
import { rampHex, hexCss } from '../core/ramp'
import type { Aircraft, AircraftClass } from '../types'
import { aircraftGeometry, aircraftRotors } from './aircraftGeometry'
import { advanceSpin, classScale, modelScale } from './classScale'
import { getModel, type ModelInfo } from './modelLoader'
import { modelNameFor } from './modelMap'
import type { RotorSpec } from './propGeometry'
import {
  D2R,
  DOT_OPACITY,
  DROP_OPACITY,
  EMISSIVE,
  FT_TO_KM,
  GROUND_COLOR,
  GROUND_EMISSIVE,
  KT_TO_KMS,
  PITCH_MAX,
  ROLL_GAIN,
  ROLL_MAX,
  ROLL_SMOOTH,
  SCALE_DIV,
  SCALE_MAX,
  SCALE_MIN,
  TRAIL_POINTS,
  TRAIL_SAMPLE_MS,
  SEL_RING_AMP,
  SEL_RING_OPACITY,
  SEL_RING_PERIOD_MS,
  SEL_RING_SCALE,
} from './constants'
import { AircraftLabel } from './labels'
import { groundY } from './terrain'
import { pal, shadeHex } from './theme'
import { vscale } from './vertical'

export interface FrameCtx {
  nowMs: number
  dt: number // seconds since last frame
  elevFt: number
  cam: THREE.Vector3
}

const HIST = TRAIL_POINTS - 1
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const tmpC = new THREE.Color()

/** Geometry/material shared by all views. */
export interface ViewKit {
  dropGeo: THREE.BufferGeometry
  dotGeo: THREE.BufferGeometry
  trailMat: THREE.LineBasicMaterial
}

export function createViewKit(): ViewKit {
  const dropGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
  ])
  const dotGeo = new THREE.RingGeometry(0.13, 0.16, 32) // thin, tight ring at the foot of the drop line
  dotGeo.rotateX(-Math.PI / 2)
  return { dropGeo, dotGeo, trailMat: new THREE.LineBasicMaterial({ vertexColors: true }) }
}

export function disposeViewKit(k: ViewKit): void {
  k.dropGeo.dispose()
  k.dotGeo.dispose()
  k.trailMat.dispose()
}

export class AircraftView {
  readonly root = new THREE.Group()
  readonly label: AircraftLabel
  id = ''
  x = 0
  y = 0
  z = 0
  scale = 1
  camDist = 0
  colorHex = 0
  /** False for un-hovered, unselected ground traffic (scene hides the HTML label). */
  showLabel = true

  private mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: EMISSIVE,
    roughness: 0.45,
    metalness: 0.1,
    flatShading: true,
  })
  private body = new THREE.Group()
  private mesh: THREE.Mesh
  private rotors: { mesh: THREE.Mesh; axis: 'x' | 'y' | 'z'; rate: number; angle: number }[] = []
  private rotorMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  private drop: THREE.Line
  private dot: THREE.Mesh
  private trail: THREE.Line
  private dropMat = new THREE.LineBasicMaterial({ transparent: true, opacity: DROP_OPACITY })
  private dotMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: DOT_OPACITY,
    side: THREE.DoubleSide,
  })
  private cls: AircraftClass | null = null
  private type = ''
  private modelName: string | null = null
  private modelBound = false
  private size = 1
  private posA = new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3)
  private colA = new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3)
  private hPos = new Float32Array(HIST * 3)
  private hCol = new Float32Array(HIST * 3)
  private hN = 0
  private lastSample = 0
  private prevTrack = 0
  private prevMs = 0
  private rate = 0
  private bank = 0

  constructor(kit: ViewKit, overlay: HTMLElement) {
    this.mesh = new THREE.Mesh(aircraftGeometry('narrow'), this.mat)
    this.body.rotation.order = 'YXZ'
    this.body.add(this.mesh)
    this.drop = new THREE.Line(kit.dropGeo, this.dropMat)
    this.drop.frustumCulled = false
    this.dot = new THREE.Mesh(kit.dotGeo, this.dotMat)
    const tg = new THREE.BufferGeometry()
    tg.setAttribute('position', this.posA)
    tg.setAttribute('color', this.colA)
    this.trail = new THREE.Line(tg, kit.trailMat)
    this.trail.frustumCulled = false
    this.root.add(this.body, this.drop, this.dot, this.trail)
    this.label = new AircraftLabel(overlay)
  }

  /** Force the next update to re-apply colors (theme change). */
  recolor(): void {
    this.colorHex = -1
  }

  /** (Re)bind to a new aircraft; clears history. */
  reset(ac: Aircraft, nowMs: number): void {
    this.id = ac.id
    this.hN = 0
    this.lastSample = nowMs
    this.prevTrack = ac.trackDeg
    this.prevMs = nowMs
    this.rate = 0
    this.bank = 0
    this.colorHex = -1
    this.root.visible = true
  }

  private setRotors(specs: readonly RotorSpec[]): void {
    for (const r of this.rotors) this.body.remove(r.mesh)
    this.rotors = specs.map((r) => {
      const mesh = new THREE.Mesh(r.geo, this.rotorMat)
      mesh.position.set(r.pos[0], r.pos[1], r.pos[2])
      this.body.add(mesh)
      return { mesh, axis: r.axis, rate: r.rate, angle: 0 }
    })
  }

  private bindClass(cls: AircraftClass): void {
    this.mesh.geometry = aircraftGeometry(cls)
    this.size = classScale(cls)
    this.setRotors(aircraftRotors(cls))
  }

  private bindModel(m: ModelInfo): void {
    this.mesh.geometry = m.geo
    this.size = modelScale(m.lengthM)
    this.setRotors(m.rotors)
  }

  /** Pick procedural class geometry or the baked model (swapped in once it has loaded). */
  private syncModel(ac: Aircraft): void {
    if (this.cls !== ac.aircraftClass || this.type !== ac.typeCode) {
      this.cls = ac.aircraftClass
      this.type = ac.typeCode
      this.modelName = modelNameFor(ac.typeCode, ac.aircraftClass)
      this.modelBound = false
      this.bindClass(ac.aircraftClass)
    }
    if (this.modelName && !this.modelBound) {
      const m = getModel(this.modelName)
      if (m) {
        this.modelBound = true
        this.bindModel(m)
      }
    }
  }

  update(ac: Aircraft, c: FrameCtx, selected: boolean, hovered = false): void {
    this.syncModel(ac)
    const muted = ac.onGround && !selected && !hovered
    this.showLabel = !muted
    const altKm = Math.max(0, ac.altFt - c.elevFt) * FT_TO_KM * vscale.k
    const x = ac.e
    const g = groundY(ac.e, ac.n)
    // On-ground traffic sits on the terrain; airborne never dips below it (DEM vs baro mismatch).
    const y = ac.onGround ? g : Math.max(altKm, g + 0.02)
    const z = -ac.n
    this.x = x
    this.y = y
    this.z = z
    const raw = muted ? GROUND_COLOR : rampHex(ac.altFt)
    const col = shadeHex(raw, pal().shade)
    if (col !== this.colorHex) {
      this.colorHex = col
      this.mat.color.setHex(col)
      this.mat.emissive.setHex(col)
      this.mat.emissiveIntensity = muted ? GROUND_EMISSIVE : EMISSIVE
      this.rotorMat.color.setHex(col)
      this.dropMat.color.setHex(col)
      this.dotMat.color.setHex(col)
    }

    this.camDist = Math.hypot(c.cam.x - x, c.cam.y - y, c.cam.z - z)
    const sc = clamp(this.camDist / SCALE_DIV, SCALE_MIN, SCALE_MAX)
    const size = this.size
    this.scale = sc * size

    // Orientation: yaw from track, pitch from climb angle, roll from smoothed turn rate.
    const dtT = (c.nowMs - this.prevMs) / 1000
    if (dtT > 0.001) {
      const dh = ((ac.trackDeg - this.prevTrack + 540) % 360) - 180
      this.rate += (dh / dtT - this.rate) * Math.min(1, c.dt * ROLL_SMOOTH)
      this.prevTrack = ac.trackDeg
      this.prevMs = c.nowMs
    }
    const tgt = clamp(-this.rate * ROLL_GAIN, -ROLL_MAX, ROLL_MAX)
    this.bank += (tgt - this.bank) * Math.min(1, c.dt * ROLL_SMOOTH)
    const climb = Math.atan2(
      (ac.vsFpm / 60) * FT_TO_KM * vscale.k,
      Math.max(ac.gsKt, 60) * KT_TO_KMS,
    )
    this.body.position.set(x, y, z)
    this.body.scale.setScalar(sc * size)
    for (const r of this.rotors) {
      r.angle = advanceSpin(r.angle, r.rate, c.dt)
      r.mesh.rotation[r.axis] = r.angle
    }
    this.body.rotation.set(clamp(climb, -PITCH_MAX, PITCH_MAX), -ac.trackDeg * D2R, this.bank)

    this.drop.position.set(x, g, z)
    this.drop.scale.y = Math.max(y - g, 1e-4)
    this.drop.visible = y - g > 0.05 && !ac.onGround
    this.dot.visible = !ac.onGround || selected
    this.dot.position.set(x, g + 0.08, z)
    if (selected) {
      const p = 0.5 + 0.5 * Math.sin((c.nowMs / SEL_RING_PERIOD_MS) * Math.PI * 2)
      this.dot.scale.setScalar(sc * size * 0.8 * (SEL_RING_SCALE + SEL_RING_AMP * (p * 2 - 1)))
      this.dotMat.opacity = SEL_RING_OPACITY[0] + (SEL_RING_OPACITY[1] - SEL_RING_OPACITY[0]) * p
    } else {
      this.dot.scale.setScalar(sc * size * 0.8)
      this.dotMat.opacity = DOT_OPACITY
    }

    this.trail.visible = !ac.onGround
    // Trail Y is stored at x1 and scaled by the object, so old vertices follow the vertical scale.
    this.trail.scale.y = vscale.k
    if (ac.onGround) this.hN = 0
    else this.writeTrail(c.nowMs, x, y / vscale.k, z, tmpC.setHex(col))

    const arrow = ac.vsFpm > 300 ? '↑' : ac.vsFpm < -300 ? '↓' : ''
    const fl = String(Math.round(Math.max(0, ac.altFt) / 100)).padStart(3, '0') + arrow
    if (this.showLabel)
      this.label.set(ac.callsign || ac.id.toUpperCase(), fl, hexCss(raw), selected)
  }

  private writeTrail(nowMs: number, x: number, y: number, z: number, cur: THREE.Color): void {
    if (nowMs - this.lastSample >= TRAIL_SAMPLE_MS) {
      this.lastSample = nowMs
      if (this.hN === HIST) {
        this.hPos.copyWithin(0, 3)
        this.hCol.copyWithin(0, 3)
        this.hN--
      }
      const o = this.hN * 3
      this.hPos[o] = x
      this.hPos[o + 1] = y
      this.hPos[o + 2] = z
      this.hCol[o] = cur.r
      this.hCol[o + 1] = cur.g
      this.hCol[o + 2] = cur.b
      this.hN++
    }
    const n = this.hN + 1
    const pa = this.posA.array as Float32Array
    const ca = this.colA.array as Float32Array
    for (let i = 0; i < n; i++) {
      const last = i === this.hN
      const t = (i + 1) / n
      const f = 0.08 + 0.92 * t * t
      const o = i * 3
      pa[o] = last ? x : this.hPos[o]
      pa[o + 1] = last ? y : this.hPos[o + 1]
      pa[o + 2] = last ? z : this.hPos[o + 2]
      ca[o] = (last ? cur.r : this.hCol[o]) * f
      ca[o + 1] = (last ? cur.g : this.hCol[o + 1]) * f
      ca[o + 2] = (last ? cur.b : this.hCol[o + 2]) * f
    }
    this.posA.needsUpdate = true
    this.colA.needsUpdate = true
    this.trail.geometry.setDrawRange(0, n)
  }

  dispose(): void {
    this.trail.geometry.dispose()
    this.mat.dispose()
    this.rotorMat.dispose()
    this.dropMat.dispose()
    this.dotMat.dispose()
    this.label.remove()
  }
}

/** Pool of views keyed by aircraft id. */
export class ViewPool {
  readonly active = new Map<string, AircraftView>()
  private free: AircraftView[] = []
  private kit = createViewKit()

  private scene: THREE.Scene
  private overlay: HTMLElement

  constructor(scene: THREE.Scene, overlay: HTMLElement) {
    this.scene = scene
    this.overlay = overlay
  }

  acquire(ac: Aircraft, nowMs: number): AircraftView {
    const v = this.free.pop() ?? new AircraftView(this.kit, this.overlay)
    v.reset(ac, nowMs)
    this.scene.add(v.root)
    this.active.set(ac.id, v)
    return v
  }

  release(id: string): void {
    const v = this.active.get(id)
    if (!v) return
    this.active.delete(id)
    this.scene.remove(v.root)
    v.label.place(null)
    this.free.push(v)
  }

  recolor(): void {
    for (const v of this.active.values()) v.recolor()
  }

  clear(): void {
    for (const id of [...this.active.keys()]) this.release(id)
  }

  dispose(): void {
    this.clear()
    this.free.forEach((v) => v.dispose())
    this.free = []
    disposeViewKit(this.kit)
  }
}
