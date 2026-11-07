// Shared contracts between data layer (src/data), scene (src/scene) and UI (src/ui).
// Change only with care: all three layers depend on these shapes.

export interface RunwayEnd {
  ident: string // e.g. "08L"
  lat: number
  lon: number
  headingDeg: number // true heading for landing on this end
}

export interface Runway {
  lengthFt: number
  widthFt: number
  le: RunwayEnd
  he: RunwayEnd
  closed?: boolean
}

export interface Airport {
  icao: string
  iata: string // "" when none
  name: string
  city: string
  country: string // ISO code
  lat: number
  lon: number
  elevationFt: number
  runways: Runway[] // may be empty → scene draws fallback layout
}

export type AircraftClass =
  'narrow' | 'wide' | 'quad' | 'regional' | 'turboprop' | 'piston' | 'bizjet' | 'heli' | 'unknown'
export type Category = 'ARR' | 'DEP' | 'OVR'
export type Phase =
  | 'Takeoff roll'
  | 'Initial climb'
  | 'Climb'
  | 'Cruise'
  | 'Descent'
  | 'Approach'
  | 'Final approach'
  | 'Landing'
  | 'Taxi'
export type FeedStatus = 'connecting' | 'live' | 'delayed' | 'offline'

/** One aircraft at a moment in time (already dead-reckoned / eased by the data layer). */
export interface Aircraft {
  id: string // icao24, lowercase hex
  callsign: string // trimmed, may be "" → UI shows id uppercased
  lat: number
  lon: number
  e: number // km east of airport
  n: number // km north of airport
  altFt: number // barometric, 0 when on ground
  gsKt: number
  trackDeg: number // true track 0..360
  vsFpm: number
  onGround: boolean
  distNm: number // from airport reference point
  category: Category
  phase: Phase
  typeCode: string // ICAO type e.g. "A320", "" unknown
  aircraftClass: AircraftClass
  registration?: string // tail number when known
  airline: string // e.g. "Air Canada", "" unknown
  origin: string // IATA (or ICAO) code, "" unknown → UI shows "—"
  dest: string
  etaMin: number | null // ARR: minutes to touchdown; others: minutes to leave 40 NM area
  lastSeenMs: number // wall-clock ms of last real position report
}

/** Read-only view the scene and UI consume. Implemented in src/data/traffic.ts. */
export interface TrafficSource {
  /** Interpolated snapshot for render time `nowMs` (performance-independent, Date.now() based). Cheap; call per frame. */
  snapshot(nowMs: number): Aircraft[]
  status(): FeedStatus
  subscribeStatus(fn: (s: FeedStatus) => void): () => void
  /** Which upstream feed served the last response ("adsblol" | "opensky"); null before the first one. */
  source?(): string | null
}

/** One vertex of a real track history (already limited to what the scene needs). */
export interface HistoryPoint {
  lat: number
  lon: number
  altFt: number
}

export interface AirspaceLimit {
  value: number
  unit: 'FT' | 'FL' | 'M'
  ref: 'MSL' | 'AGL' | 'SFC' | 'STD'
}

/** One controlled-airspace volume (outer ring only) from `/api/airspace`. */
export interface Airspace {
  id: string
  name: string
  class: string // 'A'-'D' or a type code (CTR, TMA, CTA, ATZ, R, DNG, P, ...)
  type: string
  lower: AirspaceLimit
  upper: AirspaceLimit
  polygon: [number, number][] // [lon, lat]
}

export interface AirspaceData {
  source: 'openaip' | 'faa' | 'none'
  attribution: string
  reason?: 'needs_key' | 'upstream_error'
  airspaces: Airspace[]
}

export interface AirspaceStatus {
  state: 'off' | 'loading' | 'ok' | 'unavailable'
  /** Credit to show while volumes are visible, e.g. "Airspace: openAIP". */
  attribution: string
  /** Short user-facing note when unavailable or empty. */
  note: string
}

export type ViewPreset = 'overview' | 'top' | 'side'

/** Imperative scene handle. Implemented in src/scene/createFlightScene.ts. */
export interface FlightScene {
  setAirport(ap: Airport): void // rebuild tiles + runways, reset camera
  setTraffic(src: TrafficSource): void
  select(id: string | null): void
  setFollow(on: boolean): void
  /** Real track history for the selected aircraft; ignored unless `id` is selected. null clears. */
  setHistory(id: string, path: readonly HistoryPoint[] | null): void
  /** Hide aircraft failing `pred` (no mesh/label/trail/ring, not pickable). null shows all. */
  setFilter(pred: ((a: Aircraft) => boolean) | null): void
  /** Show/hide controlled-airspace volumes around the airport (fetched lazily, off by default). */
  setAirspace(on: boolean): void
  /** Real 3D terrain (default) vs the flat map. Instant; persisted by the scene in localStorage. */
  setTerrain(on: boolean): void
  view(preset: ViewPreset): void
  /** Ease back over the airport (cancels follow) and start the idle orbit. */
  home(): void
  on(event: 'select', fn: (id: string | null) => void): () => void
  on(event: 'follow', fn: (on: boolean) => void): () => void
  on(event: 'airspace', fn: (s: AirspaceStatus) => void): () => void
  dispose(): void
}
