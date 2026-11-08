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

const SIZE_PENALTY = { large: 0, medium: 1, small: 2 } as const

/**
 * Exact ICAO/IATA matches come first. Everything else scores by match kind (ICAO/IATA prefix 1,
 * city prefix 2, name/city contains 3) plus a size penalty (large 0, medium 1, small 2), so "van"
 * lists CYVR before small strips with a Vancouver-ish name. Accent/case-insensitive; ties keep input order.
 */
export function searchAirports(list: readonly Airport[], query: string, limit = 8): Airport[] {
  const q = fold(query.trim())
  if (!q) return []
  const hits: { a: Airport; score: number }[] = []
  for (const e of entries(list)) {
    let r = -1
    if (e.icao === q || e.iata === q) r = 0
    else if (e.icao.startsWith(q) || (e.iata !== '' && e.iata.startsWith(q))) r = 1
    else if (e.city.startsWith(q)) r = 2
    else if (e.name.includes(q) || e.city.includes(q)) r = 3
    if (r < 0) continue
    hits.push({ a: e.a, score: r === 0 ? 0 : r + SIZE_PENALTY[e.a.size ?? 'medium'] })
  }
  return hits
    .sort((x, y) => x.score - y.score)
    .slice(0, limit)
    .map((h) => h.a)
}
