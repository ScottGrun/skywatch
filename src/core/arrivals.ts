import type { Aircraft, Airport } from '../types.ts'

/** True when the aircraft's real route destination (IATA or ICAO) is this airport. */
export function isInboundTo(a: Aircraft, ap: Pick<Airport, 'iata' | 'icao'>): boolean {
  const d = a.dest.trim().toUpperCase()
  return (
    d !== '' && (d === ap.icao.toUpperCase() || (ap.iata !== '' && d === ap.iata.toUpperCase()))
  )
}

/** Arrivals board rows: airborne aircraft whose looked-up route ends here, nearest first. */
export function arrivalsBoard(list: readonly Aircraft[], ap: Pick<Airport, 'iata' | 'icao'>) {
  return list.filter((a) => !a.onGround && isInboundTo(a, ap)).sort((a, b) => a.distNm - b.distNm)
}
