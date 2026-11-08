// Elevation raster tiles (Mapbox Terrain-RGB, or keyless AWS Terrarium) decoded into height fields.
import { latToTileY, lonToTileX } from './tileMath'

export type ElevSource = 'mapbox' | 'terrarium'
const SIZE = 256

export function elevationUrl(
  src: ElevSource,
  z: number,
  x: number,
  y: number,
  token?: string,
): string {
  return src === 'mapbox'
    ? `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${token}`
    : `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
}

/** Height in metres from one RGB pixel. */
export function decodeHeight(src: ElevSource, r: number, g: number, b: number): number {
  return src === 'mapbox' ? -10000 + (r * 65536 + g * 256 + b) * 0.1 : r * 256 + g + b / 256 - 32768
}

/** Decoded tiles kept across airport switches (LRU by insertion order; ~256 KB each). */
const decoded = new Map<string, Float32Array>()
const DECODED_MAX = 160

async function fetchTile(
  src: ElevSource,
  z: number,
  x: number,
  y: number,
  token: string | undefined,
  signal: AbortSignal,
): Promise<Float32Array> {
  const url = elevationUrl(src, z, x, y, token)
  const hit = decoded.get(url)
  if (hit) {
    decoded.delete(url)
    decoded.set(url, hit)
    return hit
  }
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`elevation tile ${res.status}`)
  const bmp = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
  const cv = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
  const out = new Float32Array(bmp.width * bmp.height)
  bmp.close()
  for (let i = 0; i < out.length; i++)
    out[i] = decodeHeight(src, d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
  decoded.set(url, out)
  if (decoded.size > DECODED_MAX) decoded.delete(decoded.keys().next().value as string)
  return out
}

/** Heights (m) of a rectangular block of equal-zoom tiles, sampled bilinearly by lat/lon. */
export class HeightField {
  private readonly px0: number
  private readonly py0: number
  private readonly w: number
  private readonly h: number
  private readonly data: Float32Array
  private readonly z: number
  private readonly size: number

  constructor(
    z: number,
    x0: number,
    y0: number,
    nx: number,
    ny: number,
    tiles: (Float32Array | null)[],
    size = SIZE,
  ) {
    this.z = z
    this.size = size
    this.px0 = x0 * size
    this.py0 = y0 * size
    this.w = nx * size
    this.h = ny * size
    this.data = new Float32Array(this.w * this.h)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const t = tiles[j * nx + i]
        if (!t) continue
        for (let r = 0; r < size; r++)
          this.data.set(t.subarray(r * size, (r + 1) * size), (j * size + r) * this.w + i * size)
      }
  }

  sample(lat: number, lon: number): number {
    const gx = lonToTileX(lon, this.z) * this.size - 0.5 - this.px0
    const gy = latToTileY(lat, this.z) * this.size - 0.5 - this.py0
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    const cx0 = Math.min(this.w - 1, Math.max(0, x0))
    const cx1 = Math.min(this.w - 1, Math.max(0, x0 + 1))
    const cy0 = Math.min(this.h - 1, Math.max(0, y0))
    const cy1 = Math.min(this.h - 1, Math.max(0, y0 + 1))
    const d = this.data
    const a = d[cy0 * this.w + cx0] * (1 - fx) + d[cy0 * this.w + cx1] * fx
    const b = d[cy1 * this.w + cx0] * (1 - fx) + d[cy1 * this.w + cx1] * fx
    return a * (1 - fy) + b * fy
  }
}

export interface LatLonBox {
  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
}

/** Fetches all tiles at zoom `z` covering `box`; failed tiles stay 0 m. Throws if every tile fails. */
export async function loadHeightField(
  src: ElevSource,
  token: string | undefined,
  z: number,
  box: LatLonBox,
  signal: AbortSignal,
): Promise<HeightField> {
  const N = 2 ** z
  const x0 = Math.floor(lonToTileX(box.lonMin, z))
  const x1 = Math.floor(lonToTileX(box.lonMax, z))
  const y0 = Math.max(0, Math.floor(latToTileY(box.latMax, z)))
  const y1 = Math.min(N - 1, Math.floor(latToTileY(box.latMin, z)))
  const nx = x1 - x0 + 1
  const ny = y1 - y0 + 1
  let ok = 0
  const jobs: Promise<Float32Array | null>[] = []
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      jobs.push(
        fetchTile(src, z, (((x0 + i) % N) + N) % N, y0 + j, token, signal).then(
          (t) => (ok++, t),
          (e) => {
            if (signal.aborted) throw e
            return null
          },
        ),
      )
  const tiles = await Promise.all(jobs)
  if (!ok) throw new Error('no elevation tiles loaded')
  return new HeightField(z, x0, y0, nx, ny, tiles)
}
