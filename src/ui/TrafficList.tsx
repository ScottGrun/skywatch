import { useMemo } from 'react'
import type { Aircraft } from '../types.ts'
import { altColor, callsignOf, dash, fmtAlt, fmtVsShort } from './format.ts'

interface Props {
  aircraft: Aircraft[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function TrafficList({ aircraft, selectedId, onSelect }: Props) {
  const sorted = useMemo(() => [...aircraft].sort((a, b) => b.altFt - a.altFt), [aircraft])
  const count = (c: string) => aircraft.filter((a) => a.category === c).length
  return (
    <aside className="panel traffic">
      <div className="traffic-head">
        <span className="label">TRAFFIC</span>
        <span className="traffic-n">{aircraft.length} aircraft</span>
      </div>
      <div className="counts">
        {(['ARR', 'DEP', 'OVR'] as const).map((c) => (
          <div key={c}>
            <span className="label">{c}</span>
            <b>{count(c)}</b>
          </div>
        ))}
      </div>
      <div className="rows">
        {sorted.map((a) => (
          <div
            key={a.id}
            className={'row' + (a.id === selectedId ? ' sel' : '')}
            onClick={() => onSelect(a.id === selectedId ? null : a.id)}
          >
            <div>
              <div>
                <b className="cs">{callsignOf(a)}</b> <span className="ty">{dash(a.typeCode)}</span>
              </div>
              <div className="rt">
                {dash(a.origin)} → {dash(a.dest)}
              </div>
            </div>
            <div className="alt">
              <b style={{ color: altColor(a) }}>{fmtAlt(a)}</b>
              <div className="ty">{fmtVsShort(a.vsFpm)}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
