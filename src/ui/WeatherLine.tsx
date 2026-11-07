import { useEffect, useState } from 'react'
import { fetchMetar } from '../data/metar.ts'
import type { Metar } from '../types.ts'

const CAT_COLOR = { VFR: '#2ff0c0', MVFR: '#3cb8ff', IFR: '#ff5ad8', LIFR: '#ff4d4d' }
const REFRESH_MS = 5 * 60_000

export function metarText(m: Metar): string[] {
  const out: string[] = []
  if (m.windKt != null) {
    if (m.windKt < 1) out.push('WIND CALM')
    else {
      const dir = m.windDir == null ? 'VRB' : `${String(Math.round(m.windDir)).padStart(3, '0')}°`
      const g = m.gustKt ? `G${Math.round(m.gustKt)}` : ''
      out.push(`WIND ${dir} ${Math.round(m.windKt)}${g}KT`)
    }
  }
  if (m.visSm != null) out.push(`VIS ${m.visSm}SM`)
  if (m.ceilingFt != null) {
    const c = (m.clouds ?? []).find((x) => x.baseFt === m.ceilingFt)?.cover ?? 'CIG'
    out.push(`${c} ${m.ceilingFt.toLocaleString('en-US')}`)
  } else if (!m.clouds?.length) out.push('SKC')
  if (m.tempC != null) out.push(`${Math.round(m.tempC)}°C`)
  if (m.altimHpa != null) out.push(`${Math.round(m.altimHpa)} hPa`)
  return out
}

interface Props {
  icao: string | null
}

export function WeatherLine({ icao }: Props) {
  const [m, setM] = useState<Metar | null>(null)
  useEffect(() => {
    if (!icao) return
    const ac = new AbortController()
    const load = (): void => {
      void fetchMetar(icao, ac.signal).then((r) => {
        if (ac.signal.aborted) return
        setM(r)
      })
    }
    setM(null)
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      ac.abort()
      clearInterval(id)
    }
  }, [icao])
  if (!m) return null
  const color = m.flightCat ? CAT_COLOR[m.flightCat] : ''
  return (
    <div className="wx" title={m.raw ?? undefined}>
      {m.flightCat && (
        <span className="wx-cat" style={{ color, borderColor: color }}>
          {m.flightCat}
        </span>
      )}
      <span>{metarText(m).join(' · ')}</span>
    </div>
  )
}
