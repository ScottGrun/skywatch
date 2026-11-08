import { useMemo, useRef } from 'react'
import { buildArrivals, type ArrivalMemory, type ArrivalRow } from '../core/arrivals.ts'
import type { Aircraft, Airport } from '../types.ts'
import { dash } from './format.ts'
import { TrafficRow } from './TrafficRow.tsx'

interface Props {
  aircraft: Aircraft[]
  airport: Airport | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function rowText(r: ArrivalRow, code: string): string {
  const nm = `${r.a.distNm.toFixed(0)} NM`
  if (r.kind === 'final') return `On final ${r.runway} · ${nm}`
  if (r.kind === 'landed') return `Landed ${code} · ${dash(r.a.origin)}`
  return `${dash(r.a.origin)} → ${code} · ${nm}`
}

export function ArrivalsBoard({ aircraft, airport, selectedId, onSelect }: Props) {
  const memory = useRef<{ airport: Airport | null; m: ArrivalMemory }>({
    airport: null,
    m: new Map(),
  })
  const rows = useMemo(() => {
    if (!airport) return []
    if (memory.current.airport !== airport) memory.current = { airport, m: new Map() }
    const out = buildArrivals(aircraft, airport, memory.current.m, Date.now())
    memory.current.m = out.memory
    return out.rows
  }, [aircraft, airport])
  const code = airport ? airport.iata || airport.icao : ''
  return (
    <div className="rows">
      {rows.length === 0 && <div className="arr-empty">No inbound flights right now</div>}
      {rows.map((r) => (
        <TrafficRow
          key={r.a.id}
          a={r.a}
          selected={r.a.id === selectedId}
          onSelect={onSelect}
          route={rowText(r, code)}
        />
      ))}
    </div>
  )
}
