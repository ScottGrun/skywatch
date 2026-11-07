import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'

test('runway lights: toggle, persist, night screenshots', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?apt=KSEA')
  await page.waitForTimeout(10_000)
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/lights-overview.png` })

  // Zoom in on the runways and drop the camera to a low angle.
  await page.mouse.move(720, 450)
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -150)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/lights-close-high.png` })
  await page.mouse.down()
  await page.mouse.move(720, 560, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/lights-close-low.png` })

  await page.mouse.move(900, 450)
  await page.mouse.down()
  await page.mouse.move(1010, 450, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/lights-close-along.png` })
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 150)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/lights-mid.png` })

  const btn = page.getByRole('button', { name: 'LIGHTS' })
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
  await btn.click()
  await expect(btn).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => localStorage.getItem('tracon3d.lights'))).toBe('0')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/lights-off.png` })
  await btn.click()

  await page.getByTestId('theme-toggle').click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/lights-light-theme.png` })
  expect(errors).toEqual([])
})
