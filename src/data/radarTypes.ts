import type { LatLon } from '../core/geo.ts'

export interface RadarJob {
  id: number
  /** Level II files (raw or gzip) of nearby radars; merged per voxel by max. */
  volumes: ArrayBuffer[]
  /** Grid center (the selected airport). */
  center: LatLon
}

export interface RadarResult {
  id: number
  grid: Uint8Array
  /** Site ids, one per merged volume. */
  sites: string[]
  /** Volume scan start, ms since epoch. */
  timeMs: number
  decodeMs: number
  gridMs: number
}

export interface RadarError {
  id: number
  error: string
}
