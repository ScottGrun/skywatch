// Finds the newest Level II volume for a site in the Unidata NEXRAD Level II bucket (AWS Open Data, CORS open).
export const BUCKET = 'https://unidata-nexrad-level2.s3.amazonaws.com'

/** Volumes older than this are treated as "no data" (site down / archive lag). */
export const MAX_AGE_MS = 3 * 3_600_000
const MAX_PAGES = 10

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
const dayPrefix = (site: string, d: Date) =>
  `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${site}/`

const isVolume = (k: string) => !k.endsWith('_MDM')

/** Newest full-volume key in an S3 ListObjectsV2 XML body (skips _MDM metadata files). */
export function newestKey(xml: string): string | null {
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!).filter(isVolume)
  return keys.length ? keys.sort().at(-1)! : null
}

/** Volume start (ms) parsed from `.../KATX20261106_001859_V06[.gz]`; null if the name does not match. */
export function keyTimeMs(key: string): number | null {
  const m = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(key.split('/').at(-1) ?? '')
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) : null
}

/** Lists a prefix (optionally from `startAfter`), following continuation tokens; returns the newest volume key. */
async function newestUnder(
  prefix: string,
  startAfter: string | null,
  f: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  let token = ''
  let best: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let url = `${BUCKET}/?list-type=2&prefix=${prefix}`
    if (startAfter && !token) url += `&start-after=${encodeURIComponent(startAfter)}`
    if (token) url += `&continuation-token=${encodeURIComponent(token)}`
    const r = await f(url, { signal })
    if (!r.ok) return best
    const xml = await r.text()
    const k = newestKey(xml)
    if (k && (!best || k > best)) best = k
    token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? ''
    if (!token || !/<IsTruncated>true</.test(xml)) break
  }
  return best
}

/**
 * Newest Level II key for `site` no older than MAX_AGE_MS. Today's listing is read from just before the
 * window (start-after), so busy days fetch only the tail; then yesterday's (UTC) as fallback around midnight.
 * Handles `.gz` and other suffixes since keys are only compared by their name.
 */
export async function latestKey(
  site: string,
  now = new Date(),
  f: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  const from = new Date(now.getTime() - MAX_AGE_MS)
  for (const back of [0, 1]) {
    const d = new Date(now.getTime() - back * 86_400_000)
    const sameDay = ymd(from) === ymd(d)
    const after = sameDay
      ? `${dayPrefix(site, d)}${site}${ymd(d)}_${pad(from.getUTCHours())}0000`
      : null
    let k: string | null = null
    try {
      k = await newestUnder(dayPrefix(site, d), after, f, signal)
    } catch (e) {
      if (signal?.aborted) throw e
    }
    const t = k ? keyTimeMs(k) : null
    if (k && t !== null && now.getTime() - t <= MAX_AGE_MS) return k
  }
  return null
}
