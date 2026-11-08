import { distanceNm, type LatLon } from './geo.ts'

/** Allowed detour: positions off the direct line by more than this are treated as a stale route. */
const DETOUR_FACTOR = 1.3
const SLACK_NM = 60

/**
 * Callsign-based route databases go stale (flight numbers get reused, e.g. regional carriers), so
 * a route is only shown when the aircraft's real position fits it: the trip via the aircraft must
 * not be much longer than the direct origin→destination distance. Unknown endpoints pass.
 */
export function plausibleRoute(
  pos: LatLon,
  origin: LatLon | undefined,
  dest: LatLon | undefined,
): boolean {
  if (!origin || !dest) return true
  const direct = distanceNm(origin, dest)
  if (direct < 1) return true // round trip / same field: nothing to check against
  return distanceNm(origin, pos) + distanceNm(pos, dest) <= direct * DETOUR_FACTOR + SLACK_NM
}
