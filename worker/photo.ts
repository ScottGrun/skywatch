import { TtlCache } from './ttlCache.ts'
import type { FetchFn } from './opensky.ts'

const UA = 'tracon3d-flight-tracker/1.0 (+https://flight-tracker.scottgrunerud98.workers.dev)'
const TTL_MS = 24 * 3600_000

export interface PhotoInfo {
  thumb: string
  link: string
  photographer: string
}

type Obj = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' ? (v as Obj) : undefined)

/** Planespotters `/pub/photos/hex/<hex>` response → first photo, or null. */
export function mapPhoto(j: unknown): PhotoInfo | null {
  const photos = obj(j)?.photos
  const p = Array.isArray(photos) ? obj(photos[0]) : undefined
  const thumb = str(obj(p?.thumbnail_large)?.src) || str(obj(p?.thumbnail)?.src)
  const link = str(p?.link)
  if (!/^https:\/\//.test(thumb) || !/^https:\/\//.test(link)) return null
  return { thumb, link, photographer: str(p?.photographer) }
}

export function createPhotoClient(deps: { fetch: FetchFn; now?: () => number }) {
  const now = deps.now ?? Date.now
  const cache = new TtlCache<PhotoInfo | null>(TTL_MS, 2000)
  return {
    /** `transient` is true when upstream failed (not a genuine "no photo"), so callers must not cache it. */
    async lookup(hex: string): Promise<{ photo: PhotoInfo | null; transient: boolean }> {
      const key = hex.toLowerCase()
      const hit = cache.get(key, now())
      if (hit !== undefined) return { photo: hit, transient: false }
      try {
        const res = await deps.fetch(`https://api.planespotters.net/pub/photos/hex/${key}`, {
          headers: { 'user-agent': UA, accept: 'application/json' },
        })
        if (!res.ok) return { photo: null, transient: true }
        const v = mapPhoto(await res.json().catch(() => null))
        cache.set(key, v, now())
        return { photo: v, transient: false }
      } catch {
        return { photo: null, transient: true }
      }
    },
    async get(hex: string): Promise<PhotoInfo | null> {
      return (await this.lookup(hex)).photo
    },
  }
}
