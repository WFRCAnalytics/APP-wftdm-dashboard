import { test, expect, type Page } from '@playwright/test'

// 069-explore-site-settings: the Explore limits set once in dashboard-config.yaml (and a panel's own value winning). The site file and
// the panel's YAML are rewritten on their way to the browser, the way a deployer would edit them (project `real`, three ActivitySim runs).
async function openExplore(page: Page, opts: { site?: string; panel?: string } = {}) {
  if (opts.site) {
    await page.route('**/demo-dashboard-config/dashboard-config.yaml', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, body: `${await res.text()}\n${opts.site}\n` })
    })
  }
  if (opts.panel) {
    await page.route('**/demo-dashboard-config/dashboard-7-explore.yaml', async (route) => {
      const res = await route.fetch()
      const body = await res.text()
      await route.fulfill({ response: res, body: body.replace(/^(\s+)width:\s*1\.0\s*$/m, (m, sp: string) => `${m}\n${opts.panel!.split('\n').map((l) => sp + l).join('\n')}`) })
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Explore' }).first().click()
  await expect(page.getByTestId('explore-builder')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
}

/** A bar chart of auPkTotal by scenario, coloured by scenario: the legend has one value per run (three in the demo). */
async function drawColoured(page: Page) {
  // the builder starts with two runs selected; take all three so the legend has three values
  await page.getByRole('button', { name: /^Scenarios/ }).click()
  await page.getByRole('button', { name: 'Select all' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Scenarios/ })).toContainText('3 of 3')
  await page.getByRole('button', { name: 'Add chart tab' }).click()
  const place = async (field: string, shelf: string) => {
    await page.locator('.xb .fchip', { hasText: field }).first().click()
    await page.locator('.xb .sp', { hasText: shelf }).getByRole('button', { name: new RegExp(`Place ${field}`) }).click()
  }
  await place('scenario', 'X axis')
  await place('auPkTotal', 'Y axis')
  await place('scenario', 'Colour')
  await expect(page.locator('.xb svg.plot rect[data-t]').first()).toBeVisible({ timeout: 30_000 })
}

test('with no explore keys the legend is not cut', async ({ page }) => {
  await openExplore(page)
  await drawColoured(page)
  await expect(page.getByText(/values of a legend field/)).toHaveCount(0)
})

test('a limit in the site file applies to the Explore panel and its note quotes the number', async ({ page }) => {
  await openExplore(page, { site: 'explore:\n  limits:\n    legend_series: 2' })
  await drawColoured(page)
  await expect(page.getByText('Showing the first 2 values of a legend field.')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.xb .xwarn')).toHaveCount(0)
})

test('a panel value wins over the site value', async ({ page }) => {
  await openExplore(page, { site: 'explore:\n  limits:\n    legend_series: 2', panel: 'limits: { legend_series: 5 }' })
  await drawColoured(page)
  await expect(page.getByText(/values of a legend field/)).toHaveCount(0)
})
