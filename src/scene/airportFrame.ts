import type { Airport } from '../types'
import { AIRPORT_VIEW_K, AIRPORT_VIEW_MIN_R } from './constants'
import { runwayGeoms } from './runways'

/** Center (km east/north of the airport reference point) and camera orbit radius framing the runway set. */
export function airportFrame(ap: Airport): { e: number; n: number; r: number } {
  let e0 = Infinity
  let e1 = -Infinity
  let n0 = Infinity
  let n1 = -Infinity
  for (const g of runwayGeoms(ap)) {
    for (const t of [g.a, g.b]) {
      e0 = Math.min(e0, t.e)
      e1 = Math.max(e1, t.e)
      n0 = Math.min(n0, t.n)
      n1 = Math.max(n1, t.n)
    }
  }
  const extent = Math.hypot(e1 - e0, n1 - n0)
  return {
    e: (e0 + e1) / 2,
    n: (n0 + n1) / 2,
    r: Math.max(AIRPORT_VIEW_MIN_R, extent * AIRPORT_VIEW_K),
  }
}
