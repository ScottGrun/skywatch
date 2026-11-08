/**
 * Centripetal Catmull-Rom (alpha 0.5, Barry-Goldman form) through 3D points stored flat as xyz.
 * It passes exactly through the control points and does not overshoot or loop on uneven spacing.
 */
const EPS = 1e-6

/**
 * Writes `sub` points of the p1->p2 segment (parameters 1/sub .. 1, so p2 is last) at out[o...].
 * p0..p3 are vertex indices into `pts`. Returns the next write offset. No allocation.
 */
export function crSegment(
  pts: ArrayLike<number>,
  i0: number,
  i1: number,
  i2: number,
  i3: number,
  sub: number,
  out: Float32Array | number[],
  o: number,
): number {
  const a = i0 * 3
  const b = i1 * 3
  const c = i2 * 3
  const d = i3 * 3
  const t1 = knot(pts, a, b)
  const t2 = t1 + knot(pts, b, c)
  const t3 = t2 + knot(pts, c, d)
  for (let s = 1; s <= sub; s++) {
    const t = t1 + ((t2 - t1) * s) / sub
    for (let k = 0; k < 3; k++) {
      const p0 = pts[a + k]
      const p1 = pts[b + k]
      const p2 = pts[c + k]
      const p3 = pts[d + k]
      const a1 = lerp(p0, p1, 0, t1, t)
      const a2 = lerp(p1, p2, t1, t2, t)
      const a3 = lerp(p2, p3, t2, t3, t)
      const b1 = lerp(a1, a2, 0, t2, t)
      const b2 = lerp(a2, a3, t1, t3, t)
      out[o++] = lerp(b1, b2, t1, t2, t)
    }
  }
  return o
}

function knot(p: ArrayLike<number>, a: number, b: number): number {
  const d = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2])
  return Math.max(Math.sqrt(d), EPS)
}

function lerp(p: number, q: number, ta: number, tb: number, t: number): number {
  return ((tb - t) * p + (t - ta) * q) / (tb - ta)
}
