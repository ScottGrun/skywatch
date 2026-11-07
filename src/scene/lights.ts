import * as THREE from 'three'
import { airportLights, type LightSpec } from '../core/lightLayout'
import type { Airport } from '../types'
import { D2R, DECOR_LIFT, RUNWAY_MIN_WIDTH_KM } from './constants'
import { createLightMaterial, KIND_LOOK, LOOKS } from './lightMaterial'
import { terrainY } from './terrain'
import { sceneTheme } from './theme'

/** Lights float this far (world km) above the runway slab plane so they are never buried in it. */
export const LIGHT_LIFT = 0.03
/** PAPI transition angles (deg) from the nearest box outward: white above, red below. */
const PAPI_DEG = [3.5, 3.17, 2.83, 2.5] as const
/** Rabbit: sweeps per second and trailing length in stations. */
const RABBIT_HZ = 2
const RABBIT_TAIL = 1.6

interface Papi {
  i: number
  idx: number
  hx: number
  hz: number
  white: boolean
}

export interface LightsHandle {
  root: THREE.Group
  count: number
  /**
   * Per-frame animation: rabbit sweep and PAPI colors from the camera angle.
   * `kY` = decor scale.y x vertical scale (local height -> world), `vk` = vertical exaggeration.
   */
  update(cam: THREE.Vector3, tSec: number, kY: number, vk: number): void
}

/** One Points layer with every runway light of the airport. Built inside the decor group. */
export function buildLights(ap: Airport): LightsHandle {
  const specs: LightSpec[] = airportLights(ap, RUNWAY_MIN_WIDTH_KM)
  const n = specs.length
  const look = LOOKS[sceneTheme()]
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const size = new Float32Array(n)
  const glow = new Float32Array(n)
  const papi: Papi[] = []
  const chains = new Map<number, number[]>() // group -> point indices ordered far to near

  specs.forEach((s, i) => {
    pos.set([s.e, terrainY(s.e, s.n), -s.n], i * 3)
    col.set(look.colors[s.color], i * 3)
    const k = KIND_LOOK[s.kind]
    size[i] = k.size
    glow[i] = s.kind === 'rabbit' ? 0 : k.glow
    if (s.kind === 'papi') {
      const h = (s.hdg ?? 0) * D2R
      papi.push({ i, idx: s.idx ?? 0, hx: Math.sin(h), hz: -Math.cos(h), white: true })
    } else if (s.kind === 'rabbit' && s.group !== undefined) {
      const c = chains.get(s.group) ?? []
      c[s.idx ?? 0] = i
      chains.set(s.group, c)
    }
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const colAttr = new THREE.BufferAttribute(col, 3)
  const glowAttr = new THREE.BufferAttribute(glow, 1)
  colAttr.setUsage(THREE.DynamicDrawUsage)
  glowAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aColor', colAttr)
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  geo.setAttribute('aGlow', glowAttr)
  const points = new THREE.Points(geo, createLightMaterial(sceneTheme()))
  points.frustumCulled = false
  points.renderOrder = 5
  const root = new THREE.Group()
  root.add(points)

  const chainList = [...chains.values()]
  const white = look.colors.white
  const red = look.colors.red

  return {
    root,
    count: n,
    update(cam, tSec, kY, vk) {
      if (!n || !root.visible) return
      let dirty = false
      // Rabbit: a pulse running far -> near, RABBIT_HZ times per second, with a short fading tail.
      for (const c of chainList) {
        const pulse = ((tSec * RABBIT_HZ) % 1) * (c.length + RABBIT_TAIL * 2) - RABBIT_TAIL
        for (let j = 0; j < c.length; j++) {
          const d = pulse - j
          glow[c[j]] = d < 0 || d > RABBIT_TAIL ? 0 : 1 - d / RABBIT_TAIL
        }
        dirty = true
      }
      // PAPI: compare the camera's true elevation angle to each light with its threshold.
      for (const p of papi) {
        const o = p.i * 3
        const dx = cam.x - pos[o]
        const dz = cam.z - pos[o + 2]
        const hd = Math.hypot(dx, dz) || 1e-6
        const ly = pos[o + 1] * kY + DECOR_LIFT + LIGHT_LIFT
        const ang = Math.atan2((cam.y - ly) / vk, hd) / D2R
        const isWhite = ang > PAPI_DEG[p.idx]
        if (isWhite !== p.white) {
          p.white = isWhite
          col.set(isWhite ? white : red, o)
          colAttr.needsUpdate = true
        }
        // Boxes are directional: full strength on the approach course, dim from the side or behind.
        const cosA = -(dx * p.hx + dz * p.hz) / hd
        const f = Math.min(1, Math.max(0, (cosA - 0.35) / 0.55))
        glow[p.i] = 0.15 + 0.85 * f * f * (3 - 2 * f)
      }
      if (dirty || papi.length) glowAttr.needsUpdate = true
    },
  }
}
