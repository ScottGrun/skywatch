import { expect, test, vi } from 'vitest'
import { latestKey, newestKey } from './radar'

const xml = (keys: string[]) =>
  `<ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`

test('newestKey picks the latest full volume and skips _MDM files', () => {
  const p = '2026/11/06/KATX/KATX20261106_'
  expect(newestKey(xml([`${p}001859_V06`, `${p}002551_V06`, `${p}002551_V06_MDM`]))).toBe(
    `${p}002551_V06`,
  )
  expect(newestKey(xml([]))).toBeNull()
})

test('latestKey falls back to yesterday when today is empty (mocked fetch)', async () => {
  const f = vi.fn(
    async (url: string) =>
      new Response(
        url.includes('2026/11/06/') ? xml(['2026/11/06/KATX/KATX20261106_235900_V06']) : xml([]),
      ),
  )
  const k = await latestKey('KATX', new Date('2026-11-07T00:30:00Z'), f as unknown as typeof fetch)
  expect(k).toBe('2026/11/06/KATX/KATX20261106_235900_V06')
  expect(f).toHaveBeenCalledTimes(2)
})
