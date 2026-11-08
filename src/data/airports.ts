import type { Airport } from '../types.ts'
import {
  cellKey,
  unpackAirport,
  unpackRunway,
  type AirportRow,
  type RunwayRow,
} from './airportCodec.ts'
import indexUrl from './baked/airports-index.json?url&no-inline'

// Runway shards (one per 10 degree cell): Vite hashes them, so they cache immutably.
const shardUrls = import.meta.glob<string>('./baked/rw-*.json', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
})
const shardByKey = new Map<string, string>()
for (const [path, url] of Object.entries(shardUrls)) {
  const k = /rw-(.+)\.json$/.exec(path)?.[1]
  if (k) shardByKey.set(k, url)
}

let cached: Promise<Airport[]> | null = null
const byIcao = new Map<string, Airport>()
const shards = new Map<string, Promise<void>>()

/**
 * Fetch the airport search index once (memoized; retried after a failure). Airports come back with
 * empty `runways`: call `ensureRunways` for the ones whose runways are needed.
 */
export function loadAirports(): Promise<Airport[]> {
  if (!cached) {
    cached = fetch(indexUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`airports index: ${r.status}`)
        return r.json() as Promise<AirportRow[]>
      })
      .then((rows) => {
        const list = rows.map(unpackAirport)
        byIcao.clear()
        for (const a of list) byIcao.set(a.icao, a)
        shards.clear()
        return list
      })
      .catch((e) => {
        cached = null
        throw e
      })
  }
  return cached
}

function loadShard(key: string): Promise<void> {
  let p = shards.get(key)
  if (!p) {
    const url = shardByKey.get(key)
    if (!url) return Promise.resolve() // no runways baked in this cell
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`runways ${key}: ${r.status}`)
        return r.json() as Promise<Record<string, RunwayRow[]>>
      })
      .then((cell) => {
        for (const [icao, rows] of Object.entries(cell)) {
          const a = byIcao.get(icao)
          if (a) a.runways = rows.map(unpackRunway)
        }
      })
      .catch((e) => {
        shards.delete(key)
        throw e
      })
    shards.set(key, p)
  }
  return p
}

/**
 * Fill in `runways` (in place) for every airport within ~`radiusDeg` of `ap`, including `ap` itself.
 * Call after `loadAirports()` has resolved; resolves once the covering shards are in.
 */
export async function ensureRunways(ap: Airport, radiusDeg = 0.9): Promise<void> {
  const dLon = radiusDeg / Math.max(0.2, Math.cos((ap.lat * Math.PI) / 180))
  const keys = new Set<string>()
  for (const lat of [ap.lat - radiusDeg, ap.lat + radiusDeg])
    for (const lon of [ap.lon - dLon, ap.lon + dLon]) keys.add(cellKey(lat, lon))
  keys.add(cellKey(ap.lat, ap.lon))
  await Promise.all([...keys].map(loadShard))
}

/** Look up by ICAO or IATA code (case-insensitive). ICAO wins on ambiguity. */
export async function findAirport(code: string): Promise<Airport | undefined> {
  const c = code.trim().toUpperCase()
  if (!c) return undefined
  const list = await loadAirports()
  return list.find((a) => a.icao === c) ?? list.find((a) => a.iata === c)
}
