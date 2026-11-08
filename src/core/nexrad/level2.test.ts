import { expect, test } from 'vitest'
import { parseRecord, type Radial } from './level2'

const enc = (s: string) => new TextEncoder().encode(s)

/** Builds one message-31 frame (12 byte CTM + 16 byte header + body) with VOL and REF blocks. */
function msg31(az: number, el: number, elevNum: number, gates: number[]): Uint8Array {
  const volLen = 40
  const bodyLen = 72 + volLen + 28 + gates.length
  const buf = new Uint8Array(12 + 16 + bodyLen)
  const dv = new DataView(buf.buffer)
  dv.setUint16(12, (16 + bodyLen) / 2, false)
  buf[15] = 31
  const m = 28
  buf.set(enc('KTST'), m)
  dv.setUint32(m + 4, 3_600_000, false) // 01:00:00
  dv.setUint16(m + 8, 2, false) // day 2 = 1970-01-02
  dv.setFloat32(m + 12, az, false)
  buf[m + 22] = elevNum
  dv.setFloat32(m + 24, el, false)
  dv.setUint16(m + 30, 2, false)
  dv.setUint32(m + 32, 72, false) // VOL block pointer
  dv.setUint32(m + 36, 72 + volLen, false) // REF block pointer
  const v = m + 72
  buf.set(enc('RVOL'), v)
  dv.setFloat32(v + 8, 48.5, false)
  dv.setFloat32(v + 12, -122.5, false)
  dv.setInt16(v + 16, 161, false)
  const r = v + volLen
  buf.set(enc('DREF'), r)
  dv.setUint16(r + 8, gates.length, false)
  dv.setUint16(r + 10, 2125, false)
  dv.setUint16(r + 12, 250, false)
  buf[r + 19] = 8
  dv.setFloat32(r + 20, 2, false)
  dv.setFloat32(r + 24, 66, false)
  buf.set(gates, r + 28)
  return buf
}

test('parseRecord reads REF radials and the volume header from message 31', () => {
  const a = msg31(12.5, 0.5, 1, [0, 1, 100, 120])
  const b = msg31(13, 0.5, 1, [90, 91, 92, 93])
  const rec = new Uint8Array(a.length + b.length)
  rec.set(a, 0)
  rec.set(b, a.length)
  const out: Radial[] = []
  const vol = { elevNums: [] as number[] }
  parseRecord(rec, out, vol)
  expect(out).toHaveLength(2)
  expect(out[0]).toMatchObject({ az: 12.5, el: 0.5, first: 2125, size: 250, scale: 2, offset: 66 })
  expect(Array.from(out[1]!.gates)).toEqual([90, 91, 92, 93])
  expect(vol).toMatchObject({
    site: 'KTST',
    heightM: 161,
    timeMs: 86_400_000 + 3_600_000,
    elevNums: [1, 1],
  })
})
