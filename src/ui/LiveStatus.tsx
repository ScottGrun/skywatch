import type { FeedStatus } from '../types.ts'

const MAP: Record<FeedStatus, [string, string]> = {
  live: ['#2ff0c0', 'LIVE · OPENSKY ADS-B'],
  delayed: ['#ffb020', 'DELAYED'],
  offline: ['#ff4d4d', 'OFFLINE'],
  connecting: ['#8a98a6', 'CONNECTING'],
}

export function LiveStatus({ status }: { status: FeedStatus }) {
  const [color, text] = MAP[status]
  return (
    <span className="live" style={{ color }}>
      <i style={{ background: color, boxShadow: `0 0 0 3px ${color}33` }} />
      {text}
    </span>
  )
}
