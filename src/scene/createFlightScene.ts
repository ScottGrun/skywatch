import * as THREE from 'three'
import type { Aircraft, Airport, FlightScene, TrafficSource, ViewPreset } from '../types'
import { createAirspaceControl } from './airspaceControl'
import { ViewPool, type FrameCtx } from './aircraftView'
import { disposeAircraftGeometries } from './aircraftGeometry'
import { CameraRig } from './camera'
import {
  BG,
  DIR_INTENSITY,
  FOG_FAR,
  FOG_NEAR,
  GFOG_FAR_A,
  GFOG_FAR_B,
  GFOG_NEAR_A,
  GFOG_NEAR_B,
  HEMI_GROUND,
  HEMI_INTENSITY,
  HEMI_SKY,
  LABEL_MAX_DIST,
} from './constants'
import { bindControls } from './controls'
import { createOverlay, createStaticLabels, placeStatic, type StaticLabel } from './labels'
import { createHover } from './hover'
import { createHistory } from './history'
import { createLineup } from './lineup'
import { pickNearest } from './picking'
import { radialFog } from './radialFog'
import { projectToScreen, type ScreenPoint } from './projection'
import { buildRings } from './rings'
import { buildRunways, type RunwaysHandle } from './runways'
import { createSelection } from './selection'
import { buildTiles, disposeObject } from './tiles'

const NO_THRESHOLDS: RunwaysHandle['thresholds'] = []
const EMPTY: Aircraft[] = []
const ZERO = { lat: 0, lon: 0 }

/**
 * Creates the 3D scene inside `container`. The container should be a sized element
 * (the canvas and label overlay are absolutely positioned inside it; it is made
 * `position: relative` if it is statically positioned).
 */
export function createFlightScene(container: HTMLElement): FlightScene {
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(BG)
  const cv = renderer.domElement
  cv.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab'
  container.appendChild(cv)
  const overlay = createOverlay(container)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(BG, FOG_NEAR, FOG_FAR)
  scene.add(new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY))
  const dl = new THREE.DirectionalLight(0xffffff, DIR_INTENSITY)
  dl.position.set(40, 90, 30)
  scene.add(dl)

  const rig = new CameraRig()
  const pool = new ViewPool(scene, overlay)
  const airspace = createAirspaceControl(scene, overlay)
  const selection = createSelection(scene)
  const history = createHistory(scene)
  const maxAniso = renderer.capabilities.getMaxAnisotropy()

  let w = 1
  let h = 1
  const resize = () => {
    w = container.clientWidth || 1
    h = container.clientHeight || 1
    renderer.setSize(w, h, false)
    rig.setAspect(w / h)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  resize()

  // --- state ---
  let airport: Airport | null = null
  let traffic: TrafficSource | null = null
  let selId: string | null = null
  let follow = false
  let filter: ((a: Aircraft) => boolean) | null = null
  let world: THREE.Group | null = null
  let statics: StaticLabel[] = []
  let runways: RunwaysHandle | null = null
  const selFns = new Set<(id: string | null) => void>()
  const folFns = new Set<(on: boolean) => void>()

  const emitSelect = () => selFns.forEach((f) => f(selId))
  const emitFollow = () => folFns.forEach((f) => f(follow))

  function select(id: string | null): void {
    if (id === selId) return
    selId = id
    history.set(null, ZERO, 0)
    if (!id && follow) setFollow(false)
    emitSelect()
  }
  function setFollow(on: boolean): void {
    const next = on && selId !== null
    rig.setFollowing(next)
    if (next === follow) return
    follow = next
    emitFollow()
  }

  function clearWorld(): void {
    if (world) {
      scene.remove(world)
      disposeObject(world)
      world = null
    }
    statics.forEach((s) => s.el.remove())
    statics = []
    runways = null
  }

  function setAirport(ap: Airport): void {
    airport = ap
    pool.clear()
    history.set(null, ZERO, 0)
    clearWorld()
    world = new THREE.Group()
    buildTiles(world, ap, maxAniso)
    const labelDefs = buildRings(world)
    runways = buildRunways(world, ap)
    scene.add(world)
    statics = createStaticLabels(overlay, labelDefs)
    airspace.setAirport(ap)
    select(null)
    setFollow(false)
    rig.home()
  }

  // --- input ---
  const unbind = bindControls(cv, rig, {
    onClick: (x, y) => {
      const id = pickNearest(pool.active.values(), rig.camera, w, h, x, y)
      select(id)
      if (id) setFollow(true)
    },
    onPan: () => setFollow(false),
  })

  const hover = createHover(cv, (x, y) => pickNearest(pool.active.values(), rig.camera, w, h, x, y))

  // --- frame loop ---
  const ctx: FrameCtx = { nowMs: 0, dt: 0, elevFt: 0, cam: rig.camera.position }
  const seen = new Set<string>()
  const gone: string[] = []
  const sp: ScreenPoint = { x: 0, y: 0, behind: false }
  let raf = 0
  let last = performance.now()

  function frame(t: number): void {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (t - last) / 1000)
    last = t
    const nowMs = Date.now()
    const acs = airport && traffic ? traffic.snapshot(nowMs) : EMPTY

    // camera first (follows last frame's selected position)
    const selView = selId ? (pool.active.get(selId) ?? null) : null
    rig.update(dt, follow && selView ? selView : null)
    const orb = rig.orbitState
    radialFog.center.value.set(orb.x, orb.z)
    radialFog.near.value = GFOG_NEAR_A + GFOG_NEAR_B * orb.r
    radialFog.far.value = GFOG_FAR_A + GFOG_FAR_B * orb.r

    ctx.nowMs = nowMs
    ctx.dt = dt
    ctx.elevFt = airport?.elevationFt ?? 0
    const hoverId = hover.tick()
    seen.clear()
    let selAc: Aircraft | null = null
    for (const ac of acs) {
      if (filter && !filter(ac)) continue
      seen.add(ac.id)
      const v = pool.active.get(ac.id) ?? pool.acquire(ac, nowMs)
      const isSel = ac.id === selId
      if (isSel) selAc = ac
      v.update(ac, ctx, isSel, ac.id === hoverId)
    }
    gone.length = 0
    for (const id of pool.active.keys()) if (!seen.has(id)) gone.push(id)
    for (const id of gone) pool.release(id)
    if (selId && !seen.has(selId)) select(null)

    runways?.updateActive(acs, nowMs)
    selection.update(
      selAc ? (pool.active.get(selId as string) ?? null) : null,
      selAc,
      rig.camera,
      t,
      runways?.thresholds ?? NO_THRESHOLDS,
    )

    history.update(selAc ? (pool.active.get(selId as string) ?? null) : null)

    for (const v of pool.active.values()) {
      const isSel = v.id === selId
      projectToScreen(rig.camera, w, h, v.x, v.y, v.z, sp)
      const hide =
        sp.behind ||
        !v.showLabel ||
        sp.x < -150 ||
        sp.x > w + 50 ||
        sp.y < -50 ||
        sp.y > h + 50 ||
        (!isSel && v.camDist > LABEL_MAX_DIST)
      v.label.place(hide ? null : sp)
    }
    airspace.place(rig.camera, w, h, sp)
    for (const s of statics) placeStatic(s, projectToScreen(rig.camera, w, h, s.e, 0, -s.n, sp))

    renderer.render(scene, rig.camera)
  }

  const start = () => {
    if (raf) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const onVisibility = () => (document.hidden ? stop() : start())
  document.addEventListener('visibilitychange', onVisibility)
  if (!document.hidden) start()

  const on = ((event: 'select' | 'follow' | 'airspace', fn: (v: never) => void) => {
    if (event === 'airspace') return airspace.subscribe(fn as never)
    const set = (event === 'select' ? selFns : folFns) as Set<(v: never) => void>
    set.add(fn)
    return () => {
      set.delete(fn)
    }
  }) as unknown as FlightScene['on']

  return {
    setAirport,
    setTraffic(src: TrafficSource) {
      traffic = location.search.includes('models=') ? createLineup() : src
    },
    select,
    setFollow,
    setHistory(id, path) {
      if (!airport || id !== selId) return
      history.set(path, airport, airport.elevationFt)
    },
    setAirspace: airspace.set,
    setFilter(pred) {
      filter = pred
    },
    home() {
      setFollow(false)
      rig.home()
    },
    view(preset: ViewPreset) {
      setFollow(false)
      rig.preset(preset)
    },
    on,
    dispose() {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      unbind()
      hover.dispose()
      ro.disconnect()
      selFns.clear()
      folFns.clear()
      selection.dispose()
      history.dispose()
      airspace.dispose()
      pool.dispose()
      clearWorld()
      disposeAircraftGeometries()
      renderer.dispose()
      cv.remove()
      overlay.remove()
    },
  }
}
