import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('selected aircraft shows its real track history', async ({ page }) => {
  mkdirSync('screenshots', { recursive: true })
  let trackReqs = 0
  page.on('request', (r) => r.url().includes('/api/track/') && trackReqs++)
  await page.goto('/?apt=CYVR')
  const rows = page.locator('.traffic .row')
  await expect(rows.first()).toBeVisible({ timeout: 40_000 })
  await rows.first().click()
  await expect(page.locator('.track-note')).toBeVisible({ timeout: 30_000 })
  console.log('track note:', await page.locator('.track-note').textContent())
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'screenshots/9-history-follow.png' })
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'screenshots/9b-history-overview.png' })
  await page.getByRole('button', { name: 'TOP' }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'screenshots/9c-history-top.png' })
  expect(trackReqs).toBeGreaterThan(0)
})
