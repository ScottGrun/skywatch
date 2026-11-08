import type { Aircraft, Airport, FeedStatus, RadarStatus, Theme } from '../types.ts'
import { ThemeToggle } from './ThemeToggle.tsx'
import type { FilterState } from '../core/filter.ts'
import { AirportSearch } from './AirportSearch.tsx'
import { FilterDropdown } from './FilterDropdown.tsx'
import { WeatherDropdown } from './WeatherDropdown.tsx'
import { Clock } from './Clock.tsx'
import { LiveStatus } from './LiveStatus.tsx'
import { WeatherLine } from './WeatherLine.tsx'
import { fmtCoord } from './format.ts'

interface Props {
  airport: Airport | null
  airports: Airport[]
  status: FeedStatus
  source?: string | null
  onPick: (a: Airport) => void
  filter: FilterState
  aircraft: Aircraft[]
  onFilter: (f: FilterState) => void
  onHome: () => void
  theme: Theme
  onTheme: () => void
  radarOn: boolean
  radar: RadarStatus
  radarOpacity: number
  onRadar: (on: boolean) => void
  onRadarOpacity: (a: number) => void
}

export function TopBar({
  airport,
  airports,
  status,
  source,
  onPick,
  filter,
  aircraft,
  onFilter,
  onHome,
  theme,
  onTheme,
  radarOn,
  radar,
  radarOpacity,
  onRadar,
  onRadarOpacity,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="logo">
          <i />
          SkyWatch
        </div>
        <AirportSearch airports={airports} onPick={onPick} />
        <FilterDropdown filter={filter} aircraft={aircraft} onChange={onFilter} />
        <WeatherDropdown
          radarOn={radarOn}
          radar={radar}
          opacity={radarOpacity}
          onRadar={onRadar}
          onOpacity={onRadarOpacity}
        />
      </div>
      <div className="topbar-right">
        {airport && (
          <div className="apt-col">
            <button type="button" className="apt" title="Back to airport" onClick={onHome}>
              <div className="apt-name">{airport.name}</div>
              <div className="apt-sub">
                {airport.icao} · {fmtCoord(airport.lat, airport.lon)}
              </div>
            </button>
            <WeatherLine icao={airport.icao} />
          </div>
        )}
        <div className="topbar-live">
          <LiveStatus status={status} source={source} />
          <Clock />
          <ThemeToggle theme={theme} onToggle={onTheme} />
        </div>
      </div>
    </header>
  )
}
