import type { AircraftClass } from '../types'

/** ICAO type designator -> baked model name (public/models/<name>.glb). First match wins. */
const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^A318$/, 'a318'],
  [/^A319$/, 'a319'],
  [/^A19N$/, 'a319'],
  [/^(A320|A20N)$/, 'a320'],
  [/^(A321|A21N)$/, 'a321'],
  [/^(A332|A330|A338|A339|A337|A30B|A306|A310|A3ST)$/, 'a332'],
  [/^A333$/, 'a333'],
  [/^(A343|A342|A340)$/, 'a343'],
  [/^(A345|A346)$/, 'a346'],
  [/^(A359|A35K|A358)$/, 'a359'],
  [/^A388$/, 'a380'],
  [/^(B736|B735|B734|B733|B732|B731)$/, 'b736'],
  [/^B737$/, 'b737'],
  [/^(B738|B38M|B37M|B3XM|BBJ\d)$/, 'b738'],
  [/^(B739|B39M|B712|MD8\d|MD9\d|MD90|DC9\d?|B72\w)$/, 'b739'],
  [/^(B744|B74\w|B741|B742|B743|BLCF|B74R|B74S)$/, 'b744'],
  [/^B748$/, 'b748'],
  [/^B752$/, 'b752'],
  [/^B753$/, 'b753'],
  [/^(B762|B761|B76\d?)$/, 'b762'],
  [/^B763$/, 'b763'],
  [/^B764$/, 'b764'],
  [/^(B772|B77L|B77\w?)$/, 'b772'],
  [/^(B773|B77W)$/, 'b773'],
  [/^(B788)$/, 'b788'],
  [/^(B789|B78X|B78\w)$/, 'b789'],
  [/^(BAE?146|B462|B463|RJ\d\w|AVRO|B461)$/, 'bae146'],
  [/^BCS1$/, 'cs100'],
  [/^(BCS3|A220|A223|A221)$/, 'cs300'],
  [/^(CRJ[12]|CRJ7|CRJ\d|CL60|CL30|CL35|CL3\d)$/, 'crj700'],
  [/^(CRJ9|CRJX|CRJ1)$/, 'crj900'],
  [/^(E170|E75[LSE]|E7\d\w?|E175|E135|E145|E14\w|ERJ\w?|E13\w)$/, 'e170'],
  [/^(E190|E195|E19\w|E29\w|E290|E295|E39\w)$/, 'e190'],
  [/^(DH8[A-D]|DHC\d|DH\d)$/, 'q400'],
  [/^(AT[3-7]\w|ATR\w*)$/, 'atr42'],
  [
    /^(C25\w|C5\d\d|C56X|C68\w?|C700|C750|GLF\w|LJ\d+|E55P|E50P|FA\d\w|F2TH|F900|H25\w|HDJT|PRM1|GLEX|G[2-7]\d\d|GL\w\w|E545|E550|PC24|SF50)$/,
    'citation',
  ],
  [/^(C1\d\d|C2\d\d|PA\d\w|P28\w|SR2\w|S22T|C172|BE\d\w|M20\w|DA\d\w|AA\d)$/, 'pa28'],
]

const CLASS_FALLBACK: Partial<Record<AircraftClass, string>> = {
  narrow: 'a320',
  wide: 'b789',
  quad: 'b744',
  regional: 'e190',
  turboprop: 'q400',
  piston: 'pa28',
  bizjet: 'citation',
  heli: 'heli',
}

const cache = new Map<string, string | null>()

/** Model name for an aircraft; null -> keep the procedural geometry. */
export function modelNameFor(typeCode: string, cls: AircraftClass): string | null {
  const t = typeCode.toUpperCase()
  if (cls === 'heli') return 'heli' // all helicopters share one model
  const key = `${t}|${cls}`
  let r = cache.get(key)
  if (r !== undefined) return r

  const hit = t ? RULES.find(([re]) => re.test(t)) : undefined
  // Only trust a type match when it agrees with the class (the type may be mis-reported).
  if (hit && (cls === 'unknown' || sameFamily(hit[1], cls))) r = hit[1]
  else r = CLASS_FALLBACK[cls] ?? null
  cache.set(key, r)
  return r
}

const FAMILY: Record<string, AircraftClass[]> = {
  narrow: ['narrow', 'regional'],
  wide: ['wide', 'quad'],
  quad: ['quad', 'wide'],
  regional: ['regional', 'narrow'],
  turboprop: ['turboprop', 'regional'],
  piston: ['piston', 'bizjet'],
  bizjet: ['bizjet', 'regional'],
}

const MODEL_CLASS: Record<string, AircraftClass> = {}
for (const n of ['a318', 'a319', 'a320', 'a321', 'b736', 'b737', 'b738', 'b739', 'cs100', 'cs300'])
  MODEL_CLASS[n] = 'narrow'
for (const n of ['a332', 'a333', 'a359', 'b762', 'b763', 'b764', 'b772', 'b773', 'b788', 'b789'])
  MODEL_CLASS[n] = 'wide'
for (const n of ['a343', 'a346', 'a380', 'b744', 'b748']) MODEL_CLASS[n] = 'quad'
for (const n of ['b752', 'b753']) MODEL_CLASS[n] = 'narrow'
for (const n of ['bae146', 'crj700', 'crj900', 'e170', 'e190']) MODEL_CLASS[n] = 'regional'
for (const n of ['q400', 'atr42']) MODEL_CLASS[n] = 'turboprop'
MODEL_CLASS.citation = 'bizjet'
MODEL_CLASS.pa28 = 'piston'

function sameFamily(model: string, cls: AircraftClass): boolean {
  const mc = MODEL_CLASS[model]
  return !!mc && (FAMILY[cls] ?? [cls]).includes(mc)
}
