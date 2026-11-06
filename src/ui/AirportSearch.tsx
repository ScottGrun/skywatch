import { useEffect, useMemo, useRef, useState } from 'react'
import type { Airport } from '../types.ts'
import { searchAirports } from '../core/search.ts'

interface Props {
  airports: Airport[]
  onPick: (a: Airport) => void
}

export function AirportSearch({ airports, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchAirports(airports, query, 8), [airports, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== '/' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pick = (a: Airport) => {
    onPick(a)
    setQuery('')
    setOpen(false)
    input.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const d = e.key === 'ArrowDown' ? 1 : -1
      setHi((h) => (results.length ? (h + d + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      if (results[hi]) pick(results[hi])
    } else if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
      input.current?.blur()
    }
  }

  return (
    <div className="search">
      <div className="search-field">
        <span className="label">ICAO</span>
        <input
          ref={input}
          value={query}
          placeholder="Search ICAO, IATA or city"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value)
            setHi(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <kbd>/</kbd>
      </div>
      {open && query.trim() && (
        <div className="search-dd" onMouseDown={(e) => e.preventDefault()}>
          {results.length === 0 && <div className="search-none">No airport matches "{query}"</div>}
          {results.map((a, i) => (
            <div
              key={a.icao}
              className={'search-row' + (i === hi ? ' hi' : '')}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(a)}
            >
              <b>{a.icao}</b>
              <span>{a.iata}</span>
              <em>
                {a.name} · {a.city}
              </em>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
