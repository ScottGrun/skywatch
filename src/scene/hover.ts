export interface Hover {
  /** Resolve the hovered id (at most one pick per call; call once per frame). */
  tick(): string | null
  dispose(): void
}

/** Pointer hover tracking: records the cursor, picks lazily per frame, sets cursor style. */
export function createHover(
  cv: HTMLCanvasElement,
  pick: (x: number, y: number) => string | null,
): Hover {
  let pos: { x: number; y: number } | null = null
  let dirty = false
  let id: string | null = null

  const move = (e: PointerEvent) => {
    if (e.buttons) {
      pos = null
    } else {
      const r = cv.getBoundingClientRect()
      pos = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    dirty = true
  }
  const leave = () => {
    pos = null
    dirty = true
  }
  cv.addEventListener('pointermove', move)
  cv.addEventListener('pointerleave', leave)
  return {
    tick() {
      if (!dirty) return id
      dirty = false
      const next = pos ? pick(pos.x, pos.y) : null
      if (next !== id && pos) cv.style.cursor = next ? 'pointer' : 'grab'
      id = next
      return id
    },
    dispose() {
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerleave', leave)
    },
  }
}
