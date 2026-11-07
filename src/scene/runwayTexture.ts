import * as THREE from 'three'
import { DASH_LEN, DASH_PERIOD, type EndLayout } from '../core/runwayMarkings'

/** Texture density, pixels per foot (3,000 px for a 2,600 ft cap stays under every GPU limit). */
const PPF = 1.2
const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`

function finish(c: HTMLCanvasElement, aniso: number, repeat: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  return t
}

function canvas(wFt: number, hFt: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = Math.max(8, Math.round(wFt * PPF))
  c.height = Math.max(8, Math.round(hFt * PPF))
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}

export interface PaintColors {
  asphalt: number
  paint: number
}

/** Upright glyphs centred at (cx, cy), hPx tall and condensed like FAA numerals. */
function glyphs(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  hPx: number,
): void {
  ctx.font = 'bold 100px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const asc = ctx.measureText('H').actualBoundingBoxAscent || 72
  const sy = hPx / asc
  const gw = hPx * 0.4
  const gap = hPx * 0.2
  const total = text.length * gw + (text.length - 1) * gap
  ;[...text].forEach((ch, i) => {
    const m = ctx.measureText(ch).width || 50
    ctx.save()
    ctx.translate(cx - total / 2 + gw / 2 + i * (gw + gap), cy + hPx / 2)
    ctx.scale(gw / m, sy)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
  })
}

/** One runway end cap: s = 0 at the bottom edge (the threshold), pilot's right = +x. */
export function paintCap(
  l: EndLayout,
  widthFt: number,
  col: PaintColors,
  aniso: number,
): THREE.CanvasTexture {
  const [c, ctx] = canvas(widthFt, l.capFt)
  ctx.fillStyle = css(col.asphalt)
  ctx.fillRect(0, 0, c.width, c.height)
  const y = (s: number): number => c.height - s * PPF
  const x = (t: number): number => (t + widthFt / 2) * PPF
  // Faint rubber build-up in the touchdown zone.
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  for (const sg of [-1, 1]) {
    ctx.fillRect(x(sg > 0 ? 10 : -34), y(1900), 24 * PPF, 1300 * PPF)
  }
  ctx.fillStyle = css(col.paint)
  for (const r of l.rects) ctx.fillRect(x(r.t0), y(r.s1), (r.t1 - r.t0) * PPF, (r.s1 - r.s0) * PPF)
  for (const g of [l.number, l.letter]) {
    if (g) glyphs(ctx, g.text, x(0), y(g.s + g.h / 2), g.h * PPF)
  }
  return finish(c, aniso, false)
}

/** Repeating middle section: one dash period long, v = 0 at the start of a dash. */
export function paintMid(widthFt: number, col: PaintColors, aniso: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(widthFt, DASH_PERIOD)
  ctx.fillStyle = css(col.asphalt)
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = css(col.paint)
  const edge = (t0: number, t1: number): void =>
    void ctx.fillRect((t0 + widthFt / 2) * PPF, 0, (t1 - t0) * PPF, c.height)
  const h = widthFt / 2
  edge(h - 4.5, h - 1.5)
  edge(-h + 1.5, -h + 4.5)
  ctx.fillRect(c.width / 2 - 1.5 * PPF, c.height - DASH_LEN * PPF, 3 * PPF, DASH_LEN * PPF)
  return finish(c, aniso, true)
}
