import { expect, test } from 'vitest'
import { buildRadarLut, radarAlpha, radarColor, RADAR_MIN_DBZ } from './radarColor'

test('nothing is drawn below the clutter threshold', () => {
  expect(radarAlpha(RADAR_MIN_DBZ - 1)).toBe(0)
  expect(radarAlpha(0)).toBe(0)
  expect(radarAlpha(RADAR_MIN_DBZ)).toBeGreaterThan(0)
})

test('alpha rises monotonically and saturates', () => {
  let prev = 0
  for (let d = 15; d <= 80; d += 5) {
    const a = radarAlpha(d)
    expect(a).toBeGreaterThanOrEqual(prev)
    prev = a
  }
  expect(radarAlpha(55)).toBeGreaterThan(0.9)
})

test('color ramp hits the NWS stops and interpolates between them', () => {
  expect(radarColor(30)).toEqual([2, 253, 2]) // green
  expect(radarColor(55)).toEqual([253, 0, 0]) // red
  expect(radarColor(75)).toEqual([253, 253, 253])
  expect(radarColor(200)).toEqual([253, 253, 253]) // clamped
  const mid = radarColor(32.5)
  expect(mid[1]).toBeGreaterThan(197)
  expect(mid[1]).toBeLessThan(253)
})

test('LUT is 256 RGBA entries matching the functions', () => {
  const lut = buildRadarLut()
  expect(lut.length).toBe(1024)
  expect(Array.from(lut.subarray(50 * 4, 50 * 4 + 3))).toEqual(radarColor(50))
  expect(lut[10 * 4 + 3]).toBe(0)
  expect(lut[50 * 4 + 3]).toBeGreaterThan(150)
})
