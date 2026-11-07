import { aircraftClassFor as classOf } from '../core/aircraftClass'
import type { Aircraft, AircraftClass, TrafficSource } from '../types'

const CLASSES: AircraftClass[] = [
  'quad',
  'wide',
  'narrow',
  'regional',
  'bizjet',
  'turboprop',
  'piston',
  'heli',
  'unknown',
]
const SPACING_KM = 0.36
/** One representative ICAO type per baked model, shown 19 per page by ?models=all&page=N. */
const MODEL_TYPES = [
  'A318,A319,A20N,A21N,A332,A333,A343,A346,A359,A388',
  'B736,B737,B738,B739,B744,B748,B752,B753,B762,B763,B764,B772,B773,B788,B789',
  'BAE146,CRJ7,CRJ9,E170,E190,BCS1,BCS3,DH8D,AT76,C25B,C172,EC35',
]
  .join(',')
  .split(',')
const PER_PAGE = 19
const COLS = 5
const GRID_KM = 0.6
/** Row is rotated to run left-to-right on screen at the default camera azimuth. */
const SKEW = 0.55

/** Dev-only static lineup of every class (enabled with `?models=1`). */
export function createLineup(): TrafficSource {
  const q = new URLSearchParams(location.search)
  if (q.get('models') === 'all') return createModelGrid(Number(q.get('page') ?? 0))
  return createClassLineup()
}

function baseAircraft(id: string, cb: string, e: number, n: number): Aircraft {
  return {
    id,
    callsign: cb,
    lat: 0,
    lon: 0,
    e,
    n,
    altFt: 1000,
    gsKt: 0,
    trackDeg: 0,
    vsFpm: 0,
    onGround: false,
    distNm: 3,
    category: 'OVR',
    phase: 'Cruise',
    typeCode: '',
    aircraftClass: 'unknown',
    airline: '',
    origin: '',
    dest: '',
    etaMin: null,
    lastSeenMs: 0,
  }
}

/** Grid of baked models, class taken from the type code via the same rules as the app. */
function createModelGrid(page: number): TrafficSource {
  const types = MODEL_TYPES.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const list = types.map((t, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const a = baseAircraft('t' + i, t, (col - (COLS - 1) / 2) * GRID_KM, (row - 1.5) * GRID_KM)
    a.typeCode = t
    a.aircraftClass = classOf(t)
    return a
  })
  return { snapshot: () => list, status: () => 'live', subscribeStatus: () => () => {} }
}

function createClassLineup(): TrafficSource {
  const mk = (cls: AircraftClass, i: number, ground: boolean): Aircraft => ({
    id: `${ground ? 'g' : 'm'}${i}`,
    callsign: (ground ? 'GND ' : '') + cls.toUpperCase(),
    lat: 0,
    lon: 0,
    e:
      (i - (CLASSES.length - 1) / 2) * SPACING_KM * Math.cos(SKEW) +
      (ground ? 0.5 * Math.sin(SKEW) : 0),
    n: (i - (CLASSES.length - 1) / 2) * SPACING_KM * Math.sin(SKEW) - (ground ? 0.5 : 0),
    altFt: ground ? 0 : 1000,
    gsKt: 0,
    trackDeg: 0,
    vsFpm: 0,
    onGround: ground,
    distNm: 3,
    category: 'OVR',
    phase: 'Cruise',
    typeCode: '',
    aircraftClass: cls,
    airline: '',
    origin: '',
    dest: '',
    etaMin: null,
    lastSeenMs: 0,
  })
  const list = [
    ...CLASSES.map((c, i) => mk(c, i, false)),
    ...CLASSES.map((c, i) => mk(c, i, true)).filter((_, i) => i % 2 === 0),
  ]
  return { snapshot: () => list, status: () => 'live', subscribeStatus: () => () => {} }
}
