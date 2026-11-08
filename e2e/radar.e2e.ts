import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Live NEXRAD data (Unidata/AWS): a dry radar is fine; what matters is status text and no errors.
const SHOTS = 'screenshots/radar'
const CASES: [apt: string, site: RegExp | null][] = [
  ['KSEA', /KATX/],
  ['KORD', /KLOT|KMKX|KIWX/],
  ['KDFW', /KFWS|KDYX/],
  ['PANC', /PAHG|PAEC/],
  ['PHNL', /PHWA|PHKI/],
  ['EGLL', null],
]

for (const [apt, site] of CASES) {
  test(`radar ${apt}`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(`/?apt=${apt}`)
    await page.evaluate(() => localStorage.removeItem('tracon3d.radar'))
    await page.reload()
    const field = page.locator('.filter-field', { hasText: 'WEATHER' })
    await expect(field).toContainText('Off') // default off
    await field.click()
    const status = page.locator('.wx-row', { hasText: 'STATUS' }).locator('b')
    if (!site) {
      await expect(status).toHaveText('No radar in range')
      await page.screenshot({ path: `${SHOTS}/${apt}-none.png` })
      expect(errors).toEqual([])
      return
    }
    await page.getByRole('checkbox', { name: /NEXRAD radar/ }).click()
    const scan = page.locator('.wx-row', { hasText: 'SCAN' }).locator('b')
    await expect(status).toHaveText(/^(OK|Radar unavailable)$/, { timeout: 90_000 })
    await expect(scan).toHaveText(site) // site ids are listed even when the fetch failed
    await expect(status).toHaveText('OK')
    await expect(scan).toContainText('UTC')
    const slider = page.getByLabel('Radar opacity')
    const dd = await page.locator('.wx-dd').boundingBox()
    const sb = await slider.boundingBox()
    expect(sb!.x + sb!.width).toBeLessThanOrEqual(dd!.x + dd!.width)
    await page.screenshot({ path: `${SHOTS}/${apt}-panel.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'OVERVIEW' }).click()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${SHOTS}/${apt}-overview.png` })
    expect(errors).toEqual([])
  })
}
