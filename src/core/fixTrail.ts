/** Ring of real, vetted position reports behind one aircraft (the source for its drawn trail). */

export type FixResult = 'accepted' | 'held' | 'rejected'

export const FIX_CAP = 48
const MAX_KT = 700
const SPEED_FACTOR = 1.5
const SPEED_MARGIN_KT = 80
const MAX_FPM = 15_000
const MIN_DT_S = 0.5
const MAX_BAD_RUN = 3
const KT_KMS = 1.852 / 3600

export class FixTrail {
  n = 0
  /** Bumped on every change to the stored fixes. */
  version = 0
  readonly e: Float64Array
  readonly nn: Float64Array
  readonly alt: Float64Array
  readonly t: Float64Array
  readonly gs: Float64Array
  /** Per-fix scratch for the renderer (moves with its fix; NaN for a new fix). */
  readonly aux: Float32Array
  private held = false
  private he = 0
  private hn = 0
  private ha = 0
  private ht = 0
  private hg = 0
  private bad = 0
  readonly cap: number

  constructor(cap = FIX_CAP) {
    this.cap = cap
    this.e = new Float64Array(cap)
    this.nn = new Float64Array(cap)
    this.alt = new Float64Array(cap)
    this.t = new Float64Array(cap)
    this.gs = new Float64Array(cap)
    this.aux = new Float32Array(cap).fill(NaN)
  }

  clear(): void {
    if (this.n === 0 && !this.held) return
    this.n = 0
    this.held = false
    this.bad = 0
    this.version++
  }

  /** Could an aircraft have flown from the last stored fix to this one? */
  private plausible(e: number, n: number, alt: number, t: number, gs: number): boolean {
    const i = this.n - 1
    const dt = (t - this.t[i]) / 1000
    if (dt < MIN_DT_S) return false
    return this.plausibleFrom(
      this.e[i],
      this.nn[i],
      this.alt[i],
      this.t[i],
      this.gs[i],
      e,
      n,
      alt,
      t,
      gs,
    )
  }

  private plausibleFrom(
    e0: number,
    n0: number,
    a0: number,
    t0: number,
    g0: number,
    e: number,
    n: number,
    alt: number,
    t: number,
    gs: number,
  ): boolean {
    const dt = (t - t0) / 1000
    if (dt < MIN_DT_S) return false
    const kt = Math.hypot(e - e0, n - n0) / dt / KT_KMS
    const lim = Math.min(MAX_KT, SPEED_FACTOR * Math.max(g0, gs) + SPEED_MARGIN_KT)
    if (kt > lim) return false
    const da = Math.abs(alt - a0)
    return !(da > 1500 && (da / dt) * 60 > MAX_FPM)
  }

  private append(e: number, n: number, alt: number, t: number, gs: number): void {
    if (this.n === this.cap) {
      this.e.copyWithin(0, 1)
      this.nn.copyWithin(0, 1)
      this.alt.copyWithin(0, 1)
      this.t.copyWithin(0, 1)
      this.gs.copyWithin(0, 1)
      this.aux.copyWithin(0, 1)
      this.n--
    }
    const i = this.n++
    this.e[i] = e
    this.nn[i] = n
    this.alt[i] = alt
    this.t[i] = t
    this.gs[i] = gs
    this.aux[i] = NaN
    this.version++
  }

  /**
   * Offer a report (local km, ft, ms, kt). Implausible fixes are held for one report: if the next
   * one agrees with the last good fix the held one was an outlier and is dropped; if it agrees
   * with the held one instead, both are real (a gap or a relocation) and kept.
   */
  push(e: number, n: number, alt: number, t: number, gs: number): FixResult {
    if (this.n === 0) {
      this.append(e, n, alt, t, gs)
      return 'accepted'
    }
    const last = this.n - 1
    if (t <= this.t[last]) return 'rejected' // duplicate / out of order
    if (this.held) {
      if (t <= this.ht) return 'rejected'
      if (this.plausible(e, n, alt, t, gs)) {
        this.held = false
        this.bad = 0
        this.append(e, n, alt, t, gs)
        return 'accepted'
      }
      if (this.plausibleFrom(this.he, this.hn, this.ha, this.ht, this.hg, e, n, alt, t, gs)) {
        this.held = false
        this.bad = 0
        this.append(this.he, this.hn, this.ha, this.ht, this.hg)
        this.append(e, n, alt, t, gs)
        return 'accepted'
      }
      // Disagrees with both: keep the older good fix; vet this one next.
    } else if (this.plausible(e, n, alt, t, gs)) {
      this.bad = 0
      this.append(e, n, alt, t, gs)
      return 'accepted'
    }
    if (++this.bad >= MAX_BAD_RUN) {
      // Persistent disagreement: the old fixes are the odd ones out. Start over from here.
      this.n = 0
      this.held = false
      this.bad = 0
      this.append(e, n, alt, t, gs)
      return 'accepted'
    }
    this.held = true
    this.he = e
    this.hn = n
    this.ha = alt
    this.ht = t
    this.hg = gs
    return 'held'
  }
}
