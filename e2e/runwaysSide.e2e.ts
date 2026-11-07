import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'

test('runway flush check: low grazing view at x1 and x10', async ({ page }) => {
  test.setTimeout(240_000)
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?apt=KSEA')
  await page.waitForTimeout(15_000)
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.mouse.move(900, 450)
  for (let i = 0; i < 52; i++) await page.mouse.wheel(0, -200)
  await page.waitForTimeout(2000)
  await page.mouse.down()
  await page.mouse.move(900, 200, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(2500)
  const slider = page.getByLabel('Vertical exaggeration')
  for (const k of ['1', '10']) {
    await slider.fill(k)
    await page.waitForTimeout(4000)
    await page.screenshot({ path: `${SHOTS}/rw-graze-x${k}.png` })
  }
  await page.getByRole('button', { name: 'TERRAIN' }).click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/rw-graze-x10-flat.png` })
  expect(errors).toEqual([])
})
