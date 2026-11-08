import type { LatLon } from '../core/geo.ts'
import type { RadarError, RadarJob, RadarResult } from './radarTypes.ts'

const BUCKET = 'https://unidata-nexrad-level2.s3.amazonaws.com'

const pad = (n: number) => String(n).padStart(2, '0')
const dayPrefix = (site: string, d: Date) =>
  `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${site}/`

/** Newest full-volume key from an S3 ListObjectsV2 XML body (skips _MDM metadata files). */
export function newestKey(xml: string): string | null {
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
    .map((m) => m[1]!)
    .filter((k) => !k.endsWith('_MDM'))
  return keys.length ? keys.sort().at(-1)! : null
}

/** Newest Level II key for `site` today (UTC), else yesterday. The bucket sends `Access-Control-Allow-Origin: *`. */
export async function latestKey(
  site: string,
  now = new Date(),
  f: typeof fetch = fetch,
): Promise<string | null> {
  for (const back of [0, 1]) {
    const d = new Date(now.getTime() - back * 86_400_000)
    const r = await f(`${BUCKET}/?list-type=2&prefix=${dayPrefix(site, d)}`)
    if (!r.ok) continue
    const k = newestKey(await r.text())
    if (k) return k
  }
  return null
}

export async function fetchVolumeBytes(key: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch(`${BUCKET}/${key}`, { signal })
  if (!r.ok) throw new Error(`radar fetch ${r.status}`)
  return r.arrayBuffer()
}

let worker: Worker | null = null
let seq = 0

/** Decodes + resamples in the (lazily created) radar Web Worker. */
export function decodeRadar(bytes: ArrayBuffer, center: LatLon): Promise<RadarResult> {
  worker ??= new Worker(new URL('./radarWorker.ts', import.meta.url), { type: 'module' })
  const w = worker
  const id = ++seq
  return new Promise((resolve, reject) => {
    const onMsg = (ev: MessageEvent<RadarResult | RadarError>) => {
      if (ev.data.id !== id) return
      w.removeEventListener('message', onMsg)
      if ('error' in ev.data) reject(new Error(ev.data.error))
      else resolve(ev.data)
    }
    w.addEventListener('message', onMsg)
    const job: RadarJob = { id, bytes, center }
    w.postMessage(job, [bytes])
  })
}
