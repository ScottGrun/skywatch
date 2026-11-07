// Downloads the Flightradar24 3D models (GPL-2.0), strips them to plain geometry, simplifies,
// quantizes and writes public/models/<name>.glb.   Run: pnpm bake:models [name...]
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { Document, NodeIO, type Node } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { quantize } from '@gltf-transform/functions'
import gltfPipeline from 'gltf-pipeline'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { MODELS, type ModelSpec } from './modelSpecs.ts'

const RAW = '.cache/raw'
const OUT = 'public/models'
const BASE = 'https://raw.githubusercontent.com/Flightradar24/fr24-3d-models/master/models/'

type V3 = [number, number, number]

async function download(name: string): Promise<Buffer> {
  const f = `${RAW}/${name}.glb`
  if (!existsSync(f)) {
    const res = await fetch(`${BASE}${name}.glb`)
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    writeFileSync(f, Buffer.from(await res.arrayBuffer()))
  }
  return readFileSync(f)
}

function descendants(n: Node, into: Set<Node>): void {
  into.add(n)
  for (const c of n.listChildren()) descendants(c, into)
}

function bounds(pts: ArrayLike<number>): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity]
  const max: V3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pts.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pts[i + k])
      max[k] = Math.max(max[k], pts[i + k])
    }
  return { min, max }
}

/** World-space vertices (and triangle indices into them) of the given nodes. */
function collect(nodes: Iterable<Node>): { pos: number[]; idx: number[] } {
  const pos: number[] = []
  const idx: number[] = []
  const v: number[] = [0, 0, 0]
  for (const node of nodes) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION')
      if (p.getMode() !== 4 || !a) continue
      const base = pos.length / 3
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v)
        pos.push(
          m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
          m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
          m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
        )
      }
      const ind = p.getIndices()
      const n = ind ? ind.getCount() : a.getCount()
      for (let i = 0; i < n; i++) idx.push(base + (ind ? ind.getScalar(i) : i))
    }
  }
  return { pos, idx }
}

interface Baked {
  pos: Float32Array<ArrayBuffer>
  idx: Uint32Array<ArrayBuffer>
  extras: Record<string, unknown>
}

async function bake(name: string, spec: ModelSpec): Promise<Baked> {
  const up = await gltfPipeline.processGlb(await download(name), {}) // glTF 1.0 -> 2.0
  const src = await new NodeIO().readBinary(new Uint8Array(up.glb))
  const all = src.getRoot().listNodes()

  // Spinning parts become procedural overlays: record placement, drop their meshes.
  const skip = new Set<Node>()
  const raw: { b: { min: V3; max: V3 }; axis: 'x' | 'y' | 'z'; rate: number }[] = []
  for (const rule of spec.rotors ?? []) {
    const group = new Set<Node>()
    for (const n of all) if (rule.re.test(n.getName())) descendants(n, group)
    const c = collect(group)
    if (!c.pos.length) throw new Error(`${name}: rotor rule ${rule.re} matched nothing`)
    raw.push({ b: bounds(c.pos), axis: rule.axis, rate: rule.rate })
    group.forEach((n) => skip.add(n))
  }
  const keep = all.filter((n) => !skip.has(n) && !spec.drop?.test(n.getName()))
  const { pos: p0, idx: i0 } = collect(keep)

  // Nose direction: the fin tip (highest vertex) is aft of the centre.
  const b = bounds(p0)
  let top = 0
  for (let i = 1; i < p0.length / 3; i++) if (p0[i * 3 + 1] > p0[top * 3 + 1]) top = i
  const zMid = (b.min[2] + b.max[2]) / 2
  const noseMinusZ = p0[top * 3 + 2] > zMid !== !!spec.flip
  const sign = noseMinusZ ? 1 : -1
  const length = b.max[2] - b.min[2]
  const s = 1 / length
  const cx = (b.min[0] + b.max[0]) / 2
  const cy = (b.min[1] + b.max[1]) / 2
  const T = (x: number, y: number, z: number): V3 => [
    (x - cx) * s * sign,
    (y - cy) * s,
    (z - zMid) * s * sign,
  ]

  const pos = new Float32Array(p0.length)
  for (let i = 0; i < p0.length; i += 3) pos.set(T(p0[i], p0[i + 1], p0[i + 2]), i)
  let idx = new Uint32Array(i0)
  if (sign < 0)
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]

  // Weld, simplify, compact.
  const remap = MeshoptSimplifier.generatePositionRemap(pos, 3)
  idx = idx.map((i) => remap[i])
  const target = Math.min(spec.tris, idx.length / 3)
  idx = new Uint32Array(
    MeshoptSimplifier.simplify(idx, pos, 3, target * 3, 1, ['Prune', 'Permissive'])[0],
  )
  const [map, unique] = MeshoptSimplifier.compactMesh(idx)
  const outPos = new Float32Array(unique * 3)
  for (let i = 0; i < map.length; i++)
    if (map[i] !== 0xffffffff) outPos.set(pos.subarray(i * 3, i * 3 + 3), map[i] * 3)

  const rotors = raw.map((r) => {
    const a = T(...r.b.min)
    const z = T(...r.b.max)
    const lo = a.map((v, k) => Math.min(v, z[k]))
    const hi = a.map((v, k) => Math.max(v, z[k]))
    const ext = hi.map((v, k) => v - lo[k])
    const ri = 'xyz'.indexOf(r.axis)
    const radius = Math.max(...ext.filter((_, k) => k !== ri)) / 2
    return {
      pos: lo.map((v, k) => +((v + hi[k]) / 2).toFixed(4)),
      axis: r.axis,
      radius: +radius.toFixed(4),
      rate: r.rate,
    }
  })
  const dir = noseMinusZ ? '-Z' : '+Z (flipped)'
  console.log(
    `${name}: ${i0.length / 3} -> ${idx.length / 3} tris, ${length.toFixed(1)} m, nose ${dir}, rotors ${rotors.length}`,
  )
  return { pos: outPos, idx, extras: { lengthM: +length.toFixed(2), rotors } }
}

async function write(name: string, m: Baked): Promise<number> {
  const doc = new Document()
  const buf = doc.createBuffer()
  const posA = doc.createAccessor().setType('VEC3').setArray(m.pos).setBuffer(buf)
  const idxA = doc.createAccessor().setType('SCALAR').setArray(m.idx).setBuffer(buf)
  const prim = doc.createPrimitive().setAttribute('POSITION', posA).setIndices(idxA)
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim))
  const scene = doc.createScene().addChild(node)
  scene.setExtras(m.extras)
  doc.getRoot().setDefaultScene(scene)
  await doc.transform(quantize({ quantizePosition: 14 }))
  doc.createExtension(KHRMeshQuantization).setRequired(true)
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const io = new NodeIO()
    .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  const out = `${OUT}/${name}.glb`
  await io.write(out, doc)
  return statSync(out).size
}

mkdirSync(RAW, { recursive: true })
mkdirSync(OUT, { recursive: true })
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready])
const only = process.argv.slice(2)
let total = 0
for (const [name, spec] of Object.entries(MODELS)) {
  if (only.length && !only.includes(name)) continue
  total += await write(name, await bake(name, spec))
}
console.log(`total ${(total / 1024).toFixed(0)} KB`)
