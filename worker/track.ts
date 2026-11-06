export const TRACKS_URL = 'https://opensky-network.org/api/tracks/all'

export interface TrackPoint {
  t: number
  lat: number
  lon: number
  altFt: number
  onGround: boolean
}
export interface TrackBody {
  icao24: string
  startTime: number
  endTime: number
  path: TrackPoint[]
}

const FT_PER_M = 3.28084
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const emptyTrack = (icao24: string): TrackBody => ({
  icao24,
  startTime: 0,
  endTime: 0,
  path: [],
})

/**
 * Map OpenSky `/tracks/all` to a compact body. Waypoints are
 * [time, lat, lon, baro_altitude_m, true_track, on_ground]; rows lacking time or position
 * are dropped, a null altitude becomes 0 ft.
 */
export function mapTrack(icao24: string, raw: unknown): TrackBody {
  const r = (raw ?? {}) as { startTime?: unknown; endTime?: unknown; path?: unknown }
  const path: TrackPoint[] = []
  for (const w of Array.isArray(r.path) ? (r.path as unknown[][]) : []) {
    if (!Array.isArray(w) || !isNum(w[0]) || !isNum(w[1]) || !isNum(w[2])) continue
    path.push({
      t: w[0],
      lat: w[1],
      lon: w[2],
      altFt: isNum(w[3]) ? Math.round(w[3] * FT_PER_M) : 0,
      onGround: w[5] === true,
    })
  }
  return {
    icao24,
    startTime: isNum(r.startTime) ? r.startTime : (path[0]?.t ?? 0),
    endTime: isNum(r.endTime) ? r.endTime : (path[path.length - 1]?.t ?? 0),
    path,
  }
}
