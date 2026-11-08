import type { LatLon } from '../core/geo.ts'

export interface RadarJob {
  id: number
  bytes: ArrayBuffer
  /** Grid center (the selected airport). */
  center: LatLon
}

export interface RadarResult {
  id: number
  grid: Uint8Array
  site: string
  /** Volume scan start, ms since epoch. */
  timeMs: number
  decodeMs: number
  gridMs: number
}

export interface RadarError {
  id: number
  error: string
}
