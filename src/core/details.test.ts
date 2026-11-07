import { describe, expect, it } from 'vitest'
import { mergeDetails, ownerIfDifferent, readableTypeName } from './details.ts'

const adsbdb = {
  fullType: 'Airbus A320-214',
  operator: 'Jazz Aviation LP',
  photo: 'https://www.airport-data.com/images/aircraft/1.jpg',
  photoThumb: 'https://www.airport-data.com/images/aircraft/thumbnails/1.jpg',
}
const ps = {
  thumb: 'https://t.plnspttrs.net/1/large.jpg',
  link: 'https://www.planespotters.net/photo/1/x',
  photographer: 'Jane Doe',
}

describe('details merge', () => {
  it('prefers the adsbdb photo', () => {
    const d = mergeDetails(adsbdb, ps)
    expect(d.photo?.src).toBe(adsbdb.photoThumb)
    expect(d.fullType).toBe('Airbus A320-214')
    expect(d.owner).toBe('Jazz Aviation LP')
  })
  it('falls back to planespotters with credit', () => {
    const d = mergeDetails({ fullType: 'X' }, ps)
    expect(d.photo).toEqual({
      src: ps.thumb,
      link: ps.link,
      credit: 'Jane Doe / Planespotters.net',
    })
  })
  it('hides the photo when neither has one', () => {
    expect(mergeDetails(null, null).photo).toBeNull()
  })
})

describe('names', () => {
  it('title-cases type names', () => {
    expect(readableTypeName('BOEING 737-800')).toBe('Boeing 737-800')
    expect(readableTypeName('AIRBUS A-320')).toBe('Airbus A-320')
  })
  it('shows the owner only when different from the airline', () => {
    expect(ownerIfDifferent('Air Canada', 'Air Canada')).toBe('')
    expect(ownerIfDifferent('Air Canada', 'Jazz Aviation LP')).toBe('Jazz Aviation LP')
    expect(ownerIfDifferent('', 'Jazz')).toBe('Jazz')
    expect(ownerIfDifferent('Delta Air Lines', '')).toBe('')
  })
})
