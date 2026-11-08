import { describe, expect, it } from 'vitest'
import type { Airport } from '../types.ts'
import { searchAirports } from './search.ts'

const ap = (
  icao: string,
  iata: string,
  name: string,
  city: string,
  size: Airport['size'],
): Airport => ({
  icao,
  iata,
  name,
  city,
  country: 'CA',
  lat: 0,
  lon: 0,
  elevationFt: 0,
  size,
  runways: [],
})

const list = [
  ap('CZVN', '', 'Vanderhoof Strip', 'Vanderhoof', 'small'),
  ap('KVUO', 'VUO', 'Pearson Field', 'Vancouver', 'small'),
  ap('CYVR', 'YVR', 'Vancouver International Airport', 'Vancouver', 'large'),
  ap('KVAN', 'VAN', 'Van Exact', 'Somewhere', 'small'),
  ap('KVBT', 'VBT', 'Vance Medium', 'Vancemont', 'medium'),
]

describe('searchAirports ranking', () => {
  it('lists the large airport before small ones for a city query', () => {
    const r = searchAirports(list, 'vancouver').map((a) => a.icao)
    expect(r[0]).toBe('CYVR')
    expect(r.indexOf('CYVR')).toBeLessThan(r.indexOf('KVUO'))
  })
  it('exact IATA/ICAO beats larger partial matches', () => {
    expect(searchAirports(list, 'van')[0].icao).toBe('KVAN')
    expect(searchAirports(list, 'cyvr')[0].icao).toBe('CYVR')
    expect(searchAirports(list, 'vuo')[0].icao).toBe('KVUO')
  })
  it('orders partial matches by size, medium before small', () => {
    const r = searchAirports(list, 'van').map((a) => a.icao)
    expect(r.slice(1)).toEqual(['CYVR', 'KVBT', 'CZVN', 'KVUO'])
  })
  it('is accent-insensitive and respects the limit', () => {
    expect(searchAirports(list, 'VANCOUVER', 1)).toHaveLength(1)
    expect(searchAirports(list, '  ')).toEqual([])
  })
})
