import { memo } from 'react'
import type { Aircraft } from '../types.ts'
import { AirlineLogo } from './AirlineLogo.tsx'
import { altColor, callsignOf, dash, fmtAlt, fmtVsShort } from './format.ts'

interface Props {
  a: Aircraft
  selected: boolean
  /** Called with the aircraft id, or null to deselect when this row is already selected. Keep it stable. */
  onSelect: (id: string | null) => void
  /** Second-line text; defaults to "origin → dest". */
  route?: string
}

/** One aircraft row, shared by the TRAFFIC and ARRIVALS tabs. */
export const TrafficRow = memo(function TrafficRow({ a, selected, onSelect, route }: Props) {
  return (
    <div
      className={'row' + (selected ? ' sel' : '')}
      onClick={() => onSelect(selected ? null : a.id)}
    >
      <div>
        <div>
          <AirlineLogo callsign={callsignOf(a)} /> <b className="cs">{callsignOf(a)}</b>{' '}
          <span className="ty">{dash(a.typeCode)}</span>
        </div>
        <div className="rt">{route ?? `${dash(a.origin)} → ${dash(a.dest)}`}</div>
      </div>
      <div className="alt">
        <b style={{ color: altColor(a) }}>{fmtAlt(a)}</b>
        <div className="ty">{fmtVsShort(a.vsFpm)}</div>
      </div>
    </div>
  )
})
