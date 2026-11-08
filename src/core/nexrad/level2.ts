// NEXRAD Level II (Archive II) volume decoder: message 31 reflectivity (REF) only.
import { bunzip2 } from './bzip2.ts'

export interface Radial {
  az: number
  el: number
  /** Range to the first gate center, m. */
  first: number
  /** Gate spacing, m. */
  size: number
  scale: number
  offset: number
  /** Raw gate bytes: 0 = below threshold, 1 = range folded, else dBZ = (raw - offset) / scale. */
  gates: Uint8Array
}

export interface Sweep {
  elevNum: number
  /** Mean elevation angle, deg. */
  el: number
  radials: Radial[]
}

export interface Volume {
  site: string
  lat: number
  lon: number
  /** Antenna height, m MSL. */
  heightM: number
  /** Volume start, ms since epoch. */
  timeMs: number
  sweeps: Sweep[]
}

const MSG_HDR = 16
const CTM = 12
const FIXED_FRAME = 2432
const DAY_MS = 86_400_000

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))

/** Parses the messages of one decompressed LDM record, appending REF radials to `out`. */
export function parseRecord(
  rec: Uint8Array,
  out: Radial[],
  vol: Partial<Volume> & { elevNums: number[] },
): void {
  const dv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength)
  let p = 0
  while (p + CTM + MSG_HDR <= rec.length) {
    const size = dv.getUint16(p + CTM, false) * 2
    const type = rec[p + CTM + 3]!
    if (type !== 31) {
      p += FIXED_FRAME
      continue
    }
    if (size < MSG_HDR) break
    const m = p + CTM + MSG_HDR // message body
    if (m + 72 <= rec.length) {
      const az = dv.getFloat32(m + 12, false)
      const el = dv.getFloat32(m + 24, false)
      const elevNum = rec[m + 22]!
      const nBlocks = Math.min(dv.getUint16(m + 30, false), 10)
      for (let i = 0; i < nBlocks; i++) {
        const o = m + dv.getUint32(m + 32 + i * 4, false)
        if (o + 4 > rec.length) continue
        const name = ascii(rec, o + 1, 3)
        if (name === 'VOL' && vol.lat === undefined) {
          vol.site = ascii(rec, m, 4)
          vol.lat = dv.getFloat32(o + 8, false)
          vol.lon = dv.getFloat32(o + 12, false)
          vol.heightM = dv.getInt16(o + 16, false)
          const days = dv.getUint16(m + 8, false)
          vol.timeMs = (days - 1) * DAY_MS + dv.getUint32(m + 4, false)
        } else if (name === 'REF') {
          const n = dv.getUint16(o + 8, false)
          if (o + 28 + n > rec.length || rec[o + 19] !== 8) continue
          vol.elevNums.push(elevNum)
          out.push({
            az,
            el,
            first: dv.getUint16(o + 10, false),
            size: dv.getUint16(o + 12, false),
            scale: dv.getFloat32(o + 20, false),
            offset: dv.getFloat32(o + 24, false),
            gates: rec.subarray(o + 28, o + 28 + n),
          })
        }
      }
    }
    p += CTM + size
  }
}

/** Decodes a full Archive II file (24-byte header + bzip2 LDM records). */
export function decodeVolume(buf: Uint8Array): Volume {
  if (ascii(buf, 0, 4) !== 'AR2V') throw new Error('not a NEXRAD Level II volume')
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const radials: Radial[] = []
  const vol: Partial<Volume> & { elevNums: number[] } = { elevNums: [] }
  let p = 24
  while (p + 4 < buf.length) {
    const size = Math.abs(dv.getInt32(p, false))
    p += 4
    if (!size || p + size > buf.length) break
    parseRecord(bunzip2(buf.subarray(p, p + size)), radials, vol)
    p += size
  }
  if (!radials.length || vol.lat === undefined) throw new Error('no reflectivity data in volume')
  const by = new Map<number, Radial[]>()
  radials.forEach((r, i) => {
    const k = vol.elevNums[i]!
    ;(by.get(k) ?? by.set(k, []).get(k)!).push(r)
  })
  const sweeps: Sweep[] = [...by].map(([elevNum, rs]) => ({
    elevNum,
    el: rs.reduce((s, r) => s + r.el, 0) / rs.length,
    radials: rs,
  }))
  sweeps.sort((a, b) => a.el - b.el)
  return {
    site: vol.site ?? '',
    lat: vol.lat,
    lon: vol.lon!,
    heightM: vol.heightM ?? 0,
    timeMs: vol.timeMs ?? 0,
    sweeps,
  }
}
