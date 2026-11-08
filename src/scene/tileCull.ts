import * as THREE from 'three'
import { radialFog } from './radialFog'

interface Entry {
  mesh: THREE.Mesh
  geo: THREE.BufferGeometry | null
  x0: number
  x1: number
  z0: number
  z1: number
}

/**
 * Hides tile meshes that lie wholly beyond the radial ground fog's far radius. There the fog is
 * fully opaque, so the tile would only paint the background colour that the base plane already
 * shows: skipping it is visually identical and saves a draw call per tile. (Frustum culling is
 * Three's own; geometry bounds come from `buildTileGeometry`.)
 */
export class TileCuller {
  private entries: Entry[] = []

  add(mesh: THREE.Mesh): void {
    this.entries.push({ mesh, geo: null, x0: 0, x1: 0, z0: 0, z1: 0 })
  }

  update(): void {
    const cx = radialFog.center.value.x
    const cz = radialFog.center.value.y
    const far = radialFog.far.value
    for (const e of this.entries) {
      const g = e.mesh.geometry
      if (e.geo !== g) {
        e.geo = g
        if (!g.boundingBox) g.computeBoundingBox()
        const b = g.boundingBox!
        e.x0 = b.min.x - 0.1
        e.x1 = b.max.x + 0.1
        e.z0 = b.min.z - 0.1
        e.z1 = b.max.z + 0.1
      }
      const dx = Math.max(e.x0 - cx, 0, cx - e.x1)
      const dz = Math.max(e.z0 - cz, 0, cz - e.z1)
      e.mesh.visible = dx * dx + dz * dz < far * far
    }
  }
}
