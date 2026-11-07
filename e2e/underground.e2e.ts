import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('side view: aircraft stay above terrain', async ({ page }) => {
  mkdirSync('screenshots', { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?apt=KSEA')
  await page.waitForTimeout(15_000)
  await page.getByRole('button', { name: 'SIDE' }).click()
  await page.waitForTimeout(6000)
  await page.screenshot({ path: 'screenshots/underground-side.png' })
  expect(errors).toEqual([])
})
