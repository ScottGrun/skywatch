// Usage: node scripts/build-airports.ts
// Downloads OurAirports CSVs and writes public/data/airports.json (large + medium airports,
// plus small airports with an IATA code and scheduled service).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsvRecords } from '../src/core/csv.ts'
import { bearingDeg } from '../src/core/geo.ts'
import type { Airport, Runway } from '../src/types.ts'

const BASE = 'https://davidmegginson.github.io/ourairports-data'
type Rec = Record<string, string>

const r5 = (n: number) => Math.round(n * 1e5) / 1e5
const numOrNull = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function buildRunway(r: Rec): Runway | null {
  const leLat = numOrNull(r.le_latitude_deg)
  const leLon = numOrNull(r.le_longitude_deg)
  const heLat = numOrNull(r.he_latitude_deg)
  const heLon = numOrNull(r.he_longitude_deg)
  if (leLat === null || leLon === null || heLat === null || heLon === null) return null
  const le = { lat: leLat, lon: leLon }
  const he = { lat: heLat, lon: heLon }
  const leH = numOrNull(r.le_heading_degT) ?? bearingDeg(le, he)
  const heH = numOrNull(r.he_heading_degT) ?? bearingDeg(he, le)
  const rw: Runway = {
    lengthFt: Math.round(numOrNull(r.length_ft) ?? 0),
    widthFt: Math.round(numOrNull(r.width_ft) ?? 0),
    le: {
      ident: r.le_ident,
      lat: r5(leLat),
      lon: r5(leLon),
      headingDeg: Math.round(leH * 10) / 10,
    },
    he: {
      ident: r.he_ident,
      lat: r5(heLat),
      lon: r5(heLon),
      headingDeg: Math.round(heH * 10) / 10,
    },
  }
  if (r.closed === '1') rw.closed = true
  return rw
}

export function buildAirports(airportsCsv: string, runwaysCsv: string): Airport[] {
  const byIdent = new Map<string, Runway[]>()
  for (const r of parseCsvRecords(runwaysCsv)) {
    const rw = buildRunway(r)
    if (!rw) continue
    const list = byIdent.get(r.airport_ident)
    if (list) list.push(rw)
    else byIdent.set(r.airport_ident, [rw])
  }

  const rank: Record<string, number> = { large_airport: 0, medium_airport: 1, small_airport: 2 }
  const ranked: Array<[number, Airport]> = []
  for (const a of parseCsvRecords(airportsCsv)) {
    const keep =
      a.type === 'large_airport' ||
      a.type === 'medium_airport' ||
      (a.type === 'small_airport' && a.iata_code !== '' && a.scheduled_service === 'yes')
    if (!keep) continue
    const lat = numOrNull(a.latitude_deg)
    const lon = numOrNull(a.longitude_deg)
    if (lat === null || lon === null) continue
    const icao = /^[A-Z]{4}$/.test(a.ident) ? a.ident : a.gps_code || a.ident
    ranked.push([
      rank[a.type],
      {
        icao,
        iata: a.iata_code,
        name: a.name,
        city: a.municipality,
        country: a.iso_country,
        lat: r5(lat),
        lon: r5(lon),
        elevationFt: Math.round(numOrNull(a.elevation_ft) ?? 0),
        runways: byIdent.get(a.ident) ?? [],
      },
    ])
  }
  // Large airports first so ties in search ranking favour major hubs.
  ranked.sort((x, y) => x[0] - y[0] || x[1].icao.localeCompare(y[1].icao))
  return ranked.map((x) => x[1])
}

async function download(name: string): Promise<string> {
  const res = await fetch(`${BASE}/${name}`)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  return res.text()
}

if (import.meta.main) {
  const [airportsCsv, runwaysCsv] = await Promise.all([
    download('airports.csv'),
    download('runways.csv'),
  ])
  const airports = buildAirports(airportsCsv, runwaysCsv)
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/airports.json')
  mkdirSync(dirname(file), { recursive: true })
  const json = JSON.stringify(airports)
  writeFileSync(file, json)
  const withRw = airports.filter((a) => a.runways.length > 0).length
  console.log(
    `${airports.length} airports (${withRw} with runways) -> ${file} (${(json.length / 1e6).toFixed(2)} MB)`,
  )
}
