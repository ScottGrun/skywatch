import * as THREE from 'three'
import { buildRadarLut } from '../core/radarColor'
import { GRID } from '../core/radarGrid'
import { radialFog } from './radialFog'
import { RADAR_FRAG, RADAR_VERT } from './radarShader'
import { vscale } from './vertical'

export interface RadarMesh {
  mesh: THREE.Mesh
  /** Replace the dBZ grid (layout of core/radarGrid). */
  setGrid(grid: Uint8Array): void
  /** Target opacity 0-1; the uniform eases toward it each frame. */
  setOpacity(a: number): void
  dispose(): void
}

const MIN_STEP = 0.8 // km
const MAX_STEP = 4
const GROW = 0.05
const SIGMA = 0.45

/** Box volume in the scene's km frame: centered on the airport, MSL 0-12 km shifted by the airport elevation. */
export function createRadarMesh(airportElevKm: number): RadarMesh {
  const sx = GRID.nx * GRID.cell
  const sz = GRID.ny * GRID.cell
  const sy = GRID.nz * GRID.dz
  const tex = new THREE.Data3DTexture(
    new Uint8Array(GRID.nx * GRID.ny * GRID.nz),
    GRID.nx,
    GRID.ny,
    GRID.nz,
  )
  tex.format = THREE.RedFormat
  tex.type = THREE.UnsignedByteType
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  const lut = new THREE.DataTexture(
    buildRadarLut(),
    256,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  lut.minFilter = lut.magFilter = THREE.LinearFilter
  lut.needsUpdate = true

  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: RADAR_VERT,
    fragmentShader: RADAR_FRAG,
    uniforms: {
      uVol: { value: tex },
      uLut: { value: lut },
      uSize: { value: new THREE.Vector3(sx, sy, sz) },
      uOrigin: { value: new THREE.Vector3(0, 0, 0) },
      uVK: vscale.uniform,
      uMinStep: { value: MIN_STEP },
      uMaxStep: { value: MAX_STEP },
      uGrow: { value: GROW },
      uSigma: { value: SIGMA },
      uOpacity: { value: 0 },
      uFogCenter: radialFog.center,
      uFogNear: radialFog.near,
      uFogFar: radialFog.far,
    },
    side: THREE.BackSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: false,
  })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat)
  mesh.position.set(0, sy / 2 - airportElevKm, 0)
  mesh.frustumCulled = false
  mesh.renderOrder = 10_000 // last: composites over rings, pavement, lights and aircraft
  mesh.visible = false
  let target = 0.7
  let last = performance.now()
  mat.uniforms.uOpacity!.value = target
  mesh.onBeforeRender = () => {
    const now = performance.now()
    const k = 1 - Math.exp(-(now - last) / 120)
    last = now
    const u = mat.uniforms.uOpacity!
    u.value += (target - u.value) * k
  }

  return {
    mesh,
    setOpacity(a) {
      target = a
    },
    setGrid(grid) {
      tex.image.data = grid
      tex.needsUpdate = true
      mesh.visible = true
    },
    dispose() {
      mesh.geometry.dispose()
      mat.dispose()
      tex.dispose()
      lut.dispose()
    },
  }
}
