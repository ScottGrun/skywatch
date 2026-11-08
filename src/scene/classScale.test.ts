import { describe, expect, it } from 'vitest'
import { advanceSpin, classScale } from './classScale'

describe('classScale', () => {
  it('orders classes by size and enforces the floor', () => {
    expect(classScale('quad')).toBeGreaterThan(classScale('wide'))
    expect(classScale('wide')).toBeGreaterThan(classScale('narrow'))
    expect(classScale('narrow')).toBeGreaterThan(classScale('regional'))
    expect(classScale('piston')).toBeGreaterThanOrEqual(0.5)
    expect(classScale('heli')).toBeGreaterThanOrEqual(0.5)
  })
  it('keeps spin steps small and survives bad input', () => {
    expect(advanceSpin(0, 14, 0.1)).toBeLessThan(0.5)
    expect(advanceSpin(Number.NaN, 14, 0.016)).toBeGreaterThan(0)
    expect(advanceSpin(1, 14, Number.NaN)).toBe(1)
  })
  it('wraps spin', () => {
    expect(advanceSpin(6, 10, 1)).toBeLessThan(Math.PI * 2)
  })
})
