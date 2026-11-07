// Runway marking layout (FAA AC 150/5340-1 style, simplified). Pure: feet in, rectangles out.
// Coordinates per runway end: `s` runs from that end's threshold along the landing direction,
// `t` is the offset from the centerline, positive to the pilot's right. Line weights are slightly
// exaggerated so they stay visible at a distance.

export interface MarkRect {
  s0: number
  s1: number
  t0: number
  t1: number
}

export interface EndLayout {
  /** Length of this end's textured cap, ft. */
  capFt: number
  rects: MarkRect[]
  /** Runway number: text, start `s` and glyph height (ft). */
  number: { text: string; s: number; h: number } | null
  /** Optional L/C/R letter, drawn beyond the number. */
  letter: { text: string; s: number; h: number } | null
}

export interface Split {
  capA: number
  capB: number
  /** Repeating middle section length, ft (a multiple of DASH_PERIOD). */
  mid: number
}

export const DASH_PERIOD = 200
export const DASH_LEN = 120
const CAP_MAX = 2600
const CAP_MIN = 400
const EDGE_W = 3
const EDGE_INSET = 1.5
const CENTER_W = 3

/** Where the textured end caps stop and the repeating middle starts; null when too short to mark. */
export function splitRunway(lenFt: number): Split | null {
  if (lenFt < 1200) return null
  const step = DASH_PERIOD
  const capA = Math.min(CAP_MAX, Math.max(CAP_MIN, Math.floor((lenFt * 0.45) / step) * step))
  const mid = Math.floor((lenFt - 2 * capA) / step) * step
  return { capA, capB: lenFt - capA - mid, mid }
}

/** "08L" -> digits + letter; anything else is drawn whole as the number. */
export function parseIdent(ident: string): { num: string; letter: string | null } {
  const m = /^(\d{1,2})([LCR])?$/.exec(ident.trim().toUpperCase())
  if (m) return { num: m[1].padStart(2, '0'), letter: m[2] ?? null }
  return { num: ident.trim().slice(0, 3), letter: null }
}

type Tier = 'full' | 'basic' | 'min'
export const tierFor = (lenFt: number): Tier =>
  lenFt >= 6000 ? 'full' : lenFt >= 3000 ? 'basic' : 'min'

const sym = (s0: number, s1: number, t0: number, t1: number): MarkRect[] => [
  { s0, s1, t0, t1 },
  { s0, s1, t0: -t1, t1: -t0 },
]

/** Markings for one runway end. `end` B mirrors the dash phase so both caps line up with the middle. */
export function endLayout(
  lenFt: number,
  widthFt: number,
  end: 'A' | 'B',
  ident: string,
  split: Split,
): EndLayout {
  const cap = end === 'A' ? split.capA : split.capB
  const tier = tierFor(lenFt)
  const half = widthFt / 2
  const rects: MarkRect[] = []
  // Side stripes along both edges.
  rects.push(...sym(0, cap, half - EDGE_INSET - EDGE_W, half - EDGE_INSET))

  let lineStart = 60
  if (tier !== 'min') {
    // Threshold piano keys: 5.75 ft stripes at 11.5 ft pitch, a centre gap, 150 ft long.
    const perSide = Math.max(2, Math.round(widthFt / 25))
    for (let k = 0; k < perSide; k++) {
      const t0 = 5.75 + k * 11.5
      if (t0 + 5.75 > half - 2) break
      rects.push(...sym(12, 162, t0, t0 + 5.75))
    }
    lineStart = 162 + 60
  }
  const h = Math.min(60, Math.max(30, widthFt * 0.4))
  const number = { text: parseIdent(ident).num, s: lineStart, h }
  const ltr = parseIdent(ident).letter
  const letter = ltr ? { text: ltr, s: lineStart + h * 1.6, h } : null
  const numEnd = (letter ? letter.s + h : number.s + h) + 40

  if (tier !== 'min') {
    // Aiming point block pair, ~1,000 ft in (less on shorter runways).
    const aim = tier === 'full' ? 1000 : 600
    const bw = Math.max(8, widthFt * 0.2)
    const inner = widthFt * 0.24
    if (aim + 150 <= cap) rects.push(...sym(aim, aim + 150, inner, Math.min(half - 4, inner + bw)))
    // Touchdown zone bars: 3, 2, 2, 1 per side at 500, 1500, 2000, 2500 ft.
    if (tier === 'full') {
      for (const [at, n] of [
        [500, 3],
        [1500, 2],
        [2000, 2],
        [2500, 1],
      ] as const) {
        if (at + 75 > cap) continue
        for (let k = 0; k < n; k++) {
          const t0 = inner - 4 + k * 12 - (n === 3 ? 6 : 0)
          rects.push(...sym(at, at + 75, Math.max(6, t0), Math.max(6, t0) + 7))
        }
      }
    }
  }
  // Dashed centerline, phase-locked to the middle section (see splitRunway).
  const dash = (s0: number, s1: number): void => {
    if (s0 >= numEnd && s1 <= cap) rects.push({ s0, s1, t0: -CENTER_W / 2, t1: CENTER_W / 2 })
  }
  if (end === 'A') for (let s = 0; s < cap; s += DASH_PERIOD) dash(s, s + DASH_LEN)
  else for (let e = cap; e > 0; e -= DASH_PERIOD) dash(e - DASH_LEN, e)
  return { capFt: cap, rects, number, letter }
}
