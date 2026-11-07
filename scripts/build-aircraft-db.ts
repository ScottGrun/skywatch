// Usage: node scripts/build-aircraft-db.ts   (or: pnpm bake:aircraft)
// Downloads the tar1090-db (Mictronics-derived) aircraft database and bakes
//   public/data/aircraft/<first 2 hex chars>.json  ->  { "<hex>": [typeCode, registration] }
//   public/data/types.json                          ->  { "<typeCode>": { desc, wtc, name } }
// Owner names / build years in the source CSV are deliberately dropped.
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const RAW = 'https://raw.githubusercontent.com/wiedehopf/tar1090-db'
const CSV_URL = `${RAW}/csv/aircraft.csv.gz`
const TYPES_URL = `${RAW}/master/db/icao_aircraft_types2.js` // { type: [name, desc, wtc] }, gzip-wrapped

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/data/aircraft')

const [csv, typesRaw] = await Promise.all([download(CSV_URL), download(TYPES_URL)])

const shards = new Map<string, Record<string, [string, string]>>()
let count = 0
for (const line of csv.toString('utf8').split('\n')) {
  const f = line.split(';') // hex;reg;type;flags;model;year;owner;
  const hex = (f[0] ?? '').trim().toLowerCase()
  const type = (f[2] ?? '').trim().toUpperCase()
  if (!/^[0-9a-f]{6}$/.test(hex) || !type) continue
  const key = hex.slice(0, 2)
  let shard = shards.get(key)
  if (!shard) shards.set(key, (shard = {}))
  shard[hex] = [type, (f[1] ?? '').trim().toUpperCase()]
  count++
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
for (const [key, shard] of shards)
  writeFileSync(resolve(outDir, `${key}.json`), JSON.stringify(shard))

const rawTypes = JSON.parse(typesRaw.toString('utf8')) as Record<string, [string, string, string]>
const types: Record<string, { desc: string; wtc: string; name: string }> = {}
for (const [code, [name, desc, wtc]] of Object.entries(rawTypes))
  types[code] = { desc: desc ?? '', wtc: wtc ?? '', name: name ?? '' }
writeFileSync(resolve(root, 'public/data/types.json'), JSON.stringify(types))

const bytes = readdirSync(outDir).reduce((s, f) => s + statSync(resolve(outDir, f)).size, 0)
console.log(
  `${count} aircraft in ${shards.size} shards (${(bytes / 1e6).toFixed(1)} MB), ${Object.keys(types).length} types`,
)
