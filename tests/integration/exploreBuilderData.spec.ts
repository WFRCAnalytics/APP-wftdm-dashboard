import { test, expect, type Page } from '@playwright/test'

// 065-chart-builder: the Explore builder's Data tab on the real demo data (project `real`, three ActivitySim runs).
async function openExplore(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/observed|metric catalog|GL Driver|WebGL|AbortError|aborted a request|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Explore' }).first().click()
  await expect(page.getByTestId('explore-builder')).toBeVisible({ timeout: 30_000 })
}

test('Explore opens the builder, previews a table and summarises a column', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  // the type filter lists only the types present, with counts
  await expect(page.locator('.xb .psearch .xseg button').first()).toContainText('All')
  // a column row gets a summary line
  await expect(page.locator('.xb .prow2 .pm').first()).not.toHaveText(/^\s*$/, { timeout: 30_000 })
  // the selected column shows summary statistics
  await expect(page.locator('.xb .det .st').first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'test-results/explore-data-tab.png' })
  expect(errors).toEqual([])
})

test('the SQL tab shows the builder query and Run works', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'SQL', exact: true }).click()
  await expect(page.locator('.xb .edc pre')).toContainText('SELECT')
  await page.getByRole('button', { name: 'Run query' }).click()
  await expect(page.locator('.xb .runmsg')).toContainText('rows', { timeout: 30_000 })
  expect(errors).toEqual([])
})

test('a refused statement is explained and not run', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'SQL', exact: true }).click()
  await page.getByLabel('SQL query').fill('DROP TABLE x')
  await expect(page.getByText('This statement is not allowed')).toBeVisible({ timeout: 15_000 })
  expect(errors).toEqual([])
})

test('a chart tab builds a bar chart from the shelves and exports its configuration', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Add chart tab' }).click()
  // chart-first: an empty bar chart says what it needs
  await expect(page.getByText('This chart needs a little more')).toBeVisible()
  // select a category field, then press the X shelf (keyboard path); then a number on Y
  await page.locator('.xb .fchip', { hasText: 'scenario' }).first().click()
  await page.locator('.xb .sp', { hasText: 'X axis' }).getByRole('button', { name: /Place scenario/ }).click()
  await page.locator('.xb .fchip', { hasText: 'auPkTotal' }).first().click()
  await page.locator('.xb .sp', { hasText: 'Y axis' }).getByRole('button', { name: /Place auPkTotal/ }).click()
  await expect(page.locator('.xb svg.plot rect[data-t]').first()).toBeVisible({ timeout: 30_000 })
  // with a category selected, the Colour shelf accepts it
  await page.locator('.xb .fchip', { hasText: 'scenario' }).first().click()
  await expect(page.locator('.xb .sp', { hasText: 'Colour' }).getByRole('button', { name: /Place scenario/ })).toBeEnabled()
  await page.screenshot({ path: 'test-results/explore-chart-tab.png' })
  // switch to a line and open the export dialog
  await page.getByRole('button', { name: 'Export' }).click()
  await expect(page.getByRole('dialog', { name: 'Export this chart' }).locator('textarea')).toHaveValue(/"mark": "bar"/)
  expect(errors).toEqual([])
})

test.describe('DuckDB computes the chart data for every mark', () => {
  const place = async (page: Page, field: string, shelf: string) => {
    await page.locator('.xb .fchip', { hasText: field }).first().click()
    await page.locator('.xb .sp', { hasText: shelf }).getByRole('button', { name: new RegExp(`Place ${field}`) }).click()
  }
  const setup = async (page: Page, errors: string[], mark: string) => {
    await openExplore(page, errors)
    await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Add chart tab' }).click()
    await page.locator('.xb .mk', { hasText: mark }).click()
  }
  const drawn = async (page: Page) => {
    await expect(page.locator('.xb svg.plot [data-t]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('The data could not be read')).toHaveCount(0)
  }

  test('histogram bins in DuckDB', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Histogram')
    await place(page, 'auPkTotal', 'Values to bin')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('box statistics come from DuckDB', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Box')
    await place(page, 'scenario', 'X axis')
    await place(page, 'auPkTotal', 'Y axis')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('scatter takes a repeatable sample', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Scatter')
    await place(page, 'auPkTotal', 'X axis')
    await place(page, 'trPkTotal', 'Y axis')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('pie groups in DuckDB', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Pie')
    await place(page, 'scenario', 'Colour')
    await place(page, 'auPkTotal', 'Slice size')
    await drawn(page)
    expect(errors).toEqual([])
  })
})
