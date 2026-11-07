import { describe, expect, it } from 'vitest'
import type { Airport, Runway } from '../types'
import { airportLights, runwayLights } from './lightLayout'

const O = { lat: 40, lon: -100 }
// North-south runway of `ft` feet starting at O (le = south end, landing north).
function rw(ft: number, widthFt = 150, closed = false): Runway {
  const dLat = (ft * 0.0003048) / 110.574
  return {
    lengthFt: ft,
    widthFt,
    closed,
    le: { ident: '36', lat: O.lat, lon: O.lon, headingDeg: 0 },
    he: { ident: '18', lat: O.lat + dLat, lon: O.lon, headingDeg: 180 },
  }
}
const kind = (l: ReturnType<typeof runwayLights>, k: string) => l.filter((x) => x.kind === k)

describe('runwayLights', () => {
  it('closed runway has no lights', () => {
    expect(runwayLights(rw(8000, 150, true), O, 0, 0.11)).toEqual([])
  })
  it('short runway gets edge lights only', () => {
    const l = runwayLights(rw(2500, 60), O, 0, 0.11)
    expect(l.length).toBeGreaterThan(0)
    expect(new Set(l.map((x) => x.kind))).toEqual(new Set(['edge']))
  })
  it('edge lights every 200 ft on both sides, yellow in the last 2000 ft', () => {
    const l = kind(runwayLights(rw(10000), O, 0, 0.11), 'edge')
    expect(l).toHaveLength(2 * 51)
    expect(l.filter((x) => x.color === 'yellow')).toHaveLength(2 * 2 * 10)
    expect(l.filter((x) => x.color === 'white')).toHaveLength(2 * 31)
  })
  it('centerline: 50 ft pitch, red inside the last 1000 ft, white mid-runway; none when small', () => {
    const c = kind(runwayLights(rw(10000), O, 0, 0.11), 'center')
    expect(c).toHaveLength(199)
    const near = c.filter((x) => x.n < 1000 * 0.0003048)
    expect(near.every((x) => x.color === 'red')).toBe(true)
    const mid = c.filter((x) => Math.abs(x.n - 1.5) < 0.01)
    expect(mid.every((x) => x.color === 'white')).toBe(true)
    expect(kind(runwayLights(rw(5000, 75), O, 0, 0.11), 'center')).toHaveLength(0)
  })
  it('threshold green outside the runway, end red inside', () => {
    const l = runwayLights(rw(8000), O, 0, 0.11)
    const th = kind(l, 'threshold').filter((x) => x.n < 0)
    expect(th.length).toBeGreaterThan(10)
    expect(th.every((x) => x.color === 'green')).toBe(true)
    expect(kind(l, 'end').every((x) => x.color === 'red')).toBe(true)
  })
  it('ALSF-2 for 8000+ ft with a 22-light rabbit per end, MALSR for shorter', () => {
    const long = runwayLights(rw(9000), O, 4, 0.11)
    const rab = kind(long, 'rabbit')
    expect(rab).toHaveLength(44)
    expect(new Set(rab.map((r) => r.group))).toEqual(new Set([4, 5]))
    expect(Math.min(...kind(long, 'approach').map((x) => x.n))).toBeCloseTo(-2400 * 0.0003048, 2)
    const mid = runwayLights(rw(5000, 100), O, 0, 0.11)
    expect(kind(mid, 'rabbit')).toHaveLength(6)
    expect(Math.min(...kind(mid, 'approach').map((x) => x.n))).toBeCloseTo(-1400 * 0.0003048, 2)
  })
  it('PAPI: 4 per end on the left of the landing direction', () => {
    const l = kind(runwayLights(rw(9000), O, 0, 0.11), 'papi')
    expect(l).toHaveLength(8)
    const north = l.filter((x) => Math.abs(x.hdg ?? 99) < 1) // landing north: left is west
    expect(north).toHaveLength(4)
    expect(north.every((x) => x.e < 0)).toBe(true)
    expect(north.map((x) => x.idx)).toEqual([0, 1, 2, 3])
    const south = l.filter((x) => Math.abs(Math.abs(x.hdg ?? 0) - 180) < 1)
    expect(south).toHaveLength(4)
    expect(south.every((x) => x.e > 0)).toBe(true)
  })
  it('airportLights aggregates and tolerates no runways', () => {
    const ap = { ...O, runways: [rw(9000), rw(2000)] } as unknown as Airport
    expect(airportLights(ap, 0.11).length).toBeGreaterThan(300)
    expect(airportLights({ ...O, runways: [] } as unknown as Airport, 0.11)).toEqual([])
  })
})
