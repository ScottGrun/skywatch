import * as THREE from 'three'
import { BG } from './constants'

/** Shared uniforms for the radial ground fog (centered on the camera orbit target, xz plane). */
export const radialFog = {
  center: { value: new THREE.Vector2(0, 0) },
  near: { value: 100 },
  far: { value: 250 },
  color: {
    value: new THREE.Vector3(((BG >> 16) & 255) / 255, ((BG >> 8) & 255) / 255, (BG & 255) / 255),
  },
}

/** Fog target color; must equal the map's edge/ground color so the circle fades cleanly. */
export function setFogColor(hex: number): void {
  radialFog.color.value.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255)
}

/** Makes a ground material fade to the background color by world-space distance from the fog center. */
export function applyRadialFog<T extends THREE.Material>(mat: T): T {
  ;(mat as unknown as { fog: boolean }).fog = false
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFogCenter = radialFog.center
    shader.uniforms.uFogNear = radialFog.near
    shader.uniforms.uFogFar = radialFog.far
    shader.uniforms.uFogColor = radialFog.color
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogW;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFogW = (modelMatrix * vec4(transformed, 1.0)).xz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vFogW;\nuniform vec2 uFogCenter;\nuniform float uFogNear;\nuniform float uFogFar;\nuniform vec3 uFogColor;',
      )
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, smoothstep(uFogNear, uFogFar, distance(vFogW, uFogCenter)));',
      )
  }
  mat.customProgramCacheKey = () => 'radialFog'
  return mat
}
