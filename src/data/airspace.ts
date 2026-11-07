import type { Airport, AirspaceData } from '../types.ts'

const cache = new Map<string, AirspaceData>()

/** Controlled airspace around `ap` via `/api/airspace`. Resolves null on network/HTTP failure. */
export async function fetchAirspace(
  ap: Airport,
  signal?: AbortSignal,
): Promise<AirspaceData | null> {
  const hit = cache.get(ap.icao)
  if (hit) return hit
  try {
    const q = new URLSearchParams({ lat: String(ap.lat), lon: String(ap.lon), radiusNm: '40' })
    const r = await fetch(`/api/airspace?${q}`, { signal })
    if (!r.ok) return null
    const data = (await r.json()) as AirspaceData
    if (!Array.isArray(data.airspaces)) return null
    if (!data.reason) cache.set(ap.icao, data)
    return data
  } catch {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return null
  }
}
