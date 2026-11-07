import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { type RotorSpec, rotorGeometry } from './propGeometry'

/** A baked Flightradar24 airframe: shared geometry (length 1, nose -Z) + spinning parts. */
export interface ModelInfo {
  geo: THREE.BufferGeometry
  lengthM: number
  rotors: readonly RotorSpec[]
}

interface RotorExtra {
  pos: [number, number, number]
  axis: 'x' | 'y' | 'z'
  radius: number
  rate: number
}

const loaded = new Map<string, ModelInfo>()
const pending = new Set<string>()
let loader: GLTFLoader | null = null

/** Sync lookup; kicks off a lazy load on first request. Returns null until ready (or on failure). */
export function getModel(name: string): ModelInfo | null {
  const m = loaded.get(name)
  if (m) return m
  if (!pending.has(name)) {
    pending.add(name)
    load(name).catch(() => {
      /* stays procedural */
    })
  }
  return null
}

async function load(name: string): Promise<void> {
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(`/models/${name}.glb`)
  let mesh: THREE.Mesh | null = null
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
  })
  if (!mesh) throw new Error('no mesh')
  const src = (mesh as THREE.Mesh).geometry
  gltf.scene.updateMatrixWorld(true)
  // Dequantize to plain float positions (positions only: shading is flat).
  const p = src.getAttribute('position')
  const arr = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    arr[i * 3] = p.getX(i)
    arr[i * 3 + 1] = p.getY(i)
    arr[i * 3 + 2] = p.getZ(i)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  geo.setIndex(src.getIndex())
  geo.applyMatrix4((mesh as THREE.Mesh).matrixWorld)
  geo.computeBoundingSphere()
  src.dispose()
  const ex = gltf.scene.userData as { lengthM?: number; rotors?: RotorExtra[] }
  loaded.set(name, {
    geo,
    lengthM: ex.lengthM ?? 38,
    rotors: (ex.rotors ?? []).map((r) => ({
      geo: rotorGeometry(r.axis, r.radius),
      pos: r.pos,
      axis: r.axis,
      rate: r.rate,
    })),
  })
}

export function disposeModels(): void {
  loaded.forEach((m) => m.geo.dispose())
  loaded.clear()
  pending.clear()
}
