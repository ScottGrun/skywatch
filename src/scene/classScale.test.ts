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
  it('wraps spin', () => {
    expect(advanceSpin(6, 10, 1)).toBeLessThan(Math.PI * 2)
  })
})
