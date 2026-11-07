import type { Metar } from '../types.ts'

export async function fetchMetar(icao: string, signal?: AbortSignal): Promise<Metar | null> {
  try {
    const r = await fetch(`/api/metar/${encodeURIComponent(icao)}`, { signal })
    if (!r.ok) return null
    const m = (await r.json()) as Metar
    return m.raw ? m : null
  } catch {
    return null
  }
}
