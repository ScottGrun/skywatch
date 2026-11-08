// All scene tuning values (world units: 1 unit = 1 km, +X east, -Z north).

export const BG = 0x050608
export const FOG_NEAR = 130
export const FOG_FAR = 300
/** Radial ground fog around the orbit target, in km: near = a + b*r, far = a + b*r (r = orbit distance). */
export const GFOG_NEAR_A = 40
export const GFOG_NEAR_B = 0.35
export const GFOG_FAR_A = 80
export const GFOG_FAR_B = 0.9
export const FOV = 40

/** Vertical exaggeration of altitude and relief: default and slider range (runtime value in vertical.ts). */
export const VSCALE_DEFAULT = 3
export const VSCALE_MIN = 1
export const VSCALE_MAX = 10
export const VSCALE_STEP = 0.5
/** Time constant of the exaggeration easing (s); ~200 ms to settle. */
export const VSCALE_EASE_S = 0.07
/** Terrain relief rise-in / fade-out time (s). */
export const TERRAIN_RISE_S = 0.6
export const FT_TO_KM = 0.0003048
export const KT_TO_KMS = 0.000514444
export const D2R = Math.PI / 180

// Tiles
export const TILE_ZOOM = 10
export const TILE_R = 4 // 9x9 detailed tiles
/** Low-zoom outer ring beneath the detailed tiles (cheap far coverage). */
export const TILE_ZOOM_FAR = 8
export const TILE_R_FAR = 4 // 9x9 at z8 is roughly +-450 km
/** Outer ring sits this far below the detailed one (km at x1 vertical scale). */
export const TILE_FAR_DROP = 0.05

// Ground decor
/** Lift of ground decor (grid, rings, markers) above the terrain surface, km. */
export const DECOR_LIFT = 0.06 // world km, constant at any vertical scale
export const RING_NM = [10, 20, 30, 40] as const
export const RING_LABEL_BEARING = 150
export const COMPASS_RADIUS_KM = 80

// Runways
export const RUNWAY_MIN_WIDTH_KM = 0.055
export const APPROACH_LEN_KM = 22
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
export const DOT_OPACITY = 0.55
export const SCALE_DIV = 50
export const SCALE_MIN = 0.25
export const SCALE_MAX = 4
export const PITCH_MAX = 0.4
export const ROLL_MAX = 0.6
export const ROLL_GAIN = 0.14
export const ROLL_SMOOTH = 5 // 1/s

// Selection
// Selected aircraft: its ground ring pulses in its own altitude color.
export const SEL_RING_SCALE = 2.4 // base size relative to the normal ring
export const SEL_RING_AMP = 0.35 // ± scale swing
/** Selected aircraft model scale multiplier and easing time constant (~0.25 s to settle). */
export const SEL_SCALE = 1.4
export const SEL_SCALE_TAU_S = 0.07
export const SEL_RING_PERIOD_MS = 1100 // full pulse period
export const SEL_RING_OPACITY = [0.45, 1] as const // min/max opacity over a pulse
export const ROUTE_EXTEND_KM = 40
export const ROUTE_DASH = 1.2
export const ROUTE_GAP = 0.9
export const ROUTE_OPACITY = 0.7

// Labels / picking
export const LABEL_MAX_DIST = 400
export const PICK_RADIUS_PX = 28
export const CLICK_SLOP_PX = 5

// Camera
export const HOME = { theta: 0.55, phi: 1.15, r: 140 }
export const TOP = { phi: 0.06, r: 200 }
export const SIDE = { phi: 1.45, r: 150 }
export const PHI_MIN = 0.06
export const PHI_MAX = 1.5
export const R_MIN = 0.8
/** Camera near plane (km): scales with orbit distance so close views do not clip. */
export const NEAR_MIN = 0.015
export const NEAR_MAX = 0.5
/** AIRPORT preset: orbit distance = runway extent * this, and tilt. */
export const AIRPORT_VIEW_K = 1.3
export const AIRPORT_VIEW_MIN_R = 2
export const AIRPORT_VIEW_PHI = 1.1
export const R_MAX = 320
export const EASE = 6
export const EASE_FOLLOW = 10
export const FOLLOW_R = 18
export const FOLLOW_PHI = 1.2

// Aircraft class sizes: rough real length relative to a narrowbody, applied on top of the
// camera-distance scale. Anything below CLASS_SIZE_FLOOR is raised so it stays visible/clickable.
export const CLASS_SIZE: Readonly<Record<string, number>> = {
  quad: 1.35,
  wide: 1.2,
  narrow: 0.9,
  regional: 0.75,
  turboprop: 0.7,
  bizjet: 0.55,
  heli: 0.45,
  piston: 0.4,
  unknown: 0.8,
}
export const CLASS_SIZE_FLOOR = 0.52
/** Real airframe length (m) by class, for classes without a baked model. */
export const TRUE_LENGTH_M: Readonly<Record<string, number>> = {
  quad: 70,
  wide: 62,
  narrow: 38,
  regional: 30,
  turboprop: 25,
  bizjet: 20,
  heli: 14,
  piston: 8.5,
  unknown: 35,
}
/** Camera distance (km) within which aircraft are drawn at true size, and beyond which at the exaggerated size. */
export const TRUE_SIZE_NEAR_KM = 3
export const TRUE_SIZE_FAR_KM = 30
/** Smallest on-screen half-length (px) used for picking, so tiny true-size aircraft stay clickable. */
export const PICK_MIN_PX = 14
/** Minimum drawn aircraft length on screen (px); fades out between these camera distances (km) so real size wins up close. */
export const MIN_PX_AIR = 14
export const MIN_PX_GROUND = 10
export const MIN_SIZE_FADE_KM = [1.5, 2.5] as const
/** Ground/selection rings never get smaller than this angular size (fraction of camera distance). */
export const RING_MIN_ANGLE = 0.004

// Ground aircraft
export const GROUND_COLOR = 0x5b6670
export const GROUND_EMISSIVE = 0.25
export const HOVER_PICK_PX = 28

// Slow orbit around the airport after picking it (or pressing home); any camera input stops it.
export const AUTO_ORBIT_RAD_S = 0.06 // ≈ one revolution per 105 s

// High-resolution detail patch around the airport (zoom 15 raster tiles)
export const DETAIL_ZOOM = 15
/** Half-width of the detail patch, km (8 km square). */
export const DETAIL_HALF_KM = 4
/** Mesh subdivisions per detail tile side (~40 m at z15; follows relief and runway flattening). */
export const DETAIL_SEGS = 20
/** Width of the alpha fade at the patch edge, km. */
export const DETAIL_FADE_KM = 0.9
/** Lift of the patch over the z10 surface, km at x1 vertical scale (hides coarse-mesh poke-through). */
export const DETAIL_LIFT = 0.006
