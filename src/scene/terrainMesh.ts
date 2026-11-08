import * as THREE from 'three'
import { toLocal } from '../core/geo'
import type { Airport } from '../types'
import { applyRadialFog } from './radialFog'
import { terrainY } from './terrain'
import { terrainBlend, vscale } from './vertical'
import { tileXToLon, tileYToLat } from './tileMath'

const SKIRT_KM = 1.2
/** Hillshade: light from the north-west, 45 degrees up (scene -Z is north). */
const LIGHT = new THREE.Vector3(-0.5, 0.707, -0.5).normalize()
/** Hillshade strength uniform (the light theme uses less, it reads as dirt on a pale map). */
export const hillshade = { value: 0.75 }

export interface TileSpec {
  ap: Airport
  z: number
  tx: number
  ty: number
  segs: number
  /** Added to every vertex Y (the outer ring sits slightly below the detailed one). */
  dropY: number
}

/**
 * Tile mesh geometry in world coordinates (x = east, z = -north). Heights come from the shared
 * terrain sampler, so neighbouring tiles get identical edge vertices; a downward skirt hides any
 * residual crack. Heights are at x1 vertical scale (the parent group scales Y); `aSlope` holds the x1 ground slopes (dy/de, dy/dn) so the shader shades for the live scale.
 */
const tmpP = new THREE.Vector3()

export function buildTileGeometry(t: TileSpec): THREE.BufferGeometry {
  const { ap, z, tx, ty, segs, dropY } = t
  const S = segs + 1
  const total = S * S + 4 * segs
  const pos = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  const slope = new Float32Array(total * 2)
  const idx: number[] = []
  const p0 = toLocal(ap, tileYToLat(ty, z), tileXToLon(tx, z))
  const p1 = toLocal(ap, tileYToLat(ty + 1, z), tileXToLon(tx + 1, z))
  const d = Math.max(0.05, Math.min(p1.e - p0.e, p0.n - p1.n) / segs / 2)
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const v = j * S + i
      const loc = toLocal(ap, tileYToLat(ty + j / segs, z), tileXToLon(tx + i / segs, z))
      pos[v * 3] = loc.e
      pos[v * 3 + 1] = terrainY(loc.e, loc.n) + dropY
      pos[v * 3 + 2] = -loc.n
      uv[v * 2] = i / segs
      uv[v * 2 + 1] = 1 - j / segs
      const sx = (terrainY(loc.e + d, loc.n) - terrainY(loc.e - d, loc.n)) / (2 * d)
      const sn = (terrainY(loc.e, loc.n + d) - terrainY(loc.e, loc.n - d)) / (2 * d)
      slope[v * 2] = sx
      slope[v * 2 + 1] = sn
      if (j < segs && i < segs) idx.push(v, v + S, v + 1, v + 1, v + S, v + S + 1)
    }
  }
  // Skirt: perimeter vertices (clockwise from NW) duplicated SKIRT_KM lower.
  const ring: number[] = []
  for (let i = 0; i < segs; i++) ring.push(i)
  for (let j = 0; j < segs; j++) ring.push(j * S + segs)
  for (let i = segs; i > 0; i--) ring.push(segs * S + i)
  for (let j = segs; j > 0; j--) ring.push(j * S)
  const base = S * S
  ring.forEach((v, k) => {
    const s = base + k
    pos[s * 3] = pos[v * 3]
    pos[s * 3 + 1] = pos[v * 3 + 1] - SKIRT_KM
    pos[s * 3 + 2] = pos[v * 3 + 2]
    uv[s * 2] = uv[v * 2]
    uv[s * 2 + 1] = uv[v * 2 + 1]
    slope[s * 2] = slope[v * 2]
    slope[s * 2 + 1] = slope[v * 2 + 1]
  })
  ring.forEach((v, k) => {
    const k2 = (k + 1) % ring.length
    // Winding is irrelevant: the skirt is rendered double-sided.
    idx.push(v, base + k, ring[k2], ring[k2], base + k, base + k2)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('aSlope', new THREE.BufferAttribute(slope, 2))
  g.setIndex(idx)
  // Bounds include the flat (terrain-off) height too, so culling is right at any relief blend.
  g.computeBoundingBox()
  const bb = g.boundingBox!
  bb.expandByPoint(tmpP.set((bb.min.x + bb.max.x) / 2, dropY, (bb.min.z + bb.max.z) / 2))
  bb.getBoundingSphere((g.boundingSphere = new THREE.Sphere()))
  return g
}

export interface TerrainMaterial {
  mat: THREE.MeshBasicMaterial
  /** World xz rectangle (minX, minZ, maxX, maxZ) discarded by the outer ring (covered by the inner one). */
  hole: THREE.Vector4
}

/** Edge fade for the detail patch: world xz box (minX, minZ, maxX, maxZ) and fade width in km. */
export interface EdgeFade {
  box: readonly [number, number, number, number]
  widthKm: number
}

/**
 * Tile material: radial ground fog + hillshade + terrain/flat blend. With `fade`, alpha ramps up
 * from the box edge inward and the material is drawn over the base tiles (polygon offset pulled
 * toward the camera) so the patch blends into the coarser map instead of ending in a seam.
 */
export function createTerrainMaterial(flatY: number, bg: number, fade?: EdgeFade): TerrainMaterial {
  const mat = applyRadialFog(new THREE.MeshBasicMaterial({ color: bg, side: THREE.DoubleSide }))
  mat.polygonOffset = true
  mat.polygonOffsetFactor = fade ? -2 : 1
  mat.polygonOffsetUnits = fade ? -2 : 1
  if (fade) {
    mat.transparent = true
    // Double-sided only for the skirt; a second blended pass over the same surface would double the draw calls.
    mat.forceSinglePass = true
  }
  const hole = new THREE.Vector4(0, 0, 0, 0)
  const fog = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    fog.call(mat, shader, renderer)
    shader.uniforms.uTerr = terrainBlend
    shader.uniforms.uFlatY = { value: flatY }
    shader.uniforms.uVK = vscale.uniform
    shader.uniforms.uShadeK = hillshade
    shader.uniforms.uHole = { value: hole }
    if (fade) {
      shader.uniforms.uFadeBox = { value: new THREE.Vector4(...fade.box) }
      shader.uniforms.uFadeW = { value: fade.widthKm }
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aSlope;\nvarying float vShade;\nuniform float uTerr;\nuniform float uFlatY;\nuniform float uVK;\nuniform float uShadeK;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed.y = mix(uFlatY, transformed.y, uTerr);
vec2 sl = aSlope * uVK;
float ndl = (-sl.x * ${LIGHT.x.toFixed(4)} + ${LIGHT.y.toFixed(4)} + sl.y * ${LIGHT.z.toFixed(4)}) / length(vec3(sl.x, 1.0, sl.y));
vShade = mix(1.0, 1.0 + uShadeK * (clamp(ndl / ${LIGHT.y.toFixed(4)}, 0.15, 1.9) - 1.0), uTerr);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;\nuniform vec4 uHole;')
      .replace(
        'void main() {',
        'void main() {\nif (uHole.z > uHole.x && vFogW.x > uHole.x && vFogW.x < uHole.z && vFogW.y > uHole.y && vFogW.y < uHole.w) discard;',
      )
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vShade;')
    if (fade) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec4 uFadeBox;\nuniform float uFadeW;',
        )
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\n{ vec2 dd = min(vFogW - uFadeBox.xy, uFadeBox.zw - vFogW); diffuseColor.a *= smoothstep(0.0, uFadeW, min(dd.x, dd.y)); }',
        )
    }
  }
  mat.customProgramCacheKey = () => (fade ? 'radialFog+terrain+fade' : 'radialFog+terrain')
  return { mat, hole }
}
