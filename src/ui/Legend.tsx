import type { ViewPreset } from '../types.ts'

const VIEWS: [ViewPreset, string][] = [
  ['overview', 'OVERVIEW'],
  ['top', 'TOP'],
  ['side', 'SIDE'],
]

export function Legend({ onView }: { onView: (v: ViewPreset) => void }) {
  return (
    <section className="panel legend">
      <div className="legend-head">
        <span className="label">ALTITUDE · FT</span>
        <span className="label">VERTICAL ×3</span>
      </div>
      <div className="grad" />
      <div className="ticks">
        {['0', '10k', '20k', '30k', '40k'].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="views">
        {VIEWS.map(([v, label]) => (
          <button key={v} onClick={() => onView(v)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
