import { describe, expect, it } from 'vitest'
import type { Airport } from '../types'
import { airportFrame } from './airportFrame'

const ap: Airport = {
  icao: 'TEST',
  iata: '',
  name: '',
  city: '',
  country: 'US',
  lat: 47,
  lon: -122,
  elevationFt: 0,
  runways: [],
}

describe('airportFrame', () => {
  it('frames the fallback layout with a sane radius', () => {
    const f = airportFrame(ap)
    expect(f.r).toBeGreaterThanOrEqual(2)
    expect(Number.isFinite(f.e) && Number.isFinite(f.n)).toBe(true)
  })
})
