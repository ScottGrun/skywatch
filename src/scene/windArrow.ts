import * as THREE from 'three'
import { D2R } from './constants'
import { applyRadialFog } from './radialFog'
import { terrainY } from './terrain'

/** Ground arrow at the airport pointing downwind (wind blows FROM `dirDeg`). Null when calm/variable. */
export function buildWindArrow(dirDeg: number | null, kt: number): THREE.Line | null {
  if (dirDeg == null || !(kt >= 1)) return null
  const len = Math.min(6, 1.5 + kt * 0.12)
  const to = ((dirDeg + 180) % 360) * D2R
  const de = Math.sin(to)
  const dn = Math.cos(to)
  const at = (d: number, side = 0): THREE.Vector3 => {
    const e = de * d + dn * side
    const n = dn * d - de * side
    return new THREE.Vector3(e, Math.max(0, terrainY(e, n)), -n)
  }
  const h = len / 2
  const head = Math.min(0.9, len * 0.3)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 8; i++) pts.push(at(-h + (len * i) / 8))
  pts.push(at(h - head, head * 0.6), at(h), at(h - head, -head * 0.6))
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    applyRadialFog(
      new THREE.LineBasicMaterial({ color: 0xe8edf2, transparent: true, opacity: 0.5 }),
    ),
  )
}
