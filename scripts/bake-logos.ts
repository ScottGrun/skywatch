// Usage: node scripts/bake-logos.ts   (or: pnpm bake:logos)
// Downloads airline tail-icon logos (Jxck-S/airline-logos, flightaware_logos, named by ICAO code) for a
// curated code list and bakes 48x48 PNGs to
//   public/logos/<ICAO>.png
//   public/logos/index.json   ->  ["AAL", "ACA", ...]
// Logos are trademarks of their owners; the source repo's license is unclear. Output is gitignored.
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { LOGO_CODES } from './logoCodes.ts'

const RAW = 'https://raw.githubusercontent.com/Jxck-S/airline-logos/main/flightaware_logos'
const SIZE = 48

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/logos')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const codes = [...new Set(LOGO_CODES)].sort()
const got: string[] = []

async function bake(code: string): Promise<void> {
  const res = await fetch(`${RAW}/${code}.png`)
  if (!res.ok) return
  const png = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 85, compressionLevel: 9 })
    .toBuffer()
  writeFileSync(resolve(outDir, `${code}.png`), png)
  got.push(code)
}

for (let i = 0; i < codes.length; i += 12) await Promise.all(codes.slice(i, i + 12).map(bake))
got.sort()
writeFileSync(resolve(outDir, 'index.json'), JSON.stringify(got))

const bytes = readdirSync(outDir).reduce((n, f) => n + statSync(resolve(outDir, f)).size, 0)
console.log(`${got.length}/${codes.length} logos, ${(bytes / 1024).toFixed(0)} KB`)
console.log('no source image:', codes.filter((c) => !got.includes(c)).join(' '))
