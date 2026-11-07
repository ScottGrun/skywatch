import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'

test('airport view: overview vs AIRPORT preset vs mid zoom, both themes', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?apt=KSEA')
  await page.waitForTimeout(15_000)
  await page.screenshot({ path: `${SHOTS}/airport-overview-dark.png` })
  await page.getByRole('button', { name: 'AIRPORT', exact: true }).click()
  await page.waitForTimeout(7000)
  await page.screenshot({ path: `${SHOTS}/airport-view-dark.png` })
  await page.mouse.move(720, 450)
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 200)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/airport-mid-dark.png` })
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -200)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/airport-near-dark.png` })
  await page.getByTestId('theme-toggle').click()
  await page.getByRole('button', { name: 'AIRPORT', exact: true }).click()
  await page.waitForTimeout(9000)
  await page.screenshot({ path: `${SHOTS}/airport-view-light.png` })
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.waitForTimeout(7000)
  await page.screenshot({ path: `${SHOTS}/airport-overview-light.png` })
  expect(errors).toEqual([])
})
