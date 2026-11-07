import { describe, expect, it, vi } from 'vitest'
import { createAirspaceClient, mapFaa, mapOaipLimit, mapOpenAip } from './airspace.ts'

const ring = [
  [-123.2, 49.1],
  [-123.1, 49.1],
  [-123.1, 49.2],
  [-123.2, 49.1],
]
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 })

const oaip = {
  items: [
    {
      _id: 'a1',
      name: 'VANCOUVER CTR',
      type: 4,
      icaoClass: 3,
      lowerLimit: { value: 0, unit: 1, referenceDatum: 0 },
      upperLimit: { value: 3000, unit: 1, referenceDatum: 1 },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
    {
      _id: 'a2',
      name: 'VANCOUVER TMA',
      type: 7,
      icaoClass: 4,
      lowerLimit: { value: 1200, unit: 0, referenceDatum: 0 },
      upperLimit: { value: 180, unit: 6, referenceDatum: 2 },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
    {
      _id: 'f',
      name: 'FIR',
      type: 10,
      icaoClass: 4,
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
  ],
}

describe('openAIP mapping', () => {
  it('maps unit and datum codes', () => {
    expect(mapOaipLimit({ value: 0, unit: 1, referenceDatum: 0 })).toEqual({
      value: 0,
      unit: 'FT',
      ref: 'SFC',
    })
    expect(mapOaipLimit({ value: 500, unit: 1, referenceDatum: 0 })?.ref).toBe('AGL')
    expect(mapOaipLimit({ value: 65, unit: 6, referenceDatum: 2 })).toEqual({
      value: 65,
      unit: 'FL',
      ref: 'STD',
    })
    expect(mapOaipLimit({ value: 900, unit: 0, referenceDatum: 1 })).toEqual({
      value: 900,
      unit: 'M',
      ref: 'MSL',
    })
    expect(mapOaipLimit({ value: 1, unit: 9, referenceDatum: 1 })).toBeNull()
  })
  it('maps class/type and drops uninteresting airspaces', () => {
    const out = mapOpenAip(oaip)
    expect(out.map((a) => [a.id, a.class, a.type])).toEqual([
      ['a1', 'D', 'CTR'],
      ['a2', 'TMA', 'TMA'],
    ])
    expect(out[0].polygon[0]).toEqual([-123.2, 49.1])
    expect(out[1].lower).toEqual({ value: 1200, unit: 'M', ref: 'AGL' })
  })
})

describe('FAA mapping', () => {
  const feat = (over: Record<string, unknown>, geometry: unknown) => ({
    type: 'Feature',
    id: 7,
    geometry,
    properties: {
      NAME: 'SEATTLE CLASS B',
      CLASS: 'B',
      UPPER_VAL: 10000,
      UPPER_UOM: 'FT',
      UPPER_CODE: 'MSL',
      LOWER_VAL: 0,
      LOWER_UOM: 'FT',
      LOWER_CODE: 'SFC',
      ...over,
    },
  })
  it('maps limits, splits multipolygons, skips E and unbounded', () => {
    const out = mapFaa({
      features: [
        feat({}, { type: 'MultiPolygon', coordinates: [[ring], [ring]] }),
        feat({ CLASS: 'E' }, { type: 'Polygon', coordinates: [ring] }),
        feat({ UPPER_VAL: -9998 }, { type: 'Polygon', coordinates: [ring] }),
      ],
    })
    expect(out.map((a) => a.id)).toEqual(['faa-7', 'faa-7#1'])
    expect(out[0]).toMatchObject({
      class: 'B',
      lower: { value: 0, ref: 'SFC' },
      upper: { value: 10000, ref: 'MSL' },
    })
  })
})

describe('client', () => {
  it('uses openAIP with the key header and caches', async () => {
    const f = vi.fn(async () => ok(oaip))
    const c = createAirspaceClient({ fetch: f, apiKey: 'k', now: () => 0 })
    const a = await c.get(49.194, -123.184, 40)
    expect(a.source).toBe('openaip')
    expect(a.airspaces).toHaveLength(2)
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(url).toContain('pos=49.2,-123.2&dist=74080')
    expect(init.headers['x-openaip-api-key']).toBe('k')
    await c.get(49.19, -123.19, 40)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('falls back to FAA in the US without a key', async () => {
    const f = vi.fn(async () =>
      ok({
        features: [
          {
            id: 1,
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: {
              NAME: 'X',
              CLASS: 'C',
              UPPER_VAL: 4000,
              UPPER_UOM: 'FT',
              UPPER_CODE: 'MSL',
              LOWER_VAL: 0,
              LOWER_CODE: 'SFC',
            },
          },
        ],
      }),
    )
    const r = await createAirspaceClient({ fetch: f }).get(47.45, -122.31, 40)
    expect(r.source).toBe('faa')
    expect(r.attribution).toBe('Airspace: FAA')
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('services6.arcgis.com')
  })
  it('falls back to FAA when openAIP fails', async () => {
    const f = vi.fn(async (u: unknown) =>
      String(u).includes('openaip') ? new Response('', { status: 500 }) : ok({ features: [] }),
    )
    const r = await createAirspaceClient({ fetch: f, apiKey: 'k' }).get(47.45, -122.31, 40)
    expect(r.source).toBe('faa')
  })
  it('reports needs_key outside the US with no key, without calling upstream', async () => {
    const f = vi.fn(async () => ok({}))
    const r = await createAirspaceClient({ fetch: f }).get(49.19, -123.18, 40)
    expect(r).toMatchObject({ airspaces: [], reason: 'needs_key' })
    expect(f).not.toHaveBeenCalled()
  })
})
