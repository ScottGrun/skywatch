import { describe, expect, it } from 'vitest'
import { plausibleRoute } from './routeCheck.ts'

const SEA = { lat: 47.45, lon: -122.31 }
const BLI = { lat: 48.79, lon: -122.54 }
const SFO = { lat: 37.62, lon: -122.38 }
const LAX = { lat: 33.94, lon: -118.41 }
const nearSea = { lat: 47.7, lon: -122.35 }

describe('plausibleRoute', () => {
  it('rejects a stale route far from the aircraft', () => {
    expect(plausibleRoute(nearSea, SFO, LAX)).toBe(false)
  })
  it('accepts a route the aircraft is flying', () => {
    expect(plausibleRoute(nearSea, SEA, BLI)).toBe(true)
    expect(plausibleRoute({ lat: 40, lon: -121 }, SEA, SFO)).toBe(true)
  })
  it('passes when an endpoint is unknown', () => {
    expect(plausibleRoute(nearSea, undefined, LAX)).toBe(true)
  })
})
