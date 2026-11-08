import { classFromCategory } from '../core/aircraftClass.ts'
import { airlineFromCallsign } from '../core/airlines.ts'
import { classify, etaMinutes, phase } from '../core/classify.ts'
import { Track, type Report } from '../core/deadReckon.ts'
import { FPM_PER_MS, FT_PER_M, KM_PER_NM, KT_PER_MS, toLocal } from '../core/geo.ts'
import type { Aircraft, Airport, FeedStatus, TrafficSource } from '../types.ts'
import { createAircraftDb } from './aircraftDb.ts'
import { createEnricher } from './enrich.ts'
import { plausibleRoute } from '../core/routeCheck.ts'
import type { LatLon } from '../core/geo.ts'

const LAT_PAD = 1.5
const LON_PAD = 2
const LOST_MS = 60_000
const MAX_BACKOFF_MS = 60_000
const DEFAULT_POLL_MS = 10_000

interface StateRow {
  icao24: string
  callsign: string
  lat: number
  lon: number
  altM: number
  velMs: number
  track: number
  vrMs: number
  onGround: boolean
  category?: number | string
  t?: string // ICAO type from the feed
  r?: string // registration from the feed
}
interface StatesBody {
  time: number
  states: StateRow[]
  pollMs?: number
  source?: string
}

interface Entry {
  id: string
  callsign: string
  emitterCat?: number | string
  feedType?: string
  feedReg?: string
  track: Track
  seenMs: number // last time present in a response
  reportMs: number // last time the position actually changed
}

export interface TrafficOptions {
  /** Injectable for tests; defaults to global fetch and a shared enrichment cache. */
  fetch?: typeof fetch
  now?: () => number
  /** Airport coordinates by IATA/ICAO code; routes that don't fit the aircraft's position are dropped. */
  locate?: (code: string) => LatLon | undefined
}

export type TrafficHandle = TrafficSource & { dispose(): void }

let sharedEnricher: ReturnType<typeof createEnricher> | null = null

export function createTraffic(airport: Airport, opts: TrafficOptions = {}): TrafficHandle {
  const fetchFn = opts.fetch ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init))
  const now = opts.now ?? Date.now
  const enricher = opts.fetch
    ? createEnricher(opts.fetch, now)
    : (sharedEnricher ??= createEnricher(fetchFn, now, createAircraftDb(fetchFn)))
  const codes = { icao: airport.icao, iata: airport.iata }
  const bbox = new URLSearchParams({
    lamin: String(airport.lat - LAT_PAD),
    lomin: String(airport.lon - LON_PAD),
    lamax: String(airport.lat + LAT_PAD),
    lomax: String(airport.lon + LON_PAD),
  })

  const entries = new Map<string, Entry>()
  const listeners = new Set<(s: FeedStatus) => void>()
  let current: FeedStatus = 'connecting'
  let pollMs = DEFAULT_POLL_MS
  let failures = 0
  let lastSuccess = 0
  let lastStale = false
  let source: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let inFlight = false

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

  function computeStatus(): FeedStatus {
    if (failures >= 3) return 'offline'
    if (lastSuccess === 0) return 'connecting'
    if (lastStale || now() - lastSuccess > 2.5 * pollMs) return 'delayed'
    return 'live'
  }
  function refreshStatus(): FeedStatus {
    const s = computeStatus()
    if (s !== current) {
      current = s
      listeners.forEach((fn) => fn(s))
    }
    return current
  }

  function ingest(body: StatesBody): void {
    const t = now()
    for (const s of body.states) {
      const report: Report = {
        lat: s.lat,
        lon: s.lon,
        altFt: s.onGround ? 0 : s.altM * FT_PER_M,
        gsKt: s.velMs * KT_PER_MS,
        trackDeg: s.track,
        vsFpm: s.vrMs * FPM_PER_MS,
        onGround: s.onGround,
        t,
      }
      const e = entries.get(s.icao24)
      if (!e) {
        entries.set(s.icao24, {
          id: s.icao24,
          callsign: s.callsign,
          emitterCat: s.category,
          feedType: s.t,
          feedReg: s.r,
          track: new Track(report),
          seenMs: t,
          reportMs: t,
        })
      } else {
        const prev = e.track.latest
        e.seenMs = t
        e.callsign = s.callsign || e.callsign
        e.emitterCat = s.category ?? e.emitterCat
        e.feedType = s.t ?? e.feedType
        e.feedReg = s.r ?? e.feedReg
        // OpenSky repeats stale vectors; only restart dead reckoning on a real change.
        if (
          prev.lat !== report.lat ||
          prev.lon !== report.lon ||
          prev.trackDeg !== report.trackDeg
        ) {
          e.track.update(report)
          e.reportMs = t
        }
      }
      enricher.request(s.icao24, e?.callsign ?? s.callsign, {
        typeCode: s.t,
        registration: s.r,
      })
    }
    for (const [id, e] of entries) if (t - e.seenMs > LOST_MS) entries.delete(id)
  }

  function schedule(ms: number): void {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(poll, ms)
  }

  async function poll(): Promise<void> {
    timer = null
    if (disposed || inFlight) return
    if (hidden()) return // resumes from the visibilitychange handler
    inFlight = true
    try {
      const res = await fetchFn(`/api/states?${bbox}`)
      if (disposed) return
      if (!res.ok) throw new Error(`states ${res.status}`)
      const body = (await res.json()) as StatesBody
      if (disposed) return
      failures = 0
      lastSuccess = now()
      lastStale = res.headers.get('x-stale') === '1'
      source = body.source ?? source
      pollMs = Math.min(60_000, Math.max(3000, body.pollMs ?? DEFAULT_POLL_MS))
      ingest(body)
      refreshStatus()
      schedule(pollMs)
    } catch {
      if (disposed) return
      failures++
      refreshStatus()
      schedule(Math.min(MAX_BACKOFF_MS, pollMs * 2 ** failures))
    } finally {
      inFlight = false
    }
  }

  function onVisibility(): void {
    if (disposed) return
    if (hidden()) {
      if (timer) clearTimeout(timer)
      timer = null
    } else if (!timer && !inFlight) {
      schedule(0)
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
  schedule(0)

  return {
    snapshot(nowMs: number): Aircraft[] {
      const out: Aircraft[] = []
      for (const [id, e] of entries) {
        if (nowMs - e.seenMs > LOST_MS) {
          entries.delete(id)
          continue
        }
        const p = e.track.at(nowMs)
        const r = e.track.latest
        const { e: east, n: north } = toLocal(airport, p.lat, p.lon)
        const distNm = Math.hypot(east, north) / KM_PER_NM
        const meta = enricher.aircraft(id)
        const route = enricher.route(e.callsign)
        const ok =
          !route ||
          !opts.locate ||
          plausibleRoute(p, opts.locate(route.origin), opts.locate(route.dest))
        const origin = ok ? (route?.origin ?? '') : ''
        const dest = ok ? (route?.dest ?? '') : ''
        const input = {
          e: east,
          n: north,
          distNm,
          altFt: r.onGround ? 0 : Math.max(0, p.altFt - airport.elevationFt),
          gsKt: r.gsKt,
          trackDeg: r.trackDeg,
          vsFpm: r.vsFpm,
          onGround: r.onGround,
          origin,
          dest,
        }
        const category = classify(input, codes)
        out.push({
          id,
          callsign: e.callsign,
          lat: p.lat,
          lon: p.lon,
          e: east,
          n: north,
          altFt: p.altFt,
          gsKt: r.gsKt,
          trackDeg: r.trackDeg,
          vsFpm: r.vsFpm,
          onGround: r.onGround,
          distNm,
          category,
          phase: phase(category, input),
          typeCode: meta?.typeCode || e.feedType || '',
          aircraftClass:
            meta && meta.aircraftClass !== 'unknown'
              ? meta.aircraftClass
              : classFromCategory(e.emitterCat),
          registration: e.feedReg || meta?.registration || undefined,
          airline: airlineFromCallsign(e.callsign) || meta?.operator || '',
          origin,
          dest,
          etaMin: etaMinutes(category, input),
          lastSeenMs: e.reportMs,
        })
      }
      return out
    },
    status: refreshStatus,
    source: () => source,
    subscribeStatus(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
      listeners.clear()
      entries.clear()
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', onVisibility)
      if (opts.fetch) enricher.dispose()
    },
  }
}
