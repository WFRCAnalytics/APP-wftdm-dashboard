import { test, expect, type Page } from '@playwright/test'
import { patchDemoConfig } from './_siteConfig'

// The page's list of compared scenarios (scenarios.placement), on the real demo content: under the title while the rail is
// collapsed, in the rail once it is open, and the key every tile leaves scenario names out of (legend.scenarios).

async function boot(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

async function openModeChoice(page: Page) {
  await page.getByRole('tab', { name: 'Mode choice' }).first().click()
  await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
}

const modeShare = (page: Page) => page.locator('[data-export-title="Mode share"]').first()

test('collapsed rail: the list sits under the title and the tiles leave scenario names out of their keys', async ({ page }) => {
  await boot(page)
  await openModeChoice(page)
  const list = page.getByTestId('scenario-list')
  await expect(list).toHaveAttribute('data-orientation', 'horizontal')
  await expect(list).toContainText('ActivitySim: AM/PM Transit Service Increase')
  await expect(list).toContainText('Focus')
  await expect(list).toContainText('Reference')
  // the control bar no longer carries the Scenarios chip or Compare; the list does
  await expect(page.getByTestId('scenario-picker-button')).toHaveCount(0)
  await expect(list.getByTestId('control-compare')).toBeVisible()
  // the tile's key keeps the reference line, not the scenario names
  const key = modeShare(page).getByTestId('tile-legend')
  await expect(key).toContainText('Reference')
  await expect(key.locator('[data-sc]').first()).toBeHidden()
})

test('open rail: the same list moves into the rail', async ({ page }) => {
  await boot(page)
  await openModeChoice(page)
  await page.getByRole('button', { name: 'Show menu labels' }).click()
  const list = page.locator('[data-sidebar=sidebar]').getByTestId('scenario-list')
  await expect(list).toHaveAttribute('data-orientation', 'vertical')
  await expect(list).toContainText('ActivitySim: TAZ 1 Density +40%')
  await expect(page.getByTestId('scenario-list')).toHaveCount(1)
})

test('a click focuses a scenario and the cross takes one out of the comparison', async ({ page }) => {
  await boot(page)
  await openModeChoice(page)
  const list = page.getByTestId('scenario-list')
  const transit = list.locator('li', { hasText: 'AM/PM Transit Service Increase' })
  await transit.getByRole('button', { name: /Make it the focus/ }).click()
  await expect(transit).toContainText('Focus')
  const density = list.locator('li', { hasText: 'TAZ 1 Density' })
  await density.hover()
  await density.getByRole('button', { name: /^Remove/ }).click()
  await expect(list.locator('li', { hasText: 'TAZ 1 Density' })).toHaveCount(0)
})

test('the expanded tile shows its full key, scenario names included', async ({ page }) => {
  await boot(page)
  await openModeChoice(page)
  await modeShare(page).getByRole('button', { name: /expand/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('chart-legend')).toContainText('ActivitySim: TAZ 1 Density +40%')
})

test('scenarios.placement: picker keeps the Scenarios chip, and the tiles keep their keys', async ({ page }) => {
  await patchDemoConfig(page, (c) => ({ ...c, scenarios: { placement: 'picker' } }))
  await boot(page)
  await openModeChoice(page)
  await expect(page.getByTestId('scenario-list')).toHaveCount(0)
  await expect(page.getByTestId('scenario-picker-button')).toBeVisible()
  await expect(modeShare(page).getByTestId('tile-legend').locator('[data-sc]').first()).toBeVisible()
})

test('legend.scenarios: tile keeps scenario names in every tile while the list is shown', async ({ page }) => {
  await patchDemoConfig(page, (c) => ({ ...c, legend: { scenarios: 'tile' } }))
  await boot(page)
  await openModeChoice(page)
  await expect(page.getByTestId('scenario-list')).toBeVisible()
  await expect(modeShare(page).getByTestId('tile-legend').locator('[data-sc]').first()).toBeVisible()
})
