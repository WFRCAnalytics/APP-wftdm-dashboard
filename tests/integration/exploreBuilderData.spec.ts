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
  await expect(page.locator('.xb .psearch .tfilter .tf').first()).toContainText('All')
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
  test('waffle fills 100 squares', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Waffle')
    await place(page, 'scenario', 'Colour')
    await place(page, 'auPkTotal', 'Share of squares')
    await drawn(page)
    await expect(page.locator('.xb svg.plot rect[data-t]')).toHaveCount(100)
    expect(errors).toEqual([])
  })
  test('tick strip takes a number and an optional category', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Tick strip')
    await place(page, 'auPkTotal', 'X axis')
    await place(page, 'scenario', 'Y axis')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('text table writes the aggregate in each cell', async ({ page }) => {
    const errors: string[] = []
    await openExplore(page, errors)
    await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
    await page.locator('.xb .tpick').click()
    await page.getByRole('dialog', { name: 'Choose a table' }).getByLabel('Search').fill('purpose_mode_flow')
    await page.getByRole('option', { name: 'purpose_mode_flow', exact: true }).click()
    await expect(page.locator('.xb .prow2', { hasText: 'major_trip_mode' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Add chart tab' }).click()
    await page.locator('.xb .mk', { hasText: 'Text table' }).click()
    await place(page, 'primary_purpose', 'X axis')
    await place(page, 'major_trip_mode', 'Y axis')
    await place(page, 'trips', 'Cell text')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('scatter accepts opacity, detail and label', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Scatter')
    await place(page, 'auPkTotal', 'X axis')
    await place(page, 'trPkTotal', 'Y axis')
    await place(page, 'trPkTotal', 'Opacity')
    await place(page, 'scenario', 'Detail')
    await place(page, 'scenario', 'Label')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('density draws from the sampled values', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Density')
    await place(page, 'auPkTotal', 'Values')
    await place(page, 'scenario', 'Colour')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('rule takes its range and mean from DuckDB', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Rule')
    await place(page, 'auPkTotal', 'X axis')
    await place(page, 'scenario', 'Y axis')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('treemap tiles the groups', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Treemap')
    await place(page, 'scenario', 'Colour')
    await place(page, 'auPkTotal', 'Tile size')
    await drawn(page)
    await expect(page.locator('.xb svg.plot rect[data-t]')).toHaveCount(2)
    expect(errors).toEqual([])
  })
  test('trail joins points in order', async ({ page }) => {
    const errors: string[] = []
    await setup(page, errors, 'Trail')
    await place(page, 'auPkTotal', 'X axis')
    await place(page, 'trPkTotal', 'Y axis')
    await place(page, 'auOpTotal', 'Order')
    await drawn(page)
    expect(errors).toEqual([])
  })
  test('sankey, chord and sunburst draw flows between two categories', async ({ page }) => {
    const errors: string[] = []
    await openExplore(page, errors)
    await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
    await page.locator('.xb .tpick').click()
    await page.getByRole('dialog', { name: 'Choose a table' }).getByLabel('Search').fill('purpose_mode_flow')
    await page.getByRole('option', { name: 'purpose_mode_flow', exact: true }).click()
    await expect(page.locator('.xb .prow2', { hasText: 'major_trip_mode' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Add chart tab' }).click()
    await page.locator('.xb .mk', { hasText: 'Sankey' }).click()
    await place(page, 'primary_purpose', 'From')
    await place(page, 'major_trip_mode', 'To')
    await place(page, 'trips', 'Flow')
    await drawn(page)
    await page.locator('.xb .mk', { hasText: 'Chord' }).click()
    await drawn(page)
    await page.locator('.xb .mk', { hasText: 'Sunburst' }).click()
    await place(page, 'primary_purpose', 'Inner ring')
    await place(page, 'major_trip_mode', 'Outer ring')
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

test('a category filter offers its values and the table picks its columns, both synced with the builder', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  // filter: a category offers is / is not / is any of / is none of, never greater-than, and lists its own values
  await page.getByRole('button', { name: /^Filter/ }).click()
  await page.getByRole('button', { name: 'Add a filter' }).click()
  await page.getByLabel('Filter column').click()
  await page.getByRole('option', { name: 'scenario' }).click()
  await page.getByLabel('Filter operator').click()
  await expect(page.getByRole('option')).toHaveText(['is', 'is not', 'is any of', 'is none of'])
  await page.getByRole('option', { name: 'is any of' }).click()
  await page.getByLabel('Filter value').click()
  await page.getByRole('option').first().click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.xb .qt')).toContainText('25 rows')
  // columns: unchecking one in the table's picker shows in the builder step and the table
  const heads = await page.locator('.xb .tbl thead th').count()
  await page.getByRole('button', { name: /of \d+ columns$/ }).click()
  await page.getByRole('option').nth(2).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.xb .tbl thead th')).toHaveCount(heads - 1)
  await expect(page.locator('.xb .qt')).toContainText(`${heads - 1} of ${heads} columns`)
  expect(errors).toEqual([])
})

test('the table sorts and filters through the same query the builder uses', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  // sort from a header menu: arrow on the column, summary in the builder, ORDER BY in the SQL
  const head = page.locator('.xb .tbl th').nth(2)
  const name = (await head.innerText()).trim()
  await head.hover()
  await head.getByRole('button', { name: /Sort or filter/ }).click()
  await page.getByRole('menuitem', { name: 'Sort descending' }).click()
  await expect(head).toHaveAttribute('aria-sort', 'descending')
  await expect(page.locator('.xb .qt')).toContainText(`sorted by ${name}`)
  // filter from a cell: a chip appears, the Filter step shows it and the row count drops
  const cell = page.locator('.xb .tbl tbody tr').first().locator('td').first()
  await cell.hover()
  await cell.getByRole('button').click()
  await expect(page.locator('.xb .chips2 .fchip')).toHaveCount(1)
  await expect(page.locator('.xb .chips2')).toContainText('scenario is')
  await expect(page.locator('.xb .qt')).toContainText('25 rows')
  // removing the chip removes the filter
  await page.getByRole('button', { name: 'Remove filter scenario' }).click()
  await expect(page.locator('.xb .chips2 .fchip')).toHaveCount(0)
  await page.getByRole('button', { name: 'SQL', exact: true }).click()
  await expect(page.locator('.xb .edc pre')).toContainText('ORDER BY')
  await expect(page.locator('.xb .edc pre')).not.toContainText('WHERE')
  expect(errors).toEqual([])
})
