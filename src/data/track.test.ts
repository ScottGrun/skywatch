import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTrackCache, fetchTrack, watchTrack, type TrackData } from './track.ts'

const data: TrackData = {
  icao24: 'abc123',
  startTime: 1,
  endTime: 2,
  path: [
    { t: 1, lat: 1, lon: 1, altFt: 0, onGround: true },
    { t: 2, lat: 2, lon: 2, altFt: 100, onGround: false },
  ],
}
const ok = () => new Response(JSON.stringify(data), { status: 200 })

describe('track data', () => {
  beforeEach(() => clearTrackCache())

  it('caches for 60 s', async () => {
    let t = 0
    const f = vi.fn(async () => ok()) as unknown as typeof fetch
    await fetchTrack('abc123', { fetch: f, now: () => t })
    t = 59_000
    await fetchTrack('abc123', { fetch: f, now: () => t })
    expect(f).toHaveBeenCalledTimes(1)
    t = 61_000
    await fetchTrack('abc123', { fetch: f, now: () => t })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('returns null on failure and aborts on stop', async () => {
    const bad = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch
    expect(await fetchTrack('zzz111', { fetch: bad })).toBeNull()

    const got: unknown[] = []
    const slow = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))
        }),
    ) as unknown as typeof fetch
    const stop = watchTrack('def456', (d) => got.push(d), { fetch: slow })
    stop()
    await Promise.resolve()
    expect(got).toEqual([])
  })
})
