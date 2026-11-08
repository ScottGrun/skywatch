import { useEffect, useRef, useState } from 'react'
import './layers.css'

interface Props {
  trailsOn: boolean
  tagsOn: boolean
  groundColorOn: boolean
  onGroundColor: (on: boolean) => void
  onTrails: (on: boolean) => void
  onTags: (on: boolean) => void
}

/** DISPLAY popover (same chrome as FILTER / WEATHER): aircraft trails and tags toggles. */
export function LayersDropdown({
  trailsOn,
  tagsOn,
  groundColorOn,
  onGroundColor,
  onTrails,
  onTags,
}: Props) {
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

  const rows: [string, boolean, (on: boolean) => void][] = [
    ['Trails', trailsOn, onTrails],
    ['Tags', tagsOn, onTags],
    ['Color ground aircraft', groundColorOn, onGroundColor],
  ]
  const n = Number(trailsOn) + Number(tagsOn) + Number(groundColorOn)
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
        <span className="label">DISPLAY</span>
        <span className="filter-sum ly-sum">{n === 3 ? 'All' : n === 0 ? 'Off' : 'Some'}</span>
        <i className="filter-caret" />
      </button>
      {open && (
        <div className="filter-dd ly-dd" role="group" aria-label="Display">
          {rows.map(([name, on, set]) => (
            <div
              key={name}
              role="checkbox"
              aria-checked={on}
              tabIndex={0}
              className={'fl-row' + (on ? ' on' : '')}
              onClick={() => set(!on)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  set(!on)
                }
              }}
            >
              <span className="fl-box">{on ? '✓' : ''}</span>
              <span className="fl-name">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
