import './arrivals.css'
import { useEffect, useMemo, useState } from 'react'
import type { Aircraft, Airport } from '../types.ts'
import { ArrivalsBoard } from './ArrivalsBoard.tsx'
import { TrafficRow } from './TrafficRow.tsx'

const OPEN_KEY = 'tracon3d.listOpen'
const TAB_KEY = 'tracon3d.listTab'
type Tab = 'traffic' | 'arrivals'

interface Props {
  aircraft: Aircraft[]
  airport: Airport | null
  /** Aircraft before filtering, for the "N of M" header. */
  total: number
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function TrafficList({ aircraft, airport, total, selectedId, onSelect }: Props) {
  const sorted = useMemo(() => [...aircraft].sort((a, b) => b.altFt - a.altFt), [aircraft])
  const count = (c: string) => aircraft.filter((a) => a.category === c).length
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== '0')
  useEffect(() => localStorage.setItem(OPEN_KEY, open ? '1' : '0'), [open])
  const [tab, setTab] = useState<Tab>(() =>
    localStorage.getItem(TAB_KEY) === 'arrivals' ? 'arrivals' : 'traffic',
  )
  useEffect(() => localStorage.setItem(TAB_KEY, tab), [tab])
  // "L" toggles the list (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key.toLowerCase() !== 'l' || e.ctrlKey || e.metaKey || e.altKey) return
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <aside className={'panel traffic' + (open ? '' : ' collapsed')}>
      <button
        type="button"
        className="traffic-head"
        aria-expanded={open}
        title={open ? 'Hide aircraft list (L)' : 'Show aircraft list (L)'}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="label">TRAFFIC</span>
        <span className="traffic-n">
          {aircraft.length === total ? total : `${aircraft.length} of ${total}`} aircraft
          <span className="traffic-chev">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      <div className="counts">
        {(['ARR', 'DEP', 'OVR'] as const).map((c) => (
          <div key={c}>
            <span className="label">{c}</span>
            <b>{count(c)}</b>
          </div>
        ))}
      </div>
      {open && (
        <div className="traffic-tabs" role="tablist">
          {(['traffic', 'arrivals'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'on' : ''}
              onClick={() => setTab(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {open && tab === 'arrivals' && (
        <ArrivalsBoard
          aircraft={aircraft}
          airport={airport}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
      {open && tab === 'traffic' && (
        <div className="rows">
          {sorted.map((a) => (
            <TrafficRow
              key={a.id}
              a={a}
              selected={a.id === selectedId}
              onSelect={() => onSelect(a.id === selectedId ? null : a.id)}
            />
          ))}
        </div>
      )}
    </aside>
  )
}
