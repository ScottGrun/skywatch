import * as THREE from 'three'
import { rampHex, hexCss } from '../core/ramp'
import type { Aircraft, AircraftClass } from '../types'
import { aircraftGeometry, aircraftRotors } from './aircraftGeometry'
import { advanceSpin, classScale, effectiveSize, modelScale, trueLengthKm } from './classScale'
import { getModel, type ModelInfo } from './modelLoader'
import { modelNameFor } from './modelMap'
import type { RotorSpec } from './propGeometry'
import {
  D2R,
  EMISSIVE,
  DETAIL_LIFT,
  FT_TO_KM,
  GROUND_COLOR,
  GROUND_EMISSIVE,
  KT_TO_KMS,
  MIN_PX_AIR,
  MIN_PX_GROUND,
  PITCH_MAX,
  RING_MIN_ANGLE,
  ROLL_GAIN,
  ROLL_MAX,
  ROLL_SMOOTH,
  SCALE_DIV,
  SCALE_MAX,
  SCALE_MIN,
  SEL_SCALE,
  SEL_SCALE_TAU_S,
} from './constants'
import { AircraftMarks } from './aircraftMarks'
import { AircraftLabel } from './labels'
import { LiveTrail } from './liveTrail'
import { SurfaceProbe } from './surface'
import { pal, shadeHex } from './theme'
import { terrainBlend, vscale } from './vertical'

export interface FrameCtx {
  nowMs: number
  dt: number // seconds since last frame
  elevFt: number
  cam: THREE.Vector3
  /** Pixels per km at 1 km distance (viewport height / (2 tan(fov/2))). */
  focalPx: number
  /** Draw live trails (data keeps accumulating in the feed either way). */
  trails: boolean
  /** Draw callsign tags (the selected aircraft's always shows). */
  tags: boolean
  /** Colour unselected ground traffic instead of neutral grey. */
  groundColor: boolean
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const tmpC = new THREE.Color()

function footOf(g: THREE.BufferGeometry): number {
  g.computeBoundingBox()
  return g.boundingBox?.min.y ?? 0
}

/** Geometry/material shared by all views. */
export interface ViewKit {
  marks: AircraftMarks
  trailMat: THREE.LineBasicMaterial
}

export function createViewKit(): ViewKit {
  return {
    marks: new AircraftMarks(),
    trailMat: new THREE.LineBasicMaterial({ vertexColors: true, fog: false }),
  }
}

export function disposeViewKit(k: ViewKit): void {
  k.marks.dispose()
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
    fog: false, // aircraft stay at full colour at any distance (no fade to the background)
  })
  private body = new THREE.Group()
  private mesh: THREE.Mesh
  private rotors: { mesh: THREE.Mesh; axis: 'x' | 'y' | 'z'; rate: number; angle: number }[] = []
  private rotorMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  })
  private marks: AircraftMarks
  /** Slot in the shared drop-line / ring buffers. */
  private slot: number
  private trail: LiveTrail
  private cls: AircraftClass | null = null
  private type = ''
  private modelName: string | null = null
  private modelBound = false
  private size = 1
  private trueKm = 0.038
  /** Lowest model point in model units (negative: the origin is mid-fuselage). */
  private footY = 0
  private prevTrack = 0
  private prevMs = 0
  private rate = 0
  private bank = 0
  private selK = 1
  private probe = new SurfaceProbe()

  constructor(kit: ViewKit, overlay: HTMLElement) {
    this.mesh = new THREE.Mesh(aircraftGeometry('narrow'), this.mat)
    this.body.rotation.order = 'YXZ'
    this.body.add(this.mesh)
    this.marks = kit.marks
    this.slot = kit.marks.alloc()
    this.trail = new LiveTrail(kit.trailMat)
    this.root.add(this.body, this.trail.line)
    this.label = new AircraftLabel(overlay)
  }

  hideMarks(): void {
    this.marks.hide(this.slot)
  }

  /** Force the next update to re-apply colors (theme change). */
  recolor(): void {
    this.colorHex = -1
  }

  /** (Re)bind to a new aircraft; clears history. */
  reset(ac: Aircraft, nowMs: number): void {
    this.id = ac.id
    this.probe.invalidate()
    this.trail.reset()
    this.prevTrack = ac.trackDeg
    this.prevMs = nowMs
    this.rate = 0
    this.bank = 0
    this.selK = 1
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
    this.footY = footOf(this.mesh.geometry)
    this.size = classScale(cls)
    this.trueKm = trueLengthKm(cls)
    this.setRotors(aircraftRotors(cls))
  }

  private bindModel(m: ModelInfo): void {
    this.mesh.geometry = m.geo
    this.footY = footOf(m.geo)
    this.size = modelScale(m.lengthM)
    this.trueKm = m.lengthM / 1000
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

  update(
    ac: Aircraft,
    c: FrameCtx,
    selected: boolean,
    hovered = false,
    /** Flat [eKm, nKm, altFt] tail of the fetched history this aircraft's trail continues from. */
    seed: ArrayLike<number> | null = null,
  ): void {
    this.syncModel(ac)
    const muted = ac.onGround && !selected && !hovered
    this.showLabel = !muted
    // Not clamped at airport elevation: terrain below it (water, valleys) needs the negative offset.
    const altKm = (ac.altFt - c.elevFt) * FT_TO_KM * vscale.k
    const x = ac.e
    // Surface as drawn (tile-mesh triangles, not the raw DEM), cached while the aircraft barely moves.
    // With terrain off the detail patch still sits flat at its lift, so blend toward that, not 0.
    const tb = terrainBlend.value
    const g =
      (this.probe.at(ac.e, ac.n) * tb + (ac.onGround ? (1 - tb) * DETAIL_LIFT : 0)) * vscale.k
    // On-ground traffic sits on the terrain; airborne never dips below it (DEM vs baro mismatch).
    const y = ac.onGround ? g : Math.max(altKm, g + 0.02)
    const z = -ac.n
    this.x = x
    this.y = y
    this.z = z
    const grey = muted && !c.groundColor
    const raw = grey ? GROUND_COLOR : rampHex(ac.altFt)
    const col = shadeHex(raw, pal().shade)
    if (col !== this.colorHex) {
      this.colorHex = col
      this.mat.color.setHex(col)
      this.mat.emissive.setHex(col)
      this.mat.emissiveIntensity = grey ? GROUND_EMISSIVE : EMISSIVE
      this.rotorMat.color.setHex(col)
    }

    this.camDist = Math.hypot(c.cam.x - x, c.cam.y - y, c.cam.z - z)
    const sc = clamp(this.camDist / SCALE_DIV, SCALE_MIN, SCALE_MAX)
    // Drawn length (km): true size near the camera, exaggerated size far away.
    const minPx = ac.onGround ? MIN_PX_GROUND : MIN_PX_AIR
    let len = effectiveSize(
      this.camDist,
      this.trueKm,
      sc * this.size,
      (minPx * this.camDist) / c.focalPx,
    )
    // Selected aircraft grows a hair, eased so it never pops.
    this.selK += ((selected ? SEL_SCALE : 1) - this.selK) * (1 - Math.exp(-c.dt / SEL_SCALE_TAU_S))
    len *= this.selK
    this.scale = len
    // Rings stay readable when the true-size plane is only a few pixels long.
    const ringLen = Math.max(len, this.camDist * RING_MIN_ANGLE)

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
    // Ground traffic: lift the model so its lowest point (wheels) rests on the surface.
    this.body.position.set(x, ac.onGround ? y - this.footY * len : y, z)
    this.body.scale.setScalar(len)
    for (const r of this.rotors) {
      r.angle = advanceSpin(r.angle, r.rate, c.dt)
      r.mesh.rotation[r.axis] = r.angle
    }
    this.body.rotation.set(clamp(climb, -PITCH_MAX, PITCH_MAX), -ac.trackDeg * D2R, this.bank)

    tmpC.setHex(col)
    this.marks.set(
      this.slot,
      x,
      g,
      z,
      y - g > 0.05 && !ac.onGround ? Math.max(y - g, 1e-4) : 0,
      !ac.onGround || selected ? ringLen * 0.8 : 0,
      tmpC,
    )

    const showTrail = c.trails && !ac.onGround
    this.trail.line.visible = showTrail
    // Trail Y is stored at x1 and scaled by the object, so old vertices follow the vertical scale.
    this.trail.line.scale.y = vscale.k
    if (showTrail) this.trail.update(ac.fixes, seed, c.elevFt, x, y / vscale.k, z, tmpC.setHex(col))

    const arrow = ac.vsFpm > 300 ? '↑' : ac.vsFpm < -300 ? '↓' : ''
    const fl = String(Math.round(Math.max(0, ac.altFt) / 100)).padStart(3, '0') + arrow
    if (this.showLabel && (c.tags || selected))
      this.label.set(ac.callsign || ac.id.toUpperCase(), fl, hexCss(raw), selected)
  }

  dispose(): void {
    this.trail.dispose()
    this.mat.dispose()
    this.rotorMat.dispose()
    this.marks.free(this.slot)
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
    scene.add(this.kit.marks.lines, this.kit.marks.dots)
  }

  /** Upload drop-line / ring changes; call once per frame after all views updated. */
  flush(): void {
    this.kit.marks.flush()
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
    v.hideMarks()
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
    this.scene.remove(this.kit.marks.lines, this.kit.marks.dots)
    disposeViewKit(this.kit)
  }
}
