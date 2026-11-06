import { useCallback, useEffect, useRef, useState } from 'react'
import type { Aircraft, Airport, FeedStatus, FlightScene, ViewPreset } from './types.ts'
import { loadAirports } from './data/airports.ts'
import { createTraffic, type TrafficHandle } from './data/traffic.ts'
import { createFlightScene, mapAttribution } from './scene'
import { Attribution } from './ui/Attribution.tsx'
import { DetailsCard } from './ui/DetailsCard.tsx'
import { Legend } from './ui/Legend.tsx'
import { TopBar } from './ui/TopBar.tsx'
import { TrafficList } from './ui/TrafficList.tsx'
import './ui/ui.css'
import './ui/panels.css'

const STORE_KEY = 'tracon3d.airport'

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
  const [airport, setAirport] = useState<Airport | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [status, setStatus] = useState<FeedStatus>('connecting')
  const [aircraft, setAircraft] = useState<Aircraft[]>([])

  // Scene: created once (StrictMode-safe via cleanup).
  useEffect(() => {
    const scene = createFlightScene(container.current!)
    sceneRef.current = scene
    const offs = [scene.on('select', setSelectedId), scene.on('follow', setFollow)]
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
    const unsub = traffic.subscribeStatus(setStatus)
    scene?.setAirport(airport)
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

  useEffect(() => sceneRef.current?.select(selectedId), [selectedId])
  useEffect(() => sceneRef.current?.setFollow(follow), [follow])
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

  const selected = aircraft.find((a) => a.id === selectedId) ?? null
  return (
    <div className="app">
      <div className="scene" ref={container} />
      <TopBar airport={airport} airports={airports} status={status} onPick={pickAirport} />
      <TrafficList aircraft={aircraft} selectedId={selectedId} onSelect={onListSelect} />
      <DetailsCard
        aircraft={selected}
        airportCode={airport ? airport.iata || airport.icao : ''}
        follow={follow}
        onClose={() => setSelectedId(null)}
        onFollow={setFollow}
      />
      <Legend onView={onView} />
      <Attribution text={mapAttribution()} />
    </div>
  )
}
