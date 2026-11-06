import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'

// Dev lineup of every aircraft class (no live traffic shown).
test.use({ deviceScaleFactor: 2 })
test('models lineup', async ({ page }) => {
  mkdirSync('screenshots', { recursive: true })
  await page.goto('/?apt=CYVR&models=1')
  await page.waitForTimeout(3000)
  const clip = { x: 320, y: 340, width: 1100, height: 330 }
  await page.getByRole('button', { name: 'TOP' }).click()
  await page.mouse.move(720, 450)
  for (let i = 0; i < Number(process.env.ZOOM ?? 8); i++) {
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/models-lineup-top.png', clip })
  await page.screenshot({ path: 'screenshots/ground-grey.png', clip })
  const hx = Number(process.env.HX ?? 0)
  const hy = Number(process.env.HY ?? 0)
  if (hx) {
    await page.mouse.move(hx, hy)
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'screenshots/ground-hover.png', clip })
  }
  await page.mouse.move(900, 700)
  await page.mouse.down()
  await page.mouse.move(900, 560, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.screenshot({
    path: 'screenshots/models-lineup.png',
    clip: { ...clip, y: 250, height: 400 },
  })
})
