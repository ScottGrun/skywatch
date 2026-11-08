import { expect, test } from 'vitest'
import { bunzip2 } from './bzip2'

// `bzip2 -1` of: 'hello radar ' x50 + bytes 0..255 x3 + 5000 zero bytes + 25 'a' + 'b'
const FIXTURE =
  'QlpoMTFBWSZTWUOpBQoAAXX/////////////////////////////////////////////wAG8AAkwAEwABMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEmAAmAAJgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAkwAEwABMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACP1VUTRqaMNR6QGExMmgGhoZPSMmj0JtGo9T1AYg0egmh6BMCDCMmACY1HoCNBoyYTTTE0yYjCZDEAYACYmATAAcoiOdIxEIkIp8iIklBUJJugUN0LolEUVRlHSjo3SJVSHSumdOnOpdUpKlKWpjq1NU5T1vqCQRELdCIdY61UnXOvdg7F2Ts3aKm7V2zt1Udw7l3Sqqs7tLKu7x3qsKy75WnfvAS6tq4rrwVeTCvrAmXhPDTTxE28V4zx3kPJeUsKxLG8t5jzXnLI896CcWVMp+zpeEQtMIhJJr0UjCIWlJJ2EQ9N6iYREJOdUFalrScIhbFtQhbkhCIeqm1vSkIhRYRC4JVcVyXNdHrPXew9ldV2XdeHtPbXlenuL2vi+r8v7AMCwTBsIwr3WGYdiE89576en0sxLFMWxjGsc+B8LHvifG+R8rIPmfOyLJPoZNlGVZZ9LLvqZh9bMs0zb7GcfazrPPuZ9oGhfe/BomjaRpX4tM078n5v0ahqWqfq/Z+7+H8v6f2/xq2sa1rmvbBsWybNtG1bZt3+tw3LdP+btvG9b5v3AcFwn/uG4jiuM47kOS5SykRy3LcxzXOc8XckU4UJBDqQUKA='

test('bunzip2 round-trips a fixture with runs and all byte values', () => {
  const out = bunzip2(Uint8Array.from(Buffer.from(FIXTURE, 'base64')))
  const expected = new Uint8Array(600 + 768 + 5000 + 26)
  expected.set(new TextEncoder().encode('hello radar '.repeat(50)), 0)
  for (let i = 0; i < 768; i++) expected[600 + i] = i & 255
  expected.fill(97, 600 + 768 + 5000, expected.length - 1)
  expected[expected.length - 1] = 98
  expect(out.length).toBe(expected.length)
  expect(Array.from(out)).toEqual(Array.from(expected))
})

test('bunzip2 rejects non-bzip2 input', () => {
  expect(() => bunzip2(new Uint8Array([1, 2, 3, 4, 5, 6]))).toThrow('bad magic')
})
