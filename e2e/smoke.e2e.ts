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

  // Map coverage / fog shots (no selection yet).
  const wheel = async (dy: number) => {
    await page.mouse.move(720, 450)
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, dy / 12)
    await page.waitForTimeout(2500)
  }
  await page.screenshot({ path: `${SHOTS}/5-overview.png` })
  await wheel(4000)
  await page.screenshot({ path: `${SHOTS}/6-max-zoom-out.png` })
  await page.getByRole('button', { name: 'SIDE' }).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/7-side.png` })
  await wheel(4000)
  await page.screenshot({ path: `${SHOTS}/7b-side-max-out.png` })
  await page.getByRole('button', { name: 'TOP' }).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/7c-top-max-out.png` })
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.waitForTimeout(1500)

  const rows = page.locator('.traffic .row')
  console.log('traffic rows:', await rows.count())
  if ((await rows.count()) > 0) {
    await rows.first().click()
    await page.waitForTimeout(2500)
  }
  await page.screenshot({ path: `${SHOTS}/2-selected.png` })
  await page.screenshot({ path: `${SHOTS}/8-list-follow.png` })

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
