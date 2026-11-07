import { TtlCache } from './ttlCache.ts'
import type { FetchFn } from './opensky.ts'

export const FAA_URL =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query'

export interface Limit {
  value: number
  unit: 'FT' | 'FL' | 'M'
  ref: 'MSL' | 'AGL' | 'SFC' | 'STD'
}
export interface Airspace {
  id: string
  name: string
  /** ICAO class letter A-D, else a type code (CTR, TMA, CTA, ATZ, R, DNG, P, ...). */
  class: string
  type: string
  lower: Limit
  upper: Limit
  /** Outer ring, [lon, lat]. */
  polygon: [number, number][]
}
export interface AirspaceBody {
  source: 'faa' | 'none'
  attribution: string
  /** Set when `airspaces` is empty because data is unavailable (not merely nothing nearby). */
  reason?: 'outside_us' | 'upstream_error'
  airspaces: Airspace[]
}

const DAY = 24 * 3600 * 1000
const MAX_RESULTS = 120
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const r4 = (v: number) => Math.round(v * 1e4) / 1e4

type Ring = [number, number][]
/** Outer rings of a GeoJSON Polygon/MultiPolygon (holes dropped), coordinates rounded. */
export function outerRings(g: unknown): Ring[] {
  const geo = g as { type?: string; coordinates?: unknown } | null
  if (!geo || !Array.isArray(geo.coordinates)) return []
  const polys = (geo.type === 'MultiPolygon' ? geo.coordinates : [geo.coordinates]) as unknown[][]
  const out: Ring[] = []
  for (const p of polys) {
    const ring = Array.isArray(p) ? (p[0] as unknown) : null
    if (!Array.isArray(ring)) continue
    const pts = ring
      .filter((c): c is number[] => Array.isArray(c) && num(c[0]) && num(c[1]))
      .map((c) => [r4(c[0]), r4(c[1])] as [number, number])
    if (pts.length >= 4) out.push(pts)
  }
  return out
}

const FAA_FIELDS =
  'NAME,CLASS,LOCAL_TYPE,UPPER_VAL,UPPER_UOM,UPPER_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,IDENT'

function faaLimit(v: unknown, uom: unknown, code: unknown): Limit | null {
  if (!num(v) || v < 0) return null // -9998 = "no limit"
  const ref = code === 'SFC' || code === 'AGL' || code === 'MSL' || code === 'STD' ? code : 'MSL'
  return { value: v, unit: uom === 'M' ? 'M' : 'FT', ref }
}

export function mapFaa(raw: unknown): Airspace[] {
  const feats = ((raw ?? {}) as { features?: unknown }).features
  const out: Airspace[] = []
  for (const [fi, f] of (Array.isArray(feats)
    ? (feats as Record<string, unknown>[])
    : []
  ).entries()) {
    const p = (f.properties ?? {}) as Record<string, unknown>
    const cls = String(p.CLASS ?? '')
    if (!['A', 'B', 'C', 'D'].includes(cls)) continue
    const lower = faaLimit(p.LOWER_VAL, p.LOWER_UOM, p.LOWER_CODE)
    const upper = faaLimit(p.UPPER_VAL, p.UPPER_UOM, p.UPPER_CODE)
    if (!lower || !upper) continue
    const id = `faa-${f.id ?? fi}`
    outerRings(f.geometry).forEach((polygon, i) =>
      out.push({
        id: i ? `${id}#${i}` : id,
        name: String(p.NAME ?? ''),
        class: cls,
        type: 'CLASS',
        lower,
        upper,
        polygon,
      }),
    )
  }
  return out
}

/** Rough US + territories box (the FAA service is US only). */
export const inFaaCoverage = (lat: number, lon: number): boolean =>
  (lat > 24 && lat < 49 && lon > -125 && lon < -66.5) ||
  (lat > 51 && lat < 72 && lon > -170 && lon < -130) ||
  (lat > 17 && lat < 19 && lon > -68 && lon < -64) ||
  (lat > 18 && lat < 23 && lon > -161 && lon < -154) ||
  (lat > 13 && lat < 21 && lon > 144 && lon < 146)

export interface AirspaceClientOpts {
  fetch: FetchFn
  now?: () => number
}

const credit = { faa: 'Airspace: FAA', none: '' }

export function createAirspaceClient(opts: AirspaceClientOpts) {
  const now = opts.now ?? Date.now
  const cache = new TtlCache<AirspaceBody>(DAY, 300)

  async function fromFaa(lat: number, lon: number, distM: number): Promise<Airspace[] | null> {
    const q = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      outSR: '4326',
      distance: String(distM),
      units: 'esriSRUnit_Meter',
      spatialRel: 'esriSpatialRelIntersects',
      where: "CLASS IN ('B','C','D')",
      outFields: FAA_FIELDS,
      maxAllowableOffset: '0.0004',
      resultRecordCount: '200',
      f: 'geojson',
    })
    try {
      const r = await opts.fetch(`${FAA_URL}?${q}`)
      return r.ok ? mapFaa(await r.json()) : null
    } catch {
      return null
    }
  }

  async function get(lat: number, lon: number, radiusNm: number): Promise<AirspaceBody> {
    const rl = Math.round(lat * 10) / 10
    const ro = Math.round(lon * 10) / 10
    const nm = Math.min(80, Math.max(10, Math.ceil(radiusNm / 10) * 10))
    const key = `${rl},${ro},${nm}`
    const hit = cache.get(key, now())
    if (hit) return hit
    const distM = Math.round(nm * 1852)

    // US only: FAA Class_Airspace (public domain). Outside the US there is no free, keyless source.
    if (!inFaaCoverage(rl, ro))
      return { source: 'none', attribution: '', reason: 'outside_us', airspaces: [] }
    const list = await fromFaa(rl, ro, distM)
    // Not cached: a transient failure should be retried.
    if (!list) return { source: 'none', attribution: '', reason: 'upstream_error', airspaces: [] }
    const body: AirspaceBody = {
      source: 'faa',
      attribution: credit.faa,
      airspaces: list.slice(0, MAX_RESULTS),
    }
    if (list.length) cache.set(key, body, now()) // an empty answer may be a transient upstream blip
    return body
  }

  return { get }
}
