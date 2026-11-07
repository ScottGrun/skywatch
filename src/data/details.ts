import {
  mergeDetails,
  readableTypeName,
  type AdsbdbPayload,
  type AircraftDetails,
  type PlanespottersPayload,
} from '../core/details.ts'
import { createAircraftDb } from './aircraftDb.ts'

const db = createAircraftDb((...a) => fetch(...a))
const cache = new Map<string, Promise<AircraftDetails>>()

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

async function load(id: string, typeCode: string): Promise<AircraftDetails> {
  const a = await json<AdsbdbPayload>(`/api/aircraft/${id}`)
  const ps = a?.photo || a?.photoThumb ? null : await json<PlanespottersPayload>(`/api/photo/${id}`)
  const d = mergeDetails(a, ps)
  if (!d.fullType && typeCode) {
    const info = await db.type(typeCode)
    if (info?.name) d.fullType = readableTypeName(info.name)
  }
  return d
}

/** Cached per-aircraft details for the selected aircraft (empty results are retried next time). */
export function getAircraftDetails(id: string, typeCode: string): Promise<AircraftDetails> {
  let p = cache.get(id)
  if (!p) {
    p = load(id, typeCode)
    cache.set(id, p)
    void p.then((d) => {
      if (!d.fullType && !d.owner && !d.photo) cache.delete(id)
    })
  }
  return p
}
