import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Needs baked logos (pnpm bake:logos) and live traffic.
test.use({ deviceScaleFactor: 2 })
test('airline logos on tags', async ({ page }) => {
  mkdirSync('screenshots', { recursive: true })
  await page.goto('/?apt=KSEA')
  await expect(page.locator('img.alogo').first()).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/logos-on.png' })
  await page.getByRole('button', { name: 'LOGOS' }).click()
  await expect(page.locator('img.alogo')).toHaveCount(0)
  await page.screenshot({ path: 'screenshots/logos-off.png' })
})
