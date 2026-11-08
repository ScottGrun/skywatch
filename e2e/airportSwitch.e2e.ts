import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'

const SHOTS = 'screenshots'

/** Resolves once the next "[terrain] ... triangles" log (mesh build finished) arrives. */
function nextTerrainDone(page: Page): Promise<void> {
  return new Promise((resolve) => {
    const on = (m: { text(): string }) => {
      if (m.text().includes('[terrain]')) {
        page.off('console', on)
        resolve()
      }
    }
    page.on('console', on)
  })
}

async function shoot(page: Page, name: string) {
  for (const [btn, tag] of [['OVERVIEW', 'overview'], ['SIDE', 'side'], ['TOP', 'top']] as const) {
    await page.getByRole('button', { name: btn }).click()
    await page.waitForTimeout(3_000)
    await page.screenshot({ path: `${SHOTS}/${name}-${tag}.png` })
  }
}

test('switching KSEA to CYVR renders like a fresh CYVR load', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  let done = nextTerrainDone(page)
  await page.goto('/?apt=KSEA')
  await done
  done = nextTerrainDone(page)
  const input = page.locator('.search input')
  await input.click()
  await input.fill('CYVR')
  await page.waitForTimeout(500)
  await input.press('Enter')
  await done
  await shoot(page, 'switch-ksea-to-cyvr')
  done = nextTerrainDone(page)
  await page.goto('/?apt=CYVR')
  await done
  await shoot(page, 'switch-cyvr-fresh')
})
