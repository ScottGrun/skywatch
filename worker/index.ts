import { createAdsbdb, transientResults } from './adsbdb.ts'
import { createAdsbLolClient } from './adsblol.ts'
import { createAirspaceClient } from './airspace.ts'
import { createMetarClient } from './metar.ts'
import { createTraceClient } from './trace.ts'
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

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname

    if (path === '/api/states') {
      const q = url.searchParams
      const [lamin, lomin, lamax, lomax] = ['lamin', 'lomin', 'lamax', 'lomax'].map((k) =>
        q.has(k) ? Number(q.get(k)) : NaN,
      )
      if (![lamin, lomin, lamax, lomax].every(Number.isFinite) || lamin >= lamax || lomin >= lomax)
        return json({ error: 'lamin, lomin, lamax, lomax required' }, 400)
      const r = await (wantsOpenSky(env) ? openSky(env) : adsbLol).getStates({
        lamin,
        lomin,
        lamax,
        lomax,
      })
      const h: Record<string, string> = { 'cache-control': 'no-store' }
      if (r.stale) h['x-stale'] = '1'
      return json(r.body, r.status, h)
    }

    const ac = /^\/api\/aircraft\/([0-9a-fA-F]{6})$/.exec(path)
    if (ac) {
      const info = await adsbdb.aircraft(ac[1].toLowerCase())
      // Upstream failure: 503 so the client retries instead of caching "unknown" for the session.
      if (transientResults.has(info)) return json(info, 503, { 'cache-control': 'no-store' })
      return json(info, 200, { 'cache-control': 'public, max-age=86400' })
    }

    const tr = /^\/api\/track\/([0-9a-fA-F]{6})$/.exec(path)
    if (tr) {
      const id = tr[1].toLowerCase()
      const r = await (wantsOpenSky(env) ? openSky(env).getTrack(id) : traces.getTrack(id))
      return json(r.body, r.status, { 'cache-control': 'no-store' })
    }

    const rt = /^\/api\/route\/([A-Za-z0-9]{2,10})$/.exec(path)
    if (rt) {
      return json(await adsbdb.route(rt[1].toUpperCase()), 200, {
        'cache-control': 'public, max-age=21600',
      })
    }

    const mt = /^\/api\/metar\/([A-Za-z0-9]{3,4})$/.exec(path)
    if (mt) {
      return json(await metars.get(mt[1].toUpperCase()), 200, {
        'cache-control': 'public, max-age=300',
      })
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
