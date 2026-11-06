import type { AircraftClass } from '../types.ts'

const list = (s: string) => new Set(s.split(/\s+/).filter(Boolean))

const QUAD = list('B741 B742 B743 B744 B748 BLCF A388 A380 A342 A343 A345 A346 IL96 B74S B74R')
const WIDE = list(
  `B762 B763 B764 B772 B77L B77W B773 B788 B789 B78X B703
   A306 A30B A310 A332 A333 A338 A339 A359 A35K A330 A340 A350 A3ST
   DC10 MD11 L101 IL86 IL76 B77F A124 AN12 C5M`,
)
const REGIONAL = list(
  `E170 E75L E75S E190 E195 E290 E295 E135 E145 E45X E35L E50P E55P
   CRJ1 CRJ2 CRJ7 CRJ9 CRJX CRJ5 BCS1 BCS3 A220 SU95 RJ85 RJ1H RJ70 B461 B462 B463 F100 F70 F28`,
)
const PROP = list(
  `DH8A DH8B DH8C DH8D AT43 AT44 AT45 AT46 AT72 AT73 AT75 AT76 SF34 SB20 JS31 JS32 JS41
   BE20 BE30 BE9L BE99 B190 PC12 C208 C172 C182 C206 C210 C402 C441 PA28 PA31 PA32 PA34 PA44 PA46 SR20 SR22 BE35 BE36 BE58 TBM7 TBM8 TBM9 DA40 DA42 DHC6 DHC2 DHC3 D328 SW4 SW3 AC90 AC95 E120 L410 AN24 AN26 AN28 AN32 A748 C130 C30J F27 F50 F60 SH36 SH33 DC3 DC6 B06 R44 R22 EC35 H60 S76 AS50 A139 B407 B412 B429`,
)
// Light jets / bizjets are closest to the regional model.
const BIZ = list(
  'C25A C25B C25C C510 C525 C550 C560 C56X C680 C700 C750 CL30 CL35 CL60 GLF4 GLF5 GLF6 GLEX FA7X FA8X FA50 FA20 LJ35 LJ45 LJ60 H25B HDJT PRM1 ASTR',
)

/** ICAO type designator to model class; unknown types default to narrow. */
export function aircraftClassFor(typeCode: string): AircraftClass {
  const t = typeCode.trim().toUpperCase()
  if (!t) return 'narrow'
  if (QUAD.has(t)) return 'quad'
  if (WIDE.has(t)) return 'wide'
  if (PROP.has(t)) return 'prop'
  if (REGIONAL.has(t) || BIZ.has(t)) return 'regional'
  return 'narrow'
}
