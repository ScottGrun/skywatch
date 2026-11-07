import type { Theme } from '../types'
import { BG } from './constants'

type Rgb = readonly [number, number, number]

/** Scene colors per theme. Dark values are the original look. */
export interface ScenePalette {
  bg: number
  grid: number
  gridOpacity: number
  ring: number
  runway: number
  /** Runway slab color while runway lights are on (pavement reads dark at night). */
  runwayLit: number
  approach: number
  approachOpacity: number
  select: number
  /** Terrain hillshade strength. */
  hillshade: number
  /** Multiplier on aircraft/airspace colors (a light map needs deeper hues). */
  shade: number
  /** Tile color multiplier for default Mapbox / custom Mapbox / Esri base maps. */
  tint: { mapbox: Rgb; custom: Rgb; esri: Rgb }
  /** CSS custom properties set on the HTML overlay (tags, ring labels, airspace labels). */
  vars: Record<string, string>
}

const WHITE: Rgb = [1, 1, 1]

export const PALETTES: Record<Theme, ScenePalette> = {
  dark: {
    bg: BG,
    grid: 0x10181f,
    gridOpacity: 0.6,
    ring: 0x24323f,
    runway: 0xdfe7ef,
    runwayLit: 0x3b454f,
    approach: 0xffffff,
    approachOpacity: 0.35,
    select: 0xffffff,
    hillshade: 0.75,
    shade: 1,
    tint: { mapbox: [1.25, 1.4, 1.6], custom: WHITE, esri: [0.5, 0.6, 0.72] },
    vars: {
      '--tag-bg': 'rgba(5,6,8,.8)',
      '--tag-border': 'rgba(255,255,255,.1)',
      '--tag-border-sel': '#fff',
      '--tag-text': '#fff',
      '--ring-label': '#5b6f80',
      '--halo': '#050608',
      '--alt-lmax': '1',
    },
  },
  light: {
    bg: 0xf1f2f0,
    grid: 0xc3ccd4,
    gridOpacity: 0.7,
    ring: 0x7d8d9b,
    runway: 0x39434d,
    runwayLit: 0x39434d,
    approach: 0x1c2833,
    approachOpacity: 0.5,
    select: 0x16202a,
    hillshade: 0.4,
    shade: 1,
    tint: { mapbox: WHITE, custom: WHITE, esri: WHITE },
    vars: {
      '--tag-bg': 'rgba(255,255,255,.9)',
      '--tag-border': 'rgba(10,20,30,.22)',
      '--tag-border-sel': '#0d141b',
      '--tag-text': '#0d141b',
      '--ring-label': '#46586a',
      '--halo': 'rgba(255,255,255,.9)',
      '--alt-lmax': '0.62',
    },
  },
}

/** Current scene theme; builders read `pal()` when they create materials. */
let current: Theme = 'dark'
export const sceneTheme = (): Theme => current
export const setSceneTheme = (t: Theme): void => {
  current = t
}
export const pal = (): ScenePalette => PALETTES[current]

/** Scales a 0xRRGGBB color by `k` (<1 darkens). */
export function shadeHex(hex: number, k: number): number {
  const c = (s: number) => Math.round(((hex >> s) & 255) * k)
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

/** Pushes the overlay CSS variables for `t` onto `el`. */
export function applyOverlayVars(el: HTMLElement, t: Theme): void {
  for (const [k, v] of Object.entries(PALETTES[t].vars)) el.style.setProperty(k, v)
}

/** CSS color for text that must stay readable on the current theme (darker in light mode). */
export const readable = (css: string): string => `oklch(from ${css} min(l, var(--alt-lmax, 1)) c h)`
