import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../types.ts'
import { stabilizeRows } from './stableRows.ts'

const ac = (id: string, o: Partial<Aircraft> = {}): Aircraft => ({
  id,
  callsign: id.toUpperCase(),
  lat: 49,
  lon: -123,
  e: 0,
  n: 0,
  altFt: 3000,
  gsKt: 200,
  trackDeg: 90,
  vsFpm: 0,
  onGround: false,
  distNm: 5,
  category: 'ARR',
  phase: 'Approach',
  typeCode: 'A320',
  aircraftClass: 'narrow',
  airline: '',
  origin: '',
  dest: '',
  etaMin: null,
  lastSeenMs: 0,
  ...o,
})

describe('stabilizeRows', () => {
  it('returns the previous array when only invisible values moved', () => {
    const prev = [ac('a'), ac('b')]
    const next = [ac('a', { lat: 49.0001, e: 0.01, altFt: 3000.2 }), ac('b')]
    expect(stabilizeRows(prev, next)).toBe(prev)
  })
  it('returns a new array reusing unchanged rows when one changes', () => {
    const prev = [ac('a'), ac('b')]
    const out = stabilizeRows(prev, [ac('a'), ac('b', { altFt: 3100 })])
    expect(out).not.toBe(prev)
    expect(out[0]).toBe(prev[0])
    expect(out[1]).not.toBe(prev[1])
    expect(out[1].altFt).toBe(3100)
  })
  it('detects added, removed and reordered rows', () => {
    const prev = [ac('a'), ac('b')]
    expect(stabilizeRows(prev, [ac('a')])).toHaveLength(1)
    expect(stabilizeRows(prev, [ac('a'), ac('b'), ac('c')])).toHaveLength(3)
    const swapped = stabilizeRows(prev, [ac('b'), ac('a')])
    expect(swapped).not.toBe(prev)
    expect(swapped.map((x) => x.id)).toEqual(['b', 'a'])
  })
  it('picks up route changes', () => {
    const prev = [ac('a')]
    expect(stabilizeRows(prev, [ac('a', { dest: 'CYVR' })])[0].dest).toBe('CYVR')
  })
})
