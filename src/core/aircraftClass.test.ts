import { describe, expect, it } from 'vitest'
import { aircraftClassFor, classFromDescriptor, resolveClass } from './aircraftClass.ts'

describe('aircraftClassFor (table)', () => {
  const cases: Array<[string, string]> = [
    ['A20N', 'narrow'],
    ['A321', 'narrow'],
    ['B38M', 'narrow'],
    ['B738', 'narrow'],
    ['B77W', 'wide'],
    ['B789', 'wide'],
    ['A359', 'wide'],
    ['A388', 'quad'],
    ['B748', 'quad'],
    ['K35R', 'quad'],
    ['E75L', 'regional'],
    ['CRJ9', 'regional'],
    ['DH8D', 'turboprop'],
    ['AT76', 'turboprop'],
    ['C130', 'turboprop'],
    ['PC12', 'turboprop'],
    ['C172', 'piston'],
    ['PA28', 'piston'],
    ['GLF6', 'bizjet'],
    ['CL35', 'bizjet'],
    ['C56X', 'bizjet'],
    ['EC35', 'heli'],
    ['R44', 'heli'],
    ['B06', 'heli'],
    ['A139', 'heli'],
    ['H60', 'heli'],
    ['MD90', 'narrow'],
    ['', 'unknown'],
    ['ZZZZ', 'unknown'],
  ]
  it.each(cases)('%s -> %s', (code, cls) => expect(aircraftClassFor(code)).toBe(cls))
})

describe('classFromDescriptor', () => {
  const cases: Array<[string, string, string, string]> = [
    ['L2J', 'H', '', 'wide'],
    ['L3J', 'H', '', 'wide'],
    ['L4J', 'H', '', 'quad'],
    ['L4J', 'M', 'BAE 146', 'regional'],
    ['L2J', 'M', 'BOEING 737-800', 'narrow'],
    ['L2J', 'M', 'EMBRAER ERJ-190', 'regional'],
    ['L2J', 'M', 'GULFSTREAM G650', 'bizjet'],
    ['L2J', 'L', 'XYZ', 'bizjet'],
    ['L1J', 'L', '', 'bizjet'],
    ['L2T', 'M', '', 'turboprop'],
    ['L1T', 'L', '', 'turboprop'],
    ['L1P', 'L', '', 'piston'],
    ['L2P', 'L', '', 'piston'],
    ['H1T', 'L', '', 'heli'],
    ['H2T', 'M', '', 'heli'],
    ['T2T', 'M', '', 'heli'],
    ['G1P', 'L', '', 'piston'],
    ['', 'L', '', 'unknown'],
  ]
  it.each(cases)('%s/%s %s -> %s', (d, w, n, cls) => expect(classFromDescriptor(d, w, n)).toBe(cls))
})

describe('descriptor fallback and resolveClass', () => {
  it('uses the descriptor for codes missing from the table', () => {
    expect(aircraftClassFor('QQ77', { desc: 'L2T', wtc: 'M' })).toBe('turboprop')
    expect(aircraftClassFor('QQ78', { desc: 'H1P', wtc: 'L' })).toBe('heli')
  })
  it('table overrides the descriptor', () => {
    expect(aircraftClassFor('E75L', { desc: 'L2J', wtc: 'M', name: 'X' })).toBe('regional')
  })
  it('falls back to the emitter category only when the type is unknown', () => {
    expect(resolveClass('', 6)).toBe('wide')
    expect(resolveClass('C172', 6)).toBe('piston')
    expect(resolveClass('', 0)).toBe('unknown')
  })
})
