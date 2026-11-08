import type { LatLon } from '../core/geo.ts'
import { BUCKET } from './radarList.ts'
import type { RadarError, RadarJob, RadarResult } from './radarTypes.ts'

export async function fetchVolumeBytes(key: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch(`${BUCKET}/${key}`, { signal })
  if (!r.ok) throw new Error(`radar fetch ${r.status}`)
  return r.arrayBuffer()
}

let worker: Worker | null = null
let seq = 0

/** Decodes + resamples (and max-merges, when several)  in the (lazily created) radar Web Worker. */
export function decodeRadar(volumes: ArrayBuffer[], center: LatLon): Promise<RadarResult> {
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
    const job: RadarJob = { id, volumes, center }
    w.postMessage(job, volumes)
  })
}
