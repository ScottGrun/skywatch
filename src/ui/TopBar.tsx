import type { Aircraft, Airport, FeedStatus } from '../types.ts'
import type { FilterState } from '../core/filter.ts'
import { AirportSearch } from './AirportSearch.tsx'
import { FilterDropdown } from './FilterDropdown.tsx'
import { Clock } from './Clock.tsx'
import { LiveStatus } from './LiveStatus.tsx'
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
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="logo">
          <i />
          TRACON 3D
        </div>
        <AirportSearch airports={airports} onPick={onPick} />
        <FilterDropdown filter={filter} aircraft={aircraft} onChange={onFilter} />
        {airport && (
          <button type="button" className="apt" title="Back to airport" onClick={onHome}>
            <div className="apt-name">{airport.name}</div>
            <div className="apt-sub">
              {airport.icao} · {fmtCoord(airport.lat, airport.lon)}
            </div>
          </button>
        )}
      </div>
      <div className="topbar-right">
        <LiveStatus status={status} source={source} />
        <Clock />
      </div>
    </header>
  )
}
