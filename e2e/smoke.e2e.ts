import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'

test('smoke: load, select, search, top view', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) =>
    errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`),
  )
  page.on('response', (r) => r.status() >= 400 && errors.push(`http ${r.status()}: ${r.url()}`))

  await page.goto('/?apt=CYVR')
  await page.waitForTimeout(15_000)
  await page.screenshot({ path: `${SHOTS}/1-initial.png` })

  const rows = page.locator('.traffic .row')
  console.log('traffic rows:', await rows.count())
  if ((await rows.count()) > 0) {
    await rows.first().click()
    await page.waitForTimeout(2500)
  }
  await page.screenshot({ path: `${SHOTS}/2-selected.png` })

  const input = page.locator('.search input')
  await input.click()
  await input.fill('KSEA')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/3a-search-dropdown.png` })
  await input.press('Enter')
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${SHOTS}/3-search.png` })

  await page.getByRole('button', { name: 'TOP' }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/4-top.png` })

  console.log('ERRORS:\n' + errors.join('\n'))
  expect(page.url()).toContain('apt=KSEA')
})
