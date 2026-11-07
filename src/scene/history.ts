import * as THREE from 'three'
import { toLocal, type LatLon } from '../core/geo'
import { rampHex } from '../core/ramp'
import type { HistoryPoint } from '../types'
import type { AircraftView } from './aircraftView'
import { FT_TO_KM } from './constants'
import { surfaceY } from './surface'
import { vscale } from './vertical'

export const HISTORY_MAX_POINTS = 1000
const OLDEST_FADE = 0.45 // brightness at the oldest vertex; 1 at the newest

export interface HistoryHandle {
  /** Replace the line for the selected aircraft (null clears). */
  set(path: readonly HistoryPoint[] | null, origin: LatLon, elevFt: number): void
  /** Per frame: appends the aircraft's live position as the final vertex. */
  update(view: AircraftView | null): void
  dispose(): void
}

/** Evenly pick at most `max` items, always keeping first and last. */
export function downsample<T>(items: readonly T[], max: number): T[] {
  const n = items.length
  if (n <= max) return items.slice()
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (n - 1)) / (max - 1))])
  return out
}

export function createHistory(scene: THREE.Scene): HistoryHandle {
  const cap = HISTORY_MAX_POINTS + 1
  const posA = new THREE.BufferAttribute(new Float32Array(cap * 3), 3)
  const colA = new THREE.BufferAttribute(new Float32Array(cap * 3), 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', posA)
  geo.setAttribute('color', colA)
  geo.setDrawRange(0, 0)
  const mat = new THREE.LineBasicMaterial({ vertexColors: true })
  const line = new THREE.Line(geo, mat)
  line.frustumCulled = false
  line.visible = false
  scene.add(line)

  let n = 0 // history vertices (excluding the live one)
  const c = new THREE.Color()

  return {
    set(path, origin, elevFt) {
      n = 0
      if (!path || path.length < 2) {
        geo.setDrawRange(0, 0)
        line.visible = false
        return
      }
      const pts = downsample(path, HISTORY_MAX_POINTS)
      const pa = posA.array as Float32Array
      const ca = colA.array as Float32Array
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const { e, n: north } = toLocal(origin, p.lat, p.lon)
        const o = i * 3
        pa[o] = e
        // Never below the drawn surface (baro vs DEM mismatch): x1 units, ~20 m once scaled.
        pa[o + 1] = Math.max((p.altFt - elevFt) * FT_TO_KM, surfaceY(e, north) + 0.007)
        pa[o + 2] = -north
        c.setHex(rampHex(p.altFt))
        const f = OLDEST_FADE + (1 - OLDEST_FADE) * (i / Math.max(1, pts.length - 1))
        ca[o] = c.r * f
        ca[o + 1] = c.g * f
        ca[o + 2] = c.b * f
      }
      n = pts.length
      posA.needsUpdate = true
      colA.needsUpdate = true
    },
    update(view) {
      if (!view || n === 0) {
        line.visible = false
        return
      }
      const pa = posA.array as Float32Array
      const ca = colA.array as Float32Array
      const o = n * 3
      pa[o] = view.x
      pa[o + 1] = view.y / vscale.k
      pa[o + 2] = view.z
      c.setHex(view.colorHex < 0 ? 0xffffff : view.colorHex)
      ca[o] = c.r
      ca[o + 1] = c.g
      ca[o + 2] = c.b
      posA.needsUpdate = true
      colA.needsUpdate = true
      geo.setDrawRange(0, n + 1)
      line.scale.y = vscale.k
      line.visible = true
    },
    dispose() {
      scene.remove(line)
      geo.dispose()
      mat.dispose()
    },
  }
}
