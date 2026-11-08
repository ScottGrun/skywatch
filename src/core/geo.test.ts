import { describe, expect, it } from 'vitest'
import { statesBbox, toLatLon, toLocal, wrapLon } from './geo.ts'

const NFFN = { lat: -17.755, lon: 177.443 } // Nadi, Fiji (177.4E)
const UHMA = { lat: 64.735, lon: 177.741 } // Anadyr, Russia (177.7E)

describe('wrapLon', () => {
  it('wraps into [-180, 180]', () => {
    expect(wrapLon(10)).toBe(10)
    expect(wrapLon(-179 - 177.4)).toBeCloseTo(3.6, 6)
    expect(wrapLon(-179.5 - 177.7)).toBeCloseTo(2.8, 6)
    expect(wrapLon(190)).toBe(-170)
    expect(wrapLon(540)).toBe(180)
  })
})

describe('toLocal across the antimeridian', () => {
  it('places an aircraft at -179 just east of NFFN', () => {
    const { e } = toLocal(NFFN, NFFN.lat, -179)
    expect(e).toBeGreaterThan(0)
    expect(e).toBeCloseTo(3.557 * 111.32 * Math.cos((NFFN.lat * Math.PI) / 180), 0)
  })
  it('places an aircraft at -179 just east of Anadyr, and 177 west of it', () => {
    const east = toLocal(UHMA, UHMA.lat, -179)
    expect(east.e).toBeGreaterThan(0)
    expect(east.e).toBeLessThan(160)
    expect(toLocal(UHMA, UHMA.lat, 177).e).toBeLessThan(0)
  })
  it('round-trips through toLatLon with a wrapped longitude', () => {
    const l = toLocal(UHMA, 64.9, -179)
    const back = toLatLon(UHMA, l.e, l.n)
    expect(back.lon).toBeCloseTo(-179, 6)
    expect(back.lat).toBeCloseTo(64.9, 6)
  })
  it('writes into a provided output object', () => {
    const out = { e: 0, n: 0 }
    expect(toLocal(NFFN, NFFN.lat, -179, out)).toBe(out)
    expect(out.e).toBeGreaterThan(0)
  })
})

describe('statesBbox', () => {
  it('snaps outward to 0.5 degrees', () => {
    expect(statesBbox({ lat: 49.19, lon: -123.18 }, 1.5, 2)).toEqual({
      lamin: 47.5,
      lomin: -125.5,
      lamax: 51,
      lomax: -121,
    })
  })
  it('clamps to +-180 near the antimeridian', () => {
    const b = statesBbox(UHMA, 1.5, 2)
    expect(b.lomax).toBe(180)
    expect(b.lomin).toBe(175.5)
    expect(statesBbox({ lat: 0, lon: -179.5 }, 1.5, 2).lomin).toBe(-180)
  })
})
