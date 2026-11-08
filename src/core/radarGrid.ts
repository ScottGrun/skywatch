// Resamples decoded polar sweeps into a Cartesian dBZ voxel grid (gather: each voxel looks up the beams).
import type { Volume, Sweep } from './nexrad/level2.ts'
import { elevationAndRange } from './radarGeo.ts'
import { toLocal, type LatLon } from './geo.ts'

export const GRID = {
  /** Horizontal half extent, km (grid spans -HALF..+HALF east/north of the center). */
  half: 120,
  cell: 1,
  nx: 240,
  ny: 240,
  nz: 24,
  /** Vertical cell, km (grid spans 0..12 km MSL). */
  dz: 0.5,
}

/** Half beam width, deg (WSR-88D is ~0.95 deg wide). */
const HALF_BEAM = 0.5
/** Interpolate between cuts only when they are closer than this, deg. */
const MAX_CUT_GAP = 4.5
/** Extend the lowest cut to the ground for voxels at most this far (deg) below it. */
const LOW_EXTEND_DEG = 3
const AZ_BINS = 720

/** Per-sweep lookup from azimuth (0.5 deg bins) to the nearest radial. */
interface Prepared {
  sweep: Sweep
  bin: Int16Array
}

function prepare(sweep: Sweep): Prepared {
  const bin = new Int16Array(AZ_BINS).fill(-1)
  const rs = sweep.radials
  rs.forEach((r, i) => (bin[Math.round(r.az * 2) % AZ_BINS] = i))
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < AZ_BINS; i++) {
      if (bin[i]! < 0)
        bin[i] =
          bin[(i + 1) % AZ_BINS]! >= 0 ? bin[(i + 1) % AZ_BINS]! : bin[(i + AZ_BINS - 1) % AZ_BINS]!
    }
  }
  return { sweep, bin }
}

/** Max dBZ (integer, >= 0) of the gates within +-0.5 km of slant range `rKm`, or -1 if no data. */
function sample(p: Prepared, azDeg: number, rKm: number): number {
  const idx = p.bin[Math.round(azDeg * 2) % AZ_BINS]!
  if (idx < 0) return -1
  const rad = p.sweep.radials[idx]!
  const g0 = Math.max(0, Math.floor((rKm * 1000 - 500 - (rad.first - rad.size / 2)) / rad.size))
  const g1 = Math.min(
    rad.gates.length - 1,
    Math.floor((rKm * 1000 + 500 - (rad.first - rad.size / 2)) / rad.size),
  )
  if (g1 < g0) return -1
  let best = -1
  for (let g = g0; g <= g1; g++) {
    const raw = rad.gates[g]!
    if (raw === 1) continue // range folded
    const dbz = raw === 0 ? 0 : Math.max(0, Math.round((raw - rad.offset) / rad.scale))
    if (dbz > best) best = dbz
  }
  return best
}

/**
 * Builds the grid centered on `center`. Layout: index = (k * ny + j) * nx + i with i = east, j = north,
 * k = height (MSL). Values are integer dBZ clamped to 0..120 (0 = no echo / no data).
 */
export function buildGrid(vol: Volume, center: LatLon): Uint8Array {
  const { half, cell, nx, ny, nz, dz } = GRID
  const grid = new Uint8Array(nx * ny * nz)
  const radar = toLocal(center, vol.lat, vol.lon)
  const cuts = vol.sweeps.map(prepare)
  const radarKm = vol.heightM / 1000
  const nc = cuts.length
  for (let j = 0; j < ny; j++) {
    const n = -half + (j + 0.5) * cell - radar.n
    for (let i = 0; i < nx; i++) {
      const e = -half + (i + 0.5) * cell - radar.e
      const s = Math.hypot(e, n)
      let az = (Math.atan2(e, n) * 180) / Math.PI
      if (az < 0) az += 360
      for (let k = 0; k < nz; k++) {
        const { el, r } = elevationAndRange(s, (k + 0.5) * dz - radarKm)
        let v = -1
        let lo = -1 // nearest cut below the voxel (outside the beam)
        let hi = -1
        for (let c = 0; c < nc; c++) {
          const d = cuts[c]!.sweep.el - el
          if (Math.abs(d) <= HALF_BEAM) {
            const sv = sample(cuts[c]!, az, r)
            if (sv > v) v = sv
          } else if (d < 0) lo = c
          else if (hi < 0) hi = c
        }
        if (v < 0 && lo < 0 && hi >= 0 && cuts[hi]!.sweep.el - el <= LOW_EXTEND_DEG) {
          // Below the lowest beam (it overshoots the surface at long range): extend the lowest cut down to the ground.
          v = sample(cuts[hi]!, az, r)
        }
        if (v < 0 && lo >= 0 && hi >= 0) {
          const a = cuts[lo]!
          const b = cuts[hi]!
          const gap = b.sweep.el - a.sweep.el
          if (gap <= MAX_CUT_GAP) {
            const va = sample(a, az, r)
            const vb = sample(b, az, r)
            if (va >= 0 && vb >= 0) {
              const t = (el - a.sweep.el) / gap
              v = Math.round(va + (vb - va) * t)
            }
          }
        }
        if (v > 0) grid[(k * ny + j) * nx + i] = Math.min(120, v)
      }
    }
  }
  return grid
}

/** Per-voxel max of two grids of the same size (overlapping radars); returns `a`, modified in place. */
export function mergeMax(a: Uint8Array, b: Uint8Array): Uint8Array {
  for (let i = 0; i < a.length; i++) if (b[i]! > a[i]!) a[i] = b[i]!
  return a
}
