import { test, expect, type Page } from '@playwright/test'

// The dial KPIs, the mode radar and the purpose chord on the real demo content.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

test('the Summary share KPIs draw a dial', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await boot(page)
  await expect(page.getByTestId('hero-ring')).toHaveCount(3, { timeout: 60_000 })
  await page.screenshot({ path: 'test-results/real-charts-summary.png' })
})

test('Mode share has a radar view and Purpose to mode a chord view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await boot(page)
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Mode choice' }).first().click()
  await page.getByRole('button', { name: 'Radar', exact: true }).click()
  await expect(page.locator('svg [data-axis]')).not.toHaveCount(0, { timeout: 30_000 })
  await page.screenshot({ path: 'test-results/real-charts-radar.png' })
  await page.getByRole('tab', { name: 'Purpose to mode', exact: true }).click()
  await page.getByRole('button', { name: 'Chord', exact: true }).click()
  await expect(page.locator('svg path[data-m]').first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'test-results/real-charts-chord.png' })
})

test('Trips by purpose has a radar view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await boot(page)
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Mode choice' }).first().click()
  await page.getByRole('tab', { name: 'Through the day', exact: true }).click()
  await page.getByRole('button', { name: 'Radar', exact: true }).click()
  await expect(page.locator('svg [data-axis="Work"]')).toHaveCount(1, { timeout: 30_000 })
  await page.screenshot({ path: 'test-results/real-charts-purpose-radar.png' })
})
