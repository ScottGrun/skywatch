// Runway lighting layout (FAA/ICAO-style spacing, simplified). Pure: runway data in, light points out.
import type { Airport, Runway } from '../types'
import { toLocal } from './geo'

export type LightColor = 'white' | 'yellow' | 'green' | 'red'
export type LightKind =
  'edge' | 'threshold' | 'end' | 'center' | 'tdz' | 'approach' | 'rabbit' | 'papi'

export interface LightSpec {
  /** km east / north of the airport reference point. */
  e: number
  n: number
  color: LightColor
  kind: LightKind
  /** Landing-end id (rabbit chain / PAPI bank). */
  group?: number
  /** Rabbit: order along the chain, far to near. PAPI: 0 = nearest the runway. */
  idx?: number
  /** PAPI: landing heading (deg true) the bank faces. */
  hdg?: number
}

const FT = 0.0003048 // km per ft
const EDGE_STEP = 200 * FT
const CENTER_STEP = 50 * FT
/** Pitch of the lights across a threshold / end row, km (about 10 ft). */
const ROW_STEP = 0.006
/** Threshold (green) and end (red) rows sit this far outside / inside the runway end, km. */
const ROW_OFFSET = 0.004

export const hasThreshold = (lenFt: number): boolean => lenFt >= 3000
export const isPrecision = (lenFt: number, widthFt: number): boolean =>
  lenFt >= 6000 || widthFt >= 100

/** Approach system: ALSF-2-like (2,400 ft), MALSR-like (1,400 ft) or none. */
export function approachKind(lenFt: number): 'alsf' | 'malsr' | null {
  return lenFt >= 8000 ? 'alsf' : lenFt >= 3000 ? 'malsr' : null
}

/**
 * Lights for one runway. `minWidthKm` is the drawn runway width floor; lateral offsets are
 * stretched to match it so lights sit on the drawn edges. Closed runways get none.
 */
export function runwayLights(
  rw: Runway,
  origin: { lat: number; lon: number },
  groupBase: number,
  minWidthKm: number,
): LightSpec[] {
  if (rw.closed) return []
  const a = toLocal(origin, rw.le.lat, rw.le.lon)
  const b = toLocal(origin, rw.he.lat, rw.he.lon)
  const L = Math.hypot(b.e - a.e, b.n - a.n)
  if (L < 0.2) return []
  const lenFt = L / FT
  const ue = (b.e - a.e) / L
  const un = (b.n - a.n) / L
  const realW = rw.widthFt * FT
  const halfW = Math.max(realW, minWidthKm) / 2
  const latK = Math.max(1, minWidthKm / realW) // stretch for real-scale lateral offsets
  const out: LightSpec[] = []
  /** Point `s` km along the runway from end A, `l` km to the left of the A->B direction. */
  const add = (
    s: number,
    l: number,
    color: LightColor,
    kind: LightKind,
    extra?: Partial<LightSpec>,
  ) => out.push({ e: a.e + ue * s - un * l, n: a.n + un * s + ue * l, color, kind, ...extra })

  // Edge lights, caution-zone yellow over the last 2,000 ft (or half a short runway) at each end.
  const caution = Math.min(2000 * FT, L / 2)
  const nEdge = Math.round(L / EDGE_STEP)
  for (let i = 0; i <= nEdge; i++) {
    const s = (i / nEdge) * L
    const c: LightColor = Math.min(s, L - s) < caution - 1e-6 ? 'yellow' : 'white'
    add(s, halfW, c, 'edge')
    add(s, -halfW, c, 'edge')
  }
  if (!hasThreshold(lenFt)) return out

  // Threshold (green, just outside) and end (red, just inside) rows at both physical ends.
  const nRow = Math.max(2, Math.round((halfW * 2) / ROW_STEP))
  for (let i = 0; i <= nRow; i++) {
    const l = -halfW + (i / nRow) * halfW * 2
    add(-ROW_OFFSET, l, 'green', 'threshold')
    add(ROW_OFFSET, l, 'red', 'end')
    add(L + ROW_OFFSET, l, 'green', 'threshold')
    add(L - ROW_OFFSET, l, 'red', 'end')
  }

  if (isPrecision(lenFt, rw.widthFt)) {
    // Centerline every 50 ft: white, alternating red/white 3,000..1,000 ft from either end, red inside 1,000.
    const nC = Math.round(L / CENTER_STEP)
    for (let i = 1; i < nC; i++) {
      const s = (i / nC) * L
      const remFt = Math.min(s, L - s) / FT
      const c: LightColor = remFt <= 1000 ? 'red' : remFt <= 3000 && i % 2 === 1 ? 'red' : 'white'
      add(s, 0, c, 'center')
    }
    // Touchdown zone: 3-light barrettes both sides of the centerline every 100 ft, first 3,000 ft.
    const zone = Math.min(3000 * FT, L / 2)
    for (let d = 100 * FT; d <= zone + 1e-9; d += 100 * FT) {
      for (const side of [-1, 1]) {
        for (let k = -1; k <= 1; k++) {
          const l = side * 0.008 * latK
          add(d + k * 0.005, l, 'white', 'tdz')
          add(L - d + k * 0.005, l, 'white', 'tdz')
        }
      }
    }
  }

  const apt = approachKind(lenFt)
  const ends = [
    { s0: 0, dir: 1 },
    { s0: L, dir: -1 },
  ]
  ends.forEach((end, ei) => {
    const group = groupBase + ei
    // Landing heading = along the runway, away from this end.
    const hdg = (Math.atan2(ue * end.dir, un * end.dir) * 180) / Math.PI
    // Point `d` km out from the threshold along the extended centerline, `l` to the left of A->B.
    const out_ = (d: number, l: number, c: LightColor, k: LightKind, x?: Partial<LightSpec>) =>
      add(end.s0 - end.dir * d, l, c, k, x)
    if (apt) {
      const alsf = apt === 'alsf'
      const step = (alsf ? 100 : 200) * FT
      const reach = (alsf ? 2400 : 1400) * FT
      for (let d = step; d <= reach + 1e-9; d += step) {
        for (let k = -2; k <= 2; k++) out_(d, k * 0.004, 'white', 'approach')
      }
      // Crossbar at 1,000 ft.
      for (let k = 1; k <= 6; k++) {
        for (const side of [-1, 1]) out_(1000 * FT, side * (0.006 + k * 0.004), 'white', 'approach')
      }
      // ALSF-2 red side rows (100..900 ft) beside the centerline.
      if (alsf) {
        for (let d = 100 * FT; d <= 900 * FT + 1e-9; d += 100 * FT) {
          for (const side of [-1, 1]) {
            for (let k = 0; k < 3; k++) out_(d, side * (0.012 + k * 0.004), 'red', 'approach')
          }
        }
      }
      // Sequenced flashers ("rabbit"): ALSF-2 stations 2,400..300 ft, MALSR 1,400..1,000 ft.
      const far = alsf ? 2400 : 1400
      const near = alsf ? 300 : 1000
      let idx = 0
      for (let d = far; d >= near; d -= alsf ? 100 : 200) {
        out_(d * FT, 0, 'white', 'rabbit', { group, idx: idx++ })
      }
    }
    // PAPI: 4 boxes on the left of the landing direction, 1,000 ft past the threshold.
    for (let i = 0; i < 4; i++) {
      // Left of A->B is +l; left of the reverse landing direction is -l.
      const l = end.dir * (halfW + 0.015 + i * 0.009)
      add(end.s0 + end.dir * 1000 * FT, l, 'white', 'papi', { group, idx: i, hdg })
    }
  })
  return out
}

/** All lights for an airport (none when it has no runway data). */
export function airportLights(ap: Airport, minWidthKm: number): LightSpec[] {
  const out: LightSpec[] = []
  ap.runways.forEach((rw, i) => out.push(...runwayLights(rw, ap, i * 2, minWidthKm)))
  return out
}
