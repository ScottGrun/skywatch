import { resolveTheme, THEME_KEY } from '../core/theme.ts'
import type { Theme } from '../types.ts'

/** Stored theme, else the OS preference, else dark. */
export function initialTheme(): Theme {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(THEME_KEY)
  } catch {
    /* storage unavailable */
  }
  const light =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
  return resolveTheme(stored, light)
}

/** Sets `data-theme` on <html>, which drives the CSS variables. */
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
}

/** Remembers an explicit choice (until then the OS preference applies). */
export function saveTheme(t: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
}
