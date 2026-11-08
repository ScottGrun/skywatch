// Voxel "blocks" geometry from the dBZ grid: downsample, quantize to colour categories and emit only the faces
// between a filled cell and an empty / lower-category neighbour. Pure typed-array output (built in the worker).
import { GRID } from './radarGrid.ts'
import { radarColor } from './radarColor.ts'

export const BLOCK = {
  /** Cells below this dBZ are not drawn. */
  minDbz: 20,
  /** Source cells merged per block along x/y and z. */
  fxy: 2,
  fz: 2,
  /** dBZ per colour category (adjacent blocks of the same category merge into one body). */
  catStep: 5,
}

export interface BlockData {
  /** xyz per vertex, km, scene frame (x east, z south, y MSL km; the airport elevation is applied by the mesh). */
  pos: Float32Array
  /** rgb + layer index (0-255 over the grid height). */
  col: Uint8Array
  /** Face normal xyz (+ pad), as small signed ints. */
  nrm: Int8Array
  /** Quad corner coordinates 0/1. */
  uv: Uint8Array
  index: Uint32Array
  faces: number
}

/** Max over each fxy x fxy x fz block; returns dims too. */
function downsample(grid: Uint8Array) {
  const { nx, ny, nz } = GRID
  const { fxy, fz } = BLOCK
  const bx = nx / fxy
  const by = ny / fxy
  const bz = nz / fz
  const out = new Uint8Array(bx * by * bz)
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++) {
      const src = (k * ny + j) * nx
      const dst = (((k / fz) | 0) * by + ((j / fxy) | 0)) * bx
      for (let i = 0; i < nx; i++) {
        const v = grid[src + i]!
        const o = dst + ((i / fxy) | 0)
        if (v > out[o]!) out[o] = v
      }
    }
  return { out, bx, by, bz }
}

const DIRS: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

export function buildBlocks(grid: Uint8Array): BlockData {
  const { out, bx, by, bz } = downsample(grid)
  const { minDbz, catStep, fxy, fz } = BLOCK
  const cat = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) {
    const v = out[i]!
    cat[i] = v >= minDbz ? 1 + Math.floor((v - minDbz) / catStep) : 0
  }
  const at = (i: number, j: number, k: number) =>
    i < 0 || j < 0 || k < 0 || i >= bx || j >= by || k >= bz ? 0 : cat[(k * by + j) * bx + i]!

  // pass 1: count faces
  let faces = 0
  for (let k = 0; k < bz; k++)
    for (let j = 0; j < by; j++)
      for (let i = 0; i < bx; i++) {
        const c = cat[(k * by + j) * bx + i]!
        if (!c) continue
        for (const [dx, dy, dz] of DIRS) {
          if (k === 0 && dz < 0) continue // floor of the grid
          if (at(i + dx, j + dy, k + dz) < c) faces++
        }
      }
  const pos = new Float32Array(faces * 12)
  const col = new Uint8Array(faces * 16)
  const nrm = new Int8Array(faces * 16)
  const uv = new Uint8Array(faces * 8)
  const index = new Uint32Array(faces * 6)
  const cs = GRID.cell * fxy
  const hz = GRID.dz * fz
  let f = 0
  for (let k = 0; k < bz; k++)
    for (let j = 0; j < by; j++)
      for (let i = 0; i < bx; i++) {
        const c = cat[(k * by + j) * bx + i]!
        if (!c) continue
        const rgb = radarColor(minDbz + (c - 0.5) * catStep)
        const x0 = -GRID.half + i * cs
        const z1 = GRID.half - j * cs // north is -z
        const y0 = k * hz
        for (const [dx, dy, dz] of DIRS) {
          if (k === 0 && dz < 0) continue
          if (at(i + dx, j + dy, k + dz) >= c) continue
          // grid dirs (x east, y north, z up) -> scene axes (x, y up, z = -north)
          const n = [dx, dz, -dy] as const
          const c3 = [x0 + cs / 2, y0 + hz / 2, z1 - cs / 2] as const
          const half = [cs / 2, hz / 2, cs / 2] as const
          const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2
          const a1 = (axis + 1) % 3
          const a2 = (axis + 2) % 3
          for (let v = 0; v < 4; v++) {
            const s1 = v & 1 ? 1 : -1
            const s2 = v & 2 ? 1 : -1
            const o = f * 4 + v
            const p = [c3[0], c3[1], c3[2]]
            p[axis]! += n[axis]! * half[axis]!
            p[a1]! += s1 * half[a1]!
            p[a2]! += s2 * half[a2]!
            pos.set(p, o * 3)
            col.set([rgb[0], rgb[1], rgb[2], Math.round(((k + 0.5) / bz) * 255)], o * 4)
            nrm.set([n[0], n[1], n[2], 0], o * 4)
            uv.set([v & 1, v >> 1], o * 2)
          }
          // (axis, a1, a2) is an even permutation, so a1 x a2 = +axis: CCW seen from +axis for positive normals
          const b = f * 4
          index.set(
            n[axis]! > 0
              ? [b, b + 1, b + 2, b + 1, b + 3, b + 2]
              : [b, b + 2, b + 1, b + 1, b + 2, b + 3],
            f * 6,
          )
          f++
        }
      }
  return { pos, col, nrm, uv, index, faces }
}

/** Composite (column max) reflectivity, GRID.nx x GRID.ny, row j = north index. */
export function compositeMax(grid: Uint8Array): Uint8Array {
  const { nx, ny, nz } = GRID
  const out = new Uint8Array(nx * ny)
  for (let k = 0; k < nz; k++) {
    const base = k * nx * ny
    for (let i = 0; i < nx * ny; i++) {
      const v = grid[base + i]!
      if (v > out[i]!) out[i] = v
    }
  }
  return out
}
