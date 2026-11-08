import type * as THREE from 'three'
import { radarsFor } from '../core/radarSites'
import { decodeRadar, fetchVolumeBytes } from '../data/radar'
import { latestKey } from '../data/radarList'
import type { RadarResult } from '../data/radarTypes'
import type { Airport, RadarStatus, RadarStyle } from '../types'
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
  let style: RadarStyle = 'blocks'
  let last: RadarResult | null = null
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
    last = null
  }

  /** (Re)builds the layer for the current style from the last decoded result. */
  async function show(ap: Airport, signal?: AbortSignal): Promise<void> {
    if (!last) return
    const res = last
    const make =
      style === 'blocks'
        ? (await import('./radarBlocksMesh')).createBlocksMesh
        : (await import('./radarMesh')).createRadarMesh
    if (signal?.aborted || res !== last) return
    if (mesh) {
      parent.remove(mesh.mesh)
      mesh.dispose()
    }
    mesh = make(ap.elevationFt * FT_TO_KM)
    mesh.setOpacity(opacity)
    mesh.setResult(res)
    parent.add(mesh.mesh)
  }

  /** Newest volume of each in-range site (nearest first); sites with no fresh data are dropped. */
  async function fetchAll(ids: string[], signal: AbortSignal) {
    const pin = pinnedKey()
    const got = await Promise.all(
      ids.map(async (id, i) => {
        try {
          const k = (i === 0 && pin) || (await latestKey(id, new Date(), fetch, signal))
          return k || null
        } catch {
          return null
        }
      }),
    )
    return got.filter((g): g is string => !!g)
  }

  async function load(): Promise<void> {
    const ap = airport
    const ids = ap ? radarsFor(ap).map((s) => s.id) : []
    if (!on || !ap || !ids.length) return
    abort?.abort()
    const ctl = (abort = new AbortController())
    clearTimeout(timer)
    timer = window.setTimeout(() => void load(), REFRESH_MS)
    try {
      const found = await fetchAll(ids, ctl.signal)
      if (ctl.signal.aborted) return
      if (!found.length) return emit({ state: 'error' })
      const k = found.join(',')
      if (k === key && mesh) return emit({ state: 'ok' })
      if (!mesh) emit({ state: 'loading' })
      const bufs = (
        await Promise.all(found.map((f) => fetchVolumeBytes(f, ctl.signal).catch(() => null)))
      ).filter((b) => b !== null)
      if (ctl.signal.aborted) return
      if (!bufs.length) return emit({ state: 'error' })
      emit({ state: 'decoding' })
      const res = await decodeRadar(bufs, ap)
      if (ctl.signal.aborted) return
      last = res
      await show(ap, ctl.signal)
      if (ctl.signal.aborted) return
      key = k
      if (import.meta.env.DEV) {
        console.info(
          `radar ${k}: decode ${res.decodeMs.toFixed(0)} ms, grid ${res.gridMs.toFixed(0)} ms, blocks ${res.blocks.faces} faces (${res.blocks.faces * 2} tris)`,
        )
      }
      emit({ state: 'ok', site: res.sites.join('+'), timeMs: res.timeMs })
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
    setStyle(s: RadarStyle) {
      if (s === style) return
      style = s
      if (airport && last) void show(airport)
    },
    setAirport(ap: Airport) {
      airport = ap
      const ids = radarsFor(ap).map((s) => s.id)
      clear()
      emit({
        available: ids.length > 0,
        site: ids.join('+'),
        state: on && ids.length ? 'loading' : 'off',
        timeMs: 0,
      })
      if (on && ids.length) void load()
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
