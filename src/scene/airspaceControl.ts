import type * as THREE from 'three'
import { fetchAirspace } from '../data/airspace'
import type { Airport, AirspaceStatus } from '../types'
import { buildAirspace, type AirspaceHandle } from './airspace'
import type { Rect } from './airspaceLabels'
import type { ScreenPoint } from './projection'

const OFF: AirspaceStatus = { state: 'off', attribution: '', note: '' }

/** Owns the optional airspace volumes: lazy fetch, rebuild on airport change, status events, disposal. */
export function createAirspaceControl(scene: THREE.Object3D, overlay: HTMLElement) {
  let on = false
  let airport: Airport | null = null
  let handle: AirspaceHandle | null = null
  let abort: AbortController | null = null
  let status = OFF
  const fns = new Set<(s: AirspaceStatus) => void>()

  const emit = (s: AirspaceStatus) => {
    status = s
    fns.forEach((f) => f(s))
  }

  function clear(): void {
    abort?.abort()
    abort = null
    if (handle) {
      scene.remove(handle.group)
      handle.dispose()
      handle = null
    }
  }

  function refresh(): void {
    clear()
    if (!on || !airport) return emit(OFF)
    const ap = airport
    const ctl = (abort = new AbortController())
    emit({ state: 'loading', attribution: '', note: '' })
    fetchAirspace(ap, ctl.signal)
      .then((d) => {
        if (ctl.signal.aborted) return
        if (!d || d.reason) {
          const outsideUs = d?.reason === 'outside_us'
          return emit({
            state: 'unavailable',
            attribution: '',
            note: outsideUs ? 'Airspace: US airports only' : 'Airspace data unavailable',
          })
        }
        handle = buildAirspace(d.airspaces, ap, overlay)
        scene.add(handle.group)
        emit({
          state: 'ok',
          attribution: d.attribution,
          note: d.airspaces.length ? '' : 'No controlled airspace nearby',
        })
      })
      .catch(() => undefined) // aborted
  }

  return {
    set(next: boolean) {
      if (next === on) return emit(status)
      on = next
      refresh()
    },
    setAirport(ap: Airport) {
      airport = ap
      if (on) refresh()
    },
    retint() {
      handle?.retint()
    },
    place(camera: THREE.Camera, w: number, h: number, sp: ScreenPoint, occupied: readonly Rect[]) {
      handle?.place(camera, w, h, sp, occupied)
    },
    subscribe(fn: (s: AirspaceStatus) => void) {
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
