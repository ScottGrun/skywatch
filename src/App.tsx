import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Aircraft,
  Airport,
  AirspaceStatus,
  FeedStatus,
  FlightScene,
  Theme,
  ViewPreset,
} from './types.ts'
import { nearbyAirports } from './core/nearby.ts'
import { loadAirports } from './data/airports.ts'
import { watchTrack } from './data/track.ts'
import { createTraffic, type TrafficHandle } from './data/traffic.ts'
import { createFlightScene, mapAttribution } from './scene'
import {
  FILTER_STORE_KEY,
  buildPredicate,
  filterToParams,
  loadFilter,
  serializeFilter,
  type FilterState,
} from './core/filter.ts'
import { Attribution } from './ui/Attribution.tsx'
import { DetailsCard } from './ui/DetailsCard.tsx'
import { clampVScale } from './scene/vertical.ts'
import { VSCALE_DEFAULT } from './scene/constants.ts'
import { applyTheme, initialTheme, saveTheme } from './data/theme.ts'
import { loadLogoIndex, logosEnabled } from './data/logos.ts'
import { Legend } from './ui/Legend.tsx'
import { TopBar } from './ui/TopBar.tsx'
import { TrafficList } from './ui/TrafficList.tsx'
import './ui/ui.css'
import './ui/panels.css'

const STORE_KEY = 'tracon3d.airport'
const AIRSPACE_KEY = 'tracon3d.airspace'
const AIRSPACE_OFF: AirspaceStatus = { state: 'off', attribution: '', note: '' }

function initialAirport(list: Airport[]): Airport | undefined {
  const find = (c: string | null) => {
    const code = (c ?? '').trim().toUpperCase()
    return code
      ? (list.find((a) => a.icao === code) ?? list.find((a) => a.iata === code))
      : undefined
  }
  const fromUrl = new URLSearchParams(location.search).get('apt')
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORE_KEY)
  } catch {
    /* storage unavailable */
  }
  return find(fromUrl) ?? find(stored) ?? find('CYVR') ?? list[0]
}

export function App() {
  const container = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<FlightScene | null>(null)
  const trafficRef = useRef<TrafficHandle | null>(null)
  const [airports, setAirports] = useState<Airport[]>([])
  const airportsRef = useRef<Airport[]>([])
  airportsRef.current = airports
  const [airport, setAirport] = useState<Airport | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [trackInfo, setTrackInfo] = useState<{ id: string; start: number | null } | null>(null)
  const [status, setStatus] = useState<FeedStatus>('connecting')
  const [source, setSource] = useState<string | null>(null)
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [filter, setFilter] = useState<FilterState>(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(FILTER_STORE_KEY)
    } catch {
      /* storage unavailable */
    }
    return loadFilter(location.search, stored)
  })
  const [airspaceOn, setAirspaceOn] = useState(() => {
    try {
      return localStorage.getItem(AIRSPACE_KEY) === '1'
    } catch {
      return false
    }
  })
  // The scene persists this itself (same key); App only mirrors it for the button.
  const [terrainOn, setTerrainOn] = useState(() => {
    try {
      return localStorage.getItem('tracon3d.terrain') !== '0'
    } catch {
      return true
    }
  })
  // src/data/logos persists this (via scene.setLogos); App mirrors it for the button.
  const [logosOn, setLogosOn] = useState(logosEnabled)
  useEffect(() => {
    void loadLogoIndex()
  }, [])
  // The scene persists this itself (same key); App mirrors it for the button.
  const [lightsOn, setLightsOn] = useState(() => {
    try {
      return localStorage.getItem('tracon3d.lights') !== '0'
    } catch {
      return true
    }
  })
  // The scene persists this itself (same key); App mirrors it for the slider.
  const [vscale, setVscale] = useState(() => {
    try {
      return clampVScale(Number(localStorage.getItem('tracon3d.vscale') ?? VSCALE_DEFAULT))
    } catch {
      return VSCALE_DEFAULT
    }
  })
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [airspace, setAirspaceStatus] = useState<AirspaceStatus>(AIRSPACE_OFF)
  const pred = useMemo(() => buildPredicate(filter), [filter])

  // Scene: created once (StrictMode-safe via cleanup).
  useEffect(() => {
    const scene = createFlightScene(container.current!)
    sceneRef.current = scene
    const offs = [
      scene.on('select', setSelectedId),
      scene.on('follow', setFollow),
      scene.on('airspace', setAirspaceStatus),
    ]
    return () => {
      offs.forEach((off) => off())
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    let dead = false
    loadAirports()
      .then((list) => {
        if (dead) return
        setAirports(list)
        setAirport(initialAirport(list) ?? null)
      })
      .catch(() => setStatus('offline'))
    return () => {
      dead = true
    }
  }, [])

  // Airport change: new traffic source, scene rebuild, URL + storage.
  useEffect(() => {
    if (!airport) return
    const scene = sceneRef.current
    const traffic = createTraffic(airport)
    trafficRef.current = traffic
    setStatus(traffic.status())
    setSource(null)
    const unsub = traffic.subscribeStatus((s) => {
      setStatus(s)
      setSource(traffic.source?.() ?? null)
    })
    scene?.setAirport(airport, nearbyAirports(airportsRef.current, airport))
    scene?.setTraffic(traffic)
    setAircraft(traffic.snapshot(Date.now()))
    const url = new URL(location.href)
    url.searchParams.set('apt', airport.icao)
    history.replaceState(null, '', url)
    try {
      localStorage.setItem(STORE_KEY, airport.icao)
    } catch {
      /* ignore */
    }
    return () => {
      unsub()
      traffic.dispose()
      if (trafficRef.current === traffic) trafficRef.current = null
    }
  }, [airport])

  // ~2 Hz UI refresh; paused while the tab is hidden.
  useEffect(() => {
    const tick = () => {
      const t = trafficRef.current
      if (!t || document.hidden) return
      const list = t.snapshot(Date.now())
      setAircraft(list)
      setSelectedId((id) => (id && !list.some((a) => a.id === id) ? null : id))
    }
    const id = setInterval(tick, 500)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const visible = useMemo(() => (pred ? aircraft.filter(pred) : aircraft), [aircraft, pred])

  // Filter: scene predicate + URL + storage; drop selection if it got filtered out.
  useEffect(() => {
    sceneRef.current?.setFilter(pred)
    const url = new URL(location.href)
    filterToParams(filter, url.searchParams)
    history.replaceState(null, '', url)
    try {
      localStorage.setItem(FILTER_STORE_KEY, serializeFilter(filter))
    } catch {
      /* ignore */
    }
  }, [filter, pred])
  useEffect(() => {
    if (selectedId && !visible.some((a) => a.id === selectedId)) setSelectedId(null)
  }, [visible, selectedId])

  useEffect(() => sceneRef.current?.select(selectedId), [selectedId])
  useEffect(() => sceneRef.current?.setFollow(follow), [follow])
  useEffect(() => {
    sceneRef.current?.setAirspace(airspaceOn)
    try {
      localStorage.setItem(AIRSPACE_KEY, airspaceOn ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [airspaceOn])
  useEffect(() => {
    applyTheme(theme)
    sceneRef.current?.setTheme(theme)
  }, [theme])
  const onTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    saveTheme(next)
    setTheme(next)
  }, [theme])
  useEffect(() => sceneRef.current?.setTerrain(terrainOn), [terrainOn])
  useEffect(() => sceneRef.current?.setLogos(logosOn), [logosOn])
  useEffect(() => sceneRef.current?.setLights(lightsOn), [lightsOn])
  useEffect(() => sceneRef.current?.setVerticalScale(vscale), [vscale])
  // Real track history for the selected aircraft (refetched every 60 s while selected).
  useEffect(() => {
    if (!selectedId) return
    const id = selectedId
    const stop = watchTrack(id, (d) => {
      sceneRef.current?.setHistory(id, d ? d.path : null)
      setTrackInfo({ id, start: d ? d.path[0].t : null })
    })
    return () => {
      stop()
      sceneRef.current?.setHistory(id, null)
    }
  }, [selectedId, airport])
  useEffect(() => {
    if (!selectedId) setFollow(false)
  }, [selectedId])

  const pickAirport = useCallback((a: Airport) => {
    setSelectedId(null)
    setFollow(false)
    setAirport(a)
  }, [])
  const onListSelect = useCallback((id: string | null) => {
    setSelectedId(id)
    setFollow(id !== null)
  }, [])
  const onView = useCallback((v: ViewPreset) => sceneRef.current?.view(v), [])
  const onHome = useCallback(() => sceneRef.current?.home(), [])

  const attribution = [
    mapAttribution(),
    source === 'adsblol' ? 'Data: adsb.lol (ODbL)' : '',
    airspaceOn && airspace.state === 'ok' ? airspace.attribution : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const selected = visible.find((a) => a.id === selectedId) ?? null
  return (
    <div className="app">
      <div className="scene" ref={container} />
      <TopBar
        airport={airport}
        airports={airports}
        status={status}
        source={source}
        onPick={pickAirport}
        filter={filter}
        aircraft={aircraft}
        onFilter={setFilter}
        onHome={onHome}
        theme={theme}
        onTheme={onTheme}
      />
      <TrafficList
        aircraft={visible}
        total={aircraft.length}
        selectedId={selectedId}
        onSelect={onListSelect}
      />
      <DetailsCard
        aircraft={selected}
        airports={airports}
        follow={follow}
        trackStart={trackInfo?.id === selectedId ? trackInfo.start : undefined}
        onClose={() => setSelectedId(null)}
        onFollow={setFollow}
      />
      <Legend
        onView={onView}
        airspaceOn={airspaceOn}
        airspace={airspace}
        onAirspace={setAirspaceOn}
        terrainOn={terrainOn}
        onTerrain={setTerrainOn}
        logosOn={logosOn}
        onLogos={setLogosOn}
        theme={theme}
        lightsOn={lightsOn}
        onLights={setLightsOn}
        vscale={vscale}
        onVscale={setVscale}
      />
      <Attribution text={attribution} />
    </div>
  )
}
