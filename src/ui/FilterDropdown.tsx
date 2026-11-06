import { useEffect, useRef, useState } from 'react'
import type { Aircraft, AircraftClass, Category } from '../types.ts'
import {
  ALL_CATS,
  ALL_TYPES,
  DEFAULT_FILTER,
  activeCount,
  toggleIn,
  type FilterState,
} from '../core/filter.ts'

const TYPE_LABEL: Record<AircraftClass, string> = {
  wide: 'Widebody',
  quad: 'Four-engine',
  narrow: 'Narrowbody',
  regional: 'Regional jet',
  bizjet: 'Business jet',
  turboprop: 'Turboprop',
  piston: 'Piston',
  heli: 'Helicopter',
  unknown: 'Unknown',
}

interface Props {
  filter: FilterState
  /** Unfiltered aircraft, for live per-option counts. */
  aircraft: Aircraft[]
  onChange: (f: FilterState) => void
}

function Check({
  checked,
  label,
  count,
  onToggle,
}: {
  checked: boolean
  label: string
  count?: number
  onToggle: () => void
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      className={'fl-row' + (checked ? ' on' : '')}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <span className="fl-box">{checked ? '✓' : ''}</span>
      <span className="fl-name">{label}</span>
      {count !== undefined && <b>{count}</b>}
    </div>
  )
}

export function FilterDropdown({ filter, aircraft, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const n = activeCount(filter)
  const summary = !filter.types.length
    ? 'All types'
    : filter.types.length === 1
      ? TYPE_LABEL[filter.types[0]]
      : `${filter.types.length} types`
  const counts = new Map<string, number>()
  for (const a of aircraft) counts.set(a.aircraftClass, (counts.get(a.aircraftClass) ?? 0) + 1)
  const on = <T,>(list: readonly T[], x: T) => list.length === 0 || list.includes(x)

  return (
    <div className="filter" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={'filter-field' + (open ? ' open' : '')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="label">FILTER</span>
        <span className="filter-sum">{summary}</span>
        {n > 0 && <span className="filter-badge">{n}</span>}
        <i className="filter-caret" />
      </button>
      {open && (
        <div className="filter-dd" role="group" aria-label="Aircraft filter">
          <div className="fl-head label">AIRCRAFT TYPE</div>
          {ALL_TYPES.map((t) => (
            <Check
              key={t}
              checked={on(filter.types, t)}
              label={TYPE_LABEL[t]}
              count={counts.get(t) ?? 0}
              onToggle={() => onChange({ ...filter, types: toggleIn(filter.types, ALL_TYPES, t) })}
            />
          ))}
          <div className="fl-sep" />
          <div className="fl-head label">CATEGORY</div>
          <div className="fl-cats">
            {ALL_CATS.map((c: Category) => (
              <Check
                key={c}
                checked={on(filter.cats, c)}
                label={c}
                onToggle={() => onChange({ ...filter, cats: toggleIn(filter.cats, ALL_CATS, c) })}
              />
            ))}
          </div>
          <Check
            checked={filter.ground}
            label="Show ground traffic"
            count={aircraft.filter((a) => a.onGround).length}
            onToggle={() => onChange({ ...filter, ground: !filter.ground })}
          />
          <div className="fl-foot">
            <button type="button" onClick={() => onChange({ ...filter, types: [] })}>
              Select all
            </button>
            <button type="button" onClick={() => onChange(DEFAULT_FILTER)}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
