import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Small building blocks for procedural airframes. Unit length along Z, nose = -Z.

/** Cylinder along Z (front radius, rear radius). */
export function cylZ(
  rFront: number,
  rBack: number,
  len: number,
  z: number,
  x = 0,
  y = 0,
  seg = 10,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rBack, rFront, len, seg)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  return g
}

/** Cone along Z; apex toward the nose (`forward`) or the tail. */
export function coneZ(
  r: number,
  len: number,
  z: number,
  forward: boolean,
  y = 0,
  seg = 10,
): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, seg)
  g.rotateX(forward ? -Math.PI / 2 : Math.PI / 2)
  g.translate(0, y, z)
  return g
}

export function ellipsoid(
  rx: number,
  ry: number,
  rz: number,
  x: number,
  y: number,
  z: number,
  seg = 10,
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2))
  g.scale(rx, ry, rz)
  g.translate(x, y, z)
  return g
}

/** Fuselage tube with nose and tail cones spanning exactly z in [-0.5, 0.5]. */
export function fuselage(
  fr: number,
  noseLen: number,
  tailLen: number,
  rearR = fr,
): THREE.BufferGeometry[] {
  const mid = 1 - noseLen - tailLen
  return [
    cylZ(fr, rearR, mid, (noseLen - tailLen) / 2, 0, 0, 12),
    coneZ(fr, noseLen, -0.5 + noseLen / 2, true, 0, 12),
    coneZ(rearR, tailLen, 0.5 - tailLen / 2, false, fr * 0.2, 12),
  ]
}

/** Planar wing/stabiliser. `f` = forward position of the centre (-z), `c` = chord. */
export function wing(
  span: number,
  f: number,
  c: number,
  sweep: number,
  y: number,
  th: number,
  taper = 0.38,
): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const le = f + c / 2
  const te = f - c / 2
  const tle = le - sweep
  const tte = tle - c * taper
  s.moveTo(0, le)
  s.lineTo(span, tle)
  s.lineTo(span, tte)
  s.lineTo(0, te)
  s.lineTo(-span, tte)
  s.lineTo(-span, tle)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y, 0)
  return g
}

/** Vertical fin. z values are model z (negative = forward). */
export function fin(
  zRootFront: number,
  zRootBack: number,
  zTipFront: number,
  zTipBack: number,
  h: number,
  yBase: number,
  th = 0.014,
): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-zRootFront, 0)
  s.lineTo(-zTipFront, h)
  s.lineTo(-zTipBack, h)
  s.lineTo(-zRootBack, 0)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false })
  g.translate(0, 0, -th / 2)
  g.rotateY(Math.PI / 2)
  g.translate(0, yBase, 0)
  return g
}

export function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

/** Merge parts into one shared, non-indexed geometry. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    if (n !== g) g.dispose()
    return n
  })
  const merged = mergeGeometries(flat)
  flat.forEach((g) => g.dispose())
  merged.userData.shared = true
  return merged
}
