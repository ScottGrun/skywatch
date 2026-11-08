import type { StaticLabelDef } from './rings'
import type { ScreenPoint } from './projection'
import { logoEpoch, logoUrl } from '../data/logos'
import { readable } from './theme'

const FONT = "'IBM Plex Mono',monospace"
const BASE = 'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform;'
const AIRCRAFT_CSS =
  BASE +
  `display:flex;gap:6px;align-items:baseline;padding:3px 6px;background:var(--tag-bg);` +
  `border:1px solid var(--tag-border);border-radius:3px;font:600 11px/1 ${FONT};color:var(--tag-text);z-index:1;display:none`

export function createOverlay(container: HTMLElement): HTMLDivElement {
  const d = document.createElement('div')
  d.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'
  container.appendChild(d)
  return d
}

/** Per-aircraft HTML label. DOM is only touched when a value changes. */
export class AircraftLabel {
  readonly el: HTMLDivElement
  private cs = document.createElement('span')
  private fl = document.createElement('span')
  private logo = document.createElement('img')
  private last = {
    cs: '',
    fl: '',
    color: '',
    sel: false,
    shown: false,
    tf: '',
    epoch: -1,
    logo: '',
  }

  constructor(overlay: HTMLElement) {
    this.el = document.createElement('div')
    this.el.style.cssText = AIRCRAFT_CSS
    this.logo.decoding = 'async'
    this.logo.alt = ''
    this.logo.style.cssText =
      'display:none;width:14px;height:14px;border-radius:3px;align-self:center;margin-right:-1px'
    this.el.appendChild(this.logo)
    this.el.appendChild(this.cs)
    this.el.appendChild(this.fl)
    overlay.appendChild(this.el)
  }

  set(callsign: string, fl: string, colorCss: string, selected: boolean): void {
    const l = this.last
    const ep = logoEpoch()
    if (l.cs !== callsign || l.epoch !== ep) {
      l.epoch = ep
      if (l.cs !== callsign) this.cs.textContent = l.cs = callsign
      const url = logoUrl(callsign) ?? ''
      if (url !== l.logo) {
        l.logo = url
        if (url) this.logo.src = url
        this.logo.style.display = url ? 'block' : 'none'
      }
    }
    if (l.fl !== fl) this.fl.textContent = l.fl = fl
    if (l.color !== colorCss) this.fl.style.color = readable((l.color = colorCss))
    if (l.sel !== selected) {
      l.sel = selected
      this.el.style.borderColor = selected ? 'var(--tag-border-sel)' : 'var(--tag-border)'
      this.el.style.zIndex = selected ? '2' : '1'
    }
  }

  place(p: ScreenPoint | null): void {
    const l = this.last
    if (!p) {
      if (l.shown) this.el.style.display = 'none'
      l.shown = false
      return
    }
    if (!l.shown) this.el.style.display = 'flex'
    l.shown = true
    // 10 px right, 8 px above the aircraft
    this.el.style.transform = `translate(${(p.x + 10).toFixed(1)}px,${(p.y - 8).toFixed(1)}px) translateY(-100%)`
  }

  /** Estimated box (px) of the placed label, without touching layout. */
  box(p: ScreenPoint): { x0: number; y0: number; x1: number; y1: number } {
    const w = 14 + (this.last.logo ? 20 : 0) + (this.last.cs.length + this.last.fl.length) * 6.8
    const x0 = p.x + 10
    return { x0, x1: x0 + w, y0: p.y - 8 - 19, y1: p.y - 8 }
  }

  remove(): void {
    this.el.remove()
  }
}

export interface StaticLabel {
  e: number
  n: number
  el: HTMLDivElement
}

export function createStaticLabels(overlay: HTMLElement, defs: StaticLabelDef[]): StaticLabel[] {
  return defs.map((d) => {
    const el = document.createElement('div')
    el.style.cssText = BASE + d.css + ';display:none'
    el.textContent = d.text
    overlay.appendChild(el)
    return { e: d.e, n: d.n, el }
  })
}

export function placeStatic(s: StaticLabel, p: ScreenPoint): void {
  if (p.behind) {
    s.el.style.display = 'none'
    return
  }
  s.el.style.display = 'block'
  s.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`
}
