import * as THREE from 'three'
import type { LightColor, LightKind } from '../core/lightLayout'
import { FOV } from './constants'
import { radialFog } from './radialFog'

/** Pixels per km at 1 km distance (set from the drawing-buffer height; shared by every light layer). */
export const lightView = { px: { value: 1000 } }

export function setLightViewport(heightPx: number): void {
  lightView.px.value = heightPx / (2 * Math.tan((FOV * Math.PI) / 360))
}

type Rgb = readonly [number, number, number]

/** Night look: saturated colors, hot cores, additive halos. (Lights are not drawn in the light theme.) */
export const LOOK = {
  colors: {
    white: [1, 0.9, 0.7],
    yellow: [1, 0.68, 0.1],
    green: [0.1, 1, 0.3],
    red: [1, 0.1, 0.06],
  } satisfies Record<LightColor, Rgb>,
  /** Sprite diameter multiplier: the sprite spans the halo, the core is ~28% of it. */
  size: 4,
  /** Sprite diameter clamp in device px (core = ~28%): crisp dots up close, visible from mid range. */
  minPx: 6,
  maxPx: 22,
}

/** Base halo-sprite diameter per light kind (km) and relative brightness. */
export const KIND_LOOK: Record<LightKind, { size: number; glow: number }> = {
  edge: { size: 0.0045, glow: 0.8 },
  threshold: { size: 0.005, glow: 0.9 },
  end: { size: 0.005, glow: 0.9 },
  center: { size: 0.0035, glow: 0.65 },
  tdz: { size: 0.0035, glow: 0.75 },
  approach: { size: 0.0045, glow: 0.85 },
  rabbit: { size: 0.008, glow: 1 },
  papi: { size: 0.007, glow: 1 },
}

const VERT = `
attribute vec3 aColor;
attribute float aSize;
attribute float aGlow;
uniform float uPx, uMul, uMin, uMax, uInt;
uniform vec2 uFogCenter;
uniform float uFogNear, uFogFar;
varying vec3 vCol;
varying float vA;
varying float vR;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Strobe flashes (glow > 1) also swell a little.
  float raw = aSize * uMul * (1.0 + 0.35 * max(aGlow - 1.0, 0.0)) * uPx / max(-mv.z, 0.01);
  vec2 w = (modelMatrix * vec4(position, 1.0)).xz;
  float fade = 1.0 - smoothstep(uFogNear, uFogFar, distance(w, uFogCenter));
  // Below the minimum size a light shrinks no further but dims, so distant rows read as faint lines.
  vA = aGlow * uInt * fade * clamp(raw / uMin, 0.25, 1.0);
  // 1 up close, 0 once the sprite is at its minimum size: halos and white-hot cores fade out at range.
  vR = smoothstep(uMin, uMin * 3.0, raw);
  vCol = aColor;
  gl_PointSize = vA > 0.01 ? clamp(raw, uMin, uMax) * uScale : 0.0;
  gl_Position = projectionMatrix * mv;
}`

// Core: small hot near-white disc tinted at its rim; halo: exponential falloff in the light's color.
const FRAG = `
uniform float uBloom;
varying vec3 vCol;
varying float vA;
varying float vR;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float halo = exp(-r * 8.0) * (1.0 - r);
  float core = exp(-pow(r / 0.3, 2.0));
  vec3 c;
  float i;
  if (uBloom > 0.5) {
    // Wide faint bloom layer (same geometry, larger sprite): halo only, close range only.
    i = exp(-r * 4.0) * (1.0 - r) * 0.1 * vA * vR;
    c = vCol;
  } else {
    // Hot core only up close; at range the point stays a saturated color.
    c = mix(vCol, vec3(1.0), core * 0.55 * vR);
    i = min(core * 1.0 + halo * 0.7 * vR, 1.0) * min(vA, 2.0);
  }
  gl_FragColor = vec4(c, clamp(i, 0.0, 1.0));
}`

/** `bloom` = the large, very faint second layer (no post-processing; same points, bigger sprite). */
export function createLightMaterial(bloom: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPx: lightView.px,
      uMul: { value: LOOK.size },
      uMin: { value: LOOK.minPx },
      uMax: { value: LOOK.maxPx },
      uInt: { value: 1 },
      uScale: { value: bloom ? 2 : 1 },
      uBloom: { value: bloom ? 1 : 0 },
      uFogCenter: radialFog.center,
      uFogNear: radialFog.near,
      uFogFar: radialFog.far,
    },
    vertexShader: VERT.replace('uniform float uPx,', 'uniform float uScale, uPx,'),
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}
