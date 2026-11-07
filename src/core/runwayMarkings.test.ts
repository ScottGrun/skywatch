import { describe, expect, it } from 'vitest'
import { DASH_PERIOD, endLayout, parseIdent, splitRunway } from './runwayMarkings'

describe('runway markings', () => {
  it('splits a long runway into caps and a dash-aligned middle', () => {
    const s = splitRunway(11901)!
    expect(s.capA).toBe(2600)
    expect(s.mid % DASH_PERIOD).toBe(0)
    expect(s.capA + s.mid + s.capB).toBeCloseTo(11901)
    expect(s.capB).toBeGreaterThanOrEqual(s.capA)
  })
  it('does not mark tiny strips', () => {
    expect(splitRunway(900)).toBeNull()
  })
  it('parses identifiers', () => {
    expect(parseIdent('16L')).toEqual({ num: '16', letter: 'L' })
    expect(parseIdent('9')).toEqual({ num: '09', letter: null })
    expect(parseIdent('H1').num).toBe('H1')
  })
  it('keeps everything inside the cap and the runway width', () => {
    const sp = splitRunway(11901)!
    for (const end of ['A', 'B'] as const) {
      const l = endLayout(11901, 150, end, '16C', sp)
      expect(l.letter?.text).toBe('C')
      for (const r of l.rects) {
        expect(r.s0).toBeGreaterThanOrEqual(0)
        expect(r.s1).toBeLessThanOrEqual(l.capFt)
        expect(Math.abs(r.t0)).toBeLessThanOrEqual(75)
        expect(Math.abs(r.t1)).toBeLessThanOrEqual(75)
      }
    }
  })
  it('omits touchdown bars on short runways', () => {
    const sp = splitRunway(4000)!
    const full = endLayout(11901, 150, 'A', '16', splitRunway(11901)!).rects.length
    expect(endLayout(4000, 75, 'A', '16', sp).rects.length).toBeLessThan(full)
  })
})
