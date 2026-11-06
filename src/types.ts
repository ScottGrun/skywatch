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
  | 'narrow'
  | 'wide'
  | 'quad'
  | 'regional'
  | 'turboprop'
  | 'piston'
  | 'bizjet'
  | 'heli'
  | 'unknown'
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
}

export type ViewPreset = 'overview' | 'top' | 'side'

/** Imperative scene handle. Implemented in src/scene/createFlightScene.ts. */
export interface FlightScene {
  setAirport(ap: Airport): void // rebuild tiles + runways, reset camera
  setTraffic(src: TrafficSource): void
  select(id: string | null): void
  setFollow(on: boolean): void
  view(preset: ViewPreset): void
  on(event: 'select', fn: (id: string | null) => void): () => void
  on(event: 'follow', fn: (on: boolean) => void): () => void
  dispose(): void
}
