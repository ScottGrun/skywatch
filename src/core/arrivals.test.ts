import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../types.ts'
import { arrivalStatus, arrivalsBoard, fmtEta } from './arrivals.ts'

const ac = (id: string, o: Partial<Aircraft>): Aircraft =>
  ({ id, category: 'ARR', onGround: false, etaMin: 5, ...o }) as Aircraft

describe('arrivalsBoard', () => {
  it('keeps airborne ARR, sorts by ETA with nulls last', () => {
    const out = arrivalsBoard([
      ac('a', { etaMin: null }),
      ac('b', { etaMin: 9 }),
      ac('c', { etaMin: 2 }),
      ac('d', { category: 'DEP' }),
      ac('e', { onGround: true }),
    ])
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('board text', () => {
  it('formats ETA', () => {
    expect(fmtEta(null)).toBe('—')
    expect(fmtEta(0.2)).toBe('<1 min')
    expect(fmtEta(4.4)).toBe('4 min')
  })
  it('maps phases', () => {
    expect(arrivalStatus('Final approach')).toBe('Final')
    expect(arrivalStatus('Approach')).toBe('Approach')
    expect(arrivalStatus('Landing')).toBe('Landing')
    expect(arrivalStatus('Descent')).toBe('Descent')
  })
})
