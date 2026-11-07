export interface AircraftPhoto {
  src: string
  link: string
  /** Credit line, e.g. "Jane Doe / Planespotters.net". */
  credit: string
}

export interface AircraftDetails {
  fullType: string
  owner: string
  photo: AircraftPhoto | null
}

export interface AdsbdbPayload {
  fullType?: string
  operator?: string
  photo?: string
  photoThumb?: string
}
export interface PlanespottersPayload {
  thumb?: string
  link?: string
  photographer?: string
}

/** Photo from the worker's `/api/aircraft` payload (airport-data.com), else null. */
export function photoFromAircraft(p: AdsbdbPayload | null): AircraftPhoto | null {
  const src = p?.photoThumb || p?.photo
  if (!src) return null
  return { src, link: p?.photo || src, credit: 'airport-data.com' }
}

/** Photo from the worker's `/api/photo` payload (planespotters), else null. */
export function photoFromPlanespotters(p: PlanespottersPayload | null): AircraftPhoto | null {
  if (!p?.thumb || !p.link) return null
  const who = p.photographer?.trim()
  return { src: p.thumb, link: p.link, credit: `${who ? who + ' / ' : ''}Planespotters.net` }
}

export function mergeDetails(
  a: AdsbdbPayload | null,
  ps: PlanespottersPayload | null,
): AircraftDetails {
  return {
    fullType: a?.fullType ?? '',
    owner: a?.operator ?? '',
    photo: photoFromPlanespotters(ps) ?? photoFromAircraft(a),
  }
}

/** "BOEING 737-800" -> "Boeing 737-800" (words containing digits are left as is). */
export function readableTypeName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => (/\d/.test(w) || w.length <= 1 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

/** The operator line: owner shown only when it differs from the airline name. */
export function ownerIfDifferent(airline: string, owner: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const o = owner.trim()
  if (!o) return ''
  const a = norm(airline)
  const n = norm(o)
  return a && (n.includes(a) || a.includes(n)) ? '' : o
}
