import type { FeedStatus } from '../types.ts'

/** Coarse state for the list: no data yet, healthy, or the last fetch failed (old data stays shown). */
export type FeedState = 'loading' | 'ok' | 'error'

export function feedState(s: FeedStatus): FeedState {
  return s === 'connecting' ? 'loading' : s === 'live' ? 'ok' : 'error'
}

/** What the traffic list should say in place of rows (the error notice is shown separately). */
export function listMessage(
  state: FeedState,
  rows: number,
  total: number,
): 'loading' | 'no-match' | null {
  if (rows > 0) return null
  if (total > 0) return 'no-match'
  return state === 'loading' ? 'loading' : null
}
