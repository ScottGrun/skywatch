import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvRecords } from './csv.ts'
import { bearingDeg, distanceNm, toLatLon, toLocal } from './geo.ts'
import { hexCss, rampHex } from './ramp.ts'
import { classify, etaMinutes, phase } from './classify.ts'
import { Track, project, type Report } from './deadReckon.ts'
import { airlineFromCallsign } from './airlines.ts'
import { aircraftClassFor, classFromCategory, resolveClass } from './aircraftClass.ts'
import { searchAirports } from './search.ts'
import type { Airport } from '../types.ts'

describe('csv', () => {
  it('handles quotes, escapes, CRLF and embedded newlines', () => {
    const t = 'a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line1\nline2",\r\n'
    expect(parseCsv(t)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', 'line1\nline2', ''],
    ])
    expect(parseCsvRecords(t)[0]).toEqual({ a: '1', b: 'x, y', c: 'say "hi"' })
  })
  it('handles no trailing newline and BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('geo', () => {
  const ap = { lat: 49.19, lon: -123.18 }
  it('round-trips local coordinates', () => {
    const l = toLocal(ap, 49.5, -122.5)
    const b = toLatLon(ap, l.e, l.n)
    expect(b.lat).toBeCloseTo(49.5, 6)
    expect(b.lon).toBeCloseTo(-122.5, 6)
    expect(l.n).toBeGreaterThan(0)
    expect(l.e).toBeGreaterThan(0)
  })
  it('computes distance and bearing', () => {
    expect(distanceNm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(60, 0)
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0)
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90)
  })
})

describe('ramp', () => {
  it('matches stops and blends', () => {
    expect(hexCss(rampHex(0))).toBe('#ffb020')
    expect(hexCss(rampHex(12000))).toBe('#2ff0c0')
    expect(hexCss(rampHex(60000))).toBe('#ff5ad8')
    expect(rampHex(2500)).not.toBe(rampHex(0))
  })
})

describe('classify', () => {
  const ap = { icao: 'CYVR', iata: 'YVR' }
  const base = {
    e: 0,
    n: 40,
    distNm: 21.6,
    altFt: 6000,
    gsKt: 200,
    trackDeg: 180,
    vsFpm: -1000,
    onGround: false,
  }
  it('ARR when descending toward the airport', () => {
    expect(classify(base, ap)).toBe('ARR')
  })
  it('DEP when climbing away', () => {
    expect(classify({ ...base, trackDeg: 0, vsFpm: 1500 }, ap)).toBe('DEP')
  })
  it('OVR otherwise', () => {
    expect(classify({ ...base, altFt: 36000, vsFpm: 0, trackDeg: 90, distNm: 30 }, ap)).toBe('OVR')
  })
  it('route codes override', () => {
    expect(classify({ ...base, altFt: 36000, vsFpm: 0, dest: 'YVR' }, ap)).toBe('ARR')
    expect(classify({ ...base, altFt: 36000, vsFpm: 0, origin: 'CYVR' }, ap)).toBe('DEP')
  })
  it('phases use design thresholds', () => {
    const i = { altFt: 3000, distNm: 8, onGround: false, gsKt: 150, vsFpm: -700 }
    expect(phase('ARR', i)).toBe('Final approach')
    expect(phase('ARR', { ...i, altFt: 8000 })).toBe('Approach')
    expect(phase('ARR', { ...i, altFt: 20000 })).toBe('Descent')
    expect(phase('ARR', { ...i, altFt: 50 })).toBe('Landing')
    expect(phase('DEP', { ...i, altFt: 5000 })).toBe('Initial climb')
    expect(phase('DEP', { ...i, altFt: 15000 })).toBe('Climb')
    expect(phase('OVR', { ...i, altFt: 36000, vsFpm: 0 })).toBe('Cruise')
    expect(phase('DEP', { ...i, onGround: true, gsKt: 5 })).toBe('Taxi')
    expect(phase('DEP', { ...i, onGround: true, gsKt: 90 })).toBe('Takeoff roll')
  })
  it('eta', () => {
    expect(etaMinutes('ARR', base)).toBeCloseTo((21.6 / 200) * 60)
    expect(etaMinutes('ARR', { ...base, onGround: true })).toBeNull()
  })
})

describe('deadReckon', () => {
  const r: Report = {
    lat: 49,
    lon: -123,
    altFt: 1000,
    gsKt: 360,
    trackDeg: 0,
    vsFpm: 600,
    onGround: false,
    t: 0,
  }
  it('projects along track', () => {
    const p = project(r, 10_000)
    expect(p.lat).toBeCloseTo(49 + 1 / 60, 5) // 360 kt * 10 s = 1 NM
    expect(p.lon).toBeCloseTo(-123, 6)
    expect(p.altFt).toBeCloseTo(1100)
  })
  it('does not jump on a new report and converges afterwards', () => {
    const t = new Track(r)
    const before = t.at(5000)
    t.update({ ...r, lat: 49.01, t: 5000 })
    const after = t.at(5000)
    expect(after.lat).toBeCloseTo(before.lat, 9)
    const later = t.at(5000 + 20_000)
    const target = project({ ...r, lat: 49.01, t: 5000 }, 25_000)
    expect(Math.abs(later.lat - target.lat)).toBeLessThan(1e-4)
  })
})

describe('lookups', () => {
  it('airlines', () => {
    expect(airlineFromCallsign('ACA123')).toBe('Air Canada')
    expect(airlineFromCallsign('N123AB')).toBe('')
    expect(airlineFromCallsign('')).toBe('')
  })
  it('aircraft class', () => {
    expect(aircraftClassFor('A388')).toBe('quad')
    expect(aircraftClassFor('B789')).toBe('wide')
    expect(aircraftClassFor('E190')).toBe('regional')
    expect(aircraftClassFor('DH8D')).toBe('turboprop')
    expect(aircraftClassFor('AT76')).toBe('turboprop')
    expect(aircraftClassFor('PC12')).toBe('turboprop')
    expect(aircraftClassFor('A320')).toBe('narrow')
    expect(aircraftClassFor('A21N')).toBe('narrow')
    expect(aircraftClassFor('B38M')).toBe('narrow')
    expect(aircraftClassFor('C172')).toBe('piston')
    expect(aircraftClassFor('SR22')).toBe('piston')
    expect(aircraftClassFor('BE58')).toBe('piston')
    expect(aircraftClassFor('PA28')).toBe('piston')
    expect(aircraftClassFor('C25B')).toBe('bizjet')
    expect(aircraftClassFor('GLF5')).toBe('bizjet')
    expect(aircraftClassFor('CL35')).toBe('bizjet')
    expect(aircraftClassFor('FA7X')).toBe('bizjet')
    expect(aircraftClassFor('CRJ9')).toBe('regional')
    expect(aircraftClassFor('E75L')).toBe('regional')
    expect(aircraftClassFor('EC35')).toBe('heli')
    expect(aircraftClassFor('B407')).toBe('heli')
    expect(aircraftClassFor('R44')).toBe('heli')
    expect(aircraftClassFor('A139')).toBe('heli')
    expect(aircraftClassFor('')).toBe('unknown')
    expect(aircraftClassFor('ZZZZ')).toBe('unknown')
    expect(aircraftClassFor('E55P')).toBe('bizjet')
    expect(aircraftClassFor('H25B')).toBe('bizjet')
  })
  it('class from emitter category, type wins', () => {
    expect(classFromCategory(8)).toBe('heli')
    expect(classFromCategory(6)).toBe('wide')
    expect(classFromCategory(2)).toBe('piston')
    expect(classFromCategory(3)).toBe('bizjet')
    expect(classFromCategory(4)).toBe('narrow')
    expect(classFromCategory(0)).toBe('unknown')
    expect(classFromCategory(undefined)).toBe('unknown')
    expect(resolveClass('', 8)).toBe('heli')
    expect(resolveClass('A320', 8)).toBe('narrow')
    expect(resolveClass('ZZZZ', 6)).toBe('wide')
  })
})

describe('search', () => {
  const mk = (icao: string, iata: string, name: string, city: string): Airport => ({
    icao,
    iata,
    name,
    city,
    country: 'XX',
    lat: 0,
    lon: 0,
    elevationFt: 0,
    runways: [],
  })
  const list = [
    mk('CYVR', 'YVR', 'Vancouver International', 'Vancouver'),
    mk('KVNY', 'VNY', 'Van Nuys', 'Van Nuys'),
    mk('LSZH', 'ZRH', 'Zürich', 'Zürich'),
    mk('EGLL', 'LHR', 'London Heathrow', 'London'),
    mk('KORD', 'ORD', 'Chicago OHare', 'Chicago'),
  ]
  it('ranks exact, prefix, city prefix, contains', () => {
    expect(searchAirports(list, 'yvr')[0].icao).toBe('CYVR')
    expect(searchAirports(list, 'van').map((a) => a.icao)).toEqual(['CYVR', 'KVNY'])
    expect(searchAirports(list, 'heath')[0].icao).toBe('EGLL')
  })
  it('is accent-insensitive and limited', () => {
    expect(searchAirports(list, 'zurich')[0].icao).toBe('LSZH')
    expect(searchAirports(list, 'o', 2)).toHaveLength(2)
    expect(searchAirports(list, '')).toEqual([])
  })
})

describe('ADS-B emitter category strings', () => {
  it('maps A/B categories to classes', () => {
    expect(classFromCategory('A7')).toBe('heli')
    expect(classFromCategory('A5')).toBe('wide')
    expect(classFromCategory('A3')).toBe('narrow')
    expect(classFromCategory('A1')).toBe('piston')
    expect(classFromCategory('B1')).toBe('piston')
    expect(classFromCategory('C1')).toBe('unknown')
    expect(classFromCategory(8)).toBe('heli')
  })
})
