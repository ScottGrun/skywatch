import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'

test('filter dropdown', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/?apt=CYVR')
  await page.waitForTimeout(12_000)
  await page.getByRole('button', { name: /FILTER/ }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/f1-filter-open.png` })

  await page.getByRole('checkbox', { name: 'Widebody' }).click()
  await page.getByRole('button', { name: 'Clear' }).click() // reset, then pick narrowbody only
  for (const n of [
    'Widebody',
    'Four-engine',
    'Regional jet',
    'Business jet',
    'Turboprop',
    'Piston',
    'Helicopter',
    'Unknown',
  ])
    await page.getByRole('checkbox', { name: n }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/f2-filtered.png` })
  expect(page.url()).toContain('types=narrow')
  await expect(page.locator('.traffic-n')).toContainText(' of ')

  await page.reload()
  await page.waitForTimeout(3000)
  await expect(page.locator('.filter-badge')).toHaveText('1')
})
