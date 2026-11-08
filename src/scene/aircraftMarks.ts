import * as THREE from 'three'
import { DOT_OPACITY, DROP_OPACITY } from './constants'

const CAPACITY = 4096
const tmpM = new THREE.Matrix4()
const tmpC = new THREE.Color()

/**
 * Every aircraft's drop line and ground ring in two draw calls: one LineSegments (two vertices per
 * slot, vertex colours) and one InstancedMesh (matrix + instance colour per slot). A slot is owned
 * by one view; hidden slots collapse to nothing (zero-length line, zero-scale ring).
 */
export class AircraftMarks {
  readonly lines: THREE.LineSegments
  readonly dots: THREE.InstancedMesh
  private pos = new Float32Array(CAPACITY * 6)
  private col = new Float32Array(CAPACITY * 6)
  private freeSlots: number[] = []
  private next = 0
  private dirty = false

  constructor() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    this.lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: DROP_OPACITY,
        fog: false,
      }),
    )
    this.lines.frustumCulled = false
    const ring = new THREE.RingGeometry(0.13, 0.16, 32) // thin, tight ring at the foot of the drop line
    ring.rotateX(-Math.PI / 2)
    this.dots = new THREE.InstancedMesh(
      ring,
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: DOT_OPACITY,
        side: THREE.DoubleSide,
        fog: false,
      }),
      CAPACITY,
    )
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.dots.setColorAt(0, tmpC.setRGB(1, 1, 1))
    this.dots.instanceColor!.setUsage(THREE.DynamicDrawUsage)
    this.dots.count = 0
    this.dots.frustumCulled = false
  }

  /** Reserve a slot (-1 when full: that aircraft just draws without marks). */
  alloc(): number {
    const s = this.freeSlots.pop() ?? (this.next < CAPACITY ? this.next++ : -1)
    if (s >= 0) this.hide(s)
    return s
  }

  free(s: number): void {
    if (s < 0) return
    this.hide(s)
    this.freeSlots.push(s)
  }

  hide(s: number): void {
    if (s < 0) return
    this.pos.fill(0, s * 6, s * 6 + 6)
    this.dots.setMatrixAt(s, tmpM.makeScale(0, 0, 0))
    this.dirty = true
  }

  /** Drop line from (x, g, z) up by `h` (0 = hidden) and ring of size `ring` at (x, g + 0.08, z). */
  set(s: number, x: number, g: number, z: number, h: number, ring: number, col: THREE.Color): void {
    if (s < 0) return
    const p = this.pos
    const c = this.col
    const i = s * 6
    p[i] = p[i + 3] = x
    p[i + 1] = g
    p[i + 4] = g + h
    p[i + 2] = p[i + 5] = z
    c[i] = c[i + 3] = col.r
    c[i + 1] = c[i + 4] = col.g
    c[i + 2] = c[i + 5] = col.b
    tmpM.makeScale(ring, ring, ring).setPosition(x, g + 0.08, z)
    this.dots.setMatrixAt(s, tmpM)
    this.dots.setColorAt(s, col)
    this.dirty = true
  }

  /** Upload this frame's changes (call once, before render). */
  flush(): void {
    if (!this.dirty) return
    this.dirty = false
    const n = this.next
    const geo = this.lines.geometry
    geo.setDrawRange(0, n * 2)
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
    this.dots.count = n
    this.dots.instanceMatrix.needsUpdate = true
    this.dots.instanceColor!.needsUpdate = true
  }

  dispose(): void {
    this.lines.geometry.dispose()
    ;(this.lines.material as THREE.Material).dispose()
    this.dots.geometry.dispose()
    ;(this.dots.material as THREE.Material).dispose()
    this.dots.dispose()
  }
}
