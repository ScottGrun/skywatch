import { describe, expect, it } from 'vitest'
import { feedState, listMessage } from './feedState.ts'

describe('feedState', () => {
  it('maps feed status', () => {
    expect(feedState('connecting')).toBe('loading')
    expect(feedState('live')).toBe('ok')
    expect(feedState('delayed')).toBe('error')
    expect(feedState('offline')).toBe('error')
  })
})

describe('listMessage', () => {
  it('shows loading only with no data yet', () => {
    expect(listMessage('loading', 0, 0)).toBe('loading')
    expect(listMessage('ok', 0, 0)).toBeNull()
  })
  it('shows no-match when a filter hides all existing aircraft', () => {
    expect(listMessage('ok', 0, 5)).toBe('no-match')
    expect(listMessage('error', 0, 5)).toBe('no-match')
    expect(listMessage('ok', 2, 5)).toBeNull()
  })
})
