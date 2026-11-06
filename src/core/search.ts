import type { Airport } from '../types.ts'

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

interface Entry {
  a: Airport
  icao: string
  iata: string
  name: string
  city: string
}

const index = new WeakMap<readonly Airport[], Entry[]>()

function entries(list: readonly Airport[]): Entry[] {
  let e = index.get(list)
  if (!e) {
    e = list.map((a) => ({
      a,
      icao: fold(a.icao),
      iata: fold(a.iata),
      name: fold(a.name),
      city: fold(a.city),
    }))
    index.set(list, e)
  }
  return e
}

/**
 * Rank: exact ICAO/IATA, then ICAO/IATA prefix, then city prefix, then name/city contains.
 * Accent/case-insensitive; stable within a rank (input order, so put big airports first).
 */
export function searchAirports(list: readonly Airport[], query: string, limit = 8): Airport[] {
  const q = fold(query.trim())
  if (!q) return []
  const buckets: Airport[][] = [[], [], [], []]
  for (const e of entries(list)) {
    let r = -1
    if (e.icao === q || e.iata === q) r = 0
    else if (e.icao.startsWith(q) || (e.iata !== '' && e.iata.startsWith(q))) r = 1
    else if (e.city.startsWith(q)) r = 2
    else if (e.name.includes(q) || e.city.includes(q)) r = 3
    if (r >= 0) buckets[r].push(e.a)
  }
  return buckets.flat().slice(0, limit)
}
