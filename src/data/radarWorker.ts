/// <reference lib="webworker" />
// Web Worker: Level II bytes -> dBZ voxel grid. Keeps bzip2 + resampling off the main thread.
import { decodeVolume } from '../core/nexrad/level2.ts'
import { buildGrid, mergeMax } from '../core/radarGrid.ts'
import type { RadarJob, RadarResult } from './radarTypes.ts'

async function gunzip(b: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

self.onmessage = async (ev: MessageEvent<RadarJob>) => {
  const { id, volumes, center } = ev.data
  const post = (m: RadarResult | { id: number; error: string }, tr: Transferable[] = []) =>
    (self as unknown as Worker).postMessage(m, tr)
  try {
    let decodeMs = 0
    let gridMs = 0
    let grid: Uint8Array | null = null
    const sites: string[] = []
    let timeMs = 0
    for (const buf of volumes) {
      let bytes: Uint8Array = new Uint8Array(buf)
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes)
      const t0 = performance.now()
      const vol = decodeVolume(bytes)
      const t1 = performance.now()
      const g = buildGrid(vol, center)
      decodeMs += t1 - t0
      gridMs += performance.now() - t1
      grid = grid ? mergeMax(grid, g) : g
      sites.push(vol.site)
      timeMs = Math.max(timeMs, vol.timeMs)
    }
    if (!grid) throw new Error('no volumes')
    post({ id, grid, sites, timeMs, decodeMs, gridMs }, [grid.buffer])
  } catch (e) {
    post({ id, error: String(e) })
  }
}
