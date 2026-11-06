import type { Airport, FeedStatus } from '../types.ts'
import { AirportSearch } from './AirportSearch.tsx'
import { Clock } from './Clock.tsx'
import { LiveStatus } from './LiveStatus.tsx'
import { fmtCoord } from './format.ts'

interface Props {
  airport: Airport | null
  airports: Airport[]
  status: FeedStatus
  onPick: (a: Airport) => void
}

export function TopBar({ airport, airports, status, onPick }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="logo">
          <i />
          TRACON 3D
        </div>
        <AirportSearch airports={airports} onPick={onPick} />
        {airport && (
          <div className="apt">
            <div className="apt-name">{airport.name}</div>
            <div className="apt-sub">
              {airport.icao} · {fmtCoord(airport.lat, airport.lon)}
            </div>
          </div>
        )}
      </div>
      <div className="topbar-right">
        <LiveStatus status={status} />
        <Clock />
      </div>
    </header>
  )
}
