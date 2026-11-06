import type { Aircraft } from '../types.ts'
import { altColor, callsignOf, dash, fmtInt, fmtVsLong, pad3, progress } from './format.ts'

interface Props {
  aircraft: Aircraft | null
  airportCode: string
  follow: boolean
  onClose: () => void
  onFollow: (on: boolean) => void
}

export function DetailsCard({ aircraft: a, airportCode, follow, onClose, onFollow }: Props) {
  if (!a) {
    return (
      <section className="panel details">
        <span className="label">NO AIRCRAFT SELECTED</span>
        <p className="empty">
          Click an aircraft or a list row to see its details and follow it with the camera.
        </p>
      </section>
    )
  }
  const color = altColor(a)
  const eta = a.etaMin == null ? null : Math.max(0, Math.round(a.etaMin))
  const stats: [string, string, string?][] = [
    ['ALTITUDE', a.onGround ? 'GND' : `${fmtInt(a.altFt)} ft`, color],
    ['VERTICAL', fmtVsLong(a.vsFpm)],
    ['GROUND SPEED', `${fmtInt(a.gsKt)} kt`],
    ['HEADING', pad3(a.trackDeg)],
    ['DISTANCE', `${a.distNm.toFixed(1)} NM`],
    ['ICAO24', a.id.toUpperCase()],
  ]
  return (
    <section className="panel details">
      <div className="d-head">
        <div>
          <div className="d-cs">{callsignOf(a)}</div>
          <div className="d-sub">
            {dash(a.airline)} · {dash(a.typeCode)}
          </div>
        </div>
        <button className="x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <span className="chip" style={{ background: color }}>
        {a.phase.toUpperCase()}
      </span>
      <div>
        <div className="d-route">
          <span>{dash(a.origin)}</span>
          <span>{dash(a.dest)}</span>
        </div>
        <div className="bar">
          <i style={{ width: `${progress(a) * 100}%`, background: color }} />
        </div>
        {eta != null && (
          <div className="eta">
            {a.category === 'ARR'
              ? `Touchdown at ${airportCode} in ~${eta} min`
              : `Leaves the ${airportCode} area in ~${eta} min`}
          </div>
        )}
      </div>
      <div className="stats">
        {stats.map(([k, v, c]) => (
          <div key={k}>
            <span className="label">{k}</span>
            <b style={c ? { color: c } : undefined}>{v}</b>
          </div>
        ))}
      </div>
      <button className={'follow' + (follow ? ' on' : '')} onClick={() => onFollow(!follow)}>
        {follow ? 'FOLLOWING · CLICK TO RELEASE' : 'FOLLOW WITH CAMERA'}
      </button>
    </section>
  )
}
