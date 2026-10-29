import { expect, test, type Page } from '@playwright/test'

import { patchDemoConfig } from './_siteConfig'

// 066 US3: a setting that cascades is resolved site -> page -> panel, on the real demo (whose site layout is `tabs`).
async function boot(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

test('a page layout beats the site layout: the page scrolls while the others stay tabbed', async ({ page }) => {
  await page.route('**/demo-dashboard-config/dashboard-1-summary.yaml', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, body: (await res.text()).replace(/^header:/m, `header:\n  layout_mode: scroll`) })
  })
  await boot(page)
  await expect(page.getByTestId('row_kpis')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('tabbed-page')).toHaveCount(0)
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Network' }).first().click()
  await expect(page.getByTestId('tabbed-page')).toBeVisible({ timeout: 30_000 })
})

test('with no page setting the site layout applies', async ({ page }) => {
  await patchDemoConfig(page, (c) => {
    c.layout = { mode: 'scroll' }
  })
  await boot(page)
  await expect(page.getByTestId('row_kpis')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('tabbed-page')).toHaveCount(0)
})

test('Explore: the panel replaces the site chart list and adds to the site table exclusions', async ({ page }) => {
  await patchDemoConfig(page, (c) => {
    c.explore = { charts: { allow: ['bar', 'line', 'pie'] }, tables: { exclude: ['mode_share_by_period'] } }
  })
  await page.route('**/demo-dashboard-config/dashboard-7-explore.yaml', async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace(/^(\s+)width:\s*1\.0\s*$/m, (m, sp: string) => `${m}\n${sp}charts: { allow: [bar, line] }\n${sp}tables: { exclude: [purpose_mode_flow] }`)
    await route.fulfill({ response: res, body })
  })
  await boot(page)
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Explore' }).first().click()
  await expect(page.getByTestId('explore-builder')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Table', exact: true }).first().click()
  const pick = page.getByRole('dialog', { name: 'Choose a table' })
  await expect(pick).toBeVisible()
  await expect(pick.getByText('mode_share_by_period')).toHaveCount(0)
  await expect(pick.getByText('purpose_mode_flow')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Add chart tab' }).click()
  await expect(page.locator('.xb .mkgrid button.mk')).toHaveCount(2)
  await expect(page.locator('.xb .xwarn')).toHaveCount(0)
})
