import * as THREE from 'three'
import type { LightColor, LightKind } from '../core/lightLayout'
import { FOV } from './constants'
import { radialFog } from './radialFog'
import type { Theme } from '../types'

/** Pixels per km at 1 km distance (set from the drawing-buffer height; shared by every light layer). */
export const lightView = { px: { value: 1000 } }

export function setLightViewport(heightPx: number): void {
  lightView.px.value = heightPx / (2 * Math.tan((FOV * Math.PI) / 360))
}

type Rgb = readonly [number, number, number]

interface LightLook {
  colors: Record<LightColor, Rgb>
  /** Sprite size multiplier. */
  size: number
  /** Overall alpha. */
  intensity: number
  /** Point size clamp in device px. */
  minPx: number
  maxPx: number
  additive: boolean
}

/** Dark: bright warm glows blended additively. Light: darker, smaller dots with normal blending. */
export const LOOKS: Record<Theme, LightLook> = {
  dark: {
    colors: {
      white: [1, 0.93, 0.78],
      yellow: [1, 0.72, 0.12],
      green: [0.15, 1, 0.35],
      red: [1, 0.12, 0.08],
    },
    size: 3,
    intensity: 1,
    minPx: 3.5,
    maxPx: 30,
    additive: true,
  },
  light: {
    colors: {
      white: [0.9, 0.55, 0.05],
      yellow: [0.85, 0.45, 0],
      green: [0, 0.55, 0.2],
      red: [0.8, 0.05, 0.05],
    },
    size: 0.6,
    intensity: 0.75,
    minPx: 2,
    maxPx: 12,
    additive: false,
  },
}

/** Base sprite diameter per light kind (km) and relative brightness. */
export const KIND_LOOK: Record<LightKind, { size: number; glow: number }> = {
  edge: { size: 0.011, glow: 0.9 },
  threshold: { size: 0.011, glow: 1 },
  end: { size: 0.011, glow: 1 },
  center: { size: 0.008, glow: 0.8 },
  tdz: { size: 0.008, glow: 0.9 },
  approach: { size: 0.011, glow: 1 },
  rabbit: { size: 0.028, glow: 1 },
  papi: { size: 0.016, glow: 1 },
}

/** Soft round glow sprite drawn on a canvas. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d') as CanvasRenderingContext2D
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.28)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
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
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float raw = aSize * uMul * uPx / max(-mv.z, 0.01);
  vec2 w = (modelMatrix * vec4(position, 1.0)).xz;
  float fade = 1.0 - smoothstep(uFogNear, uFogFar, distance(w, uFogCenter));
  // Below the minimum size the light shrinks no further but dims, so distant rows read as faint lines.
  vA = aGlow * uInt * fade * clamp(raw / uMin, 0.5, 1.0);
  vCol = aColor;
  gl_PointSize = vA > 0.01 ? clamp(raw, uMin, uMax) : 0.0;
  gl_Position = projectionMatrix * mv;
}`

const FRAG = `
uniform sampler2D uMap;
varying vec3 vCol;
varying float vA;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vA;
  gl_FragColor = vec4(vCol, a);
}`

export function createLightMaterial(theme: Theme): THREE.ShaderMaterial {
  const look = LOOKS[theme]
  const map = glowTexture()
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uPx: lightView.px,
      uMul: { value: look.size },
      uMin: { value: look.minPx },
      uMax: { value: look.maxPx },
      uInt: { value: look.intensity },
      uFogCenter: radialFog.center,
      uFogNear: radialFog.near,
      uFogFar: radialFog.far,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: look.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  // disposeObject() disposes `material.map`; point it at the sprite so it is freed with the lights.
  ;(mat as unknown as { map: THREE.Texture }).map = map
  return mat
}
