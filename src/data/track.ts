/** Full track history of the current flight for one aircraft, via `/api/track/:icao24`. */
export interface TrackPoint {
  t: number // unix seconds
  lat: number
  lon: number
  altFt: number
  onGround: boolean
}
export interface TrackData {
  icao24: string
  startTime: number
  endTime: number
  path: TrackPoint[]
}

export const TRACK_REFRESH_MS = 60_000

export interface TrackOptions {
  fetch?: typeof fetch
  now?: () => number
  signal?: AbortSignal
}

const cache = new Map<string, { at: number; data: TrackData }>()

/** Cached for 60 s. Resolves null when unavailable; rejects only with AbortError. */
export async function fetchTrack(id: string, opts: TrackOptions = {}): Promise<TrackData | null> {
  const now = opts.now ?? Date.now
  const hit = cache.get(id)
  if (hit && now() - hit.at < TRACK_REFRESH_MS) return hit.data
  const f = opts.fetch ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init))
  try {
    const res = await f(`/api/track/${id}`, { signal: opts.signal })
    if (!res.ok) return hit?.data ?? null
    const data = (await res.json()) as TrackData
    if (!Array.isArray(data.path)) return null
    cache.set(id, { at: now(), data })
    if (cache.size > 50) cache.delete(cache.keys().next().value as string)
    return data
  } catch (e) {
    if (opts.signal?.aborted) throw e
    return hit?.data ?? null
  }
}

/**
 * Follow one aircraft's track: fetch now, refetch every 60 s until `stop()`.
 * `onData(null)` means unavailable (no track or error). Aborts in-flight requests on stop.
 */
export function watchTrack(
  id: string,
  onData: (d: TrackData | null) => void,
  opts: Omit<TrackOptions, 'signal'> = {},
): () => void {
  const ac = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  const run = async () => {
    try {
      const d = await fetchTrack(id, { ...opts, signal: ac.signal })
      if (ac.signal.aborted) return
      onData(d && d.path.length > 1 ? d : null)
    } catch {
      return
    }
    timer = setTimeout(run, TRACK_REFRESH_MS)
  }
  void run()
  return () => {
    ac.abort()
    if (timer) clearTimeout(timer)
  }
}

export function clearTrackCache(): void {
  cache.clear()
}
