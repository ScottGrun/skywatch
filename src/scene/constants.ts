// All scene tuning values (world units: 1 unit = 1 km, +X east, -Z north).

export const BG = 0x050608
export const FOG_NEAR = 130
export const FOG_FAR = 300
export const FOV = 40

export const ALT_EXAG = 3
export const FT_TO_KM = 0.0003048
export const KT_TO_KMS = 0.000514444
export const D2R = Math.PI / 180

// Tiles
export const TILE_ZOOM = 10
export const TILE_R = 3 // 7x7
/** Esri Dark Gray is lighter than the CARTO tiles the design assumed, so it is tinted down. */
export const TILE_TINT_ESRI: readonly [number, number, number] = [0.5, 0.6, 0.72]
export const TILE_TINT: readonly [number, number, number] = [1.25, 1.4, 1.6]

// Ground decor
export const GRID_COLOR = 0x10181f
export const GRID_OPACITY = 0.6
export const RING_COLOR = 0x24323f
export const RING_LABEL_COLOR = '#5b6f80'
export const RING_NM = [10, 20, 30, 40] as const
export const RING_LABEL_BEARING = 150
export const COMPASS_RADIUS_KM = 80

// Runways
export const RUNWAY_COLOR = 0xdfe7ef
export const RUNWAY_MIN_WIDTH_KM = 0.11
export const APPROACH_LEN_KM = 22
export const APPROACH_OPACITY = 0.35
export const ACTIVE_REFRESH_MS = 2000

// Lights
export const HEMI_SKY = 0xbfd8ff
export const HEMI_GROUND = 0x101418
export const HEMI_INTENSITY = 1.1
export const DIR_INTENSITY = 1.6
export const EMISSIVE = 0.55

// Aircraft view
export const TRAIL_POINTS = 80
export const TRAIL_SAMPLE_MS = 2000
export const DROP_OPACITY = 0.45
export const DOT_OPACITY = 0.7
export const SCALE_DIV = 50
export const SCALE_MIN = 0.25
export const SCALE_MAX = 4
export const PITCH_MAX = 0.4
export const ROLL_MAX = 0.6
export const ROLL_GAIN = 0.14
export const ROLL_SMOOTH = 5 // 1/s
export const SELECT_COLOR = 0xffffff

// Selection
export const HALO_BASE = 1.05
export const HALO_AMP = 0.06
export const HALO_PERIOD_MS = 220
export const ROUTE_EXTEND_KM = 40
export const ROUTE_DASH = 1.2
export const ROUTE_GAP = 0.9
export const ROUTE_OPACITY = 0.7

// Labels / picking
export const LABEL_MAX_DIST = 400
export const PICK_RADIUS_PX = 28
export const CLICK_SLOP_PX = 5

// Camera
export const HOME = { theta: 0.55, phi: 0.98, r: 100 }
export const TOP = { phi: 0.06, r: 150 }
export const SIDE = { phi: 1.45, r: 110 }
export const PHI_MIN = 0.06
export const PHI_MAX = 1.5
export const R_MIN = 3
export const R_MAX = 320
export const EASE = 6
export const EASE_FOLLOW = 10
export const FOLLOW_R = 18
export const FOLLOW_PHI = 1.2
