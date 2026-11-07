/** ICAO airline code from a callsign: 3 letters followed by a digit ("ASA1367" -> "ASA"); else "". */
export function airlineCode(callsign: string): string {
  const m = /^([A-Z]{3})\d/.exec(callsign.trim().toUpperCase())
  return m ? m[1] : ''
}
