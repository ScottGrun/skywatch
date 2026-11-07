import type { Aircraft } from '../types.ts'
import { hexCss, rampHex } from '../core/ramp.ts'

export const dash = (s: string): string => s || '—'
export const callsignOf = (a: Aircraft): string => a.callsign || a.id.toUpperCase()
/** Altitude ramp color; `--alt-mix` (CSS, theme-driven) darkens it on the light theme for contrast. */
export const altColor = (a: Aircraft): string =>
  `color-mix(in srgb, ${hexCss(rampHex(a.onGround ? 0 : a.altFt))} var(--alt-mix, 100%), black)`
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

export function progress(a: Aircraft): number {
  const f = a.category === 'ARR' ? 1 - a.distNm / 40 : a.distNm / 40
  return Math.min(1, Math.max(0, f))
}

export function fmtCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
}

export const pad3 = (n: number): string => String(Math.round(n) % 360).padStart(3, '0') + '°'
