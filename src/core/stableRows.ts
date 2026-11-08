import type { Aircraft } from '../types.ts'

/** Everything the UI displays or sorts/filters on, at displayed precision. */
export function displayKey(a: Aircraft): string {
  return [
    a.id,
    a.callsign,
    a.onGround ? 'G' : Math.round(a.altFt),
    Math.round(a.gsKt),
    Math.round(a.trackDeg) % 360,
    Math.round(a.vsFpm / 100),
    a.distNm.toFixed(1),
    a.category,
    a.phase,
    a.typeCode,
    a.aircraftClass,
    a.airline,
    a.registration ?? '',
    a.origin,
    a.dest,
  ].join('|')
}

/**
 * Reuse previous Aircraft objects whose displayed values are unchanged, and return `prev` itself when
 * nothing changed at all, so React can skip re-rendering (and memoised rows can bail out).
 */
export function stabilizeRows(prev: readonly Aircraft[], next: readonly Aircraft[]): Aircraft[] {
  const old = new Map<string, Aircraft>()
  for (const a of prev) old.set(a.id, a)
  let changed = prev.length !== next.length
  const out = next.map((a, i) => {
    const p = old.get(a.id)
    if (p && displayKey(p) === displayKey(a)) {
      if (prev[i] !== p) changed = true
      return p
    }
    changed = true
    return a
  })
  return changed ? out : (prev as Aircraft[])
}
