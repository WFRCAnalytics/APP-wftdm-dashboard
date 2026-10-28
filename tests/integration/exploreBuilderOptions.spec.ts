import { test, expect, type Page } from '@playwright/test'

// 065-chart-builder: what a deployer can set on the explore-builder panel (limits, features, charts, tables, columns, presets).
// The panel's YAML is rewritten on its way to the browser, the way a deployer would edit dashboard-7-explore.yaml.
async function openExplore(page: Page, options: string) {
  await page.route('**/demo-dashboard-config/dashboard-7-explore.yaml', async (route) => {
    const res = await route.fetch()
    const body = await res.text()
    await route.fulfill({ response: res, body: body.replace(/^(\s+)width:\s*1\.0\s*$/m, (m, sp: string) => `${m}\n${options.split('\n').map((l) => sp + l).join('\n')}`) })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Explore' }).first().click()
  await expect(page.getByTestId('explore-builder')).toBeVisible({ timeout: 30_000 })
}

test('a deployer can turn features off, fix the page size, limit the tables and rename a column', async ({ page }) => {
  await openExplore(page, [
    'limits: { page_size: 8, max_joins: 1 }',
    'features: { sql_tab: false, csv: false, copy_sql: false, import_export: false, my_tables: false, undo: false }',
    'tables: { include: [purpose_mode_flow] }',
    'columns:',
    '  scenario: { label: Run }',
  ].join('\n'))
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  // fixed page size, whatever the height of the tile
  await expect(page.locator('.xb .tbl tbody tr')).toHaveCount(8)
  // features that are off are not there
  await expect(page.getByRole('group', { name: 'Query view' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Copy SQL' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download CSV' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Import' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'My tables' })).toHaveCount(0)
  await expect(page.getByLabel('Name for the saved table')).toHaveCount(0)
  // only the one table is on offer
  await page.getByRole('button', { name: 'Table', exact: true }).first().click()
  const pick = page.getByRole('dialog', { name: 'Choose a table' })
  await expect(pick.getByText('purpose_mode_flow').first()).toBeVisible()
  await expect(pick.getByText('mode_share_by_period')).toHaveCount(0)
  await page.keyboard.press('Escape')
  // the column's label shows in the table header
  await expect(page.locator('.xb .tbl thead').getByText('Run', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.xb .xwarn')).toHaveCount(0)
})

test('a deployer can limit the chart types and choose the one a new tab starts with', async ({ page }) => {
  await openExplore(page, ['charts: { allow: [bar, line, pie], default: line }', 'features: { undo: false, import_export: false }'].join('\n'))
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Add chart tab' }).click()
  const grid = page.locator('.xb .mkgrid')
  await expect(grid.getByRole('button', { name: /^Line/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(grid.locator('button.mk')).toHaveCount(3)
  // no Map placeholder, and no undo buttons or Export button
  await expect(grid.getByRole('button', { name: /Map, coming soon/ })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Undo and redo' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0)
})

test('a starter chart opens as a new tab', async ({ page }) => {
  const preset = '{"version":1,"data":{"relation":"t:purpose_mode_flow","source":{"scenarios":["nope"],"sql":""}},"mark":"bar","encoding":{},"stack":"group","filter":[],"axes":{"zeroBaseline":false,"gridlines":true,"referenceLine":null},"text":{"title":{"text":"Flow starter","size":"lg","weight":"bold","italic":false}}}'
  await openExplore(page, `presets:\n  - ${preset}`)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Starter charts' }).click()
  await page.getByRole('dialog').getByText('Flow starter').click()
  await expect(page.getByRole('tab', { name: 'Flow starter' })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 })
})

test('a wrong setting is reported and the default stays', async ({ page }) => {
  await openExplore(page, 'limits: { csv_rows: many }')
  await expect(page.locator('.xb .xwarn')).toContainText('limits.csv_rows: expected a number')
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible()
})
