import { describe, expect, it } from 'vitest'
import { airlineCode } from './airlineCode.ts'

describe('airlineCode', () => {
  it('extracts the 3-letter prefix', () => {
    expect(airlineCode('ASA1367')).toBe('ASA')
    expect(airlineCode(' aca12')).toBe('ACA')
    expect(airlineCode('BAW1AB')).toBe('BAW')
  })
  it('rejects registrations and malformed callsigns', () => {
    expect(airlineCode('N123AB')).toBe('')
    expect(airlineCode('CGABC')).toBe('')
    expect(airlineCode('AB1234')).toBe('')
    expect(airlineCode('')).toBe('')
  })
})
