/** Dead reckoning plus exponential error easing so new reports never cause a visible jump. */

export interface Report {
  lat: number
  lon: number
  altFt: number
  gsKt: number
  trackDeg: number
  vsFpm: number
  onGround: boolean
  /** Wall-clock ms the report applies to. */
  t: number
}

export interface Position {
  lat: number
  lon: number
  altFt: number
}

export const EASE_TAU_MS = 2000
const MAX_PROJECT_S = 30
const D2R = Math.PI / 180

/** Project a report forward to `nowMs` using ground speed, track and vertical rate. */
export function project(r: Report, nowMs: number): Position {
  const dt = Math.min(MAX_PROJECT_S, Math.max(0, (nowMs - r.t) / 1000))
  if (r.onGround && r.gsKt < 1) return { lat: r.lat, lon: r.lon, altFt: 0 }
  const nm = (r.gsKt * dt) / 3600
  const lat = r.lat + (nm * Math.cos(r.trackDeg * D2R)) / 60
  const lon =
    r.lon + (nm * Math.sin(r.trackDeg * D2R)) / (60 * Math.max(0.05, Math.cos(r.lat * D2R)))
  const altFt = r.onGround ? 0 : Math.max(0, r.altFt + (r.vsFpm * dt) / 60)
  return { lat, lon, altFt }
}

/** One aircraft's displayed track: projection from latest report + decaying correction offset. */
export class Track {
  private report: Report
  private off: Position = { lat: 0, lon: 0, altFt: 0 }
  private offT: number
  private tau: number

  constructor(first: Report, tauMs = EASE_TAU_MS) {
    this.report = first
    this.offT = first.t
    this.tau = tauMs
  }

  get latest(): Report {
    return this.report
  }

  /** Displayed position at `nowMs`. */
  at(nowMs: number): Position {
    const p = project(this.report, nowMs)
    const k = Math.exp(-Math.max(0, nowMs - this.offT) / this.tau)
    return {
      lat: p.lat + this.off.lat * k,
      lon: p.lon + this.off.lon * k,
      altFt: Math.max(0, p.altFt + this.off.altFt * k),
    }
  }

  /** Feed a new report; the visible position stays continuous. */
  update(next: Report): void {
    const shown = this.at(next.t)
    const target = project(next, next.t)
    this.off = {
      lat: shown.lat - target.lat,
      lon: shown.lon - target.lon,
      altFt: shown.altFt - target.altFt,
    }
    this.offT = next.t
    this.report = next
  }
}
