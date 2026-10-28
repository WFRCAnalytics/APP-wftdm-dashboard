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

test('turning the page leaves the column summary and the row count alone', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.xb .det .st').first()).toBeVisible({ timeout: 30_000 })
  // the Table step's row count (the footer says "rows on this page", which is a different thing)
  const stepCount = /\d[\d,]* rows(?! on this page)/
  await expect(page.locator('.xb .qt')).toContainText(stepCount, { timeout: 30_000 })
  // watch the summary card and the count while the page turns: neither may be removed, blanked or show its loading text
  await page.evaluate(() => {
    const w = window as unknown as { __flick: string[] }
    w.__flick = []
    const root = document.querySelector('.xb')!
    new MutationObserver((recs) => {
      for (const r of recs) {
        r.removedNodes.forEach((n) => { if (n instanceof Element && (n.matches('.det') || n.querySelector('.det'))) w.__flick.push('summary removed') })
      }
      if (root.textContent?.includes('Summarising')) w.__flick.push('summarising')
      const qt = document.querySelector('.xb .qt')?.textContent ?? ''
      if (!/\d[\d,]* rows(?! on this page)/.test(qt)) w.__flick.push('count blanked')
    }).observe(root, { childList: true, subtree: true, characterData: true })
  })
  const next = page.getByRole('button', { name: 'Next page' })
  await expect(next).toBeEnabled()
  const first = await page.locator('.xb .tbl tbody tr').first().innerText()
  await next.click()
  await expect(async () => expect(await page.locator('.xb .tbl tbody tr').first().innerText()).not.toBe(first)).toPass({ timeout: 15_000 })
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => (window as unknown as { __flick: string[] }).__flick)).toEqual([])
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

test('a chart tab can be renamed by double-click or F2', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Add chart tab' }).click()
  await page.getByRole('tab', { name: 'Chart 1' }).dblclick()
  await page.getByLabel('Rename chart tab').fill('Trips by hour')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Trips by hour' })).toBeVisible()
  await expect(page.locator('.xb .cardhead .ci')).toContainText('Trips by hour')
  // Escape cancels, an empty name keeps the old one
  await page.getByRole('tab', { name: 'Trips by hour' }).focus()
  await page.keyboard.press('F2')
  await page.getByLabel('Rename chart tab').fill('Nope')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tab', { name: 'Trips by hour' })).toBeVisible()
  await page.getByRole('tab', { name: 'Trips by hour' }).dblclick()
  await page.getByLabel('Rename chart tab').fill('   ')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Trips by hour' })).toBeVisible()
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
    await expect(page.locator('.xb .plot [data-t]').first()).toBeVisible({ timeout: 30_000 })
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
    await place(page, 'scenario', 'Groups')
    await place(page, 'auPkTotal', 'Tile size')
    await drawn(page)
    await expect(page.locator('.xb .plot rect')).toHaveCount(2)
    expect(errors).toEqual([])
  })
  test('treemap and sunburst zoom into a group and back', async ({ page }) => {
    const errors: string[] = []
    await openExplore(page, errors)
    await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
    await page.locator('.xb .tpick').click()
    await page.getByRole('dialog', { name: 'Choose a table' }).getByLabel('Search').fill('purpose_mode_flow')
    await page.getByRole('option', { name: 'purpose_mode_flow', exact: true }).click()
    await expect(page.locator('.xb .prow2', { hasText: 'major_trip_mode' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Add chart tab' }).click()
    await page.locator('.xb .mk', { hasText: 'Treemap' }).click()
    await place(page, 'primary_purpose', 'Groups')
    await place(page, 'major_trip_mode', 'Add level')
    await place(page, 'trips', 'Tile size')
    await drawn(page)
    // only the levels in use, plus one pill for the next
    await expect(page.locator('.xb .sp.add')).toHaveCount(1)
    await expect(page.locator('.xb .sp', { hasText: 'Fifth level' })).toHaveCount(0)
    const tiles = page.locator('.xb .plot g[data-t]')
    const before = await tiles.count()
    await tiles.first().click()
    const back = page.locator('.xb .plot text', { hasText: '‹' })
    await expect(back).toBeVisible()
    await expect(back).toContainText('click to go up')
    await back.click()
    await expect(back).toHaveCount(0)
    await expect(tiles).toHaveCount(before)
    // with a third level a click is one step: it opens the group, not the deepest tile under the cursor
    await place(page, 'scenario', 'Add level')
    await drawn(page)
    await tiles.first().click()
    await expect(back).toBeVisible()
    await expect(back).not.toContainText('›')
    await tiles.first().click()
    await expect(back).toContainText('›')
    await back.click()
    await expect(back).not.toContainText('›')
    await back.click()
    await expect(back).toHaveCount(0)
    await page.locator('.xb .mk', { hasText: 'Sunburst' }).click()
    await drawn(page)
    // three rings: a click on the outermost arc opens its ring-one group, not the arc itself; each further click goes one level down
    const arcs = page.locator('.xb .plot path[data-t]')
    const rings = await arcs.count()
    const up = page.locator('.xb .plot text', { hasText: 'click to go up' })
    const name = page.locator('.xb .plot circle + text + text')
    await arcs.last().click()
    await expect(up).toBeVisible()
    const group = await name.textContent()
    expect(await arcs.count()).toBeLessThan(rings)
    await arcs.first().click()
    await expect(name).not.toHaveText(group!)
    await page.locator('.xb .plot circle').click()
    await expect(name).toHaveText(group!)
    await page.locator('.xb .plot circle').click()
    await expect(up).toHaveCount(0)
    await expect(arcs).toHaveCount(rings)
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
    await place(page, 'major_trip_mode', 'Add ring')
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

test('the table can be copied as SQL and downloaded as CSV', async ({ page, context }) => {
  const errors: string[] = []
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Copy SQL' })).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Copy SQL' }).click()
  await expect(page.getByRole('button', { name: 'SQL copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\s*SELECT/i)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()])
  expect(download.suggestedFilename()).toMatch(/\.csv$/)
  const text = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')
  expect(text.split('\r\n').length).toBeGreaterThan(2)
  expect(errors).toEqual([])
})

test('a chart change can be undone and redone, and bars can be sorted', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  // undo and redo belong to chart tabs
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add chart tab' }).click()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
  const place = async (field: string, shelf: string) => {
    await page.locator('.xb .fchip', { hasText: field }).first().click()
    await page.locator('.xb .sp', { hasText: shelf }).getByRole('button', { name: new RegExp(`Place ${field}`) }).click()
  }
  await place('scenario', 'X axis')
  await place('auPkTotal', 'Y axis')
  const bars = page.locator('.xb svg.plot rect[data-t]')
  await expect(bars.first()).toBeVisible({ timeout: 30_000 })
  // the button takes the Y field off again; redo puts it back
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('This chart needs a little more')).toBeVisible()
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(bars.first()).toBeVisible({ timeout: 30_000 })
  // the keyboard works too, while no text field has focus
  await page.locator('.xb .plotw').click()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('This chart needs a little more')).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(bars.first()).toBeVisible({ timeout: 30_000 })
  // sort the bars by height
  const heights = async () => (await bars.evaluateAll((els) => els.map((e) => Number(e.getAttribute('height')))))
  await page.getByRole('group', { name: 'Chart settings' }).getByRole('button', { name: 'Axes' }).click()
  await page.getByRole('combobox', { name: 'Sort categories' }).click()
  await page.getByRole('option', { name: 'Largest first' }).click()
  await expect.poll(async () => { const h = await heights(); return h.every((v, i) => i === 0 || v <= h[i - 1] + 0.01) }).toBe(true)
  await page.getByRole('combobox', { name: 'Sort categories' }).click()
  await page.getByRole('option', { name: 'Smallest first' }).click()
  await expect.poll(async () => { const h = await heights(); return h.every((v, i) => i === 0 || v >= h[i - 1] - 0.01) }).toBe(true)
  // the choice is exported
  await page.getByRole('button', { name: 'Export' }).click()
  await expect(page.getByRole('dialog', { name: 'Export this chart' }).locator('textarea')).toHaveValue(/"sort": "low"/)
  expect(errors).toEqual([])
})
