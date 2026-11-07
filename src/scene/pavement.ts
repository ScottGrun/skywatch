import * as THREE from 'three'
import { DASH_PERIOD, endLayout, splitRunway, type Split } from '../core/runwayMarkings'
import { DECOR_LIFT, DETAIL_LIFT, FT_TO_KM } from './constants'
import { applyRadialFog } from './radialFog'
import { paintCap, paintMid } from './runwayTexture'
import { terrainY } from './terrain'
import { pal } from './theme'

/** Pavement polygon offset: stronger than the detail patch (-2) so coplanar paint always wins. */
const OFFSET = -6
const STEP_KM = 0.25

export interface PavementRunway {
  a: { e: number; n: number }
  b: { e: number; n: number }
  widthKm: number
  idents: readonly [string, string]
}

/**
 * Local Y for pavement/lights placed in the decor group so they land on the drawn detail patch plus
 * `worldLift` km: decor world Y = DECOR_LIFT + vk * b * y, patch world Y = vk * (DETAIL_LIFT + b * h).
 */
export function drapedY(vk: number, b: number, worldLift = 0): number {
  return (vk * DETAIL_LIFT - DECOR_LIFT + worldLift) / (vk * b)
}

/** Strip along (e0,n0)->dir from s0..s1 km, `half` km each side, draped on the terrain. */
function strip(
  o: { e: number; n: number },
  d: { e: number; n: number },
  s0: number,
  s1: number,
  half: number,
  v0: number,
  v1: number,
): THREE.BufferGeometry {
  const segs = Math.max(1, Math.ceil((s1 - s0) / STEP_KM))
  const pos = new Float32Array((segs + 1) * 6)
  const uv = new Float32Array((segs + 1) * 4)
  const idx: number[] = []
  const rE = d.n
  const rN = -d.e // pilot's right in (east, north)
  for (let i = 0; i <= segs; i++) {
    const f = i / segs
    const s = s0 + (s1 - s0) * f
    for (let k = 0; k < 2; k++) {
      const t = k ? half : -half
      const e = o.e + d.e * s + rE * t
      const n = o.n + d.n * s + rN * t
      const j = i * 2 + k
      pos.set([e, terrainY(e, n), -n], j * 3)
      uv.set([k, v0 + (v1 - v0) * f], j * 2)
    }
    if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Runway surfaces with markings as textured strips draped on the terrain, in x1 vertical units. */
export function buildPavement(
  runways: readonly PavementRunway[],
  aniso: number,
): { group: THREE.Group; setLit(lit: boolean): void } {
  const group = new THREE.Group()
  const mats: THREE.MeshBasicMaterial[] = []
  const col = { asphalt: pal().asphalt, paint: pal().paint }
  const add = (geo: THREE.BufferGeometry, map: THREE.Texture): void => {
    const mat = applyRadialFog(
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, polygonOffset: true }),
    )
    mat.polygonOffsetFactor = OFFSET
    mat.polygonOffsetUnits = OFFSET
    mats.push(mat)
    const m = new THREE.Mesh(geo, mat)
    m.renderOrder = 0
    group.add(m)
  }
  // Middle sections depend only on width, so runways of the same width share one texture.
  const midTex = new Map<number, THREE.Texture>()
  const midFor = (widthFt: number): THREE.Texture => {
    const k = Math.round(widthFt)
    let t = midTex.get(k)
    if (!t) midTex.set(k, (t = paintMid(widthFt, col, aniso)))
    return t
  }
  for (const r of runways) {
    const dx = r.b.e - r.a.e
    const dn = r.b.n - r.a.n
    const len = Math.hypot(dx, dn) || 0.1
    const lenFt = len / FT_TO_KM
    const widthFt = r.widthKm / FT_TO_KM
    const half = r.widthKm / 2
    const dir = { e: dx / len, n: dn / len }
    const sp: Split | null = splitRunway(lenFt)
    if (!sp) {
      add(strip(r.a, dir, 0, len, half, 0, 1), midFor(widthFt))
      continue
    }
    const kmA = sp.capA * FT_TO_KM
    const kmB = sp.capB * FT_TO_KM
    const la = endLayout(lenFt, widthFt, 'A', r.idents[0], sp)
    const lb = endLayout(lenFt, widthFt, 'B', r.idents[1], sp)
    add(strip(r.a, dir, 0, kmA, half, 0, 1), paintCap(la, widthFt, col, aniso))
    // Far cap is drawn from its own threshold looking back, so its "right" is the mirror side.
    const back = { e: -dir.e, n: -dir.n }
    add(strip(r.b, back, 0, kmB, half, 0, 1), paintCap(lb, widthFt, col, aniso))
    if (sp.mid > 0) {
      const mid = midFor(widthFt)
      add(strip(r.a, dir, kmA, len - kmB, half, 0, sp.mid / DASH_PERIOD), mid)
    }
  }
  return {
    group,
    setLit(lit) {
      for (const m of mats) m.color.setScalar(lit ? 0.8 : 1)
    },
  }
}
