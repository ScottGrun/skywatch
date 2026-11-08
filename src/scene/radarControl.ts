import type * as THREE from 'three'
import { radarFor } from '../core/radarSites'
import { decodeRadar, fetchVolumeBytes, latestKey } from '../data/radar'
import type { Airport, RadarStatus } from '../types'
import { FT_TO_KM } from './constants'
import type { RadarMesh } from './radarMesh'

const REFRESH_MS = 5 * 60_000

/** Dev-only: `?radarKey=2026/11/06/KATX/KATX20261106_001859_V06` pins an archived volume. */
function pinnedKey(): string | null {
  return import.meta.env.DEV ? new URLSearchParams(location.search).get('radarKey') : null
}

/** Owns the optional weather-radar volume: lazy-loaded mesh + worker, 5 min refresh, status events. */
export function createRadarControl(parent: THREE.Object3D) {
  let on = false
  let airport: Airport | null = null
  let mesh: RadarMesh | null = null
  let abort: AbortController | null = null
  let timer = 0
  let key = ''
  let opacity = 0.7
  let status: RadarStatus = { state: 'off', available: false, site: '', timeMs: 0 }
  const fns = new Set<(s: RadarStatus) => void>()

  const emit = (patch: Partial<RadarStatus>) => {
    status = { ...status, ...patch }
    fns.forEach((f) => f(status))
  }

  function clear(): void {
    abort?.abort()
    abort = null
    clearTimeout(timer)
    if (mesh) {
      parent.remove(mesh.mesh)
      mesh.dispose()
      mesh = null
    }
    key = ''
  }

  async function load(): Promise<void> {
    const ap = airport
    const site = ap && radarFor(ap)
    if (!on || !ap || !site) return
    abort?.abort()
    const ctl = (abort = new AbortController())
    clearTimeout(timer)
    timer = window.setTimeout(() => void load(), REFRESH_MS)
    try {
      const k = pinnedKey() ?? (await latestKey(site.id))
      if (ctl.signal.aborted) return
      if (!k) return emit({ state: 'error' })
      if (k === key && mesh) return emit({ state: 'ok' })
      if (!mesh) emit({ state: 'loading' })
      const bytes = await fetchVolumeBytes(k, ctl.signal)
      emit({ state: 'decoding' })
      const res = await decodeRadar(bytes, ap)
      if (ctl.signal.aborted) return
      if (!mesh) {
        const { createRadarMesh } = await import('./radarMesh')
        if (ctl.signal.aborted) return
        mesh = createRadarMesh(ap.elevationFt * FT_TO_KM)
        mesh.setOpacity(opacity)
        parent.add(mesh.mesh)
      }
      mesh.setGrid(res.grid)
      key = k
      if (import.meta.env.DEV) {
        console.info(
          `radar ${k}: decode ${res.decodeMs.toFixed(0)} ms, grid ${res.gridMs.toFixed(0)} ms`,
        )
      }
      emit({ state: 'ok', site: res.site, timeMs: res.timeMs })
    } catch {
      if (!ctl.signal.aborted) emit({ state: 'error' })
    }
  }

  return {
    set(next: boolean) {
      if (next === on) return
      on = next
      if (!on) {
        clear()
        return emit({ state: 'off' })
      }
      void load()
    },
    setOpacity(a: number) {
      opacity = Math.min(1, Math.max(0, a))
      mesh?.setOpacity(opacity)
    },
    setAirport(ap: Airport) {
      airport = ap
      const site = radarFor(ap)
      clear()
      emit({
        available: !!site,
        site: site?.id ?? '',
        state: on && site ? 'loading' : 'off',
        timeMs: 0,
      })
      if (on && site) void load()
    },
    subscribe(fn: (s: RadarStatus) => void) {
      fns.add(fn)
      return () => {
        fns.delete(fn)
      }
    },
    dispose() {
      clear()
      fns.clear()
    },
  }
}
