import { describe, expect, it, vi } from 'vitest'
import { createAirspaceClient, mapFaa } from './airspace.ts'

const ring = [
  [-123.2, 49.1],
  [-123.1, 49.1],
  [-123.1, 49.2],
  [-123.2, 49.1],
]
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 })

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
  it('uses FAA for US airports and caches', async () => {
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
    const c = createAirspaceClient({ fetch: f, now: () => 0 })
    const r = await c.get(47.45, -122.31, 40)
    await c.get(47.451, -122.311, 40)
    expect(f).toHaveBeenCalledTimes(1)
    expect(r.source).toBe('faa')
    expect(r.attribution).toBe('Airspace: FAA')
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('services6.arcgis.com')
  })
  it('reports outside_us without calling upstream', async () => {
    const f = vi.fn(async () => ok({}))
    const r = await createAirspaceClient({ fetch: f }).get(49.19, -123.18, 40)
    expect(r).toMatchObject({ airspaces: [], reason: 'outside_us' })
    expect(f).not.toHaveBeenCalled()
  })
})
