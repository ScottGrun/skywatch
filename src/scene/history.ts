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
const TAIL_POINTS = 4
const TAIL_GAP_KM = 0.15

export interface HistoryHandle {
  /** Replace the line for the selected aircraft (null clears). */
  set(path: readonly HistoryPoint[] | null, origin: LatLon, elevFt: number): void
  /** True while a fetched history is drawn. */
  readonly active: boolean
  /** Flat [eKm, nKm, altFt] of the history's last points, or null. The live trail continues from it. */
  readonly tail: Float64Array | null
  /** Per frame: shows the line while the selected aircraft is in view. */
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

/** Last few well-spaced points of the path, oldest first, as flat [eKm, nKm, altFt]. */
function tailOf(path: readonly HistoryPoint[], origin: LatLon): Float64Array {
  const out: number[] = []
  let pe = Infinity
  let pn = Infinity
  for (let i = path.length - 1; i >= 0 && out.length < TAIL_POINTS * 3; i--) {
    const { e, n } = toLocal(origin, path[i].lat, path[i].lon)
    if (out.length > 0 && Math.hypot(e - pe, n - pn) < TAIL_GAP_KM) continue
    out.unshift(e, n, path[i].altFt)
    pe = e
    pn = n
  }
  return Float64Array.from(out)
}

export function createHistory(scene: THREE.Scene): HistoryHandle {
  const cap = HISTORY_MAX_POINTS
  const posA = new THREE.BufferAttribute(new Float32Array(cap * 3), 3)
  const colA = new THREE.BufferAttribute(new Float32Array(cap * 3), 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', posA)
  geo.setAttribute('color', colA)
  geo.setDrawRange(0, 0)
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, fog: false })
  const line = new THREE.Line(geo, mat)
  line.frustumCulled = false
  line.visible = false
  scene.add(line)

  let n = 0
  let tail: Float64Array | null = null
  const c = new THREE.Color()

  return {
    get active() {
      return n > 0
    },
    get tail() {
      return tail
    },
    set(path, origin, elevFt) {
      n = 0
      tail = null
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
      tail = tailOf(path, origin)
      posA.needsUpdate = true
      colA.needsUpdate = true
    },
    update(view) {
      line.visible = view !== null && n > 0
      if (line.visible) {
        geo.setDrawRange(0, n)
        line.scale.y = vscale.k
      }
    },
    dispose() {
      scene.remove(line)
      geo.dispose()
      mat.dispose()
    },
  }
}
