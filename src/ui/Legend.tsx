import type { AirspaceStatus, RadarStatus, Theme, ViewPreset } from '../types.ts'
import { VerticalSlider } from './VerticalSlider.tsx'

const VIEWS: [ViewPreset, string][] = [
  ['overview', 'OVERVIEW'],
  ['top', 'TOP'],
  ['side', 'SIDE'],
  ['airport', 'AIRPORT'],
]

interface Props {
  onView: (v: ViewPreset) => void
  airspaceOn: boolean
  airspace: AirspaceStatus
  onAirspace: (on: boolean) => void
  radarOn: boolean
  radar: RadarStatus
  onRadar: (on: boolean) => void
  terrainOn: boolean
  onTerrain: (on: boolean) => void
  logosOn: boolean
  onLogos: (on: boolean) => void
  theme: Theme
  lightsOn: boolean
  onLights: (on: boolean) => void
  vscale: number
  onVscale: (k: number) => void
}

export function Legend({
  onView,
  airspaceOn,
  airspace,
  onAirspace,
  radarOn,
  radar,
  onRadar,
  terrainOn,
  onTerrain,
  logosOn,
  onLogos,
  theme,
  lightsOn,
  onLights,
  vscale,
  onVscale,
}: Props) {
  const radarNote =
    radarOn && radar.available
      ? radar.state === 'ok'
        ? `Radar ${radar.site} � ${new Date(radar.timeMs).toISOString().slice(11, 16)} UTC`
        : radar.state === 'error'
          ? 'Radar unavailable'
          : 'Radar loading�'
      : ''
  const note = airspaceOn ? (airspace.state === 'loading' ? 'LOADING…' : airspace.note) : ''
  return (
    <section className="panel legend">
      <div className="legend-head">
        <span className="label">ALTITUDE · FT</span>
      </div>
      <div className="grad" />
      <div className="ticks">
        {['0', '10k', '20k', '30k', '40k'].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <VerticalSlider value={vscale} onChange={onVscale} />
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
        <button
          className={logosOn ? 'on' : ''}
          aria-pressed={logosOn}
          onClick={() => onLogos(!logosOn)}
        >
          LOGOS
        </button>
        {radar.available && (
          <button
            className={radarOn ? 'on' : ''}
            aria-pressed={radarOn}
            onClick={() => onRadar(!radarOn)}
          >
            RADAR
          </button>
        )}
        {theme === 'dark' && (
          <button
            className={lightsOn ? 'on' : ''}
            aria-pressed={lightsOn}
            onClick={() => onLights(!lightsOn)}
          >
            LIGHTS
          </button>
        )}
        {note && <span className="airspace-note">{note}</span>}
        {radarNote && <span className="airspace-note">{radarNote}</span>}
      </div>
    </section>
  )
}
