import { describe, expect, it, vi } from 'vitest'
import { fullTypeName, mapAircraft } from './adsbdb.ts'
import { createPhotoClient, mapPhoto } from './photo.ts'

const fixture = {
  photos: [
    {
      id: '1',
      thumbnail: { src: 'https://t.plnspttrs.net/1/small.jpg' },
      thumbnail_large: { src: 'https://t.plnspttrs.net/1/large.jpg' },
      link: 'https://www.planespotters.net/photo/1/x',
      photographer: 'Jane Doe',
    },
  ],
}

describe('planespotters photo', () => {
  it('maps the first photo, preferring the large thumbnail', () => {
    expect(mapPhoto(fixture)).toEqual({
      thumb: 'https://t.plnspttrs.net/1/large.jpg',
      link: 'https://www.planespotters.net/photo/1/x',
      photographer: 'Jane Doe',
    })
  })
  it('returns null for empty or malformed input', () => {
    expect(mapPhoto({ photos: [] })).toBeNull()
    expect(mapPhoto(null)).toBeNull()
    expect(mapPhoto({ photos: [{ link: 'x', thumbnail: { src: 'http://a/b.jpg' } }] })).toBeNull()
  })
  it('caches, sends a User-Agent, and caches misses', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(fixture)))
    const c = createPhotoClient({ fetch: f, now: () => 0 })
    expect((await c.get('ABC123'))?.photographer).toBe('Jane Doe')
    await c.get('abc123')
    expect(f).toHaveBeenCalledTimes(1)
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/tracon3d/)
    const g = vi.fn(async () => new Response('{"photos":[]}'))
    const d = createPhotoClient({ fetch: g, now: () => 0 })
    expect(await d.get('000001')).toBeNull()
    await d.get('000001')
    expect(g).toHaveBeenCalledTimes(1)
  })
})

describe('adsbdb type and photo fields', () => {
  it('builds the full type name', () => {
    expect(fullTypeName('Airbus', 'A320-214')).toBe('Airbus A320-214')
    expect(fullTypeName('Boeing', 'Boeing 737-800')).toBe('Boeing 737-800')
    expect(fullTypeName('', 'A320')).toBe('A320')
    expect(fullTypeName('', '')).toBe('')
  })
  it('passes photo URLs through, upgrading to https', () => {
    const m = mapAircraft({
      response: {
        aircraft: {
          manufacturer: 'Airbus',
          type: 'A320-214',
          registered_owner: 'Air Canada',
          url_photo: 'http://www.airport-data.com/images/aircraft/1.jpg',
          url_photo_thumbnail: 'https://www.airport-data.com/images/aircraft/thumbnails/1.jpg',
        },
      },
    })
    expect(m.fullType).toBe('Airbus A320-214')
    expect(m.photo).toBe('https://www.airport-data.com/images/aircraft/1.jpg')
    expect(m.photoThumb).toMatch(/^https:/)
  })
})

describe('photo lookup transient flag', () => {
  it('flags upstream failures but not genuine misses', async () => {
    const bad = createPhotoClient({ fetch: async () => new Response('', { status: 500 }) })
    expect((await bad.lookup('000001')).transient).toBe(true)
    const none = createPhotoClient({
      fetch: async () => new Response(JSON.stringify({ photos: [] })),
    })
    expect(await none.lookup('000002')).toEqual({ photo: null, transient: false })
  })
})
