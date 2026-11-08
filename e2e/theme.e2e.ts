import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'

test('theme: toggle, persist, screenshots in both themes', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?apt=CYVR')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await page.waitForTimeout(12_000)
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.mouse.move(720, 450)
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 150)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/theme-dark-overview.png` })
  const rows = page.locator('.traffic .row')
  if ((await rows.count()) > 0) await rows.first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/theme-dark-selected.png` })

  await page.getByTestId('theme-toggle').click()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${SHOTS}/theme-light-selected.png` })
  await page.keyboard.press('Escape')
  await page.locator('.details .x').click().catch(() => undefined)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'OVERVIEW' }).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/theme-light-overview.png` })
  await page.getByText('AIRSPACE').click()
  await page.locator('.filter-field').click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${SHOTS}/theme-light-filter.png` })
  expect(await page.evaluate(() => localStorage.getItem('tracon3d.theme'))).toBe('light')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('theme-toggle').click() // back to dark: tiles swap again without errors
  await page.waitForTimeout(3000)
  expect(errors).toEqual([])
})
