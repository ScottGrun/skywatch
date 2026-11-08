import { classFromCategory } from '../core/aircraftClass.ts'
import { airlineFromCallsign } from '../core/airlines.ts'
import { classify, etaMinutes, phase, type ClassifyInput } from '../core/classify.ts'
import { Track, type Report } from '../core/deadReckon.ts'
import { FixTrail } from '../core/fixTrail.ts'
import {
  FPM_PER_MS,
  FT_PER_M,
  KM_PER_NM,
  KT_PER_MS,
  statesBbox,
  toLocal,
  type LocalKm,
} from '../core/geo.ts'
import type { Aircraft, Airport, FeedStatus, TrafficSource } from '../types.ts'
import { createAircraftDb } from './aircraftDb.ts'
import { createEnricher } from './enrich.ts'
import { createRouteStore } from './routeStore.ts'
import { plausibleRoute } from '../core/routeCheck.ts'
import type { LatLon } from '../core/geo.ts'

const LAT_PAD = 1.5
const LON_PAD = 2
const LOST_MS = 60_000
const MAX_BACKOFF_MS = 60_000
const DEFAULT_POLL_MS = 8000
const FETCH_TIMEOUT_MS = 10_000

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
  fixes: FixTrail
  /** Persistent output object, mutated in place by `fill`. */
  view?: Aircraft
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

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

let sharedEnricher: ReturnType<typeof createEnricher> | null = null

export function createTraffic(airport: Airport, opts: TrafficOptions = {}): TrafficHandle {
  const fetchFn = opts.fetch ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init))
  const now = opts.now ?? Date.now
  const enricher = opts.fetch
    ? createEnricher(opts.fetch, now)
    : (sharedEnricher ??= createEnricher(
        fetchFn,
        now,
        createAircraftDb(fetchFn),
        createRouteStore(safeStorage(), now),
      ))
  const codes = { icao: airport.icao, iata: airport.iata }
  const bbox = new URLSearchParams(
    Object.entries(statesBbox(airport, LAT_PAD, LON_PAD)).map(([k, v]) => [k, String(v)]),
  )

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
    if (failures >= 1) return 'delayed' // last fetch failed or timed out; last data stays on screen
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
      const loc = toLocal(airport, s.lat, s.lon)
      if (!e) {
        const fixes = new FixTrail()
        if (!s.onGround) fixes.push(loc.e, loc.n, report.altFt, t, report.gsKt)
        listDirty = true
        entries.set(s.icao24, {
          id: s.icao24,
          callsign: s.callsign,
          emitterCat: s.category,
          feedType: s.t,
          feedReg: s.r,
          track: new Track(report),
          fixes,
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
          // Outliers (MLAT jumps, stale or out-of-order reports) neither enter the trail nor move the aircraft.
          const res = s.onGround
            ? (e.fixes.clear(), 'accepted')
            : e.fixes.push(loc.e, loc.n, report.altFt, t, report.gsKt)
          if (res === 'accepted') {
            e.track.update(report)
            e.reportMs = t
          }
        }
      }
      enricher.request(s.icao24, e?.callsign ?? s.callsign, {
        typeCode: s.t,
        registration: s.r,
      })
    }
    for (const [id, e] of entries) {
      if (t - e.seenMs > LOST_MS) {
        entries.delete(id)
        listDirty = true
      }
    }
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
      const res = await fetchFn(`/api/states?${bbox}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
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

  // Rebuilt only when aircraft appear/disappear; per frame we just refresh each persistent object.
  const list: Aircraft[] = []
  let listDirty = true
  const loc: LocalKm = { e: 0, n: 0 }
  const input: ClassifyInput = {
    e: 0,
    n: 0,
    distNm: 0,
    altFt: 0,
    gsKt: 0,
    trackDeg: 0,
    vsFpm: 0,
    onGround: false,
  }

  /** Dead-reckons `e` to `nowMs` into its persistent Aircraft object. */
  function fill(e: Entry, nowMs: number): Aircraft {
    const p = e.track.at(nowMs)
    const r = e.track.latest
    toLocal(airport, p.lat, p.lon, loc)
    const distNm = Math.hypot(loc.e, loc.n) / KM_PER_NM
    const meta = enricher.aircraft(e.id)
    const route = enricher.route(e.callsign)
    const ok =
      !route ||
      !opts.locate ||
      plausibleRoute(p, opts.locate(route.origin), opts.locate(route.dest))
    const origin = ok ? (route?.origin ?? '') : ''
    const dest = ok ? (route?.dest ?? '') : ''
    input.e = loc.e
    input.n = loc.n
    input.distNm = distNm
    input.altFt = r.onGround ? 0 : Math.max(0, p.altFt - airport.elevationFt)
    input.gsKt = r.gsKt
    input.trackDeg = r.trackDeg
    input.vsFpm = r.vsFpm
    input.onGround = r.onGround
    input.origin = origin
    input.dest = dest
    const category = classify(input, codes)
    const a = (e.view ??= {} as Aircraft)
    a.id = e.id
    a.callsign = e.callsign
    a.lat = p.lat
    a.lon = p.lon
    a.e = loc.e
    a.n = loc.n
    a.altFt = p.altFt
    a.gsKt = r.gsKt
    a.trackDeg = r.trackDeg
    a.vsFpm = r.vsFpm
    a.onGround = r.onGround
    a.distNm = distNm
    a.category = category
    a.phase = phase(category, input)
    a.typeCode = meta?.typeCode || e.feedType || ''
    a.aircraftClass =
      meta && meta.aircraftClass !== 'unknown'
        ? meta.aircraftClass
        : classFromCategory(e.emitterCat)
    a.registration = e.feedReg || meta?.registration || undefined
    a.airline = airlineFromCallsign(e.callsign) || meta?.operator || ''
    a.origin = origin
    a.dest = dest
    a.etaMin = etaMinutes(category, input)
    a.lastSeenMs = e.reportMs
    a.fixes = e.fixes
    return a
  }

  function live(nowMs: number): readonly Aircraft[] {
    for (const [id, e] of entries) {
      if (nowMs - e.seenMs > LOST_MS) {
        entries.delete(id)
        listDirty = true
      }
    }
    if (listDirty) {
      list.length = 0
      for (const e of entries.values()) list.push(fill(e, nowMs))
      listDirty = false
    } else {
      for (const e of entries.values()) fill(e, nowMs)
    }
    return list
  }

  return {
    live,
    snapshot(nowMs: number): Aircraft[] {
      // Fresh copies: React state and tests may hold these across frames.
      return live(nowMs).map((a) => ({ ...a }))
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
