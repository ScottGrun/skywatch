/** Tiny in-memory TTL cache with a size cap (oldest-inserted evicted first). */
export class TtlCache<V> {
  private map = new Map<string, { v: V; exp: number }>()
  private ttlMs: number
  private max: number

  constructor(ttlMs: number, max = 2000) {
    this.ttlMs = ttlMs
    this.max = max
  }

  get(key: string, now: number): V | undefined {
    const e = this.map.get(key)
    return e && e.exp > now ? e.v : undefined
  }

  /** Returns the value even if expired (for stale serving). */
  peek(key: string): V | undefined {
    return this.map.get(key)?.v
  }

  set(key: string, v: V, now: number): void {
    this.map.delete(key)
    this.map.set(key, { v, exp: now + this.ttlMs })
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
  }
}
