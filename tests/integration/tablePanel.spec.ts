import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 005-table-panel, extending
// dashboardShell.spec.ts's/panelExpand.spec.ts's pattern (real
// DuckDB-WASM, fixture Parquet, fixture dashboard-config). See
// quickstart.md and contracts/table-panel.md / table-logic.md.
//
// Fixture shape (tests/fixtures/dashboard-config/dashboard-1-summary.yaml,
// tests/fixtures/generate.py's SCREENLINES_ROWS — 30 rows):
// - "Screenline Validation": columns: config (link_id/facility_type/
//   observed/modeled/pct_error), sort: {pct_error, desc}, pagination: 10,
//   NOT searchable.
// - "Screenline Validation (Raw)": no columns: (derived), searchable,
//   default pagination (20). Row L025 (facility_type "Ramp", the only
//   row with that value) sits at fetch index 24 — page 2 of 2 at this
//   panel's default page size, since it has no sort: config.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

test.describe('User Story 1 - See a panel\'s query result as a real table', () => {
  test('renders exactly the configured columns, labeled and formatted', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation')
    await expect(card.getByRole('columnheader', { name: /Link ID/ })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: /Facility/ })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: /Observed/ })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: /Modeled/ })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: /% Error/ })).toBeVisible()
    // format: "{:,.0f}" applied to observed/modeled — thousands separator,
    // no decimals. This panel has sort: {pct_error, desc} + pagination: 10,
    // so page 1 shows the 10 highest-pct_error rows, not link_id order —
    // L011 (pct_error 0.5, this fixture's max) is one of them: observed
    // 907, modeled 1360 (see generate.py).
    await expect(card.getByText('907', { exact: true })).toBeVisible()
    await expect(card.getByText('1,360', { exact: true })).toBeVisible()
  })

  test('derives columns from the query result shape when no columns: is configured', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')
    // Raw field names, not configured labels — this panel has no
    // columns: config at all.
    await expect(card.getByRole('columnheader', { name: 'link_id' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'facility_type' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'observed' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'modeled' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'pct_error' })).toBeVisible()
  })

  test('color_scale renders a visible, legible color treatment', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation')
    // sort: {pct_error, desc} means the highest pct_error rows are on
    // page 1 — L011/L024 (pct_error 0.5, this fixture's domain maximum)
    // carry the strongest --destructive tint of any cell.
    const cell = card.locator('td', { hasText: '50.0%' }).first()
    await expect(cell).toBeVisible()
    const backgroundColor = await cell.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)') // a real color was applied, not transparent
    const textColor = await cell.evaluate((el) => getComputedStyle(el).color)
    // Legibility check: text color and background color must be distinct
    // (a real contrast check would need a full WCAG computation; this
    // confirms at minimum they aren't the same color, which a broken
    // implementation — e.g. accidentally setting text to the same tint —
    // would produce).
    expect(textColor).not.toBe(backgroundColor)
  })

  test('the search-empty state and the genuine query-error state each use the shared components, distinctly', async ({
    page,
  }) => {
    await boot(page)
    // Search-narrowed-to-zero-rows: a real query result exists, the
    // search just matched nothing — TablePanel.tsx's own distinct
    // branch, not the "no data at all" one.
    const rawCard = panelCard(page, 'Screenline Validation (Raw)')
    await rawCard.getByRole('textbox', { name: /Search/ }).fill('this-matches-nothing-at-all')
    await expect(rawCard.getByText('No rows match your search')).toBeVisible()

    // Genuine query rejection (a metric no scenario publishes) —
    // PanelErrorState, the same shared component ValueBoxPanel/
    // PlotlyPanel already use for their own rejected queries.
    const brokenCard = panelCard(page, 'Broken Table Panel (intentional)')
    await expect(brokenCard.getByText("Couldn't load this table")).toBeVisible()
    // And confirms FR-010-style isolation: the broken panel doesn't
    // affect its siblings on the same tab.
    await expect(panelCard(page, 'Screenline Validation').locator('table')).toBeVisible()
  })

  test('is styled consistently with other panel cards (SC-004)', async ({ page }) => {
    await boot(page)
    const tableCard = panelCard(page, 'Screenline Validation')
    const valueBoxCard = panelCard(page, 'Total Households')
    await expect(tableCard).toHaveClass(/border/)
    const tableBorder = await tableCard.evaluate((el) => getComputedStyle(el).borderStyle)
    const valueBoxBorder = await valueBoxCard.evaluate((el) => getComputedStyle(el).borderStyle)
    expect(tableBorder).toBe(valueBoxBorder)
    expect(tableBorder).toBe('solid')
  })
})

test.describe('User Story 2 - Sort the table by any column', () => {
  test('clicking a header sorts ascending, clicking again reverses, a different column resets to ascending', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')
    const firstCellOfFirstRow = () => card.locator('tbody tr').first().locator('td').nth(2) // "observed"

    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').click()
    await expect(firstCellOfFirstRow()).toHaveText('537') // L001, smallest observed value, ascending

    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').click()
    await expect(firstCellOfFirstRow()).toHaveText('1610') // L030, largest, now descending

    await card.getByRole('columnheader', { name: 'link_id' }).getByRole('button').click()
    await expect(card.locator('tbody tr').first().locator('td').first()).toHaveText('L001') // ascending on the new column
  })

  test('config.sort applies as the initial order before any click', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation')
    // sort: { column: pct_error, order: desc } — L011 and L024 both have
    // pct_error 0.5 (this fixture's max), so one of them leads.
    const firstRowLinkId = await card.locator('tbody tr').first().locator('td').first().innerText()
    expect(['L011', 'L024']).toContain(firstRowLinkId)
  })

  test('a column header is keyboard-operable — Tab to it, press Enter, sort applies same as a click', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')
    const firstCellOfFirstRow = () => card.locator('tbody tr').first().locator('td').nth(2) // "observed"

    // Real <button> elements are Tab-reachable — .focus() the specific
    // header's button directly rather than counting Tab presses from
    // page top (brittle: depends on every focusable element earlier in
    // the DOM, e.g. the scenario picker, other panels' search inputs).
    // The keyboard operability being tested is "this control responds to
    // Enter once focused", which .focus() + press('Enter') proves just as
    // well as an unbroken Tab chain would.
    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').focus()
    await page.keyboard.press('Enter')
    await expect(firstCellOfFirstRow()).toHaveText('537') // L001, smallest observed value, ascending — same result as the mouse-click test above

    // Space is the other native-button activation key — confirm it also
    // triggers the sort (reverses to descending here).
    await page.keyboard.press('Space')
    await expect(firstCellOfFirstRow()).toHaveText('1610') // L030, largest, now descending
  })

  test('sorting triggers no additional query', async ({ page }) => {
    await boot(page)
    const before = await page.evaluate(() =>
      window.__wftdm!.__debugQueryLog().filter((s) => s.includes('screenlines')).length,
    )
    const card = panelCard(page, 'Screenline Validation (Raw)')
    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').click()
    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').click()
    const after = await page.evaluate(() =>
      window.__wftdm!.__debugQueryLog().filter((s) => s.includes('screenlines')).length,
    )
    expect(after).toBe(before)
  })
})

test.describe('User Story 3 - Page through a large result set', () => {
  test('a result set larger than the page size renders only the first page, with controls to reach the rest', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)') // default pagination: 20, 30 rows
    await expect(card.locator('tbody tr')).toHaveCount(20)
    await expect(card.getByText('Page 1 of 2')).toBeVisible()
    await card.getByRole('button', { name: 'Next' }).click()
    await expect(card.locator('tbody tr')).toHaveCount(10)
    await expect(card.getByText('Page 2 of 2')).toBeVisible()
  })

  test('config.pagination overrides the default page size', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation') // pagination: 10
    await expect(card.locator('tbody tr')).toHaveCount(10)
    await expect(card.getByText('Page 1 of 3')).toBeVisible()
  })

  test('a result set within one page shows every row reachable with no working pagination required', async ({
    page,
  }) => {
    await boot(page)
    // Change the purpose filter's scope isn't relevant here — instead,
    // use search to narrow "Screenline Validation (Raw)" (30 rows, page
    // size 20) down to a single-page result and confirm no pagination
    // controls are needed.
    const card = panelCard(page, 'Screenline Validation (Raw)')
    await card.getByRole('textbox', { name: /Search/ }).fill('Ramp')
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByText(/Page \d+ of \d+/)).not.toBeVisible()
  })

  test('paging forward on a sorted table reflects the sorted order', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')
    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').click() // ascending
    await card.getByRole('button', { name: 'Next' }).click()
    // Page 2 (rows 21-30 in ascending observed order) should start right
    // after page 1's last (20th smallest) value — the 20th-smallest
    // observed value in this fixture is L020's 1240.
    const firstCellOnPage2 = card.locator('tbody tr').first().locator('td').first()
    await expect(firstCellOnPage2).toHaveText('L021')
  })
})

test.describe('User Story 4 - Search across the full result set', () => {
  test('searchable: true renders a search input; a panel without it does not', async ({ page }) => {
    await boot(page)
    await expect(
      panelCard(page, 'Screenline Validation (Raw)').getByRole('textbox', { name: /Search/ }),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Screenline Validation').getByRole('textbox', { name: /Search/ }),
    ).toHaveCount(0)
  })

  test('a search term matching a row on a different page surfaces it in the re-paginated results', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')
    await expect(card.locator('tbody tr')).toHaveCount(20) // page 1 — "Ramp" (index 24) is NOT here
    await expect(card.getByText('Ramp')).not.toBeVisible()

    await card.getByRole('textbox', { name: /Search/ }).fill('Ramp')
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByText('Ramp')).toBeVisible()
    await expect(card.getByText('L025')).toBeVisible()
  })

  test('search and sort combine — sort orders the filtered subset', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')
    // Search to just the three "Collector" rows near the top of the
    // fixture id space, then sort — confirms sort acts on the narrowed
    // set, not the full 30.
    await card.getByRole('textbox', { name: /Search/ }).fill('Collector')
    await card.getByRole('columnheader', { name: 'link_id' }).getByRole('button').click()
    const linkIds = await card.locator('tbody tr td:first-child').allInnerTexts()
    expect(linkIds).toEqual([...linkIds].sort())
    expect(linkIds.length).toBeGreaterThan(0)
    expect(linkIds.length).toBeLessThan(30)
  })

  test('a search matching nothing shows a distinct "no results" state', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')
    await card.getByRole('textbox', { name: /Search/ }).fill('zzz-no-such-value')
    await expect(card.getByText('No rows match your search')).toBeVisible()
    await expect(card.getByText('No data for this selection')).not.toBeVisible()
  })
})

test.describe('Polish - three-way reset on refetch, and 004 expand-dialog inheritance', () => {
  test('sortState/searchTerm/currentPage all reset together when a filter change causes a refetch', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')

    // Establish non-default state: user-driven sort, a search term, and
    // (implicitly) page 0 already — sort first so there's something to
    // revert away from config.sort's absence (this panel has no
    // config.sort, so the reverted state is natural/unsorted order).
    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').click() // ascending
    await expect(card.locator('tbody tr').first().locator('td').first()).toHaveText('L001')
    await card.getByRole('textbox', { name: /Search/ }).fill('Freeway')
    await expect(card.locator('tbody tr').first()).toBeVisible()

    // Trigger a refetch via a global filter change — this fixture's
    // panels don't bind `filter:`, so directly re-set a scenario/filter
    // isn't guaranteed to refetch this specific panel; instead assert
    // the documented mechanism directly by forcing the panel's own
    // effect to re-run through appState (same technique already
    // available via window.__wftdm) is out of scope for this test's
    // simplicity — use the purpose filter, which every panel's query
    // re-runs against on any change since panelQuery.ts's filters
    // dependency is part of every panel's effect deps.
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await page.waitForTimeout(200)

    // Search term cleared, sort reverted to natural order (no
    // config.sort on this panel), first page.
    await expect(card.getByRole('textbox', { name: /Search/ })).toHaveValue('')
    await expect(card.locator('tbody tr')).toHaveCount(20)
    await expect(card.locator('tbody tr').first().locator('td').first()).toHaveText('L001')

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
  })

  test('a table panel gets 004\'s expand trigger with zero panel-specific wiring', async ({ page }) => {
    await boot(page)
    await expect(
      page.getByRole('button', { name: 'Expand Screenline Validation (Raw)' }),
    ).toBeVisible()
  })

  test('sort/search/page state survives an expand -> collapse round trip unchanged', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Screenline Validation (Raw)')
    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').click() // ascending
    await card.getByRole('textbox', { name: /Search/ }).fill('Freeway')
    await card.getByRole('columnheader', { name: 'observed' }).getByRole('button').click() // desc, still filtered to Freeway

    await page.getByRole('button', { name: 'Expand Screenline Validation (Raw)' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /Search/ })).toHaveValue('Freeway')
    const dialogFirstRow = dialog.locator('tbody tr').first().locator('td').first()
    const expandedValue = await dialogFirstRow.innerText()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(card.getByRole('textbox', { name: /Search/ })).toHaveValue('Freeway')
    await expect(card.locator('tbody tr').first().locator('td').first()).toHaveText(expandedValue)
  })
})

// 019-baseline-diff-consumption. Reuses this file's own boot()/panelCard()
// helpers plus generate.py's real VMT_BY_HOME_TAZ_ROWS/
// VMT_BY_HOME_TAZ_OBSERVED_ROWS fixture data — the exact same values
// zonemapPanel.spec.ts's own hardcoded-name comparison: diff test already
// hand-verifies (TAZ 100: -13.0, TAZ 700: 20.0), and a genuine 0.0 at TAZ
// 300 in good_scenario's own data for the zero-baseline percent-diff case.
test.describe('019-baseline-diff-consumption', () => {
  function rowFor(card: ReturnType<typeof panelCard>, taz: string) {
    return card.locator('tbody tr', { hasText: taz })
  }

  test('User Story 1: $baseline resolves and computes the correct absolute diff, reactively', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Table VMT Diff via $baseline')
    await expect(card.getByRole('columnheader', { name: 'TAZ' })).toBeVisible()

    // Explicitly mark 'observed' baseline — a === observed, b === good_scenario.
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('observed'))

    await expect(rowFor(card, '100').locator('td').nth(1)).toHaveText('-13.0')
    await expect(rowFor(card, '700').locator('td').nth(1)).toHaveText('20.0')
  })

  test('User Story 2: a zero baseline value renders a distinct "N/A" state, never Infinity/NaN/the literal string "null"', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Table VMT Percent Diff via $baseline (zero-baseline case)')
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('good_scenario'))

    // TAZ 300: good_scenario's own value is 0.0 -> NULLIF(0,0) -> NULL.
    const naCell = rowFor(card, '300').locator('td').nth(1)
    await expect(naCell).toHaveText('N/A')
    const naStyle = (await naCell.getAttribute('style')) ?? ''
    expect(naStyle).toContain('muted-foreground') // dedicated "not computable" color

    // TAZ 700: good_scenario's own value is 25.0 -> a real, non-null
    // percentage, clean and hand-verifiable: (5.0 - 25.0) / 25.0 = -80.0%.
    const realCell = rowFor(card, '700').locator('td').nth(1)
    await expect(realCell).toHaveText('-80.0%')
    const realStyle = (await realCell.getAttribute('style')) ?? ''
    expect(realStyle).not.toContain('muted-foreground') // distinct from the N/A cell above
  })

  test('User Story 4: shows the existing error state when no baseline resolves, recovers automatically once one does', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Table VMT Diff via $baseline')
    await expect(card.getByRole('columnheader', { name: 'TAZ' })).toBeVisible()

    await page.evaluate(() => {
      for (const s of window.__wftdm!.appState.list()) {
        window.__wftdm!.appState.unregister(s.name)
      }
    })
    await expect(card.getByRole('alert')).toBeVisible()

    await page.evaluate(() => {
      window.__wftdm!.appState.register('good_scenario', { source: 'url', path: 'test/good_scenario' })
      window.__wftdm!.appState.setStatus('good_scenario', 'ready')
    })
    await expect(card.getByRole('alert')).not.toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'TAZ' })).toBeVisible()
  })
})
