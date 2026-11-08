/**
 * Display-only altitude smoothing. Barometric altitude arrives in 25-100 ft steps, so a climbing
 * or descending track shows stair-steps. Where a short run of equal altitudes ends in a small
 * step, ramp across the run toward the next value. Never leaves the reported [min, max] range.
 */
const MAX_STEP_FT = 250
const MAX_RUN_S = 30

/** `t` in ms. Writes smoothed altitudes (ft) to `out[0..n)`. */
export function smoothAltitudes(
  alt: ArrayLike<number>,
  t: ArrayLike<number>,
  n: number,
  out: Float64Array,
): void {
  for (let i = 0; i < n; i++) out[i] = alt[i]
  let s = 0
  while (s < n) {
    let j = s + 1
    while (j < n && alt[j] === alt[s]) j++
    // Equal run is s..j-1; alt[j] (if any) is the next, different value.
    if (j < n && j - s > 1) {
      const step = Math.abs(alt[j] - alt[s])
      const span = (t[j] - t[s]) / 1000
      if (step <= MAX_STEP_FT && span <= MAX_RUN_S && span > 0) {
        for (let k = s + 1; k < j; k++) {
          const u = (t[k] - t[s]) / (t[j] - t[s])
          out[k] = alt[s] + (alt[j] - alt[s]) * u
        }
      }
    }
    s = j
  }
}
