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
/** Row is rotated to run left-to-right on screen at the default camera azimuth. */
const SKEW = 0.55

/** Dev-only static lineup of every class (enabled with `?models=1`). */
export function createLineup(): TrafficSource {
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
