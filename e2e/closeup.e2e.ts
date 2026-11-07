import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'
const TAG = process.env.SHOT_TAG ?? 'after'

test('closeup: KSEA zoomed in, dark + light', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?apt=KSEA')
  await page.waitForTimeout(15_000)
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.mouse.move(720, 450)
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -200)
  await page.waitForTimeout(8000)
  await page.screenshot({ path: `${SHOTS}/closeup-${TAG}-dark.png` })
  await page.getByTestId('theme-toggle').click()
  await page.waitForTimeout(10_000)
  await page.screenshot({ path: `${SHOTS}/closeup-${TAG}-light.png` })
  for (let i = 0; i < 14; i++) await page.mouse.wheel(0, 200)
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${SHOTS}/closeup-${TAG}-light-mid.png` })
  expect(errors).toEqual([])
})
