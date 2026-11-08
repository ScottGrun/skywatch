import { transientResults } from './adsbdb.ts'
import type { FetchFn } from './opensky.ts'
import { TtlCache } from './ttlCache.ts'

const UA = 'tracon3d-flight-tracker/1.0 (open-source hobby project)'
const TTL_MS = 5 * 60_000
const COVERS = ['FEW', 'SCT', 'BKN', 'OVC', 'VV']

interface RawMetar {
  rawOb?: string
  obsTime?: number
  wdir?: number | string | null
  wspd?: number | null
  wgst?: number | null
  visib?: number | string | null
  temp?: number | null
  dewp?: number | null
  altim?: number | null
  fltCat?: string | null
  cover?: string | null
  clouds?: { cover?: string; base?: number | null }[]
}

export interface MetarOut {
  icao: string
  raw: string | null
  obsTime: number | null
  windDir: number | null
  windKt: number | null
  gustKt: number | null
  visSm: number | null
  ceilingFt: number | null
  cover: string | null
  clouds: { cover: string; baseFt: number }[]
  tempC: number | null
  dewC: number | null
  altimHpa: number | null
  flightCat: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function mapMetar(
  icao: string,
  m: RawMetar | undefined,
): MetarOut | { icao: string; raw: null } {
  if (!m?.rawOb) return { icao, raw: null }
  const vis = typeof m.visib === 'string' ? Number.parseFloat(m.visib) || null : num(m.visib)
  const clouds = (m.clouds ?? [])
    .filter((c) => COVERS.includes(c.cover ?? '') && typeof c.base === 'number')
    .map((c) => ({ cover: c.cover as string, baseFt: c.base as number }))
  const ceil = clouds.filter((c) => ['BKN', 'OVC', 'VV'].includes(c.cover)).map((c) => c.baseFt)
  const cat = ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(m.fltCat ?? '')
    ? (m.fltCat as MetarOut['flightCat'])
    : null
  return {
    icao,
    raw: m.rawOb,
    obsTime: num(m.obsTime),
    windDir: typeof m.wdir === 'number' ? m.wdir : null,
    windKt: num(m.wspd),
    gustKt: num(m.wgst),
    visSm: vis,
    ceilingFt: ceil.length ? Math.min(...ceil) : null,
    cover: m.cover ?? null,
    clouds,
    tempC: num(m.temp),
    dewC: num(m.dewp),
    altimHpa: num(m.altim),
    flightCat: cat,
  }
}

export function createMetarClient(deps: { fetch: FetchFn; now?: () => number }) {
  const now = deps.now ?? Date.now
  const cache = new TtlCache<unknown>(TTL_MS, 200)
  return {
    async get(icao: string): Promise<unknown> {
      const hit = cache.get(icao, now())
      if (hit) return hit
      const none = { icao, raw: null }
      const transient = <T extends object>(v: T): T => (transientResults.add(v), v)
      try {
        const res = await deps.fetch(
          `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`,
          { headers: { 'user-agent': UA, accept: 'application/json' } },
        )
        if (!res.ok) return cache.peek(icao) ?? transient(none)
        const text = await res.text()
        const arr = text ? (JSON.parse(text) as RawMetar[]) : []
        const out = mapMetar(icao, arr[0])
        cache.set(icao, out, now())
        return out
      } catch {
        return cache.peek(icao) ?? transient(none)
      }
    },
  }
}
