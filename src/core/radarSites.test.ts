import { expect, test } from 'vitest'
import { RADAR_SITES, radarsFor } from './radarSites'
import { mergeMax } from './radarGrid'

test('site table is complete and unique', () => {
  expect(RADAR_SITES.length).toBeGreaterThanOrEqual(160)
  expect(new Set(RADAR_SITES.map((s) => s.id)).size).toBe(RADAR_SITES.length)
})

test('radarsFor: nearest first, in range only', () => {
  const sea = radarsFor({ lat: 47.45, lon: -122.31 })
  expect(sea[0]!.id).toBe('KATX')
  expect(sea.length).toBe(2)
  expect(radarsFor({ lat: 61.17, lon: -150.0 })[0]!.id).toBe('PAHG')
  expect(radarsFor({ lat: 51.47, lon: -0.45 })).toEqual([]) // London
})

test('mergeMax keeps the larger value per voxel', () => {
  expect(Array.from(mergeMax(Uint8Array.of(1, 9, 0), Uint8Array.of(5, 2, 0)))).toEqual([5, 9, 0])
})
