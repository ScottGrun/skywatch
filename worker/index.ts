import { isAiBot } from './aiBots.ts'
import { createAdsbdb, transientResults } from './adsbdb.ts'
import { createAdsbLolClient } from './adsblol.ts'
import { createAirspaceClient } from './airspace.ts'
import { createPhotoClient } from './photo.ts'
import { createMetarClient } from './metar.ts'
import { createTraceClient } from './trace.ts'
import { parseStatesBbox, statesCacheUrl } from './bbox.ts'
import { createOpenSkyClient, type FetchFn } from './opensky.ts'

interface Env {
  OPENSKY_CLIENT_ID?: string
  OPENSKY_CLIENT_SECRET?: string
  /** `adsblol` (default) or `opensky`. */
  TRAFFIC_SOURCE?: string
  ASSETS?: { fetch: FetchFn }
}

const doFetch: FetchFn = (input, init) => fetch(input, init)
const adsbLol = createAdsbLolClient({ fetch: doFetch })
const metars = createMetarClient({ fetch: doFetch })
const photos = createPhotoClient({ fetch: doFetch })
const traces = createTraceClient({ fetch: doFetch })
const wantsOpenSky = (env: Env) => env.TRAFFIC_SOURCE?.toLowerCase() === 'opensky'
const adsbdb = createAdsbdb({ fetch: doFetch })
let airspaceClient: ReturnType<typeof createAirspaceClient> | null = null
let osClient: ReturnType<typeof createOpenSkyClient> | null = null
let osKey = ''

function openSky(env: Env) {
  const key = `${env.OPENSKY_CLIENT_ID ?? ''}:${env.OPENSKY_CLIENT_SECRET ?? ''}`
  if (!osClient || key !== osKey) {
    osKey = key
    osClient = createOpenSkyClient({
      fetch: doFetch,
      clientId: env.OPENSKY_CLIENT_ID,
      clientSecret: env.OPENSKY_CLIENT_SECRET,
    })
  }
  return osClient
}

function airspace() {
  return (airspaceClient ??= createAirspaceClient({ fetch: doFetch }))
}

const NO_STORE = { 'cache-control': 'no-store' }

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

export default {
  async fetch(req: Request, env: Env, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname

    // robots.txt stays readable so well-behaved bots can see the policy.
    if (path !== '/robots.txt' && isAiBot(req.headers.get('user-agent')))
      return new Response('Forbidden', { status: 403 })

    if (path === '/api/states') {
      const bbox = parseStatesBbox(url.searchParams)
      if (!bbox) return json({ error: 'valid lamin, lomin, lamax, lomax required (max 3.5 x 4.5 deg)' }, 400)
      // Edge cache keyed on the normalized (quantized) box: one upstream fetch per ~5 s per area.
      const edge = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null
      const key = new Request(statesCacheUrl(url.origin, bbox))
      const hit = await edge?.match(key)
      if (hit) return hit
      const r = await (wantsOpenSky(env) ? openSky(env) : adsbLol).getStates(bbox)
      const h: Record<string, string> = { 'cache-control': 'no-store' }
      if (r.stale) h['x-stale'] = '1'
      if (r.status === 200 && !r.stale) {
        // s-maxage lets the edge keep it; max-age=0 keeps browsers polling.
        h['cache-control'] = 'public, max-age=0, s-maxage=5'
        const res = json(r.body, 200, h)
        if (edge) ctx?.waitUntil(edge.put(key, res.clone()))
        return res
      }
      return json(r.body, r.status, h)
    }

    const ac = /^\/api\/aircraft\/([0-9a-fA-F]{6})$/.exec(path)
    if (ac) {
      const info = await adsbdb.aircraft(ac[1].toLowerCase())
      // Upstream failure: 503 so the client retries instead of caching "unknown" for the session.
      if (transientResults.has(info)) return json(info, 503, NO_STORE)
      return json(info, 200, { 'cache-control': 'public, max-age=86400' })
    }

    const ph = /^\/api\/photo\/([0-9a-fA-F]{6})$/.exec(path)
    if (ph) {
      const { photo, transient } = await photos.lookup(ph[1].toLowerCase())
      if (transient) return json(photo, 503, NO_STORE)
      return json(photo, 200, { 'cache-control': 'public, max-age=86400' })
    }

    const tr = /^\/api\/track\/([0-9a-fA-F]{6})$/.exec(path)
    if (tr) {
      const id = tr[1].toLowerCase()
      // Edge cache per hex for 60 s: parsing trace JSON is the CPU-heavy part.
      const edge = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null
      const key = new Request(`${url.origin}/api/track/${id}`)
      const hit = await edge?.match(key)
      if (hit) return hit
      const r = await (wantsOpenSky(env) ? openSky(env).getTrack(id) : traces.getTrack(id))
      if (r.status !== 200) return json(r.body, r.status, NO_STORE)
      const res = json(r.body, 200, { 'cache-control': 'public, max-age=0, s-maxage=60' })
      if (edge) ctx?.waitUntil(edge.put(key, res.clone()))
      return res
    }

    const rt = /^\/api\/route\/([A-Za-z0-9]{2,10})$/.exec(path)
    if (rt) {
      const info = await adsbdb.route(rt[1].toUpperCase())
      if (transientResults.has(info)) return json(info, 503, NO_STORE)
      return json(info, 200, { 'cache-control': 'public, max-age=21600' })
    }

    const mt = /^\/api\/metar\/([A-Za-z0-9]{3,4})$/.exec(path)
    if (mt) {
      const m = await metars.get(mt[1].toUpperCase())
      if (typeof m === 'object' && m !== null && transientResults.has(m)) return json(m, 503, NO_STORE)
      return json(m, 200, { 'cache-control': 'public, max-age=300' })
    }

    if (path === '/api/airspace') {
      const q = url.searchParams
      const lat = Number(q.get('lat'))
      const lon = Number(q.get('lon'))
      const nm = q.has('radiusNm') ? Number(q.get('radiusNm')) : 40
      const bad = !q.get('lat') || !q.get('lon') || ![lat, lon, nm].every(Number.isFinite)
      if (bad || Math.abs(lat) > 90 || Math.abs(lon) > 180)
        return json({ error: 'lat, lon required' }, 400)
      const body = await airspace().get(lat, lon, nm)
      return json(body, 200, { 'cache-control': body.reason ? 'no-store' : 'public, max-age=3600' })
    }

    if (path.startsWith('/api/')) return json({ error: 'not found' }, 404)
    return env.ASSETS ? env.ASSETS.fetch(req.url, req) : new Response('not found', { status: 404 })
  },
}
