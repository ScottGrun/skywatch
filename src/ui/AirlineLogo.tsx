import { useSyncExternalStore } from 'react'
import { logoEpoch, logoUrl, subscribeLogos } from '../data/logos.ts'

/** Small airline logo for a callsign; renders nothing when logos are off or not baked. */
export function AirlineLogo({ callsign, size = 14 }: { callsign: string; size?: number }) {
  useSyncExternalStore(subscribeLogos, logoEpoch)
  const url = logoUrl(callsign)
  if (!url) return null
  return (
    <img
      className="alogo"
      src={url}
      width={size}
      height={size}
      alt=""
      decoding="async"
      style={{ width: size, height: size }}
    />
  )
}
