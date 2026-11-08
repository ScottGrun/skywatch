import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const DIR = 'screenshots/trails'
const TAG = process.env.SHOT_TAG ?? 'after'

test('live trails at KSEA: top + oblique + selected seam, fps', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?apt=KSEA')
  await expect(page.locator('.traffic .row').first()).toBeVisible({ timeout: 40_000 })
  await page.waitForTimeout(100_000) // let trails accumulate from live reports
  const fps = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        let n = 0
        const t0 = performance.now()
        const tick = () => {
          n++
          if (performance.now() - t0 > 5000) res((n * 1000) / (performance.now() - t0))
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
  console.log(`fps ${TAG}: ${fps.toFixed(1)}`)
  await page.getByRole('button', { name: 'TOP' }).click()
  await page.mouse.move(720, 450)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${DIR}/${TAG}-top.png` })
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 200)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${DIR}/${TAG}-top-wide.png` })
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${DIR}/${TAG}-oblique.png` })
  await page.locator('.traffic .row').first().click()
  await page.waitForTimeout(8000)
  await page.screenshot({ path: `${DIR}/${TAG}-selected.png` })
  expect(errors).toEqual([])
})
