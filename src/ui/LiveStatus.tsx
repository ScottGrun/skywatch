import type { FeedStatus } from '../types.ts'

const LIVE_LABEL: Record<string, string> = {
  adsblol: 'LIVE · ADSB.LOL',
  opensky: 'LIVE · OPENSKY ADS-B',
}

const MAP: Record<FeedStatus, [string, string]> = {
  live: ['#2ff0c0', 'LIVE'],
  delayed: ['#ffb020', 'DELAYED'],
  offline: ['#ff4d4d', 'OFFLINE'],
  connecting: ['#8a98a6', 'CONNECTING'],
}

export function LiveStatus({ status, source }: { status: FeedStatus; source?: string | null }) {
  const [color, base] = MAP[status]
  const text = status === 'live' ? (LIVE_LABEL[source ?? ''] ?? 'LIVE · ADS-B') : base
  return (
    <span className="live" style={{ color }}>
      <i style={{ background: color, boxShadow: `0 0 0 3px ${color}33` }} />
      {text}
    </span>
  )
}
