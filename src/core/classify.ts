import type { Category, Phase } from '../types.ts'
import { angleDiffDeg } from './geo.ts'

export const AREA_NM = 40

export interface ClassifyInput {
  e: number // km east of airport
  n: number // km north of airport
  distNm: number
  /** Altitude above the airport (ft); 0 on ground. */
  altFt: number
  gsKt: number
  trackDeg: number
  vsFpm: number
  onGround: boolean
  origin?: string
  dest?: string
}

export interface AirportCodes {
  icao: string
  iata?: string
}

const matches = (code: string | undefined, ap: AirportCodes): boolean => {
  if (!code) return false
  const c = code.toUpperCase()
  return c === ap.icao.toUpperCase() || (!!ap.iata && c === ap.iata.toUpperCase())
}

/** Bearing (deg) from the aircraft toward the airport, from local km offsets. */
function bearingToAirport(e: number, n: number): number {
  return ((Math.atan2(-e, -n) * 180) / Math.PI + 360) % 360
}

/**
 * Radial component of ground speed: >0 moving away from the airport, <0 toward it.
 */
export function radialSpeedKt(i: Pick<ClassifyInput, 'e' | 'n' | 'trackDeg' | 'gsKt'>): number {
  const toward = angleDiffDeg(i.trackDeg, bearingToAirport(i.e, i.n))
  return -i.gsKt * Math.cos((toward * Math.PI) / 180)
}

/**
 * ARR / DEP / OVR. A matching destination/origin code overrides geometry
 * (destination wins when both match).
 */
export function classify(i: ClassifyInput, ap: AirportCodes): Category {
  if (matches(i.dest, ap)) return 'ARR'
  if (matches(i.origin, ap)) return 'DEP'
  if (i.onGround) return i.distNm <= 5 ? 'DEP' : 'OVR'
  if (i.distNm > AREA_NM) return 'OVR'
  const toward = angleDiffDeg(i.trackDeg, bearingToAirport(i.e, i.n)) < 60
  const away = angleDiffDeg(i.trackDeg, (bearingToAirport(i.e, i.n) + 180) % 360) < 60
  if (toward && (i.vsFpm < -300 || (i.altFt < 5000 && i.distNm < 25))) return 'ARR'
  if (away && (i.vsFpm > 300 || (i.altFt < 5000 && i.distNm < 25))) return 'DEP'
  return 'OVR'
}

/** Phase label; thresholds from phase() in design/flight-scene.js. */
export function phase(
  cat: Category,
  i: Pick<ClassifyInput, 'altFt' | 'distNm' | 'onGround' | 'gsKt' | 'vsFpm'>,
): Phase {
  if (i.onGround) {
    if (i.gsKt > 40) return cat === 'ARR' ? 'Landing' : 'Takeoff roll'
    return 'Taxi'
  }
  if (cat === 'ARR') {
    return i.altFt < 80
      ? 'Landing'
      : i.altFt < 4200 && i.distNm * 1.852 < 26
        ? 'Final approach'
        : i.altFt < 10500
          ? 'Approach'
          : 'Descent'
  }
  if (cat === 'DEP') {
    return i.altFt < 80 ? 'Takeoff roll' : i.altFt < 10000 ? 'Initial climb' : 'Climb'
  }
  if (i.vsFpm > 500) return 'Climb'
  if (i.vsFpm < -500) return 'Descent'
  return 'Cruise'
}

/** ARR: minutes to touchdown. Others: minutes until leaving the 40 NM area. null if unknown. */
export function etaMinutes(cat: Category, i: ClassifyInput): number | null {
  if (i.onGround || i.gsKt < 30) return null
  if (cat === 'ARR') return Math.max(0, (i.distNm / Math.max(i.gsKt, 120)) * 60)
  const radial = radialSpeedKt(i)
  const nm = radial > 0 ? AREA_NM - i.distNm : i.distNm + AREA_NM
  return Math.max(0, (Math.max(0, nm) / i.gsKt) * 60)
}
