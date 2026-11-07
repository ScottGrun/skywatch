import { TtlCache } from './ttlCache.ts'
import type { FetchFn } from './opensky.ts'

export const OPENAIP_URL = 'https://api.core.openaip.net/api/airspaces'
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
  source: 'openaip' | 'faa' | 'none'
  attribution: string
  /** Set when `airspaces` is empty because data is unavailable (not merely nothing nearby). */
  reason?: 'needs_key' | 'upstream_error'
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

// ---- openAIP ----
const OAIP_CLASS = ['A', 'B', 'C', 'D']
const OAIP_TYPE: Record<number, string> = {
  1: 'R',
  2: 'DNG',
  3: 'P',
  4: 'CTR',
  7: 'TMA',
  13: 'ATZ',
  14: 'MATZ',
  17: 'ALR',
  18: 'WRN',
  26: 'CTA',
  36: 'MCTR',
}
const OAIP_UNIT = { 0: 'M', 1: 'FT', 6: 'FL' } as const
const OAIP_REF = { 0: 'AGL', 1: 'MSL', 2: 'STD' } as const

/** openAIP vertical limit {value, unit(0 m,1 ft,6 FL), referenceDatum(0 GND,1 MSL,2 STD)}. */
export function mapOaipLimit(l: unknown): Limit | null {
  const x = l as { value?: unknown; unit?: unknown; referenceDatum?: unknown } | null
  if (!x || !num(x.value) || !num(x.unit) || !num(x.referenceDatum)) return null
  const unit = OAIP_UNIT[x.unit as keyof typeof OAIP_UNIT]
  let ref: Limit['ref'] | undefined = OAIP_REF[x.referenceDatum as keyof typeof OAIP_REF]
  if (!unit || !ref) return null
  if (unit === 'FL') ref = 'STD'
  else if (ref === 'AGL' && x.value === 0) ref = 'SFC'
  return { value: x.value, unit, ref }
}

export function mapOpenAip(raw: unknown): Airspace[] {
  const items = ((raw ?? {}) as { items?: unknown }).items
  const out: Airspace[] = []
  for (const it of Array.isArray(items) ? (items as Record<string, unknown>[]) : []) {
    const c = it.icaoClass as number
    const letter = c >= 0 && c <= 3 ? OAIP_CLASS[c] : ''
    const typeCode = OAIP_TYPE[it.type as number]
    if (!letter && !typeCode) continue // FIR/RMZ/TMZ/gliding/E-G etc.: not interesting here
    const lower = mapOaipLimit(it.lowerLimit)
    const upper = mapOaipLimit(it.upperLimit)
    if (!lower || !upper) continue
    const id = String(it._id ?? it.name)
    outerRings(it.geometry).forEach((polygon, i) =>
      out.push({
        id: i ? `${id}#${i}` : id,
        name: String(it.name ?? ''),
        class: letter || typeCode,
        type: typeCode ?? 'OTHER',
        lower,
        upper,
        polygon,
      }),
    )
  }
  return out
}

// ---- FAA Class_Airspace ----
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
  apiKey?: string
  now?: () => number
}

const credit = { openaip: 'Airspace: openAIP', faa: 'Airspace: FAA', none: '' }

export function createAirspaceClient(opts: AirspaceClientOpts) {
  const now = opts.now ?? Date.now
  const cache = new TtlCache<AirspaceBody>(DAY, 300)

  async function fromOpenAip(lat: number, lon: number, distM: number): Promise<Airspace[] | null> {
    const u = `${OPENAIP_URL}?pos=${lat},${lon}&dist=${distM}&limit=500`
    try {
      const r = await opts.fetch(u, { headers: { 'x-openaip-api-key': opts.apiKey ?? '' } })
      return r.ok ? mapOpenAip(await r.json()) : null
    } catch {
      return null
    }
  }

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
    const key = `${rl},${ro},${nm},${opts.apiKey ? 1 : 0}`
    const hit = cache.get(key, now())
    if (hit) return hit
    const distM = Math.round(nm * 1852)

    let list: Airspace[] | null = null
    let source: AirspaceBody['source'] = 'none'
    if (opts.apiKey) {
      list = await fromOpenAip(rl, ro, distM)
      if (list) source = 'openaip'
    }
    if (!list && inFaaCoverage(rl, ro)) {
      list = await fromFaa(rl, ro, distM)
      if (list) source = 'faa'
    }
    if (!list) {
      // Not cached: a missing key or transient failure should be retried.
      const reason = opts.apiKey || inFaaCoverage(rl, ro) ? 'upstream_error' : 'needs_key'
      return { source: 'none', attribution: '', reason, airspaces: [] }
    }
    const body: AirspaceBody = {
      source,
      attribution: credit[source],
      airspaces: list.slice(0, MAX_RESULTS),
    }
    if (list.length) cache.set(key, body, now()) // an empty answer may be a transient upstream blip
    return body
  }

  return { get }
}
