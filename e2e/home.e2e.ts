import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SHOTS = 'screenshots'

test('airport opens with idle orbit; airport name returns the camera home', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/?apt=CYVR')
  await page.waitForTimeout(6_000)
  await page.screenshot({ path: `${SHOTS}/h1-orbit-a.png` })
  await page.waitForTimeout(6_000)
  await page.screenshot({ path: `${SHOTS}/h2-orbit-b.png` })
  // pan far away, then click the airport name to come back
  const box = (await page.locator('.scene canvas').boundingBox())!
  await page.mouse.move(box.width / 2, box.height / 2)
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(box.width / 2 + 500, box.height / 2 + 300, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: `${SHOTS}/h3-panned.png` })
  await page.getByRole('button', { name: /Vancouver International/ }).click()
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: `${SHOTS}/h4-home.png` })
  expect(errors).toEqual([])
})
