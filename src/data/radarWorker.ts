/// <reference lib="webworker" />
// Web Worker: Level II bytes -> dBZ voxel grid. Keeps bzip2 + resampling off the main thread.
import { decodeVolume } from '../core/nexrad/level2.ts'
import { buildGrid } from '../core/radarGrid.ts'
import type { RadarJob, RadarResult } from './radarTypes.ts'

self.onmessage = (ev: MessageEvent<RadarJob>) => {
  const { id, bytes, center } = ev.data
  try {
    const t0 = performance.now()
    const vol = decodeVolume(new Uint8Array(bytes))
    const t1 = performance.now()
    const grid = buildGrid(vol, center)
    const res: RadarResult = {
      id,
      grid,
      site: vol.site,
      timeMs: vol.timeMs,
      decodeMs: t1 - t0,
      gridMs: performance.now() - t1,
    }
    ;(self as unknown as Worker).postMessage(res, [grid.buffer])
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, error: String(e) })
  }
}
