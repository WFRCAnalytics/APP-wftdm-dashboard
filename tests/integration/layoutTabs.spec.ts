import { test, expect, type Page } from '@playwright/test'

// Tabbed pages (project-docs/redesign/10-toolbar-layout-export-proposal.md section C) on the real demo content.

async function boot(page: Page, path = '/') {
  await page.goto(path)
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}
const pageTab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Page sections' }).getByRole('tab', { name, exact: true })

test.describe('tabbed pages', () => {
  test('Summary opens as tabs: the KPI band stays above, one section is shown, the window does not scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await boot(page)
    await expect(page.getByTestId('tabbed-page')).toHaveAttribute('data-section', 'scenarios')
    await expect(page.getByTestId('row_kpis')).toBeVisible()
    await expect(pageTab(page, 'Scenarios')).toHaveAttribute('aria-selected', 'true')
    // only the active tab is mounted
    await expect(page.locator('[data-chart-kind="scorecard"]')).toHaveCount(1)
    await expect(page.locator('[data-chart-kind="mode-bars"]')).toHaveCount(0)
    const scroll = await page.evaluate(() => ({ y: document.documentElement.scrollHeight - window.innerHeight }))
    expect(scroll.y).toBeLessThanOrEqual(1)

    await pageTab(page, 'Mode choice').click()
    await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-chart-kind="scorecard"]')).toHaveCount(0)
    await expect(page.getByTestId('row_kpis')).toBeVisible()
    expect(page.url()).toContain('#mode')
  })

  test('the tile fills the tab and a wide tile keeps its controls in a rail beside the chart', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await boot(page)
    await page.hover('[data-sidebar=sidebar]')
    await page.getByRole('tab', { name: 'Network' }).click()
    await expect(page.locator('.maplibregl-map').first()).toBeVisible({ timeout: 30_000 })
    const map = await page.locator('.maplibregl-map').first().boundingBox()
    const rail = page.getByRole('complementary', { name: /controls$/ })
    await expect(rail).toBeVisible()
    await expect(rail).toContainText('Compare as')
    const box = await rail.boundingBox()
    expect(box!.height).toBeGreaterThan(380)
    expect(box!.x).toBeGreaterThan(map!.x + map!.width * 0.6)
  })

  test('a "pick" tab shows one tile at a time, chosen from a list', async ({ page }) => {
    await boot(page)
    await pageTab(page, 'Maps').click()
    await expect(page.getByTestId('tab-chart-picker')).toHaveValue('zones')
    await expect(page.getByRole('heading', { name: 'Where transit is used' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Trip desire lines' })).toHaveCount(0)
    await page.getByTestId('tab-chart-picker').selectOption('flows')
    await expect(page.getByRole('heading', { name: 'Trip desire lines' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Where transit is used' })).toHaveCount(0)
  })

  test('the sidebar sections select tabs, and Compare off removes the compare-only tab', async ({ page }) => {
    await boot(page)
    // The section list shows once the nav is expanded with its toggle (hovering no longer expands it).
    await page.getByRole('button', { name: 'Show menu labels' }).click()
    await page.getByRole('group', { name: 'Summary sections' }).getByRole('button', { name: 'Time of day' }).click()
    await expect(page.getByTestId('tabbed-page')).toHaveAttribute('data-section', 'time')
    await page.getByTestId('control-compare').click()
    await expect(pageTab(page, 'Scenarios')).toHaveCount(0)
    await expect(page.getByTestId('tabbed-page')).toHaveAttribute('data-section', 'time')
  })

  test('the keyboard moves between tabs; a link opens a tab', async ({ page }) => {
    await boot(page)
    await pageTab(page, 'Scenarios').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('tabbed-page')).toHaveAttribute('data-section', 'mode')
    await boot(page, '/#time')
    await expect(page.getByTestId('tabbed-page')).toHaveAttribute('data-section', 'time')
  })

  test('?layout=scroll shows every row on the page, as before', async ({ page }) => {
    await boot(page, '/?layout=scroll')
    await expect(page.getByTestId('tabbed-page')).toHaveCount(0)
    await expect(page.getByTestId('row_time')).toBeAttached()
    await expect(page.getByTestId('row_mix_share')).toBeAttached()
  })

  test('Settings > Appearance switches the layout for the session', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('group', { name: 'Page layout' }).getByRole('button', { name: 'Scrolling' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('tabbed-page')).toHaveCount(0)
    await expect(page.getByTestId('row_time')).toBeAttached()
  })
})

test.describe('shared tab controls', () => {
  test('a section can lift Group by and View into the tab strip, and they drive the tile', async ({ page }) => {
    await page.route('**/dashboard-4-mode-choice.yaml', async (route) => {
      const body = await (await route.fetch()).text()
      const lifted = body.replace('rows: [row_share] }', 'rows: [row_share], shared_controls: [group, view] }')
      expect(lifted).not.toBe(body)
      await route.fulfill({ body: lifted, contentType: 'text/yaml' })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await boot(page)
    await page.hover('[data-sidebar=sidebar]')
    await page.getByRole('tab', { name: 'Mode choice' }).first().click()
    const shared = page.getByTestId('shared-controls')
    await expect(shared).toBeVisible({ timeout: 30_000 })
    // the tile no longer carries its own copies
    const tile = page.getByTestId('tab-body')
    await expect(tile.getByRole('group', { name: 'View' })).toHaveCount(0)
    await expect(tile.getByLabel('Compare by')).toHaveCount(0)
    await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    await shared.getByRole('button', { name: '100% bars' }).click()
    await expect(page.locator('[data-chart-kind="stacked-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-chart-kind="mode-bars"]')).toHaveCount(0)
  })

  test('without shared_controls the tile keeps its own controls and the strip has none', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await boot(page)
    await page.hover('[data-sidebar=sidebar]')
    await page.getByRole('tab', { name: 'Mode choice' }).first().click()
    await expect(page.getByTestId('tab-body').getByRole('group', { name: 'View' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('shared-controls')).toHaveCount(0)
  })
})
