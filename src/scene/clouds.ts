import * as THREE from 'three'
import type { CloudLayer } from '../types'
import { FT_TO_KM } from './constants'
import { radialFog } from './radialFog'

const RADIUS_KM = 60
const OPACITY: Record<CloudLayer['cover'], number> = {
  FEW: 0.06,
  SCT: 0.12,
  BKN: 0.22,
  OVC: 0.32,
  VV: 0.32,
}
/** Noise threshold: higher = more broken. */
const THRESH: Record<CloudLayer['cover'], number> = {
  FEW: 0.62,
  SCT: 0.5,
  BKN: 0.32,
  OVC: 0.0,
  VV: 0.0,
}

const vert = `
varying vec2 vLocal;
varying vec2 vW;
void main() {
  vLocal = position.xy;
  vW = (modelMatrix * vec4(position, 1.0)).xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const frag = `
varying vec2 vLocal;
varying vec2 vW;
uniform float uOpacity;
uniform float uThresh;
uniform float uRadius;
uniform vec2 uFogCenter;
uniform float uFogNear;
uniform float uFogFar;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vLocal / 9.0;
  float n = 0.5 * vn(p) + 0.3 * vn(p * 2.3 + 7.0) + 0.2 * vn(p * 5.1 + 3.0);
  float cov = smoothstep(uThresh, uThresh + 0.22, n);
  float edge = 1.0 - smoothstep(uRadius * 0.55, uRadius, length(vLocal));
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, distance(vW, uFogCenter));
  gl_FragColor = vec4(0.769, 0.808, 0.847, uOpacity * cov * edge * fog);
}`

export interface CloudsHandle {
  set(layers: readonly CloudLayer[] | null): void
  setEnabled(on: boolean): void
  dispose(): void
}

/** Translucent cloud sheets at each reported layer's AGL base. Parent is the height-scaled group. */
export function createClouds(parent: THREE.Object3D): CloudsHandle {
  const group = new THREE.Group()
  parent.add(group)
  const geo = new THREE.PlaneGeometry(RADIUS_KM * 2, RADIUS_KM * 2)
  let layers: readonly CloudLayer[] = []
  let enabled = true

  const clear = (): void => {
    for (const m of [...group.children] as THREE.Mesh[]) {
      group.remove(m)
      ;(m.material as THREE.Material).dispose()
    }
  }
  const rebuild = (): void => {
    clear()
    group.visible = enabled
    for (const l of layers) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uOpacity: { value: OPACITY[l.cover] },
          uThresh: { value: THRESH[l.cover] },
          uRadius: { value: RADIUS_KM },
          uFogCenter: radialFog.center,
          uFogNear: radialFog.near,
          uFogFar: radialFog.far,
        },
      })
      const m = new THREE.Mesh(geo, mat)
      m.rotation.x = -Math.PI / 2
      m.position.y = Math.max(0, l.baseFt) * FT_TO_KM
      m.renderOrder = 5
      m.frustumCulled = false
      group.add(m)
    }
  }
  return {
    set(l) {
      layers = (l ?? []).filter((x) => x.cover in OPACITY)
      rebuild()
    },
    setEnabled(on) {
      enabled = on
      group.visible = on
    },
    dispose() {
      clear()
      geo.dispose()
      parent.remove(group)
    },
  }
}
