import { readFileSync } from 'node:fs'
import { test, expect, type Locator, type Page } from '@playwright/test'

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
  const textTable = async (page: Page, errors: string[]) => {
    await openExplore(page, errors)
    await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
    await page.locator('.xb .tpick').click()
    await page.getByRole('dialog', { name: 'Choose a table' }).getByLabel('Search').fill('purpose_mode_flow')
    await page.getByRole('option', { name: 'purpose_mode_flow', exact: true }).click()
    await expect(page.locator('.xb .prow2', { hasText: 'major_trip_mode' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Add chart tab' }).click()
    await page.locator('.xb .mk', { hasText: 'Text table' }).click()
  }
  test('text table is a pivot table with totals and sortable headings', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await place(page, 'primary_purpose', 'Columns')
    await place(page, 'major_trip_mode', 'Rows')
    await place(page, 'trips', 'Values')
    await drawn(page)
    const table = page.locator('.xb .plot.pivot table')
    await expect(table.locator('thead th', { hasText: 'Total' })).toBeVisible()
    await expect(table.locator('tfoot th', { hasText: 'Total' })).toBeVisible()
    const firstRow = table.locator('tbody tr').first().locator('th')
    const before = await firstRow.textContent()
    const head = table.locator('thead th.pvt-col').first()
    await head.click()
    await expect(head).toHaveAttribute('aria-sort', 'descending')
    await head.click()
    await expect(head).toHaveAttribute('aria-sort', 'ascending')
    await head.click()
    await expect(head).toHaveAttribute('aria-sort', 'none')
    expect(await firstRow.textContent()).toBe(before)
    expect(errors).toEqual([])
  })
  test('the plot panel expands into a wide dialog, exports from there, and contracts again', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await place(page, 'scenario', 'Columns')
    await place(page, 'primary_purpose', 'Rows')
    await place(page, 'trips', 'Values')
    await drawn(page)
    const inCard = (await page.locator('.xb .plot.pivot').boundingBox())!
    await page.getByRole('button', { name: 'Expand Chart 1' }).click()
    const dialog = page.getByRole('dialog', { name: 'Chart 1' })
    await expect(dialog.locator('.pvt table')).toBeVisible()
    // drawn once, in the dialog, and larger than it was in the card
    await expect(page.locator('.xb .pvt table')).toHaveCount(1)
    const wide = (await dialog.locator('.plot.pivot').boundingBox())!
    expect(wide.width).toBeGreaterThan(inCard.width)
    const [download] = await Promise.all([page.waitForEvent('download'), (async () => {
      await dialog.getByRole('button', { name: 'Export' }).click()
      await page.getByRole('dialog', { name: 'Export this chart' }).getByRole('button', { name: 'SVG' }).click()
    })()])
    expect(readFileSync((await download.path())!, 'utf8')).toContain('>Total<')
    await page.getByRole('dialog', { name: 'Export this chart' }).getByRole('button', { name: 'Close' }).click()
    await dialog.getByRole('button', { name: 'Contract Chart 1' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.xb .plot.pivot table')).toBeVisible()
    expect(errors).toEqual([])
  })
  test('a bar chart lies down when its number is on X, and Swap x and y flips it, within the placement rules', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await page.locator('.xb .mk', { hasText: 'Bar' }).click()
    await place(page, 'primary_purpose', 'X axis')
    await place(page, 'trips', 'Y axis')
    await drawn(page)
    const bars = page.locator('.xb svg.plot rect[data-t]')
    const first = async () => (await bars.first().boundingBox())!
    // columns: taller than wide
    const col = await first()
    expect(col.height).toBeGreaterThan(col.width)
    // swap: the number goes to X and the same bars lie down
    await page.getByRole('button', { name: 'Swap x and y' }).click()
    await expect(page.locator('.xb .strip .sp', { hasText: 'X axis' })).toContainText('trips')
    await expect(page.locator('.xb .strip .sp', { hasText: 'Y axis' })).toContainText('primary_purpose')
    await expect.poll(async () => { const b = await first(); return b.width > b.height }).toBe(true)
    await page.getByRole('button', { name: 'Swap x and y' }).click()
    await expect.poll(async () => { const b = await first(); return b.height > b.width }).toBe(true)
    // two numbers (or two categories) are not a bar chart, and the chart says so
    await page.getByRole('button', { name: /Remove primary_purpose from X axis/ }).click()
    await place(page, 'trips', 'X axis')
    await expect(page.getByText(/both numbers/)).toBeVisible()
    // a chart type with a category-only axis refuses the swap and says why
    await page.getByRole('button', { name: /Remove trips from X axis/ }).click()
    await place(page, 'primary_purpose', 'X axis')
    await page.locator('.xb .mk', { hasText: 'Box' }).click()
    await expect(page.getByRole('button', { name: 'Swap x and y' })).toBeDisabled()
    await expect(page.locator('.xb .swapw')).toHaveAttribute('data-tip', /Can't swap/)
    expect(errors).toEqual([])
  })
  test('data labels on a bar chart and a pie come from the Style tab and survive the SVG export', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await page.locator('.xb .mk', { hasText: 'Bar' }).click()
    await place(page, 'primary_purpose', 'X axis')
    await place(page, 'trips', 'Y axis')
    await drawn(page)
    const labels = page.locator('.xb svg.plot text[stroke]')
    await expect(labels).toHaveCount(0)
    await page.locator('.xseg').getByText('Style', { exact: true }).click()
    await page.getByRole('button', { name: 'Value', exact: true }).click()
    await expect(labels.first()).toBeVisible()
    expect(await labels.count()).toBeGreaterThan(5)
    await page.getByRole('button', { name: 'Export' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog', { name: 'Export this chart' }).getByRole('button', { name: 'SVG' }).click()])
    expect(readFileSync((await download.path())!, 'utf8')).toMatch(/>\d+(\.\d)?k</)
    await page.getByRole('dialog', { name: 'Export this chart' }).getByRole('button', { name: 'Close' }).click()
    // the choice carries over to a pie, which also offers a share and both
    await page.locator('.xseg').getByText('Chart', { exact: true }).click()
    await page.getByRole('button', { name: 'Clear' }).click()
    await page.locator('.xb .mk', { hasText: 'Pie' }).click()
    await place(page, 'major_trip_mode', 'Colour')
    await place(page, 'trips', 'Slice size')
    await page.locator('.xseg').getByText('Style', { exact: true }).click()
    await expect(page.locator('.xb svg.plot text', { hasText: /^\d+(\.\d)?k$/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.locator('.xb svg.plot text', { hasText: /^\d+%$/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Both', exact: true }).click()
    await expect(page.locator('.xb svg.plot text', { hasText: /· \d+%/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Off', exact: true }).click()
    await expect(page.locator('.xb svg.plot text', { hasText: /%/ })).toHaveCount(0)
    expect(errors).toEqual([])
  })
  test('a placed field moves between shelves, swaps with an occupied one, goes back to the list, and the list tags it', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await page.locator('.xb .mk', { hasText: 'Bar' }).click()
    await place(page, 'primary_purpose', 'X axis')
    await place(page, 'trips', 'Y axis')
    await place(page, 'major_trip_mode', 'Colour')
    await drawn(page)
    const shelf = (name: string) => page.locator('.xb .strip .sp', { hasText: name })
    const tag = (field: string) => page.locator('.xb .fchip', { hasText: field }).first().locator('.fused')
    // dragging by a shelf's label, with the real mouse
    const drag = (from: Locator, to: Locator) => from.locator('.spl').dragTo(to)
    // starting a drag must not reflow the shelves (they used to rewrite their button text, so the target moved from under the pointer)
    const boxes = async () => (await Promise.all((await page.locator('.xb .strip .sp').all()).map((e) => e.boundingBox()))).map((b) => `${b!.x},${b!.y},${b!.width},${b!.height}`)
    await page.waitForTimeout(900) // the landing animation of the last placement
    const still = await boxes()
    const dt = await page.evaluateHandle(() => new DataTransfer())
    await page.locator('.xb .fchip', { hasText: 'trips' }).first().dispatchEvent('dragstart', { dataTransfer: dt })
    await page.waitForTimeout(200)
    expect(await boxes()).toEqual(still)
    // the shelf under the pointer says what a drop would do; shelves elsewhere stay quiet
    const x = page.locator('.xb .strip .sp', { hasText: 'Colour' }) // takes categories only, so a number is refused there
    const y = page.locator('.xb .strip .sp', { hasText: 'Y axis' })
    await x.dispatchEvent('dragenter', { dataTransfer: dt })
    await expect(x).toHaveAttribute('data-hint', /^Takes .* only$/)
    await expect(y).not.toHaveAttribute('data-hint', /.*/)
    await y.dispatchEvent('dragenter', { dataTransfer: dt })
    await expect(y).toHaveAttribute('data-hint', 'Already here')
    await page.locator('.xb .fchip', { hasText: 'trips' }).first().dispatchEvent('dragend', { dataTransfer: dt })
    await expect(page.locator('.xb .strip .sp[data-hint]')).toHaveCount(0)
    // the field list says where a field is used, and the field stays free to use again
    await expect(tag('primary_purpose')).toHaveText('X axis')
    // move: a category from X to Hatch
    await drag(shelf('X axis'), shelf('Hatch'))
    await expect(shelf('Hatch')).toContainText('primary_purpose')
    await expect(shelf('X axis')).not.toContainText('primary_purpose')
    await expect(tag('primary_purpose')).toHaveText('Hatch')
    // a number cannot go on a category shelf, and stays where it was
    await drag(shelf('Y axis'), shelf('Colour'))
    await expect(shelf('Y axis')).toContainText('trips')
    await expect(shelf('Colour')).toContainText('major_trip_mode')
    // swap: two categories trade places
    await drag(shelf('Colour'), shelf('Hatch'))
    await expect(shelf('Hatch')).toContainText('major_trip_mode')
    await expect(shelf('Colour')).toContainText('primary_purpose')
    // take off: drag a placed field back onto the field list
    await drag(shelf('Hatch'), page.locator('.xb .flist'))
    await expect(shelf('Hatch')).not.toContainText('major_trip_mode')
    await expect(tag('major_trip_mode')).toHaveCount(0)
    expect(errors).toEqual([])
  })
  test('a transparent export has no background, and dark mode still gets dark text', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await place(page, 'scenario', 'Columns')
    await place(page, 'major_trip_mode', 'Rows')
    await place(page, 'trips', 'Values')
    await drawn(page)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export this chart' })
    await dialog.getByRole('button', { name: 'Transparent', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'SVG' }).click()])
    const svg = readFileSync((await download.path())!, 'utf8')
    // nothing is painted behind the image (the first thing inside the svg is the content group, not a full-size rect)
    expect(/^<svg[^>]*><g /.test(svg)).toBe(true)
    // drawn in the light theme: the table's text is dark, not the dark theme's near-white
    const fills = [...svg.matchAll(/<text[^>]* fill="rgb\((\d+), (\d+), (\d+)\)"/g)].map((m) => Number(m[1]))
    expect(fills.length).toBeGreaterThan(5)
    expect(Math.max(...fills)).toBeLessThan(200)
    // and the page is back in the dark theme with the cover gone
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('status').filter({ hasText: 'Preparing image' })).toHaveCount(0)
    // the choice is shared: White is a white rect, Match theme the dark fill
    await dialog.getByRole('button', { name: 'White', exact: true }).click()
    const [white] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'SVG' }).click()])
    expect(readFileSync((await white.path())!, 'utf8')).toMatch(/^<svg[^>]*><rect width="\d+" height="\d+" fill="#ffffff"\/>/)
    expect(errors).toEqual([])
  })
  test('a small table is exported at its own size, not padded out to the card', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await place(page, 'scenario', 'Columns')
    await place(page, 'major_trip_mode', 'Rows')
    await place(page, 'trips', 'Values')
    await drawn(page)
    const card = (await page.getByTestId('chart-export-card').boundingBox())!
    const table = (await page.locator('.xb .pvt table').boundingBox())!
    await page.getByRole('button', { name: 'Export' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog', { name: 'Export this chart' }).getByRole('button', { name: 'SVG' }).click()])
    const svg = readFileSync((await download.path())!, 'utf8')
    const width = Number(/<svg[^>]* width="(\d+)"/.exec(svg)![1])
    const height = Number(/<svg[^>]* height="(\d+)"/.exec(svg)![1])
    // the table's own size plus the card's padding and the image margin, never the size of the card it sat in
    expect(width).toBeLessThan(card.width)
    expect(width).toBeLessThan(table.width + 90)
    expect(height).toBeLessThan(card.height)
    expect(errors).toEqual([])
  })
  test('a table too big for its card is exported whole as SVG', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await place(page, 'scenario', 'Columns')
    await place(page, 'primary_purpose', 'Rows')
    await place(page, 'major_trip_mode', 'Add row group')
    await place(page, 'trips', 'Values')
    await drawn(page)
    const card = page.getByTestId('chart-export-card')
    const shown = (await card.boundingBox())!
    // the table scrolls inside its card: the last rows are not on screen
    const scrollH = await page.locator('.xb .pvt-scroll').evaluate((e) => e.scrollHeight - e.clientHeight)
    expect(scrollH).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Export' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog', { name: 'Export this chart' }).getByRole('button', { name: 'SVG' }).click()])
    const svg = readFileSync((await download.path())!, 'utf8')
    const height = Number(/<svg[^>]* height="(\d+)"/.exec(svg)![1])
    expect(height).toBeGreaterThan(shown.height + scrollH / 2)
    // the last purpose in the table and the Total row are in the file, not only what was in view
    expect(svg).toContain('>work<')
    expect(svg).toContain('>Total<')
    // and the copy used for it is gone again
    await expect(page.locator('.xb-export-holder')).toHaveCount(0)
    expect(errors).toEqual([])
  })
  test('text table nests row groups, collapses them, shows shares and takes a second value', async ({ page }) => {
    const errors: string[] = []
    await textTable(page, errors)
    await place(page, 'scenario', 'Columns')
    await place(page, 'primary_purpose', 'Rows')
    await place(page, 'trips', 'Values')
    await drawn(page)
    const table = page.locator('.xb .plot.pivot table')
    const flat = await table.locator('tbody tr').count()
    // a second level of rows: each purpose becomes a group with a subtotal row, its modes below
    await place(page, 'major_trip_mode', 'Add row group')
    await expect(table.locator('tbody tr.pvt-group').first()).toBeVisible()
    const nested = await table.locator('tbody tr').count()
    expect(nested).toBeGreaterThan(flat)
    await table.locator('tbody tr.pvt-group .pvt-chev').first().click()
    await expect.poll(() => table.locator('tbody tr').count()).toBeLessThan(nested)
    await page.getByRole('button', { name: 'Expand all' }).click()
    await expect(table.locator('tbody tr')).toHaveCount(nested)
    // shares
    await page.locator('.xseg').getByText('Table', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Show trips as' }).click()
    await page.getByRole('option', { name: '% of total' }).click()
    await expect(table.locator('tbody td.pvt-cell').first()).toContainText('%')
    await page.getByRole('combobox', { name: 'Show trips as' }).click()
    await page.getByRole('option', { name: 'Value', exact: true }).click()
    await expect(table.locator('tbody td.pvt-cell').first()).not.toContainText('%')
    // a second value splits every column in two
    await place(page, 'trips', 'Add value')
    await expect(table.locator('thead th.pvt-measure').first()).toBeVisible()
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
    // click a node and only its flows stay; click it again and they all return
    const bands = page.locator('.xb .plot path[data-t]')
    const all = await bands.count()
    await page.locator('.xb .plot g[data-t]').first().click()
    await expect(page.locator('.xb .plot text', { hasText: 'click to show all' })).toBeVisible()
    await expect(bands).not.toHaveCount(all)
    expect(await bands.count()).toBeLessThan(all)
    await page.locator('.xb .plot g[data-t]').first().click()
    await expect(bands).toHaveCount(all)
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

test('the Axes tab follows the chart: axis titles, zero baseline only where it applies, pie options, one footer, left or right', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Add chart tab' }).click()
  const place = async (field: string, shelf: string) => {
    await page.locator('.xb .fchip', { hasText: field }).first().click()
    await page.locator('.xb .sp', { hasText: shelf }).getByRole('button', { name: new RegExp(`Place ${field}`) }).click()
  }
  const drawn = async () => expect(page.locator('.xb svg.plot rect[data-t]').first()).toBeVisible({ timeout: 30_000 })
  const rail = page.getByRole('group', { name: 'Chart settings' })
  await page.locator('.xb .mk', { hasText: 'Bar' }).click()
  await place('scenario', 'X axis')
  await place('auPkTotal', 'Y axis')
  await drawn()
  await rail.getByRole('button', { name: 'Axes' }).click()
  // a bar chart always starts at zero, so there is no switch for it; it does have axis titles
  await expect(page.getByText('Y axis starts at zero')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show', exact: true }).first().click()
  await expect(page.locator('.xb svg.plot text', { hasText: 'scenario' })).toBeVisible()
  await page.getByLabel('X title').fill('Trip purpose')
  await expect(page.locator('.xb svg.plot text', { hasText: 'Trip purpose' })).toBeVisible()
  // footer: source on the left, note on the right of one row
  await rail.getByRole('button', { name: 'Style' }).click()
  await page.getByLabel('Footer', { exact: true }).fill('Source: WFRC model')
  await page.getByLabel('Tag', { exact: true }).fill('Draft')
  // one italic footer, bottom left until moved to the right
  const foot = page.locator('.xb .tfoot'), card = (await page.locator('.xb .cardbody').boundingBox())!
  await expect(foot).toHaveCSS('font-style', 'italic')
  expect((await foot.boundingBox())!.x).toBeLessThan(card.x + 40)
  await page.getByRole('button', { name: 'Right', exact: true }).click()
  const fb = (await foot.boundingBox())!
  await expect(foot).toHaveCSS('text-align', 'right')
  expect(fb.x + fb.width).toBeGreaterThan(card.x + card.width - 40)
  // a pie has its own tab
  await rail.getByRole('button', { name: 'Chart', exact: true }).click()
  await page.locator('.xb .mk', { hasText: 'Pie' }).click()
  await expect(rail.getByRole('button', { name: 'Pie', exact: true })).toBeVisible()
  await rail.getByRole('button', { name: 'Pie', exact: true }).click()
  await expect(page.getByText('Y axis starts at zero')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Slice order' })).toBeVisible()
  expect(errors).toEqual([])
})
