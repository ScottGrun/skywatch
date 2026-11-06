import type { Airport } from '../types.ts'

let cached: Promise<Airport[]> | null = null

/** Fetch the baked airport index once (memoized; retried after a failure). */
export function loadAirports(): Promise<Airport[]> {
  if (!cached) {
    cached = fetch('/data/airports.json')
      .then((r) => {
        if (!r.ok) throw new Error(`airports.json: ${r.status}`)
        return r.json() as Promise<Airport[]>
      })
      .catch((e) => {
        cached = null
        throw e
      })
  }
  return cached
}

/** Look up by ICAO or IATA code (case-insensitive). ICAO wins on ambiguity. */
export async function findAirport(code: string): Promise<Airport | undefined> {
  const c = code.trim().toUpperCase()
  if (!c) return undefined
  const list = await loadAirports()
  return list.find((a) => a.icao === c) ?? list.find((a) => a.iata === c)
}
