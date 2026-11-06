import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../types.ts'
import {
  ALL_TYPES,
  DEFAULT_FILTER,
  buildPredicate,
  deserializeFilter,
  filterFromParams,
  filterToParams,
  loadFilter,
  serializeFilter,
  toggleIn,
} from './filter.ts'

const ac = (o: Partial<Aircraft>) =>
  ({ aircraftClass: 'narrow', category: 'ARR', onGround: false, ...o }) as Aircraft

describe('filter', () => {
  it('default has no predicate', () => expect(buildPredicate(DEFAULT_FILTER)).toBeNull())

  it('filters by type, category and ground', () => {
    const p = buildPredicate({ types: ['wide'], cats: ['DEP'], ground: false })!
    expect(p(ac({ aircraftClass: 'wide', category: 'DEP' }))).toBe(true)
    expect(p(ac({ aircraftClass: 'wide', category: 'ARR' }))).toBe(false)
    expect(p(ac({ aircraftClass: 'heli', category: 'DEP' }))).toBe(false)
    expect(p(ac({ aircraftClass: 'wide', category: 'DEP', onGround: true }))).toBe(false)
  })

  it('ground only', () => {
    const p = buildPredicate({ types: [], cats: [], ground: false })!
    expect(p(ac({ onGround: true }))).toBe(false)
    expect(p(ac({}))).toBe(true)
  })

  it('toggleIn', () => {
    expect(toggleIn([], ALL_TYPES, 'wide')).toHaveLength(8)
    expect(toggleIn(['wide'], ALL_TYPES, 'quad')).toEqual(['wide', 'quad'])
    expect(toggleIn(['wide'], ALL_TYPES, 'wide')).toEqual([])
    expect(
      toggleIn(
        ALL_TYPES.filter((t) => t !== 'heli'),
        ALL_TYPES,
        'heli',
      ),
    ).toEqual([])
  })

  it('url round trip', () => {
    const f = { types: ['wide' as const, 'quad' as const], cats: ['ARR' as const], ground: false }
    const p = new URLSearchParams('apt=CYVR')
    filterToParams(f, p)
    expect(p.get('types')).toBe('wide,quad')
    expect(p.get('apt')).toBe('CYVR')
    expect(filterFromParams(p)).toEqual(f)
    filterToParams(DEFAULT_FILTER, p)
    expect(p.toString()).toBe('apt=CYVR')
  })

  it('parses loosely and ignores junk', () => {
    expect(filterFromParams(new URLSearchParams('types=WIDE,bogus&cat=arr'))).toEqual({
      types: ['wide'],
      cats: ['ARR'],
      ground: true,
    })
    expect(filterFromParams(new URLSearchParams('apt=X'))).toBeNull()
  })

  it('storage round trip and precedence', () => {
    const f = { types: ['heli' as const], cats: [], ground: true }
    expect(deserializeFilter(serializeFilter(f))).toEqual(f)
    expect(deserializeFilter('{nope')).toBeNull()
    expect(loadFilter('?types=quad', serializeFilter(f)).types).toEqual(['quad'])
    expect(loadFilter('', serializeFilter(f))).toEqual(f)
    expect(loadFilter('', null)).toEqual(DEFAULT_FILTER)
  })
})
