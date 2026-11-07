import { useEffect, useState } from 'react'
import { ownerIfDifferent, type AircraftDetails } from '../core/details.ts'
import { getAircraftDetails } from '../data/details.ts'
import type { Aircraft } from '../types.ts'
import { AirlineLogo } from './AirlineLogo.tsx'
import { altColor, callsignOf, dash, fmtInt, fmtVsLong, pad3, progress } from './format.ts'

const utcHm = (s: number) => new Date(s * 1000).toISOString().slice(11, 16)

interface Props {
  aircraft: Aircraft | null
  follow: boolean
  /** Track history start (unix s); null = unavailable; undefined = still loading (line hidden). */
  trackStart?: number | null
  onClose: () => void
  onFollow: (on: boolean) => void
}

export function DetailsCard({
  aircraft: a,
  follow,
  trackStart,
  onClose,
  onFollow,
}: Props) {
  const id = a?.id
  const typeCode = a?.typeCode ?? ''
  const [det, setDet] = useState<{ id: string; d: AircraftDetails } | null>(null)
  useEffect(() => {
    if (!id) return
    let live = true
    void getAircraftDetails(id, typeCode).then((d) => live && setDet({ id, d }))
    return () => {
      live = false
    }
  }, [id, typeCode])
  if (!a) return null
  const d = det?.id === a.id ? det.d : null
  const owner = d ? ownerIfDifferent(a.airline, d.owner) : ''
  const color = altColor(a)
  const pct = progress(a) * 100
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
          <div className="d-cs">
            <AirlineLogo callsign={callsignOf(a)} size={22} /> {callsignOf(a)}
          </div>
          <div className="d-sub">
            {dash(a.airline)} · {dash(a.typeCode)}
          </div>
        </div>
        <button className="x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {d?.photo && (
        <figure className="d-photo">
          <img src={d.photo.src} alt={callsignOf(a)} loading="lazy" />
          <figcaption>
            <a href={d.photo.link} target="_blank" rel="noopener noreferrer">
              {d.photo.credit}
            </a>
          </figcaption>
        </figure>
      )}
      {(d?.fullType || owner) && (
        <div className="d-type">
          {d?.fullType && <b>{d.fullType}</b>}
          {owner && <span>Operated by {owner}</span>}
        </div>
      )}
      <div>
        <div className="d-route">
          <span>{dash(a.origin)}</span>
          <span>{dash(a.dest)}</span>
        </div>
        <div className="bar">
          <i style={{ width: `${pct}%`, background: color }} />
          <svg
            className="bar-plane"
            style={{ left: `${pct}%`, color }}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"
              transform="rotate(90 12 12)"
            />
          </svg>
        </div>
      </div>
      <div className="stats">
        {stats.map(([k, v, c]) => (
          <div key={k}>
            <span className="label">{k}</span>
            <b style={c ? { color: c } : undefined}>{v}</b>
          </div>
        ))}
      </div>
      {trackStart !== undefined && (
        <div className="track-note">
          {trackStart === null ? 'TRACK · unavailable' : `TRACK · since ${utcHm(trackStart)} UTC`}
        </div>
      )}
      <button className={'follow' + (follow ? ' on' : '')} onClick={() => onFollow(!follow)}>
        {follow ? 'FOLLOWING · CLICK TO RELEASE' : 'FOLLOW WITH CAMERA'}
      </button>
    </section>
  )
}
