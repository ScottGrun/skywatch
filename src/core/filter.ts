import type { Aircraft, AircraftClass, Category } from '../types.ts'

/** Empty `types` / `cats` mean "all". `ground` false hides aircraft on the ground. */
export interface FilterState {
  types: AircraftClass[]
  cats: Category[]
  ground: boolean
}

export const ALL_TYPES: readonly AircraftClass[] = [
  'wide',
  'quad',
  'narrow',
  'regional',
  'bizjet',
  'turboprop',
  'piston',
  'heli',
  'unknown',
]
export const ALL_CATS: readonly Category[] = ['ARR', 'DEP', 'OVR']

export const DEFAULT_FILTER: FilterState = { types: [], cats: [], ground: true }

export const FILTER_STORE_KEY = 'tracon3d.filter'

export function isActive(f: FilterState): boolean {
  return f.types.length > 0 || f.cats.length > 0 || !f.ground
}

/** Number of active constraints, for the trigger badge. */
export function activeCount(f: FilterState): number {
  return (f.types.length ? 1 : 0) + (f.cats.length ? 1 : 0) + (f.ground ? 0 : 1)
}

/** Predicate for the scene/UI, or null when nothing is filtered. */
export function buildPredicate(f: FilterState): ((a: Aircraft) => boolean) | null {
  if (!isActive(f)) return null
  const types = new Set<string>(f.types)
  const cats = new Set<string>(f.cats)
  return (a) =>
    (f.ground || !a.onGround) &&
    (types.size === 0 || types.has(a.aircraftClass)) &&
    (cats.size === 0 || cats.has(a.category))
}

/** Toggle one member of an "empty = all" list; all-selected (or none left) collapses to empty. */
export function toggleIn<T>(list: readonly T[], all: readonly T[], item: T): T[] {
  const cur = list.length ? list : all
  const next = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item]
  return next.length === 0 || next.length === all.length ? [] : all.filter((x) => next.includes(x))
}

function parseList<T extends string>(raw: string | null, all: readonly T[], upper = false): T[] {
  if (!raw) return []
  const parts = raw.split(',').map((s) => (upper ? s.trim().toUpperCase() : s.trim().toLowerCase()))
  const found = all.filter((x) => parts.includes(x))
  return found.length === all.length ? [] : found
}

export function filterFromParams(p: URLSearchParams): FilterState | null {
  if (!p.has('types') && !p.has('cat') && !p.has('gnd')) return null
  return {
    types: parseList(p.get('types'), ALL_TYPES),
    cats: parseList(p.get('cat'), ALL_CATS, true),
    ground: p.get('gnd') !== '0',
  }
}

/** Writes filter params onto `p` (removing them when inactive). */
export function filterToParams(f: FilterState, p: URLSearchParams): void {
  const set = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k))
  set('types', f.types.join(','))
  set('cat', f.cats.join(','))
  set('gnd', f.ground ? '' : '0')
}

export function serializeFilter(f: FilterState): string {
  return JSON.stringify(f)
}

export function deserializeFilter(raw: string | null): FilterState | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<FilterState>
    return {
      types: parseList(Array.isArray(o.types) ? o.types.join(',') : null, ALL_TYPES),
      cats: parseList(Array.isArray(o.cats) ? o.cats.join(',') : null, ALL_CATS, true),
      ground: o.ground !== false,
    }
  } catch {
    return null
  }
}

/** URL wins over localStorage; falls back to the default. */
export function loadFilter(search: string, stored: string | null): FilterState {
  return (
    filterFromParams(new URLSearchParams(search)) ?? deserializeFilter(stored) ?? DEFAULT_FILTER
  )
}
