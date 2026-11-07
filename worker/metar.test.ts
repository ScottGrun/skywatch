import { describe, expect, it, vi } from 'vitest'
import { createMetarClient, mapMetar } from './metar.ts'

const fixture = {
  rawOb: 'METAR CYVR 061800Z 27012G20KT 10SM FEW015 OVC040 BKN025 14/08 A2992',
  obsTime: 1762451400,
  wdir: 270,
  wspd: 12,
  wgst: 20,
  visib: '10+',
  temp: 14,
  dewp: 8,
  altim: 1013.2,
  fltCat: 'VFR',
  cover: 'BKN',
  clouds: [
    { cover: 'FEW', base: 1500 },
    { cover: 'OVC', base: 4000 },
    { cover: 'BKN', base: 2500 },
  ],
}

describe('METAR mapping', () => {
  it('maps fields, layers and lowest ceiling', () => {
    const m = mapMetar('CYVR', fixture)
    expect(m).toMatchObject({
      windDir: 270,
      windKt: 12,
      gustKt: 20,
      visSm: 10,
      ceilingFt: 2500,
      tempC: 14,
      altimHpa: 1013.2,
      flightCat: 'VFR',
    })
    expect((m as { clouds: unknown[] }).clouds).toHaveLength(3)
  })
  it('VRB wind gives null dir; empty gives raw null', () => {
    expect(mapMetar('X', { ...fixture, wdir: 'VRB' })).toMatchObject({ windDir: null })
    expect(mapMetar('X', undefined)).toEqual({ icao: 'X', raw: null })
  })
  it('caches for 5 minutes', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([fixture]), { status: 200 }))
    let t = 0
    const c = createMetarClient({ fetch: f, now: () => t })
    await c.get('CYVR')
    await c.get('CYVR')
    expect(f).toHaveBeenCalledTimes(1)
    t = 301_000
    await c.get('CYVR')
    expect(f).toHaveBeenCalledTimes(2)
  })
})
