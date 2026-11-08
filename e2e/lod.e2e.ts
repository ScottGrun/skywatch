import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Basemap level-of-detail rings: screenshots at three distances in both themes (Esri forced).
const SHOTS = 'screenshots'
const TAG = process.env.SHOT_TAG ?? 'after'

test('lod: KSEA overview / mid / close, Esri tiles, dark + light', async ({ page }) => {
  test.setTimeout(420_000)
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const logs: string[] = []
  page.on('console', (m) => m.text().startsWith('[terrain]') && logs.push(m.text()))
  await page.addInitScript(() =>
    localStorage.setItem('tracon3d.mapboxDownUntil', String(Date.now() + 36e5)),
  )
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?apt=KSEA')
  await page.waitForTimeout(25_000)
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.mouse.move(720, 450)
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') {
      await page.getByTestId('theme-toggle').click()
      await page.waitForTimeout(15_000)
    }
    await page.getByRole('button', { name: 'OVERVIEW' }).click()
    await page.mouse.move(720, 450)
    await page.waitForTimeout(3000)
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 1500)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${SHOTS}/lod-${TAG}-${theme}-overview.png` })
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -600)
    await page.waitForTimeout(6000)
    await page.screenshot({ path: `${SHOTS}/lod-${TAG}-${theme}-mid.png` })
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -1000)
    await page.waitForTimeout(6000)
    await page.screenshot({ path: `${SHOTS}/lod-${TAG}-${theme}-close.png` })
  }
  console.log(logs.join('\n'))
  expect(errors).toEqual([])
})
