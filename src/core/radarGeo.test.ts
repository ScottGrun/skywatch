import { expect, test } from 'vitest'
import { beamHeightKm, elevationAndRange, groundRangeKm, polarToLocal } from './radarGeo'

test('beam height at 0 deg follows the 4/3-earth curvature drop', () => {
  // h ~ r^2 / (2 * 4/3 R) = 100^2 / 16990 ~ 0.589 km
  expect(beamHeightKm(100, 0)).toBeCloseTo(0.589, 2)
  expect(beamHeightKm(0, 5)).toBeCloseTo(0, 6)
})

test('beam height at 0.5 deg, 100 km', () => {
  expect(beamHeightKm(100, 0.5)).toBeCloseTo(1.462, 2)
})

test('ground range is a bit shorter than the slant range', () => {
  const g = groundRangeKm(100, 0.5)
  expect(g).toBeLessThan(100)
  expect(g).toBeGreaterThan(99.9)
})

test('polarToLocal: azimuth is clockwise from north', () => {
  const east = polarToLocal(90, 0.5, 50)
  expect(east.e).toBeCloseTo(50, 0)
  expect(Math.abs(east.n)).toBeLessThan(1e-6)
  const north = polarToLocal(0, 0.5, 50)
  expect(north.n).toBeGreaterThan(49.9)
  expect(Math.abs(north.e)).toBeLessThan(1e-6)
  const west = polarToLocal(270, 10, 20)
  expect(west.e).toBeLessThan(0)
  expect(west.up).toBeCloseTo(3.47, 1)
})

test('elevationAndRange inverts beam height / ground range', () => {
  const s = groundRangeKm(137, 3.1)
  const h = beamHeightKm(137, 3.1)
  const back = elevationAndRange(s, h)
  expect(back.el).toBeCloseTo(3.1, 4)
  expect(back.r).toBeCloseTo(137, 3)
})
