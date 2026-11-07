import { airlineCode } from '../core/airlineCode.ts'

/**
 * Baked airline logos (public/logos, see scripts/bake-logos.ts). The folder is gitignored, so everything
 * here degrades to "no logos" when index.json is absent. Shared by the scene and the React panels.
 */
const KEY = 'tracon3d.logos'
let codes: ReadonlySet<string> = new Set()
let enabled = true
try {
  enabled = localStorage.getItem(KEY) !== '0'
} catch {
  /* ignore */
}
/** Bumped whenever the index loads or the toggle flips, so per-frame consumers can cheaply re-resolve. */
let epoch = 0
const subs = new Set<() => void>()
const bump = () => {
  epoch++
  subs.forEach((f) => f())
}

export async function loadLogoIndex(fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    const r = await fetchFn('/logos/index.json')
    if (!r.ok) return
    const j: unknown = await r.json()
    if (!Array.isArray(j)) return
    codes = new Set(j.filter((c): c is string => typeof c === 'string'))
    bump()
  } catch {
    /* no logos baked */
  }
}

export function logosEnabled(): boolean {
  return enabled
}

export function setLogosEnabled(on: boolean): void {
  if (on === enabled) return
  enabled = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  bump()
}

export const logoEpoch = (): number => epoch

export function subscribeLogos(fn: () => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** Logo URL for a callsign, or null when disabled / not baked. */
export function logoUrl(callsign: string): string | null {
  if (!enabled) return null
  const c = airlineCode(callsign)
  return c && codes.has(c) ? `/logos/${c}.png` : null
}
