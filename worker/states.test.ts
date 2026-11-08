import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseStatesBbox } from './bbox.ts'
import worker from './index.ts'

const qs = (o: Record<string, string>) => new URLSearchParams(o)
const ok = { lamin: '47.7', lomin: '-125.2', lamax: '50.7', lomax: '-121.2' }
const headers = { 'user-agent': 'Mozilla/5.0' }

describe('parseStatesBbox', () => {
  it('quantizes outward to 0.5 degrees', () => {
    expect(parseStatesBbox(qs(ok))).toEqual({
      lamin: 47.5,
      lomin: -125.5,
      lamax: 51,
      lomax: -121,
    })
  })
  it('rejects missing, non-finite, inverted and oversized boxes', () => {
    expect(parseStatesBbox(qs({}))).toBeNull()
    expect(parseStatesBbox(qs({ ...ok, lamin: 'abc' }))).toBeNull()
    expect(parseStatesBbox(qs({ ...ok, lomax: 'Infinity' }))).toBeNull()
    expect(parseStatesBbox(qs({ ...ok, lamin: '' }))).toBeNull()
    expect(parseStatesBbox(qs({ ...ok, lamin: '51', lamax: '50' }))).toBeNull()
    expect(parseStatesBbox(qs({ ...ok, lamin: '40' }))).toBeNull() // 10 deg tall
    expect(parseStatesBbox(qs({ ...ok, lomin: '-140' }))).toBeNull() // too wide
  })
  it('clamps to the valid coordinate range', () => {
    const b = parseStatesBbox(qs({ lamin: '89', lamax: '91', lomin: '179', lomax: '181' }))
    expect(b).toEqual({ lamin: 89, lamax: 90, lomin: 179, lomax: 180 })
  })
})

describe('worker routes', () => {
  afterEach(() => vi.unstubAllGlobals())
  const call = (path: string) =>
    worker.fetch(new Request(`https://x.test${path}`, { headers }), {})

  it('/api/states: 400 on a bad box, short edge cache on success', async () => {
    expect((await call('/api/states?lamin=1&lomin=2&lamax=NaN&lomax=3')).status).toBe(400)
    const up = vi.fn(async () => new Response(JSON.stringify({ now: 1000, ac: [] })))
    vi.stubGlobal('fetch', up)
    const r = await call('/api/states?lamin=10.1&lomin=20.1&lamax=12&lomax=22')
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=5')
    // Nearby boxes that quantize identically share one upstream fetch (in-process TTL cache).
    await call('/api/states?lamin=10.2&lomin=20.3&lamax=11.9&lomax=21.8')
    expect(up).toHaveBeenCalledTimes(1)
  })

  it('/api/states: serves from and fills the edge cache when available', async () => {
    const store = new Map<string, Response>()
    vi.stubGlobal('caches', {
      default: {
        match: async (r: Request) => store.get(r.url)?.clone(),
        put: async (r: Request, res: Response) => void store.set(r.url, res),
      },
    })
    const up = vi.fn(async () => new Response(JSON.stringify({ now: 1000, ac: [] })))
    vi.stubGlobal('fetch', up)
    const waits: Promise<unknown>[] = []
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) }
    const req = () =>
      new Request('https://x.test/api/states?lamin=30.1&lomin=40.1&lamax=32&lomax=42', { headers })
    await worker.fetch(req(), {}, ctx)
    await Promise.all(waits)
    expect([...store.keys()]).toEqual([
      'https://x.test/api/states?lamin=30&lomin=40&lamax=32&lomax=42',
    ])
    const hit = await worker.fetch(req(), {}, ctx)
    expect(hit.status).toBe(200)
    expect(up).toHaveBeenCalledTimes(1)
  })

  it('transient upstream failures answer 503 no-store; genuine misses stay cacheable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )
    for (const p of ['/api/route/ZZZ9999', '/api/photo/aabbcc', '/api/metar/ZZZZ']) {
      const r = await call(p)
      expect(r.status, p).toBe(503)
      expect(r.headers.get('cache-control'), p).toBe('no-store')
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    const r = await call('/api/route/YYY8888')
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('public, max-age=21600')
  })
})
