import { useMemo } from 'react'
import { arrivalsBoard } from '../core/arrivals.ts'
import type { Aircraft, Airport } from '../types.ts'
import { dash } from './format.ts'
import { TrafficRow } from './TrafficRow.tsx'

interface Props {
  aircraft: Aircraft[]
  airport: Airport | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function ArrivalsBoard({ aircraft, airport, selectedId, onSelect }: Props) {
  const rows = useMemo(() => (airport ? arrivalsBoard(aircraft, airport) : []), [aircraft, airport])
  const code = airport ? airport.iata || airport.icao : ''
  return (
    <div className="rows">
      {rows.length === 0 && <div className="arr-empty">No inbound flights with a known route</div>}
      {rows.map((a) => (
        <TrafficRow
          key={a.id}
          a={a}
          selected={a.id === selectedId}
          onSelect={() => onSelect(a.id === selectedId ? null : a.id)}
          route={`${dash(a.origin)} → ${code} · ${a.distNm.toFixed(0)} NM`}
        />
      ))}
    </div>
  )
}
