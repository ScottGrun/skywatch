import { expect, test } from 'vitest'
import { buildBlocks, compositeMax } from './radarBlocks'
import { GRID } from './radarGrid'

const idx = (i: number, j: number, k: number) => (k * GRID.ny + j) * GRID.nx + i
const empty = () => new Uint8Array(GRID.nx * GRID.ny * GRID.nz)

test('empty grid and sub-threshold echo make no faces', () => {
  const g = empty()
  g[idx(100, 100, 4)] = 19
  expect(buildBlocks(g).faces).toBe(0)
})

test('a lone block has 6 faces, outward normals and the right size', () => {
  const g = empty()
  g[idx(100, 100, 4)] = 40 // downsampled block (50, 50, 2)
  const b = buildBlocks(g)
  expect(b.faces).toBe(6)
  expect(b.index.length).toBe(36)
  const xs = Array.from({ length: 24 }, (_, v) => b.pos[v * 3]!)
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2)
  const ys = Array.from({ length: 24 }, (_, v) => b.pos[v * 3 + 1]!)
  expect(Math.min(...ys)).toBeCloseTo(2) // block k=2 spans 2..3 km
  expect(Math.max(...ys)).toBeCloseTo(3)
  // winding agrees with the stored normal for every face
  for (let f = 0; f < 6; f++) {
    const [a, c, d] = [0, 1, 2].map((t) => b.index[f * 6 + t]!)
    const p = (v: number) => [b.pos[v * 3]!, b.pos[v * 3 + 1]!, b.pos[v * 3 + 2]!]
    const [pa, pc, pd] = [p(a!), p(c!), p(d!)]
    const u = pc.map((x, i) => x - pa![i]!)
    const w = pd.map((x, i) => x - pa![i]!)
    const n = [
      u[1]! * w[2]! - u[2]! * w[1]!,
      u[2]! * w[0]! - u[0]! * w[2]!,
      u[0]! * w[1]! - u[1]! * w[0]!,
    ]
    const s = [0, 1, 2].map((i) => b.nrm[a! * 4 + i]!)
    expect(n[0]! * s[0]! + n[1]! * s[1]! + n[2]! * s[2]!).toBeGreaterThan(0)
  }
})

test('same-category neighbours merge; a higher category keeps its own faces', () => {
  const g = empty()
  g[idx(100, 100, 4)] = 40
  g[idx(102, 100, 4)] = 40
  expect(buildBlocks(g).faces).toBe(10) // 2 x 6 - 2 shared
  g[idx(102, 100, 4)] = 55
  // 40 block keeps 5 (its +x side is toward a higher cell), 55 block 6
  expect(buildBlocks(g).faces).toBe(11)
})

test('nothing is emitted under the grid floor', () => {
  const g = empty()
  g[idx(100, 100, 0)] = 40
  expect(buildBlocks(g).faces).toBe(5)
})

test('composite is the column maximum', () => {
  const g = empty()
  g[idx(3, 4, 2)] = 30
  g[idx(3, 4, 9)] = 45
  expect(compositeMax(g)[4 * GRID.nx + 3]).toBe(45)
})
