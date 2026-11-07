import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const SHOTS = 'screenshots'

async function drag(page: Page, dx: number, dy: number): Promise<void> {
  await page.mouse.move(900, 450)
  await page.mouse.down()
  await page.mouse.move(900 + dx, 450 + dy, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
}
const zoom = async (page: Page, n: number, d: number): Promise<void> => {
  await page.mouse.move(900, 450)
  for (let i = 0; i < n; i++) await page.mouse.wheel(0, d)
  await page.waitForTimeout(2500)
}

test('runway pavement + markings: close, along, mid, side at x1 and x10', async ({ page }) => {
  test.setTimeout(420_000)
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?apt=KSEA')
  await page.waitForTimeout(15_000)
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  const slider = page.getByLabel('Vertical exaggeration')
  await slider.fill('1')
  await zoom(page, 52, -200)
  await page.screenshot({ path: `${SHOTS}/rw-close-high.png` })
  await drag(page, 0, 110)
  await page.screenshot({ path: `${SHOTS}/rw-close-low.png` })
  await drag(page, 120, 0)
  await page.screenshot({ path: `${SHOTS}/rw-along-dark.png` })
  await page.screenshot({
    path: `${SHOTS}/rw-thresh-dark.png`,
    clip: { x: 330, y: 560, width: 520, height: 340 },
  })
  await page.getByTestId('theme-toggle').click()
  await page.waitForTimeout(8000)
  await page.screenshot({ path: `${SHOTS}/rw-along-light.png` })
  await page.getByTestId('theme-toggle').click()
  await page.waitForTimeout(6000)
  await zoom(page, 12, 200)
  await page.screenshot({ path: `${SHOTS}/rw-mid.png` })
  await page.getByRole('button', { name: 'SIDE' }).click()
  await page.waitForTimeout(2500)
  await zoom(page, 20, -200)
  await page.screenshot({ path: `${SHOTS}/rw-side-x1.png` })
  await slider.fill('10')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/rw-side-x10.png` })
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await zoom(page, 52, -200)
  await drag(page, 0, 110)
  await page.screenshot({ path: `${SHOTS}/rw-close-low-x10.png` })
  await page.getByRole('button', { name: 'TERRAIN' }).click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/rw-close-low-x10-flat.png` })
  expect(errors).toEqual([])
})
