import * as THREE from 'three'
import { toLocal } from '../core/geo'
import type { Airport } from '../types'
import { BG } from './constants'
import { applyRadialFog } from './radialFog'
import { terrainY } from './terrain'
import { tileXToLon, tileYToLat } from './tileMath'

/** 1 = terrain relief, 0 = flat (shared by every ground material so the toggle is instant). */
export const terrainBlend = { value: 1 }
const SKIRT_KM = 1.2
/** Hillshade: light from the north-west, 45 degrees up (scene -Z is north). */
const LIGHT = new THREE.Vector3(-0.5, 0.707, -0.5).normalize()
const FLAT_NDL = LIGHT.y
const SHADE_STRENGTH = 0.75

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
 * residual crack. Attribute `aShade` is a precomputed hillshade factor (1 = flat ground).
 */
export function buildTileGeometry(t: TileSpec): THREE.BufferGeometry {
  const { ap, z, tx, ty, segs, dropY } = t
  const S = segs + 1
  const total = S * S + 4 * segs
  const pos = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  const shade = new Float32Array(total)
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
      const ndl = (-sx * LIGHT.x + LIGHT.y + sn * LIGHT.z) / Math.hypot(sx, 1, sn)
      shade[v] = 1 + SHADE_STRENGTH * (Math.min(1.9, Math.max(0.15, ndl / FLAT_NDL)) - 1)
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
    shade[s] = shade[v]
  })
  ring.forEach((v, k) => {
    const k2 = (k + 1) % ring.length
    // Winding is irrelevant: the skirt is rendered double-sided.
    idx.push(v, base + k, ring[k2], ring[k2], base + k, base + k2)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1))
  g.setIndex(idx)
  return g
}

export interface TerrainMaterial {
  mat: THREE.MeshBasicMaterial
  /** World xz rectangle (minX, minZ, maxX, maxZ) discarded by the outer ring (covered by the inner one). */
  hole: THREE.Vector4
}

/** Tile material: radial ground fog + hillshade + terrain/flat blend. */
export function createTerrainMaterial(flatY: number): TerrainMaterial {
  const mat = applyRadialFog(new THREE.MeshBasicMaterial({ color: BG, side: THREE.DoubleSide }))
  mat.polygonOffset = true
  mat.polygonOffsetFactor = 1
  mat.polygonOffsetUnits = 1
  const hole = new THREE.Vector4(0, 0, 0, 0)
  const fog = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    fog.call(mat, shader, renderer)
    shader.uniforms.uTerr = terrainBlend
    shader.uniforms.uFlatY = { value: flatY }
    shader.uniforms.uHole = { value: hole }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aShade;\nvarying float vShade;\nuniform float uTerr;\nuniform float uFlatY;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.y = mix(uFlatY, transformed.y, uTerr);\nvShade = mix(1.0, aShade, uTerr);',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;\nuniform vec4 uHole;')
      .replace(
        'void main() {',
        'void main() {\nif (uHole.z > uHole.x && vFogW.x > uHole.x && vFogW.x < uHole.z && vFogW.y > uHole.y && vFogW.y < uHole.w) discard;',
      )
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vShade;')
  }
  mat.customProgramCacheKey = () => 'radialFog+terrain'
  return { mat, hole }
}
