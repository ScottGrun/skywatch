import type { Aircraft, Phase } from '../types.ts'

/** Arrivals board rows: airborne ARR aircraft, soonest ETA first, unknown ETA last. */
export function arrivalsBoard(list: readonly Aircraft[]): Aircraft[] {
  return list
    .filter((a) => a.category === 'ARR' && !a.onGround)
    .sort((a, b) => {
      if (a.etaMin === null || b.etaMin === null) {
        return a.etaMin === b.etaMin ? 0 : a.etaMin === null ? 1 : -1
      }
      return a.etaMin - b.etaMin
    })
}

export function fmtEta(min: number | null): string {
  if (min === null) return '—'
  const m = Math.round(min)
  return m < 1 ? '<1 min' : `${m} min`
}

/** Board status wording for an arriving aircraft's phase. */
export function arrivalStatus(p: Phase): string {
  switch (p) {
    case 'Final approach':
      return 'Final'
    case 'Landing':
      return 'Landing'
    case 'Approach':
      return 'Approach'
    default:
      return 'Descent'
  }
}
