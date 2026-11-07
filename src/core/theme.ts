import type { Theme } from '../types.ts'

export const THEME_KEY = 'tracon3d.theme'

/** Stored choice wins; otherwise follow the OS (`prefers-color-scheme: light`), else dark. */
export function resolveTheme(stored: string | null, prefersLight: boolean): Theme {
  if (stored === 'dark' || stored === 'light') return stored
  return prefersLight ? 'light' : 'dark'
}
