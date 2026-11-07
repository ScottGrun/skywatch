import { test } from '@playwright/test'

test('airport view shots for parked aircraft', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?apt=KSEA')
  await page.waitForTimeout(15_000)
  await page.getByRole('button', { name: 'AIRPORT', exact: true }).click()
  await page.waitForTimeout(5000)
  await page.mouse.move(900, 500)
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(850, 440, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'screenshots/airport-view-parked.png' })
})
