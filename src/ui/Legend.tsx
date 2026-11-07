import type { AirspaceStatus, ViewPreset } from '../types.ts'

const VIEWS: [ViewPreset, string][] = [
  ['overview', 'OVERVIEW'],
  ['top', 'TOP'],
  ['side', 'SIDE'],
]

interface Props {
  onView: (v: ViewPreset) => void
  airspaceOn: boolean
  airspace: AirspaceStatus
  onAirspace: (on: boolean) => void
  terrainOn: boolean
  onTerrain: (on: boolean) => void
}

export function Legend({ onView, airspaceOn, airspace, onAirspace, terrainOn, onTerrain }: Props) {
  const note = airspaceOn ? (airspace.state === 'loading' ? 'LOADING…' : airspace.note) : ''
  return (
    <section className="panel legend">
      <div className="legend-head">
        <span className="label">ALTITUDE · FT</span>
        <span className="label">VERTICAL ×3</span>
      </div>
      <div className="grad" />
      <div className="ticks">
        {['0', '10k', '20k', '30k', '40k'].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="views">
        {VIEWS.map(([v, label]) => (
          <button key={v} onClick={() => onView(v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="airspace-row">
        <button
          className={terrainOn ? 'on' : ''}
          aria-pressed={terrainOn}
          onClick={() => onTerrain(!terrainOn)}
        >
          TERRAIN
        </button>
        <button
          className={airspaceOn ? 'on' : ''}
          aria-pressed={airspaceOn}
          onClick={() => onAirspace(!airspaceOn)}
        >
          AIRSPACE
        </button>
        {note && <span className="airspace-note">{note}</span>}
      </div>
    </section>
  )
}
