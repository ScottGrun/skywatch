import type { Aircraft } from '../types.ts'
import { distanceNm, type LatLon } from '../core/geo.ts'
import { hexCss, rampHex } from '../core/ramp.ts'

export const dash = (s: string): string => s || '—'
export const callsignOf = (a: Aircraft): string => a.callsign || a.id.toUpperCase()
/** Altitude ramp color; `--alt-lmax` (CSS, theme-driven) caps its lightness (hue and chroma kept) on the light theme for contrast. */
export const altColor = (a: Aircraft): string =>
  `oklch(from ${hexCss(rampHex(a.onGround ? 0 : a.altFt))} min(l, var(--alt-lmax, 1)) c h)`
export const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US')
export const fmtAlt = (a: Aircraft): string =>
  a.onGround ? 'GND' : fmtInt(Math.round(a.altFt / 100) * 100)

export function fmtVsShort(fpm: number): string {
  const r = Math.round(fpm / 100) * 100
  return r > 0 ? `↑ ${fmtInt(r)}` : r < 0 ? `↓ ${fmtInt(-r)}` : 'level'
}

export function fmtVsLong(fpm: number): string {
  const r = Math.round(fpm / 100) * 100
  return r > 0 ? `+${fmtInt(r)} fpm` : r < 0 ? `−${fmtInt(-r)} fpm` : 'Level'
}

/** Route progress origin -> dest (0..1) when both airports are known, else local-area progress. */
export function progress(a: Aircraft, from?: LatLon | null, to?: LatLon | null): number {
  let f: number
  if (from && to) {
    const done = distanceNm(from, a)
    const left = distanceNm(a, to)
    f = done + left > 0 ? done / (done + left) : 0
  } else f = a.category === 'ARR' ? 1 - a.distNm / 40 : a.distNm / 40
  return Math.min(1, Math.max(0, f))
}

export function fmtCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
}

export const pad3 = (n: number): string => String(Math.round(n) % 360).padStart(3, '0') + '°'
