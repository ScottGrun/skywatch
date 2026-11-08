import { describe, expect, it } from 'vitest'
import type { Aircraft, Runway } from '../types.ts'
import { approachRunway } from './approach.ts'
import { buildArrivals, LANDED_KEEP_MS } from './arrivals.ts'

// 16R-like runway: threshold at (47.46, -122.308), landing heading 180 (south). Approach is to the north.
const rw: Runway = {
  lengthFt: 11900,
  widthFt: 150,
  le: { ident: '16R', lat: 47.46, lon: -122.308, headingDeg: 180 },
  he: { ident: '34L', lat: 47.428, lon: -122.308, headingDeg: 0 },
}
const ap = { iata: 'SEA', icao: 'KSEA', elevationFt: 400, runways: [rw] }
const NM = 1 / 60 // degrees latitude per NM
const ac = (o: Partial<Aircraft>): Aircraft =>
  ({
    id: 'x',
    dest: '',
    onGround: false,
    distNm: 5,
    lat: 47.46 + 5 * NM,
    lon: -122.308,
    altFt: 400 + 1500,
    trackDeg: 180,
    gsKt: 140,
    vsFpm: -700,
    ...o,
  }) as Aircraft

describe('approachRunway', () => {
  it('detects an aligned, descending aircraft 5 NM out', () => {
    expect(approachRunway(ac({}), ap)).toBe('16R')
  })
  it('accepts a small lateral offset but not a large one', () => {
    expect(approachRunway(ac({ lon: -122.308 + 0.01 }), ap)).toBe('16R') // ~0.4 NM
    expect(approachRunway(ac({ lon: -122.308 + 0.06 }), ap)).toBeNull() // ~2.4 NM
  })
  it('rejects wrong track, too far, too high, level, and ground', () => {
    expect(approachRunway(ac({ trackDeg: 215 }), ap)).toBeNull()
    expect(approachRunway(ac({ lat: 47.46 + 20 * NM }), ap)).toBeNull()
    expect(approachRunway(ac({ altFt: 400 + 6000 }), ap)).toBeNull()
    expect(approachRunway(ac({ vsFpm: 0 }), ap)).toBeNull()
    expect(approachRunway(ac({ onGround: true }), ap)).toBeNull()
  })
  it('rejects an overflight on the far side of the threshold heading away', () => {
    expect(approachRunway(ac({ lat: 47.46 - 3 * NM }), ap)).toBeNull()
  })
  it('accepts level flight when very low, and the reciprocal end', () => {
    expect(approachRunway(ac({ vsFpm: 0, altFt: 400 + 300 }), ap)).toBe('16R')
    expect(approachRunway(ac({ lat: 47.428 - 4 * NM, trackDeg: 2 }), ap)).toBe('34L')
  })
  it('ignores closed runways and slow aircraft', () => {
    expect(approachRunway(ac({}), { ...ap, runways: [{ ...rw, closed: true }] })).toBeNull()
    expect(approachRunway(ac({ gsKt: 20 }), ap)).toBeNull()
  })
})

describe('buildArrivals', () => {
  it('combines route matches and observed finals, nearest first, without duplicates', () => {
    const { rows } = buildArrivals(
      [
        ac({ id: 'a', dest: 'SEA', distNm: 9 }),
        ac({ id: 'b', distNm: 4 }),
        ac({ id: 'c', distNm: 2, lat: 47.6, trackDeg: 90 }), // overflight, no evidence
        ac({ id: 'd', dest: 'KSEA', distNm: 1, trackDeg: 90 }),
      ],
      ap,
      new Map(),
      0,
    )
    expect(rows.map((r) => [r.a.id, r.kind])).toEqual([
      ['d', 'route'],
      ['b', 'final'],
      ['a', 'route'],
    ])
    expect(rows.find((r) => r.a.id === 'b')?.runway).toBe('16R')
  })
  it('keeps a previously inbound aircraft as Landed for a few minutes', () => {
    const first = buildArrivals([ac({ id: 'b' })], ap, new Map(), 1000)
    const down = ac({ id: 'b', onGround: true, distNm: 1, altFt: 0 })
    const soon = buildArrivals([down], ap, first.memory, 1000 + 60_000)
    expect(soon.rows.map((r) => r.kind)).toEqual(['landed'])
    const late = buildArrivals([down], ap, soon.memory, 1000 + LANDED_KEEP_MS + 1)
    expect(late.rows).toEqual([])
  })
  it('does not list ground aircraft that were never inbound, or landed ones far away', () => {
    const g = ac({ id: 'g', onGround: true, distNm: 1, dest: 'SEA' })
    expect(buildArrivals([g], ap, new Map(), 0).rows).toEqual([])
    const m = new Map([['g', 0]])
    expect(buildArrivals([{ ...g, distNm: 30 }], ap, m, 0).rows).toEqual([])
  })
})
