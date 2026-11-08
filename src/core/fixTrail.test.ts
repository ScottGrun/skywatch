import { describe, expect, it } from 'vitest'
import { smoothAltitudes } from './altSmooth'
import { FixTrail } from './fixTrail'
import { crSegment } from './spline'

// 250 kt ~ 0.1286 km/s; a fix every 5 s heading north is ~0.643 km.
const KMS = 250 * (1.852 / 3600)
const fix = (f: FixTrail, i: number, dn = 0, de = 0, alt = 3000) =>
  f.push(de, i * 5 * KMS + dn, alt, 1000 + i * 5000, 250)

describe('FixTrail', () => {
  it('accepts consistent fixes', () => {
    const f = new FixTrail()
    for (let i = 0; i < 5; i++) expect(fix(f, i)).toBe('accepted')
    expect(f.n).toBe(5)
  })
  it('rejects duplicate and out-of-order timestamps', () => {
    const f = new FixTrail()
    fix(f, 0)
    fix(f, 1)
    expect(f.push(0, 1, 3000, 1000 + 5000, 250)).toBe('rejected')
    expect(f.push(0, 0, 3000, 1000, 250)).toBe('rejected')
    expect(f.n).toBe(2)
  })
  it('drops an MLAT-style jump contradicted by the next fix', () => {
    const f = new FixTrail()
    fix(f, 0)
    fix(f, 1)
    expect(fix(f, 2, 0, 12)).toBe('held')
    expect(f.n).toBe(2)
    expect(fix(f, 3)).toBe('accepted')
    expect(f.n).toBe(3)
    expect(Math.max(...f.e.slice(0, f.n))).toBe(0)
  })
  it('keeps a held fix when the next one agrees with it (real relocation)', () => {
    const f = new FixTrail()
    fix(f, 0)
    fix(f, 1)
    expect(fix(f, 2, 0, 12)).toBe('held')
    expect(fix(f, 3, 0, 12)).toBe('accepted')
    expect(f.n).toBe(4)
  })
  it('rejects impossible implied speed and altitude jumps, accepts after long gaps', () => {
    const f = new FixTrail()
    fix(f, 0)
    expect(f.push(0, 5, 3000, 2000, 250)).toBe('held') // 5 km in 1 s
    const g = new FixTrail()
    fix(g, 0)
    expect(g.push(0, KMS * 5, 9000, 6000, 250)).toBe('held') // +6000 ft in 5 s
    const h = new FixTrail()
    fix(h, 0)
    expect(h.push(0, 20, 3000, 1000 + 120_000, 250)).toBe('accepted') // 20 km in 2 min = 324 kt
  })
  it('restarts after persistent disagreement and caps its length', () => {
    const f = new FixTrail(8)
    fix(f, 0)
    fix(f, 1)
    f.push(0, 500, 3000, 20_000, 250)
    f.push(30, 900, 3000, 30_000, 250)
    expect(f.push(-40, 100, 3000, 40_000, 250)).toBe('accepted')
    expect(f.n).toBe(1)
    for (let i = 0; i < 20; i++) f.push(0, 100 + i * 0.6, 3000, 50_000 + i * 5000, 250)
    expect(f.n).toBe(8)
  })
})

describe('smoothAltitudes', () => {
  it('ramps plateaus toward the next step without leaving the reported range', () => {
    const alt = [3000, 3000, 3000, 3100, 3100, 3200]
    const t = [0, 5000, 10000, 15000, 20000, 25000]
    const out = new Float64Array(6)
    smoothAltitudes(alt, t, 6, out)
    expect(Array.from(out.slice(0, 4))).toEqual([
      3000, 3033.3333333333335, 3066.6666666666665, 3100,
    ])
    for (const v of out) expect(v >= 3000 && v <= 3200).toBe(true)
  })
  it('leaves level flight and large steps alone', () => {
    const out = new Float64Array(4)
    smoothAltitudes([3000, 3000, 3000, 5000], [0, 5000, 10000, 15000], 4, out)
    expect(Array.from(out)).toEqual([3000, 3000, 3000, 5000])
  })
})

describe('crSegment', () => {
  const pts = [0, 0, 0, 1, 0, 0, 2, 1, 0, 3, 3, 0, 3.5, 6, 0]
  it('passes exactly through its end control point and is continuous', () => {
    const out: number[] = []
    crSegment(pts, 0, 1, 2, 3, 6, out, 0)
    expect(out.slice(-3)).toEqual([2, 1, 0])
    const out2: number[] = []
    crSegment(pts, 1, 2, 3, 4, 6, out2, 0)
    expect(out2.slice(-3).map((v) => +v.toFixed(9))).toEqual([3, 3, 0])
    // The next segment starts near where this one ended (first sample close to p2).
    expect(Math.hypot(out2[0] - 2, out2[1] - 1)).toBeLessThan(0.5)
  })
  it('stays on the straight line for collinear points and never overshoots a corner', () => {
    const line = [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]
    const o: number[] = []
    crSegment(line, 0, 1, 2, 3, 4, o, 0)
    for (let i = 1; i < o.length; i += 3) expect(o[i]).toBeCloseTo(0, 9)
    const corner = [0, 0, 0, 5, 0, 0, 5, 5, 0, 5, 10, 0]
    const c: number[] = []
    crSegment(corner, 0, 1, 2, 3, 8, c, 0)
    for (let i = 0; i < c.length; i += 3) {
      expect(c[i]).toBeLessThanOrEqual(5.5)
      expect(c[i + 1]).toBeGreaterThanOrEqual(-0.5)
    }
  })
})
