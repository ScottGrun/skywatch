import type { TypeInfo } from '../core/aircraftClass.ts'

export interface DbHit {
  typeCode: string
  registration: string
}

type Shard = Record<string, [string, string]>

/** Lazy client for the baked hex→type shards (public/data/aircraft) and types.json. Missing files are fine. */
export function createAircraftDb(fetchFn: typeof fetch, base = '/data') {
  const shards = new Map<string, Promise<Shard>>()
  let types: Promise<Record<string, TypeInfo>> | null = null

  async function getJson<T>(url: string, empty: T): Promise<T> {
    try {
      const r = await fetchFn(url)
      if (!r.ok) return empty
      const j: unknown = await r.json()
      return j && typeof j === 'object' ? (j as T) : empty
    } catch {
      return empty
    }
  }

  return {
    async lookup(hex: string): Promise<DbHit | null> {
      const h = hex.toLowerCase()
      const key = h.slice(0, 2)
      let p = shards.get(key)
      if (!p) shards.set(key, (p = getJson<Shard>(`${base}/aircraft/${key}.json`, {})))
      const e = (await p)[h]
      return e ? { typeCode: e[0], registration: e[1] } : null
    },
    async type(code: string): Promise<TypeInfo | null> {
      types ??= getJson<Record<string, TypeInfo>>(`${base}/types.json`, {})
      return (await types)[code.toUpperCase()] ?? null
    },
  }
}

export type AircraftDb = ReturnType<typeof createAircraftDb>
