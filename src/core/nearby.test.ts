import { describe, expect, it } from 'vitest'
import type { Airport, Runway } from '../types'
import { nearbyAirports } from './nearby'

const rw = (ident: string, lengthFt: number, closed = false): Runway => ({
  lengthFt,
  widthFt: 100,
  le: { ident, lat: 0, lon: 0, headingDeg: 0 },
  he: { ident: '36', lat: 0, lon: 0, headingDeg: 180 },
  closed,
})
const ap = (icao: string, lat: number, runways: Runway[]): Airport => ({
  icao,
  iata: '',
  name: icao,
  city: '',
  country: 'US',
  lat,
  lon: 0,
  elevationFt: 0,
  runways,
})

describe('nearbyAirports', () => {
  const sel = ap('SEL', 0, [rw('09', 8000)])
  it('keeps near airports with drawable runways, nearest first, excluding the selected one', () => {
    const list = [
      sel,
      ap('FAR', 1, [rw('09', 5000)]), // ~110 km
      ap('B', 0.3, [rw('09', 5000), rw('H1', 5000), rw('12', 900), rw('18', 6000, true)]),
      ap('A', 0.1, [rw('09', 3000)]),
      ap('HELI', 0.2, [rw('H1', 5000)]),
      ap('WATER', 0.2, [rw('NE', 5000)]),
      ap('TINY', 0.2, [rw('09', 1200)]),
    ]
    const out = nearbyAirports(list, sel)
    expect(out.map((a) => a.icao)).toEqual(['A', 'B'])
    expect(out[1].runways).toHaveLength(1)
  })
  it('caps the count', () => {
    const list = Array.from({ length: 10 }, (_, i) => ap(`X${i}`, 0.01 * (i + 1), [rw('09', 5000)]))
    expect(nearbyAirports(list, sel, 60, 3).map((a) => a.icao)).toEqual(['X0', 'X1', 'X2'])
  })
})
