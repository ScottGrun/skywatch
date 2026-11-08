import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../types.ts'
import { arrivalsBoard, isInboundTo } from './arrivals.ts'

const ap = { iata: 'YVR', icao: 'CYVR' }
const ac = (id: string, o: Partial<Aircraft>): Aircraft =>
  ({ id, dest: 'YVR', onGround: false, distNm: 10, ...o }) as Aircraft

describe('arrivalsBoard', () => {
  it('matches dest by IATA or ICAO, drops overflights and ground, sorts by distance', () => {
    const out = arrivalsBoard(
      [
        ac('a', { distNm: 30 }),
        ac('b', { dest: 'cyvr', distNm: 5 }),
        ac('c', { dest: 'SEA', distNm: 1 }),
        ac('d', { dest: '' }),
        ac('e', { onGround: true }),
      ],
      ap,
    )
    expect(out.map((x) => x.id)).toEqual(['b', 'a'])
  })
  it('does not match an empty IATA against an empty dest', () => {
    expect(isInboundTo(ac('x', { dest: '' }), { iata: '', icao: 'KXYZ' })).toBe(false)
  })
})
