import * as THREE from 'three'
import { smoothAltitudes } from '../core/altSmooth'
import { FIX_CAP, type FixTrail } from '../core/fixTrail'
import { rampHex } from '../core/ramp'
import { crSegment } from '../core/spline'
import { FT_TO_KM } from './constants'
import { surfaceY } from './surface'
import { pal, shadeHex } from './theme'

const SUB = 6 // spline points per segment
const SEED_MAX = 4 // fetched-history tail points that anchor the seam
const MAX_CTRL = FIX_CAP + SEED_MAX + 4
const MAX_VERTS = (FIX_CAP + SEED_MAX + 2) * SUB + 2
const SEAM_KM = 1.5
const tmp = new THREE.Color()

/** Age fade; none when continuing a fetched history (its line already ends at full brightness). */
const fade = (i: number, n: number, seeded: boolean) => {
  if (seeded) return 1
  const t = (i + 1) / n
  return 0.08 + 0.92 * t * t
}

/**
 * One aircraft's trail: a centripetal Catmull-Rom curve through its real (vetted) position fixes,
 * ending in a short live segment to the interpolated aircraft position. The curve is rebuilt only
 * when a fix arrives; per frame only the last two segments are rewritten.
 */
export class LiveTrail {
  readonly line: THREE.Line
  private posA = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3)
  private colA = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3)
  private ctrl = new Float64Array(MAX_CTRL * 3) // [0] start mirror, 1..m real, m+1 head, m+2 mirror
  private altS = new Float64Array(FIX_CAP)
  private m = 0
  private from = 1
  private liveStart = 0
  private total = 0
  private key = -1
  private keyFixes: FixTrail | null = null
  private keySeed: ArrayLike<number> | null = null
  private keyShade = -1

  constructor(mat: THREE.Material) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', this.posA)
    g.setAttribute('color', this.colA)
    g.setDrawRange(0, 0)
    this.line = new THREE.Line(g, mat)
    this.line.frustumCulled = false
  }

  reset(): void {
    this.key = -1
    this.keyFixes = null
    this.line.geometry.setDrawRange(0, 0)
  }

  /** `seed`: flat [eKm, nKm, altFt] of a fetched history's last points (or null). */
  update(
    fx: FixTrail | undefined,
    seed: ArrayLike<number> | null,
    elevFt: number,
    hx: number,
    hy: number,
    hz: number,
    cur: THREE.Color,
  ): void {
    if (!fx) {
      this.line.geometry.setDrawRange(0, 0)
      return
    }
    const shade = pal().shade
    if (
      fx !== this.keyFixes ||
      fx.version !== this.key ||
      seed !== this.keySeed ||
      shade !== this.keyShade
    ) {
      this.keyFixes = fx
      this.key = fx.version
      this.keySeed = seed
      this.keyShade = shade
      this.rebuild(fx, seed, elevFt)
    }
    if (this.m === 0) {
      this.line.geometry.setDrawRange(0, 0)
      return
    }
    this.writeLive(hx, hy, hz, cur)
  }

  private point(i: number, e: number, n: number, altFt: number, elevFt: number, surf: number) {
    const o = (i + 1) * 3
    this.ctrl[o] = e
    this.ctrl[o + 1] = Math.max((altFt - elevFt) * FT_TO_KM, surf + 0.007)
    this.ctrl[o + 2] = -n
  }

  private rebuild(fx: FixTrail, seed: ArrayLike<number> | null, elevFt: number): void {
    const c = this.ctrl
    let m = 0
    let cut = 0
    const ns = seed ? Math.min(SEED_MAX, Math.floor(seed.length / 3)) : 0
    if (seed && ns > 0) {
      const s0 = seed.length - ns * 3
      for (let i = 0; i < ns; i++) {
        const e = seed[s0 + i * 3]
        const n = seed[s0 + i * 3 + 1]
        this.point(m++, e, n, seed[s0 + i * 3 + 2], elevFt, surfaceY(e, n))
      }
      // Live fixes up to the one nearest the history's end are already in the history.
      const le = seed[seed.length - 3]
      const ln = seed[seed.length - 2]
      let best = SEAM_KM
      for (let i = 0; i < fx.n; i++) {
        const d = Math.hypot(fx.e[i] - le, fx.nn[i] - ln)
        if (d < best) {
          best = d
          cut = i + 1
        }
      }
    }
    smoothAltitudes(fx.alt, fx.t, fx.n, this.altS)
    for (let i = cut; i < fx.n; i++) {
      if (Number.isNaN(fx.aux[i])) fx.aux[i] = surfaceY(fx.e[i], fx.nn[i])
      this.point(m++, fx.e[i], fx.nn[i], this.altS[i], elevFt, fx.aux[i])
    }
    this.m = m
    if (m === 0) return
    this.from = ns > 0 ? ns : 1
    const pairs = m - this.from + 1
    this.total = 1 + SUB * pairs
    this.liveStart = 1 + SUB * Math.max(0, m - 1 - this.from)
    // Mirror the start so the first segment has a tangent.
    if (m >= 2) {
      for (let k = 0; k < 3; k++) c[k] = 2 * c[3 + k] - c[6 + k]
    }
    const p = this.posA.array as Float32Array
    p[0] = c[this.from * 3]
    p[1] = c[this.from * 3 + 1]
    p[2] = c[this.from * 3 + 2]
    let o = 3
    for (let i = this.from; i <= m - 2; i++) o = crSegment(c, i - 1, i, i + 1, i + 2, SUB, p, o)
    // Colors by height with the age fade; the live tail keeps these until the next fix.
    const ca = this.colA.array as Float32Array
    for (let i = 0; i < this.total; i++) {
      // Heights of baked vertices are known; live ones are filled in by writeLive.
      if (i >= this.liveStart) break
      const ft = p[i * 3 + 1] / FT_TO_KM + elevFt
      tmp.setHex(shadeHex(rampHex(ft), this.keyShade))
      const f = fade(i, this.total, this.keySeed !== null)
      ca[i * 3] = tmp.r * f
      ca[i * 3 + 1] = tmp.g * f
      ca[i * 3 + 2] = tmp.b * f
    }
    this.colA.needsUpdate = true
    this.liveColored = false
  }

  private liveColored = false

  private writeLive(hx: number, hy: number, hz: number, cur: THREE.Color): void {
    const c = this.ctrl
    const m = this.m
    const h = (m + 1) * 3
    c[h] = hx
    c[h + 1] = hy
    c[h + 2] = hz
    const q = h + 3 // mirror of the head side
    c[q] = 2 * hx - c[m * 3]
    c[q + 1] = 2 * hy - c[m * 3 + 1]
    c[q + 2] = 2 * hz - c[m * 3 + 2]
    if (m === 1) for (let k = 0; k < 3; k++) c[k] = 2 * c[3 + k] - c[h + k]
    const p = this.posA.array as Float32Array
    let o = this.liveStart * 3
    if (m - 1 >= this.from) o = crSegment(c, m - 2, m - 1, m, m + 1, SUB, p, o)
    crSegment(c, m - 1, m, m + 1, m + 2, SUB, p, o)
    if (!this.liveColored) {
      this.liveColored = true
      const ca = this.colA.array as Float32Array
      for (let i = this.liveStart; i < this.total; i++) {
        const f = fade(i, this.total, this.keySeed !== null)
        ca[i * 3] = cur.r * f
        ca[i * 3 + 1] = cur.g * f
        ca[i * 3 + 2] = cur.b * f
      }
      this.colA.needsUpdate = true
    } else {
      const ca = this.colA.array as Float32Array
      const i = (this.total - 1) * 3
      ca[i] = cur.r
      ca[i + 1] = cur.g
      ca[i + 2] = cur.b
      this.colA.needsUpdate = true
    }
    this.posA.needsUpdate = true
    this.line.geometry.setDrawRange(0, this.total)
  }

  dispose(): void {
    this.line.geometry.dispose()
  }
}
