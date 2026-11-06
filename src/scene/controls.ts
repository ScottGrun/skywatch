import { CLICK_SLOP_PX } from './constants'
import type { CameraRig } from './camera'

export interface ControlHandlers {
  /** Click without drag, in CSS px relative to the canvas. */
  onClick(x: number, y: number): void
  /** User panned (cancels follow-cam). */
  onPan(): void
}

/** Pointer/wheel controls for the orbit rig. Returns an unbind function. */
export function bindControls(
  cv: HTMLCanvasElement,
  rig: CameraRig,
  h: ControlHandlers,
): () => void {
  let drag: { x: number; y: number; sx: number; sy: number; pan: boolean } | null = null

  const down = (e: PointerEvent) => {
    drag = {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      pan: e.button === 2 || e.shiftKey,
    }
    cv.setPointerCapture(e.pointerId)
    cv.style.cursor = 'grabbing'
  }
  const move = (e: PointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    drag.x = e.clientX
    drag.y = e.clientY
    if (drag.pan) {
      rig.pan(dx, dy)
      if (rig.following) h.onPan()
    } else {
      rig.orbit(dx, dy)
    }
  }
  const up = (e: PointerEvent) => {
    const d = drag
    drag = null
    cv.style.cursor = 'grab'
    if (!d || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > CLICK_SLOP_PX) return
    const r = cv.getBoundingClientRect()
    h.onClick(e.clientX - r.left, e.clientY - r.top)
  }
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    rig.zoom(e.deltaY)
  }
  const ctx = (e: Event) => e.preventDefault()

  cv.addEventListener('pointerdown', down)
  cv.addEventListener('pointermove', move)
  cv.addEventListener('pointerup', up)
  cv.addEventListener('pointercancel', up)
  cv.addEventListener('wheel', wheel, { passive: false })
  cv.addEventListener('contextmenu', ctx)
  return () => {
    cv.removeEventListener('pointerdown', down)
    cv.removeEventListener('pointermove', move)
    cv.removeEventListener('pointerup', up)
    cv.removeEventListener('pointercancel', up)
    cv.removeEventListener('wheel', wheel)
    cv.removeEventListener('contextmenu', ctx)
  }
}
