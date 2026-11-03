import { test, expect, type Page } from '@playwright/test'

// 065-chart-builder: a chart tooltip starts with a small tile that shows how the hovered mark looks, and has no blank colour
// slot when no row carries a colour. Real demo data (project `real`).
async function openExplore(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Explore' }).first().click()
  await expect(page.getByTestId('explore-builder')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
}
const place = async (page: Page, field: string, shelf: string) => {
  await page.locator('.xb .fchip', { hasText: field }).first().click()
  await page.locator('.xb .sp', { hasText: shelf }).getByRole('button', { name: new RegExp(`Place ${field}`) }).click()
}

test('a bar tooltip starts with a tile of the bar colour and its labels line up at the left', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await page.getByRole('button', { name: /(Create|Add) chart/ }).click()
  await place(page, 'scenario', 'X axis')
  await place(page, 'auPkTotal', 'Y axis')
  const bar = page.locator('.xb svg.plot rect[data-t]').first()
  await expect(bar).toBeVisible({ timeout: 30_000 })
  await bar.hover()
  const tip = page.locator('.wf-tip')
  await expect(tip.locator('.tt-h svg.tt-tile')).toBeVisible()
  await expect(tip.locator('.tt-r.nc').first()).toBeVisible()
  await expect(tip.locator('.tt-r i')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/tooltip-tile-bar.png' })
  expect(errors).toEqual([])
})

test('a treemap tooltip starts with a tile of the hovered group colour', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await page.locator('.xb .tpick[aria-label="Table"]').click()
  await page.getByRole('dialog', { name: 'Choose a table' }).getByLabel('Search').fill('purpose_mode_flow')
  await page.getByRole('option', { name: 'purpose_mode_flow', exact: true }).click()
  await expect(page.locator('.xb .prow2', { hasText: 'major_trip_mode' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /(Create|Add) chart/ }).click()
  await page.locator('.xb .mk', { hasText: 'Treemap' }).click()
  await place(page, 'primary_purpose', 'Groups')
  await place(page, 'trips', 'Tile size')
  const tile = page.locator('.xb .plot g[data-t]').first()
  await expect(tile).toBeVisible({ timeout: 30_000 })
  await tile.hover()
  const tip = page.locator('.wf-tip')
  await expect(tip.locator('.tt-h svg.tt-tile')).toBeVisible()
  await page.screenshot({ path: 'test-results/tooltip-tile-treemap.png' })
  expect(errors).toEqual([])
})
