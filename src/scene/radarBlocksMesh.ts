import * as THREE from 'three'
import { buildRadarLut } from '../core/radarColor'
import { GRID } from '../core/radarGrid'
import type { RadarResult } from '../data/radarTypes'
import { BLOCKS_FRAG, BLOCKS_VERT, FOOT_FRAG, FOOT_VERT } from './radarBlocksShader'
import type { RadarMesh } from './radarMesh'
import { radialFog } from './radialFog'

/** Radar as voxel blocks (geometry prebuilt in the worker) plus a faint composite-reflectivity ground footprint. */
export function createBlocksMesh(airportElevKm: number): RadarMesh {
  const root = new THREE.Group()
  root.visible = false
  const fog = { uFogCenter: radialFog.center, uFogFar: radialFog.far }
  const uOpacity = { value: 0 }

  let geo = new THREE.BufferGeometry()
  const mat = new THREE.ShaderMaterial({
    vertexShader: BLOCKS_VERT,
    fragmentShader: BLOCKS_FRAG,
    uniforms: { uOpacity, ...fog },
    transparent: true,
    depthWrite: true, // exposed faces only: nearest face wins, no sort artifacts
  })
  const blocks = new THREE.Mesh(geo, mat)
  blocks.position.y = -airportElevKm
  blocks.frustumCulled = false
  blocks.renderOrder = 10_000

  const lut = new THREE.DataTexture(buildRadarLut(), 256, 1, THREE.RGBAFormat)
  lut.minFilter = lut.magFilter = THREE.LinearFilter
  lut.needsUpdate = true
  const comp = new THREE.DataTexture(
    new Uint8Array(GRID.nx * GRID.ny),
    GRID.nx,
    GRID.ny,
    THREE.RedFormat,
  )
  comp.minFilter = comp.magFilter = THREE.LinearFilter
  comp.unpackAlignment = 1
  const footMat = new THREE.ShaderMaterial({
    vertexShader: FOOT_VERT,
    fragmentShader: FOOT_FRAG,
    uniforms: { uComp: { value: comp }, uLut: { value: lut }, uOpacity, ...fog },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const foot = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID.nx * GRID.cell, GRID.ny * GRID.cell).rotateX(-Math.PI / 2),
    footMat,
  )
  foot.position.y = 0.02
  foot.frustumCulled = false
  foot.renderOrder = 9_999
  root.add(foot, blocks)

  let target = 0.7
  let last = performance.now()
  uOpacity.value = target
  blocks.onBeforeRender = () => {
    const now = performance.now()
    uOpacity.value += (target - uOpacity.value) * (1 - Math.exp(-(now - last) / 120))
    last = now
  }

  return {
    mesh: root,
    setOpacity(a) {
      target = a
    },
    setResult(res: RadarResult) {
      const b = res.blocks
      const old = geo
      geo = blocks.geometry = new THREE.BufferGeometry()
      old.dispose()
      geo.setAttribute('position', new THREE.BufferAttribute(b.pos, 3))
      geo.setAttribute('aCol', new THREE.BufferAttribute(b.col, 4, true))
      geo.setAttribute('aNrm', new THREE.BufferAttribute(b.nrm, 3 + 1))
      geo.setAttribute('aUv', new THREE.BufferAttribute(b.uv, 2, true))
      geo.setIndex(new THREE.BufferAttribute(b.index, 1))
      geo.computeBoundingSphere()
      comp.image.data = res.composite
      comp.needsUpdate = true
      root.visible = true
    },
    dispose() {
      geo.dispose()
      mat.dispose()
      foot.geometry.dispose()
      footMat.dispose()
      lut.dispose()
      comp.dispose()
    },
  }
}
