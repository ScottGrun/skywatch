import { expect, test, vi } from 'vitest'
import { keyTimeMs, latestKey, newestKey } from './radarList'

const xml = (keys: string[], next = '') =>
  `<ListBucketResult><IsTruncated>${next ? 'true' : 'false'}</IsTruncated>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}${next ? `<NextContinuationToken>${next}</NextContinuationToken>` : ''}</ListBucketResult>`
const mock = (fn: (url: string) => string) =>
  vi.fn(async (url: string) => new Response(fn(url))) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>

test('newestKey picks the latest full volume and skips _MDM files', () => {
  const p = '2026/11/06/KATX/KATX20261106_'
  expect(newestKey(xml([`${p}001859_V06`, `${p}002551_V06`, `${p}002551_V06_MDM`]))).toBe(
    `${p}002551_V06`,
  )
  expect(newestKey(xml([]))).toBeNull()
})

test('keyTimeMs parses _V06, .gz, and rejects odd names', () => {
  const t = Date.UTC(2026, 10, 6, 0, 18, 59)
  expect(keyTimeMs('2026/11/06/KATX/KATX20261106_001859_V06')).toBe(t)
  expect(keyTimeMs('2026/11/06/KATX/KATX20261106_001859_V08.gz')).toBe(t)
  expect(keyTimeMs('2026/11/06/KATX/KATX20261106_001859.gz')).toBe(t)
  expect(keyTimeMs('junk')).toBeNull()
})

test('latestKey lists only the tail of today (start-after) and follows continuation tokens', async () => {
  const p = '2026/11/07/KATX/KATX20261107_'
  const f = mock((url) =>
    url.includes('continuation-token=T1') ? xml([`${p}121000_V06`]) : xml([`${p}115000_V06`], 'T1'),
  )
  const k = await latestKey('KATX', new Date('2026-11-07T12:15:00Z'), f)
  expect(k).toBe(`${p}121000_V06`)
  const first = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0]!
  expect(first).toContain('start-after=2026%2F11%2F07%2FKATX%2FKATX20261107_090000')
})

test('latestKey falls back to yesterday around midnight (mocked fetch)', async () => {
  const f = mock((url) =>
    url.includes('2026/11/06/') ? xml(['2026/11/06/KATX/KATX20261106_235900_V06']) : xml([]),
  )
  const k = await latestKey('KATX', new Date('2026-11-07T00:30:00Z'), f)
  expect(k).toBe('2026/11/06/KATX/KATX20261106_235900_V06')
})

test('latestKey rejects stale volumes', async () => {
  const f = mock(() => xml(['2026/11/07/KATX/KATX20261107_010000_V06']))
  expect(await latestKey('KATX', new Date('2026-11-07T12:00:00Z'), f)).toBeNull()
})
