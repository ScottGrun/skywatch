// Compact wire format for the baked airport files (shared by scripts/build-airports.ts and the loader).
import type { Airport, Runway } from '../types.ts'

/** [icao, iata, name, city, country, lat, lon, elevationFt, size(0 large,1 medium,2 small)] */
export type AirportRow = [string, string, string, string, string, number, number, number, number]
/** [lengthFt, widthFt, leIdent, leLat, leLon, leHdg, heIdent, heLat, heLon, heHdg, closed(0|1)] */
export type RunwayRow = [
  number,
  number,
  string,
  number,
  number,
  number,
  string,
  number,
  number,
  number,
  number,
]

const SIZES = ['large', 'medium', 'small'] as const

/** Runway shards are 10 degree cells. */
export const CELL_DEG = 10
export const cellKey = (lat: number, lon: number): string =>
  `${Math.floor(lat / CELL_DEG)}_${Math.floor(lon / CELL_DEG)}`.replaceAll('-', 'm')

export const unpackAirport = (r: AirportRow): Airport => ({
  icao: r[0],
  iata: r[1],
  name: r[2],
  city: r[3],
  country: r[4],
  lat: r[5],
  lon: r[6],
  elevationFt: r[7],
  size: SIZES[r[8]] ?? 'small',
  runways: [],
})

export const packRunway = (r: Runway): RunwayRow => [
  r.lengthFt,
  r.widthFt,
  r.le.ident,
  r.le.lat,
  r.le.lon,
  r.le.headingDeg,
  r.he.ident,
  r.he.lat,
  r.he.lon,
  r.he.headingDeg,
  r.closed ? 1 : 0,
]

export function unpackRunway(r: RunwayRow): Runway {
  const rw: Runway = {
    lengthFt: r[0],
    widthFt: r[1],
    le: { ident: r[2], lat: r[3], lon: r[4], headingDeg: r[5] },
    he: { ident: r[6], lat: r[7], lon: r[8], headingDeg: r[9] },
  }
  if (r[10]) rw.closed = true
  return rw
}
