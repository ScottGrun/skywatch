import { FT_PER_M } from '../core/geo'
import type { AirspaceLimit } from '../types'

export interface AirspaceStyle {
  color: number
  css: string
  dashed: boolean
}

const st = (color: number, dashed = false): AirspaceStyle => ({
  color,
  css: '#' + color.toString(16).padStart(6, '0'),
  dashed,
})

const STYLES: Record<string, AirspaceStyle> = {
  A: st(0xff6b6b),
  B: st(0x3cb8ff),
  C: st(0xd65cff),
  D: st(0x2ff0c0, true),
  CTR: st(0x2ff0c0, true),
  ATZ: st(0x2ff0c0, true),
  MCTR: st(0x2ff0c0, true),
  TMA: st(0x6f9cff),
  CTA: st(0x6f9cff),
  R: st(0xff9a3c, true),
  DNG: st(0xff9a3c, true),
  P: st(0xff5c5c, true),
  WRN: st(0xff9a3c, true),
  ALR: st(0xff9a3c, true),
}
const DEFAULT = st(0x8aa0b4, true)

export const airspaceStyle = (cls: string): AirspaceStyle => STYLES[cls] ?? DEFAULT

/** Limit height in feet (MSL for MSL/STD, above ground for AGL/SFC) plus whether it is ground-relative. */
export function limitFt(l: AirspaceLimit): { ft: number; agl: boolean } {
  const ft = l.unit === 'FL' ? l.value * 100 : l.unit === 'M' ? l.value * FT_PER_M : l.value
  return { ft, agl: l.ref === 'AGL' || l.ref === 'SFC' }
}

/** Compact label text for one limit: "SFC", "2500", "FL180", "500 AGL", "1200 M". */
export function fmtLimit(l: AirspaceLimit): string {
  if (l.ref === 'SFC' || (l.ref === 'AGL' && l.value === 0)) return 'SFC'
  if (l.unit === 'FL') return `FL${String(l.value).padStart(3, '0')}`
  const v = String(Math.round(l.value))
  const u = l.unit === 'M' ? ' M' : ''
  return l.ref === 'AGL' ? `${v}${u} AGL` : `${v}${u}`
}
