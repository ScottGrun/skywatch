import type { AircraftClass } from '../types.ts'

// Ordered: first matching pattern wins. Patterns are tested against the ICAO type designator.
const RULES: ReadonlyArray<readonly [AircraftClass, RegExp]> = [
  ['quad', /^(B74[1-8SR]|BLCF|A38\d|A34[2-6]|IL96|A124|AN22|C5M?|E3TF|K35R|B52|C17)$/],
  [
    'wide',
    /^(B76\d|B77[A-Z0-9]|B78[0-9X]|A30[6B]|A310|A33\d|A35[0-9K]|A3ST|DC10|MD11|L101|IL86|IL76|B703|KC10|A332|B772|BSCA)$/,
  ],
  [
    'regional',
    /^(E1[479]\d|E1[0-9][A-Z]|E[23]\d{2}|E7\d[A-Z]?|E4\dX|E[35]\dL|CRJ[0-9X]|CL[0-9]{2}R|BCS[13]|A220|SU95|RJ\d[0-9A-Z]|B46\d|F100|F70|F28|BAE?146|RJ1H|AR\d{2}|E135|E145|ERJ|SSJ)$/,
  ],
  [
    'turboprop',
    /^(DH8[A-D]|AT[3-7]\d|SF34|SB20|JS\d\d|BE20|BE30|BE9[0-9L]|B190|B350|PC12|PC6T|PC21|C208|C441|C425|C90|C130|C30J|F27|F50|F60|SH3\d|L410|AN2[468]|AN32|A748|DHC[2-7]|D328|SW[34]|AC9\d|E120|TBM\d|P180|MU2|DH[1-7]|DC3|DC6|PAY\d|T6|AT8|AN12|IL18|C212|CN35|CASA|BE10|BE99|M28|Y12|MA60|DHC\d)$/,
  ],
  [
    'heli',
    /^(EC\d\d|AS\d\d|AS3[25]|B06|B407|B412|B429|B427|B505|B212|B230|B47[A-Z]?|R22|R44|R66|S76|S92|S61|S64|S70|H60|A109|A119|A139|A169|A189|H160|H125|H130|H135|H145|MD52|MD60|EXPL|V22|NH90|CH47|H47|UH1|H500|MI\d+|KA\d+|BK17|EN28|EN48|G2CA|HUCO)$/,
  ],
  [
    'bizjet',
    /^(C25[A-Z]|C5[0-9]{2}|C56X|C68[A-Z]?|C700|C750|CL[3-6][0-9]|GL[0-9A-Z]{2}|GLF\d|GLEX|G[2-7]\d{2}|LJ\d{2}|E55P|E50P|FA\d[0-9A-Z]|F2TH|F900|FA7X|FA8X|H25[BC]|HDJT|PRM1|ASTR|WW24|SF50|EA50|BE40|BE4W|C510|PC24|GALX|LJ\d\d|CL30|CL35|CL60|HA4T|GA[0-9]C|GA[0-9]{2}|G150|G280|MU30|ECLP|E545|E550)$/,
  ],
  [
    'piston',
    /^(C1[0-9]{2}|C150|C152|C162|C172|C175|C177|C180|C182|C185|C195|C20[0-9]|C21\d|C310|C337|C340|C402|C414|C421|PA\d{2}|P28[A-Z]|P32[A-Z]|PA2\d|PA3\d|PA4\d|SR2\d|S22T|BE3\d|BE5\d|BE6\d|BE7\d|BE76|M20[A-Z]|DA\d\d|DV20|AA5|AA1|RV\d|COL[34]|TB\d{1,2}|TOBA|TRIN|G115|CH7[A-Z]|SLG2|GLID|ULAC|AT\d[A-Z]?|P46T|PA46|C77R|GA7|J3|PIVI|M600|CRUZ|BL8|CNA|DR40|SIRA|EVOT|ARCE|M[0-9]{3}|B[0-9]{2}P|NG5|SF25|YK\d+|SK\d+|TWEN|STIN|LNC\d|MO\d\w|GLAS|CIRA|ZLIN|ROBN)$/,
  ],
]

/** Doc 8643 data for a type (from the baked public/data/types.json). */
export interface TypeInfo {
  desc: string // e.g. "L2J", "H1T"
  wtc: string // "L" | "M" | "H" | "J"
  name?: string // e.g. "BOEING 737-800"
}

const REGIONAL_NAME =
  /(ERJ|EMB-?1[3-9]\d|EMBRAER 1[3-9]\d|EMBRAER E|CRJ|REGIONAL JET|FOKKER|AVRO|RJ\d|SUPERJET|SSJ|ARJ|MRJ|SPACEJET|DORNIER 328)/
const BIZJET_NAME =
  /(CITATION|LEARJET|GULFSTREAM|FALCON|HAWKER|CHALLENGER \d|GLOBAL \d|GLOBAL EXPRESS|PHENOM|LEGACY|PRAETOR|LATITUDE|HONDAJET|ECLIPSE|SABRELINER|WESTWIND|ASTRA|BEECHJET|PREMIER|VISION ?JET|G\d{3}|CIRRUS SF)/

/** Class from an ICAO Doc 8643 description (e.g. L2J) plus wake turbulence category. */
export function classFromDescriptor(desc: string, wtc = '', name = ''): AircraftClass {
  const d = desc.trim().toUpperCase()
  if (d.length < 3) return 'unknown'
  const kind = d[0]
  const count = d[1]
  const eng = d[2]
  if (kind === 'H' || kind === 'T') return 'heli' // helicopter, tiltrotor
  if (kind === 'G') return 'piston' // gyrocopter / glider-like light aircraft
  if (kind !== 'L' && kind !== 'S' && kind !== 'A') return 'unknown'
  const heavy = wtc === 'H' || wtc === 'J'
  switch (eng) {
    case 'P':
    case 'E':
    case 'R':
      return 'piston'
    case 'T':
      return 'turboprop'
    case 'J': {
      const n = Number(count)
      if (n >= 4) return heavy ? 'quad' : 'regional'
      if (heavy) return 'wide'
      const nm = name.toUpperCase()
      if (REGIONAL_NAME.test(nm)) return 'regional'
      if (BIZJET_NAME.test(nm)) return 'bizjet'
      if (n === 1 || wtc === 'L') return 'bizjet'
      return 'narrow'
    }
    default:
      return 'unknown'
  }
}

/**
 * ICAO type designator to model class. The explicit table wins; otherwise the Doc 8643
 * descriptor (when supplied) decides; finally a few airliner family patterns.
 */
export function aircraftClassFor(typeCode: string, info?: TypeInfo | null): AircraftClass {
  const t = typeCode.trim().toUpperCase()
  if (!t) return 'unknown'
  for (const [cls, re] of RULES) if (re.test(t)) return cls
  if (info) {
    const c = classFromDescriptor(info.desc, info.wtc, info.name)
    if (c !== 'unknown') return c
  }
  // Common airliner families by prefix (A19N/A20N/A21N, A318-A321, B73x/B37M/B38M/B39M, MD8x, B72x, DC9).
  if (
    /^(A3[12]\d|A[12][0-9]N|B73[0-9A-Z]|B3[789]M|B72\d|MD[89]\d|DC9\d?|B71\d|B75\d|C919|MC21|TU\d+|A20N|A21N)$/.test(
      t,
    )
  )
    return 'narrow'
  if (/^[A-Z]{1,2}\d{1,3}[A-Z]?$/.test(t) && /^(B7|A3|MD|DC|IL|TU)/.test(t)) return 'narrow'
  return 'unknown'
}

/**
 * OpenSky ADS-B emitter category (0..20) to class, used when the type code is unknown.
 * 2 light, 3 small, 4 large, 5 high-vortex large, 6 heavy, 7 high performance, 8 rotorcraft.
 */
export function classFromCategory(category: number | undefined): AircraftClass {
  switch (category) {
    case 2:
    case 9: // glider
    case 12: // ultralight
      return 'piston'
    case 3:
      return 'bizjet'
    case 4:
      return 'narrow'
    case 5:
      return 'wide'
    case 6:
      return 'wide'
    case 7:
      return 'bizjet'
    case 8:
      return 'heli'
    default:
      return 'unknown'
  }
}

/** Type code wins; the emitter category only fills in when the type is missing/unrecognised. */
export function resolveClass(
  typeCode: string,
  category?: number,
  info?: TypeInfo | null,
): AircraftClass {
  const byType = aircraftClassFor(typeCode, info)
  return byType !== 'unknown' ? byType : classFromCategory(category)
}
