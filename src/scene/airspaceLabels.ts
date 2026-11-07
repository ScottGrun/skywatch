import type * as THREE from 'three'
import { readable } from './theme'
import { projectToScreen, type ScreenPoint } from './projection'

const FONT = "'IBM Plex Mono',monospace"
const MAX_SHOWN = 10
const CHAR_W = 5.8
const LABEL_H = 11
const PAD = 3
/** Switch the anchor vertex only when another is this much better (fraction of polygon radius). */
const HYSTERESIS = 0.15
const MAX_EDGE_PTS = 64

/** Screen rectangle in CSS px. */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** One distinct airspace: label text, top height at x1 scale, and its outline at the top. */
export interface LabelCand {
  key: string
  text: string
  css: string
  area: number
  cx: number
  cz: number
  /** Top of the volume (km, x1 vertical scale). */
  y: number
  ring: { x: number; z: number }[]
}

interface Label extends LabelCand {
  el: HTMLDivElement
  edge: { x: number; z: number }[]
  anchor: number
  radius: number
  shown: boolean
  w: number
}

/** One candidate per key (same name/class/limits); the largest polygon wins. */
export function dedupe(cands: readonly LabelCand[]): LabelCand[] {
  const best = new Map<string, LabelCand>()
  for (const c of cands) {
    const b = best.get(c.key)
    if (!b || c.area > b.area) best.set(c.key, c)
  }
  return [...best.values()]
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

function make(overlay: HTMLElement, c: LabelCand): Label {
  const el = document.createElement('div')
  // Below aircraft labels (z-index 1/2) in the shared overlay.
  el.style.cssText =
    `position:absolute;left:0;top:0;z-index:0;white-space:nowrap;will-change:transform;display:none;` +
    `font:500 9px/1 ${FONT};letter-spacing:.04em;color:${readable(c.css)};opacity:.75;text-shadow:0 0 3px var(--halo)`
  el.textContent = c.text
  overlay.appendChild(el)
  const step = Math.max(1, Math.ceil(c.ring.length / MAX_EDGE_PTS))
  const edge = c.ring.filter((_, i) => i % step === 0)
  const radius = Math.max(0.1, ...edge.map((p) => Math.hypot(p.x - c.cx, p.z - c.cz)))
  return { ...c, el, edge, anchor: 0, radius, shown: false, w: c.text.length * CHAR_W }
}

export interface AirspaceLabels {
  /**
   * Position labels: only volumes within `reach` km of the orbit target, one per distinct airspace,
   * anchored on the outline point facing the camera, greedily decluttered against `occupied`
   * (aircraft labels, which always win) and each other.
   */
  place(
    camera: THREE.Camera,
    w: number,
    h: number,
    sp: ScreenPoint,
    occupied: readonly Rect[],
    k: number,
    target: { x: number; z: number },
    reach: number,
  ): void
  dispose(): void
}

export function createAirspaceLabels(
  overlay: HTMLElement,
  cands: readonly LabelCand[],
): AirspaceLabels {
  const labels = dedupe(cands).map((c) => make(overlay, c))
  const taken: Rect[] = []
  const order: { l: Label; d: number }[] = []

  const hide = (l: Label) => {
    if (l.shown) l.el.style.display = 'none'
    l.shown = false
  }

  return {
    place(camera, w, h, sp, occupied, k, target, reach) {
      order.length = 0
      for (const l of labels) {
        const d = Math.hypot(l.cx - target.x, l.cz - target.z)
        if (d > reach) hide(l)
        else order.push({ l, d })
      }
      order.sort((a, b) => a.d - b.d)
      taken.length = 0
      let shown = 0
      for (const { l } of order) {
        // Outline point facing the camera (with hysteresis so the label does not hop around).
        const dx = camera.position.x - l.cx
        const dz = camera.position.z - l.cz
        const inv = 1 / (Math.hypot(dx, dz) || 1)
        const score = (i: number) => ((l.edge[i].x - l.cx) * dx + (l.edge[i].z - l.cz) * dz) * inv
        let bi = l.anchor
        let bs = score(bi)
        for (let i = 0; i < l.edge.length; i++) {
          const s = score(i)
          if (s > bs + HYSTERESIS * l.radius) {
            bs = s
            bi = i
          }
        }
        l.anchor = bi
        const p = l.edge[bi]
        projectToScreen(camera, w, h, p.x, l.y * k, p.z, sp)
        const r: Rect = {
          x0: sp.x - l.w / 2 - PAD,
          x1: sp.x + l.w / 2 + PAD,
          y0: sp.y - LABEL_H * 1.2 - PAD,
          y1: sp.y + PAD,
        }
        const off = sp.behind || r.x1 < 0 || r.x0 > w || r.y1 < 0 || r.y0 > h
        if (
          off ||
          shown >= MAX_SHOWN ||
          occupied.some((o) => overlaps(r, o)) ||
          taken.some((o) => overlaps(r, o))
        ) {
          hide(l)
          continue
        }
        taken.push(r)
        shown++
        if (!l.shown) l.el.style.display = 'block'
        l.shown = true
        l.el.style.transform = `translate(${sp.x.toFixed(1)}px,${sp.y.toFixed(1)}px) translate(-50%,-120%)`
      }
    },
    dispose() {
      labels.forEach((l) => l.el.remove())
    },
  }
}
