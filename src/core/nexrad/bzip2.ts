// Minimal bzip2 decompressor (single stream, no CRC check, no legacy "randomised" blocks).
// NEXRAD Level II wraps each LDM record in one bzip2 stream, which is all this has to handle.

class Bits {
  private pos = 0
  private buf = 0
  private n = 0
  private readonly src: Uint8Array
  constructor(src: Uint8Array) {
    this.src = src
  }
  /** Reads up to 24 bits, MSB first. */
  read(count: number): number {
    while (this.n < count) {
      if (this.pos >= this.src.length) throw new Error('bzip2: unexpected end of data')
      this.buf = ((this.buf << 8) | this.src[this.pos++]!) >>> 0
      this.n += 8
    }
    this.n -= count
    const v = (this.buf >>> this.n) & ((1 << count) - 1)
    this.buf &= (1 << this.n) - 1
    return v
  }
  bit(): number {
    return this.read(1)
  }
}

interface Table {
  minLen: number
  limit: Int32Array
  base: Int32Array
  perm: Int32Array
}

function buildTable(len: Uint8Array, alpha: number): Table {
  let minLen = 32
  let maxLen = 0
  for (let i = 0; i < alpha; i++) {
    minLen = Math.min(minLen, len[i]!)
    maxLen = Math.max(maxLen, len[i]!)
  }
  const perm = new Int32Array(alpha)
  const base = new Int32Array(23)
  const limit = new Int32Array(23)
  let pp = 0
  for (let l = minLen; l <= maxLen; l++)
    for (let j = 0; j < alpha; j++) if (len[j] === l) perm[pp++] = j
  for (let i = 0; i < alpha; i++) base[len[i]! + 1]!++
  for (let i = 1; i < 23; i++) base[i]! += base[i - 1]!
  let vec = 0
  for (let l = minLen; l <= maxLen; l++) {
    vec += base[l + 1]! - base[l]!
    limit[l] = vec - 1
    vec <<= 1
  }
  for (let l = minLen + 1; l <= maxLen; l++) base[l] = ((limit[l - 1]! + 1) << 1) - base[l]!
  return { minLen, limit, base, perm }
}

class Out {
  private chunks: Uint8Array[] = []
  private cur = new Uint8Array(1 << 20)
  private len = 0
  total = 0
  push(b: number): void {
    if (this.len === this.cur.length) {
      this.chunks.push(this.cur)
      this.cur = new Uint8Array(this.cur.length * 2)
      this.len = 0
    }
    this.cur[this.len++] = b
    this.total++
  }
  result(): Uint8Array {
    const out = new Uint8Array(this.total)
    let o = 0
    for (const c of this.chunks) {
      out.set(c, o)
      o += c.length
    }
    out.set(this.cur.subarray(0, this.len), o)
    return out
  }
}

/** Decodes the Huffman/MTF/RLE2 stage of one block into `tt` (low byte), returns the symbol count. */
function readBlock(br: Bits, level: number, tt: Uint32Array, counts: Int32Array): number {
  br.read(24)
  br.read(8) // block CRC (unchecked)
  if (br.bit()) throw new Error('bzip2: randomised blocks unsupported')
  const origPtr = br.read(24)
  const used = br.read(16)
  const seqToUnseq: number[] = []
  for (let i = 0; i < 16; i++) {
    if (used & (0x8000 >> i)) {
      const m = br.read(16)
      for (let j = 0; j < 16; j++) if (m & (0x8000 >> j)) seqToUnseq.push(i * 16 + j)
    }
  }
  const nInUse = seqToUnseq.length
  if (!nInUse) throw new Error('bzip2: empty symbol map')
  const alpha = nInUse + 2
  const nGroups = br.read(3)
  if (nGroups < 2 || nGroups > 6) throw new Error('bzip2: bad group count')
  const nSel = br.read(15)
  const mtfG = [0, 1, 2, 3, 4, 5].slice(0, nGroups)
  const selectors = new Uint8Array(nSel)
  for (let i = 0; i < nSel; i++) {
    let j = 0
    while (br.bit()) if (++j >= nGroups) throw new Error('bzip2: bad selector')
    const v = mtfG[j]!
    mtfG.splice(j, 1)
    mtfG.unshift(v)
    selectors[i] = v
  }
  const tables: Table[] = []
  for (let g = 0; g < nGroups; g++) {
    const len = new Uint8Array(alpha)
    let cur = br.read(5)
    for (let i = 0; i < alpha; i++) {
      for (;;) {
        if (cur < 1 || cur > 20) throw new Error('bzip2: bad code length')
        if (!br.bit()) break
        cur += br.bit() ? -1 : 1
      }
      len[i] = cur
    }
    tables.push(buildTable(len, alpha))
  }
  const mtf = new Uint8Array(256)
  for (let i = 0; i < 256; i++) mtf[i] = i
  counts.fill(0)
  const max = level * 100000
  const eob = nInUse + 1
  let n = 0
  let runLen = 0
  let runBit = 1
  let selIdx = 0
  let left = 0
  let t!: Table
  for (;;) {
    if (left === 0) {
      if (selIdx >= nSel) throw new Error('bzip2: out of selectors')
      t = tables[selectors[selIdx++]!]!
      left = 50
    }
    left--
    let zn = t.minLen
    let zv = br.read(zn)
    while (zv > t.limit[zn]!) {
      if (++zn > 20) throw new Error('bzip2: bad huffman code')
      zv = (zv << 1) | br.bit()
    }
    const sym = t.perm[zv - t.base[zn]!]!
    if (sym <= 1) {
      runLen += runBit << sym
      runBit <<= 1
      continue
    }
    if (runLen) {
      const b = seqToUnseq[mtf[0]!]!
      if (n + runLen > max) throw new Error('bzip2: block overflow')
      counts[b]! += runLen
      tt.fill(b, n, n + runLen)
      n += runLen
      runLen = 0
      runBit = 1
    }
    if (sym === eob) break
    const idx = sym - 1
    const v = mtf[idx]!
    mtf.copyWithin(1, 0, idx)
    mtf[0] = v
    const b = seqToUnseq[v]!
    if (n >= max) throw new Error('bzip2: block overflow')
    counts[b]!++
    tt[n++] = b
  }
  if (origPtr >= n) throw new Error('bzip2: bad origPtr')
  tt[n] = origPtr // stash for the caller
  return n
}

export function bunzip2(src: Uint8Array): Uint8Array {
  const br = new Bits(src)
  if (br.read(8) !== 0x42 || br.read(8) !== 0x5a || br.read(8) !== 0x68)
    throw new Error('bzip2: bad magic')
  const level = br.read(8) - 0x30
  if (level < 1 || level > 9) throw new Error('bzip2: bad level')
  const tt = new Uint32Array(level * 100000 + 1)
  const counts = new Int32Array(256)
  const out = new Out()
  for (;;) {
    const m1 = br.read(24)
    const m2 = br.read(24)
    if (m1 === 0x177245 && m2 === 0x385090) return out.result()
    if (m1 !== 0x314159 || m2 !== 0x265359) throw new Error('bzip2: bad block magic')
    const n = readBlock(br, level, tt, counts)
    const origPtr = tt[n]!
    // inverse BWT
    const cf = new Int32Array(256)
    let sum = 0
    for (let i = 0; i < 256; i++) {
      cf[i] = sum
      sum += counts[i]!
    }
    for (let i = 0; i < n; i++) {
      const b = tt[i]! & 0xff
      const dst = cf[b]!
      cf[b] = dst + 1
      tt[dst] = tt[dst]! | (i << 8)
    }
    let tPos = tt[origPtr]! >>> 8
    // undo the initial run-length encoding (4 equal bytes + repeat count)
    let prev = -1
    let same = 0
    for (let i = 0; i < n; i++) {
      const e = tt[tPos]!
      const ch = e & 0xff
      tPos = e >>> 8
      if (same === 4) {
        for (let k = 0; k < ch; k++) out.push(prev)
        same = 0
        prev = -1
        continue
      }
      same = ch === prev ? same + 1 : 1
      prev = ch
      out.push(ch)
    }
  }
}
