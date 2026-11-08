// NWS-style reflectivity color ramp and the opacity curve used by the volume renderer.

/** Below this the volume is fully transparent (clutter / drizzle noise). */
export const RADAR_MIN_DBZ = 15

/** [dBZ, r, g, b] stops of the classic NWS ramp. */
const STOPS: readonly (readonly [number, number, number, number])[] = [
  [15, 4, 233, 231],
  [20, 1, 159, 244],
  [25, 3, 0, 244],
  [30, 2, 253, 2],
  [35, 1, 197, 1],
  [40, 253, 248, 2],
  [45, 229, 188, 0],
  [50, 253, 149, 0],
  [55, 253, 0, 0],
  [60, 212, 0, 0],
  [65, 248, 0, 253],
  [70, 152, 84, 198],
  [75, 253, 253, 253],
]

/** Opacity density 0..1: nothing under 15 dBZ, faint but visible 15-25, solid by ~50. */
export function radarAlpha(dbz: number): number {
  if (dbz < RADAR_MIN_DBZ) return 0
  const t = Math.min(1, (dbz - RADAR_MIN_DBZ) / 40)
  return 0.14 + 0.86 * Math.pow(t, 1.4)
}

export function radarColor(dbz: number): [number, number, number] {
  const d = Math.min(75, Math.max(RADAR_MIN_DBZ, dbz))
  let i = 0
  while (i < STOPS.length - 2 && d > STOPS[i + 1]![0]) i++
  const a = STOPS[i]!
  const b = STOPS[i + 1]!
  const t = (d - a[0]) / (b[0] - a[0])
  return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t].map(
    Math.round,
  ) as [number, number, number]
}

/** 256-entry RGBA lookup indexed by the stored Uint8 dBZ (0-255). */
export function buildRadarLut(): Uint8Array {
  const lut = new Uint8Array(256 * 4)
  for (let d = 0; d < 256; d++) {
    const [r, g, b] = radarColor(d)
    lut.set([r, g, b, Math.round(radarAlpha(d) * 255)], d * 4)
  }
  return lut
}
