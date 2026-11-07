import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'

test('traffic list toggles open/closed and remembers it', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/?apt=CYVR')
  await page.waitForTimeout(8_000)
  const head = page.getByRole('button', { name: /TRAFFIC/ })
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  await head.click()
  await expect(head).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.traffic .rows')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/l1-list-collapsed.png` })
  await page.reload()
  await page.waitForTimeout(3_000)
  await expect(page.getByRole('button', { name: /TRAFFIC/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await page.keyboard.press('l')
  await expect(page.locator('.traffic .rows')).toHaveCount(1)
})
