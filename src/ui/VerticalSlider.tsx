import { useEffect } from 'react'
import { VSCALE_DEFAULT, VSCALE_MAX, VSCALE_MIN, VSCALE_STEP } from '../scene/constants.ts'
import { clampVScale } from '../scene/vertical.ts'

interface Props {
  value: number
  onChange: (k: number) => void
}

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) &&
  !(t instanceof HTMLInputElement && t.type === 'range')

/** Compact vertical-exaggeration slider: double-click resets, `[` / `]` step it outside text fields. */
export function VerticalSlider({ value, onChange }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const d = e.key === '[' ? -VSCALE_STEP : e.key === ']' ? VSCALE_STEP : 0
      if (d) onChange(clampVScale(value + d))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [value, onChange])

  const pct = ((value - VSCALE_MIN) / (VSCALE_MAX - VSCALE_MIN)) * 100
  return (
    <div
      className="vscale"
      onDoubleClick={() => onChange(VSCALE_DEFAULT)}
      title="Double-click to reset (×3)"
    >
      <span className="label">VERTICAL ×{value}</span>
      <input
        type="range"
        aria-label="Vertical exaggeration"
        min={VSCALE_MIN}
        max={VSCALE_MAX}
        step={VSCALE_STEP}
        value={value}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(clampVScale(Number(e.target.value)))}
      />
    </div>
  )
}
