import { useEffect, useRef, useState } from 'react'
import { radarColor } from '../core/radarColor.ts'
import type { RadarStatus, RadarStyle } from '../types.ts'

interface Props {
  radarOn: boolean
  radar: RadarStatus
  opacity: number
  onRadar: (on: boolean) => void
  onOpacity: (a: number) => void
  style: RadarStyle
  onStyle: (s: RadarStyle) => void
}

const STOPS = [15, 30, 45, 60, 75]
const RAMP = `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => {
  const d = 15 + i * 5
  return `rgb(${radarColor(d).join(',')}) ${(i / 12) * 100}%`
}).join(', ')})`

function statusLine(on: boolean, r: RadarStatus): string {
  if (!on) return 'Off'
  if (r.state === 'loading' || r.state === 'off') return 'Loading volume…'
  if (r.state === 'decoding') return 'Decoding…'
  if (r.state === 'error') return 'Radar unavailable'
  return 'OK'
}

/** Compact WEATHER popover (same chrome as the FILTER dropdown): radar toggle, opacity, scan info, dBZ legend. */
export function WeatherDropdown({
  radarOn,
  radar,
  opacity,
  onRadar,
  onOpacity,
  style,
  onStyle,
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

  const scan =
    radar.available && radar.state === 'ok' && radarOn
      ? `${radar.site} · ${new Date(radar.timeMs).toISOString().slice(11, 16)} UTC`
      : radar.available
        ? radar.site
        : '—'
  const pct = Math.round(opacity * 100)
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
        <span className="label">WEATHER</span>
        <span className="filter-sum wx-sum">{radarOn && radar.available ? 'Radar' : 'Off'}</span>
        <i className="filter-caret" />
      </button>
      {open && (
        <div className="filter-dd wx-dd" role="group" aria-label="Weather">
          <div
            role="checkbox"
            aria-checked={radarOn}
            aria-disabled={!radar.available}
            tabIndex={0}
            className={'fl-row' + (radarOn ? ' on' : '')}
            onClick={() => radar.available && onRadar(!radarOn)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                if (radar.available) onRadar(!radarOn)
              }
            }}
          >
            <span className="fl-box">{radarOn ? '✓' : ''}</span>
            <span className="fl-name">NEXRAD radar</span>
          </div>
          {!radar.available && <div className="wx-none">No radar in range</div>}
          {radar.available && (
            <div className="wx-body">
              <div className="wx-row" role="radiogroup" aria-label="Radar style">
                <span className="label">STYLE</span>
                <span className="wx-style">
                  {(['volume', 'blocks'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={style === s}
                      className={style === s ? 'on' : ''}
                      onClick={() => onStyle(s)}
                    >
                      {s === 'volume' ? 'Volume' : 'Blocks'}
                    </button>
                  ))}
                </span>
              </div>
              <div className="vscale wx-op">
                <span className="label">OPACITY {pct}%</span>
                <input
                  type="range"
                  aria-label="Radar opacity"
                  min={0}
                  max={100}
                  step={5}
                  value={pct}
                  style={{ '--fill': `${pct}%` } as React.CSSProperties}
                  onChange={(e) => onOpacity(Number(e.target.value) / 100)}
                />
              </div>
              <div className="wx-row">
                <span className="label">SCAN</span>
                <b>{scan}</b>
              </div>
              <div className="wx-row">
                <span className="label">STATUS</span>
                <b>{statusLine(radarOn, radar)}</b>
              </div>
              <div className="wx-ramp" style={{ background: RAMP }} />
              <div className="wx-ticks">
                {STOPS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
                <span>dBZ</span>
              </div>
              <div className="wx-ends label">
                <span>LIGHT</span>
                <span>HEAVY</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
