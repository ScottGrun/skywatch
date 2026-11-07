import { useMemo } from 'react'
import { arrivalStatus, arrivalsBoard, fmtEta } from '../core/arrivals.ts'
import type { Aircraft } from '../types.ts'
import { altColor, callsignOf, dash } from './format.ts'
import './arrivals.css'

interface Props {
  aircraft: Aircraft[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function ArrivalsBoard({ aircraft, selectedId, onSelect }: Props) {
  const rows = useMemo(() => arrivalsBoard(aircraft), [aircraft])
  return (
    <div className="rows arrivals">
      <div className="arr-row arr-head">
        <span>FLIGHT</span>
        <span>FROM</span>
        <span>ETA</span>
      </div>
      {rows.length === 0 && <div className="arr-empty">No arrivals right now</div>}
      {rows.map((a) => (
        <div
          key={a.id}
          className={'row arr-row' + (a.id === selectedId ? ' sel' : '')}
          onClick={() => onSelect(a.id === selectedId ? null : a.id)}
        >
          <div className="arr-main">
            <b className="cs">{callsignOf(a)}</b> <span className="ty">{dash(a.typeCode)}</span>
            <div className="rt arr-air">{dash(a.airline)}</div>
          </div>
          <div className="arr-from">{dash(a.origin)}</div>
          <div className="alt">
            <b style={{ color: altColor(a) }}>{fmtEta(a.etaMin)}</b>
            <div className="ty">{arrivalStatus(a.phase)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
