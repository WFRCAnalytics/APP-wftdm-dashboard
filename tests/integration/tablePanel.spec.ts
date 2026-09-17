import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 005-table-panel/019-baseline-diff-consumption.
// Migrated (040-test-suite-migration) off the retired synthetic
// tests/fixtures/dashboard-config/dashboard-1-summary.yaml +
// tests/fixtures/generate.py's own SCREENLINES_ROWS — both deleted, no
// on-disk fixture-copy mechanism (public/scenarios/, public/dashboard-
// config/, public/observed/ are gitignored and genuinely empty in this
// checkout; scripts/copy-fixtures.js / npm run dev:fixtures no longer
// exist). See quickstart.md and contracts/table-panel.md / table-logic.md
// for this feature's own original design record.
//
// Real panel shapes used throughout, hand-verified directly against the
// real Parquet files via the duckdb CLI, not assumed:
// - "Mandatory Tour Start/End/Duration (Work Tours)" (dashboard-3-tour-
//   models.yaml, Tour tab) — columns: config (Start Hour/End Hour/
//   Duration (hrs)/Tours), sort: {tours, desc}, pagination: 20, NOT
//   searchable, filter: {primary_purpose: work} baked into the panel
//   itself. 169 real rows (one scenario) — page 1 of 9. Top row (unique
//   max, no tie): start 7, end 17, duration 10, tours 264.
// - "Auto Ownership by Household Segment" (dashboard-2-person-
//   household.yaml, Person & Households tab) — columns: config (Autos
//   Owned/HH Size/Income Group/Workers/Home District/Households),
//   sort: {households, desc}, pagination: 20, searchable: true. 239 real
//   rows (one scenario) — page 1 of 12. Top row (unique max): households
//   835. A real, unique households value (50, rank 22 — off page 1)
//   makes "50" a safe, non-colliding search term (confirmed via a live
//   substring sweep across every column: exactly one match app-wide).
// - Two small, real, permanent additions to dashboard-8-test.yaml's own
//   Test tab (this feature's own contribution, not fabricated data — see
//   that file's own header comments on each new row): "Table No Columns
//   Config (derived headers)" and "Table Color Scale (households)" close
//   a real, confirmed gap — a direct grep sweep found EVERY real table
//   panel in public/demo-dashboard-config/ carries an explicit
//   `columns:` list (038-all-loaded-scenarios' own scenario-discriminator
//   column), and NONE use a per-column `color_scale:`/`domain:` (a real,
//   documented grammar shape — project-docs/GRAMMAR.md's own KPI Summary
//   example — with zero real `type: table` coverage anywhere in this
//   repo; every real color_scale usage today is on `type: zonemap`,
//   which auto-computes its own domain, unlike table's author-required
//   one).
// - Two more small, real, permanent additions, also on the Test tab —
//   "Table VMT Diff via $baseline" / "Table VMT Percent Diff via
//   $baseline" — close a second real, confirmed gap (038-all-loaded-
//   scenarios' own item-25 audit: "zero panels in public/demo-dashboard-
//   config/ use comparison: diff or $baseline anywhere"; this repo's
//   only other comparison: diff TABLE panel, "Broken Comparison Diff", is
//   deliberately unresolvable). Both use the real, already-published
//   vmt_by_home_taz metric (the same one the Test tab's own zonemap diff
//   panels already use), a: activitysim-baseline fixed, b: "$baseline".

const REAL_DEMO_DASHBOARD_INDEX = {
  dashboards: [
    'dashboard-1-summary.yaml',
    'dashboard-2-person-household.yaml',
    'dashboard-3-tour-models.yaml',
    'dashboard-4-mode-choice.yaml',
    'dashboard-5-trip-models.yaml',
    'dashboard-6-network.yaml',
    'dashboard-7-explore.yaml',
    'dashboard-8-test.yaml',
  ],
  title: 'WFRC TDM Calibration Dashboard',
}

// A deliberately minimal, deterministic scenario world: 'activitysim-
// baseline' is the ONLY active scenario (every row count/page count/exact
// cell value above was hand-verified against exactly one scenario's own
// data) — 'activitysim-density-variant' is also REGISTERED (needed by the
// 019-baseline-diff-consumption describe block's own $baseline resolution,
// which only requires a scenario to be registered, not active — panels/
// panelQuery.ts's resolveComparisonScenarioName()/services/
// tabDataLoader.ts's isComparisonDiff() branch both resolve named
// scenarios independent of appState.active) but explicitly deactivated
// right after boot, so it never joins any UNPINNED panel's own $scenario
// union and inflates the hand-verified row/page counts above.
async function boot(page: Page) {
  await page.route('**/demo-dashboard-config/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_DASHBOARD_INDEX) }),
  )
  await page.route('**/demo-scenarios/index.json', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(['activitysim-baseline', 'activitysim-density-variant']),
    }),
  )
  await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/scenarios/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/dashboard-config/index.json', (r) => r.fulfill({ status: 404, body: '' }))

  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () =>
      window.__wftdm!.appState.get('activitysim-baseline')?.status !== 'registering' &&
      window.__wftdm!.appState.get('activitysim-density-variant')?.status !== 'registering',
    null,
    { timeout: 30_000 },
  )
  await page.evaluate(() => window.__wftdm!.appState.setActive('activitysim-density-variant', false))
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

test.describe('User Story 1 - See a panel\'s query result as a real table', () => {
  test('renders exactly the configured columns, labeled and formatted', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Tour' }).click()
    const card = panelCard(page, 'Mandatory Tour Start/End/Duration (Work Tours)')
    await expect(card.getByRole('columnheader', { name: 'Start Hour' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'End Hour' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'Duration (hrs)' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'Tours' })).toBeVisible()

    // format: "{:,.0f}" applied to Tours. sort: {tours, desc} +
    // filter: {primary_purpose: work} puts the real, unique-maximum row
    // (264 tours, no tie) first — hand-verified against the real
    // Parquet file via the duckdb CLI.
    const firstRow = card.locator('tbody tr').first().locator('td')
    await expect(firstRow.nth(1)).toHaveText('7') // Start Hour
    await expect(firstRow.nth(2)).toHaveText('17') // End Hour
    await expect(firstRow.nth(3)).toHaveText('10') // Duration (hrs)
    await expect(firstRow.nth(4)).toHaveText('264') // Tours
  })

  test('derives columns from the query result shape when no columns: is configured', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Table No Columns Config (derived headers)')
    // Raw field names, not configured labels — this panel has no
    // columns: config at all.
    await expect(card.getByRole('columnheader', { name: 'auto_ownership' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(card.getByRole('columnheader', { name: 'hhsize' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'income_group' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'num_workers' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'home_district' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'households' })).toBeVisible()
  })

  test('color_scale renders a visible, legible color treatment', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Table Color Scale (households)')
    // sort: {households, desc}, domain: [0, 900] — the real top row
    // (households 835) sits near the domain's own maximum, carrying the
    // strongest tint of any row.
    const cell = card.locator('tbody tr').first().locator('td').last()
    await expect(cell).toHaveText('835', { timeout: 20_000 })
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
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const aoCard = panelCard(page, 'Auto Ownership by Household Segment')
    await aoCard.getByRole('textbox', { name: /Search/ }).fill('this-matches-nothing-at-all')
    await expect(aoCard.getByText('No rows match your search')).toBeVisible()

    // Genuine query rejection (a metric no scenario publishes) —
    // PanelErrorState, the same shared component ValueBoxPanel/
    // PlotlyPanel already use for their own rejected queries. A default
    // 5s timeout is unreliable on the Test tab — it has grown
    // substantially crowded across several later features, so this
    // panel's own error can take longer than 5s under real DuckDB-WASM
    // contention from every sibling panel's own concurrent query (same
    // class of fix this project's other Test-tab assertions already use).
    await page.getByRole('tab', { name: 'Test' }).click()
    const brokenCard = panelCard(page, 'Broken Table Panel (missing metric)')
    await expect(brokenCard.getByText("Couldn't load this table")).toBeVisible({ timeout: 20_000 })
    // And confirms FR-010-style isolation: the broken panel doesn't
    // affect a real, working sibling on the same tab.
    await expect(panelCard(page, 'Table No Columns Config (derived headers)').locator('table')).toBeVisible()
  })

  test('is styled consistently with other panel cards (SC-004)', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Tour' }).click()
    const tableCard = panelCard(page, 'Mandatory Tour Start/End/Duration (Work Tours)')
    await expect(tableCard.locator('table')).toBeVisible()
    await expect(tableCard).toHaveClass(/border/)
    const tableBorder = await tableCard.evaluate((el) => getComputedStyle(el).borderStyle)

    await page.getByRole('tab', { name: 'Summary' }).click()
    const valueBoxCard = panelCard(page, 'Households')
    await expect(valueBoxCard).toBeVisible()
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
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    const autosOwnedCell = () => card.locator('tbody tr').first().locator('td').nth(1)

    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').click()
    await expect(autosOwnedCell()).toHaveText('0') // ascending — 0 is the real minimum

    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').click()
    await expect(autosOwnedCell()).toHaveText('4') // descending — 4 is the real maximum

    const incomeGroupCell = () => card.locator('tbody tr').first().locator('td').nth(3)
    await card.getByRole('columnheader', { name: 'Income Group' }).getByRole('button').click()
    // Ascending on the new column — "High" sorts first alphabetically
    // among the real, distinct income_group values (High/Low/Medium/
    // Very High/Very Low).
    await expect(incomeGroupCell()).toHaveText('High')
  })

  test('config.sort applies as the initial order before any click', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Tour' }).click()
    // sort: { column: tours, order: desc } — the real, unique-maximum row
    // (264 tours) leads with no click needed.
    const card = panelCard(page, 'Mandatory Tour Start/End/Duration (Work Tours)')
    const toursCell = card.locator('tbody tr').first().locator('td').nth(4)
    await expect(toursCell).toHaveText('264')
  })

  test('a column header is keyboard-operable — Tab to it, press Enter, sort applies same as a click', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    const autosOwnedCell = () => card.locator('tbody tr').first().locator('td').nth(1)

    // Real <button> elements are Tab-reachable — .focus() the specific
    // header's button directly rather than counting Tab presses from
    // page top (brittle: depends on every focusable element earlier in
    // the DOM, e.g. the sidebar/settings controls, other panels' search
    // inputs). The keyboard operability being tested is "this control
    // responds to Enter once focused", which .focus() + press('Enter')
    // proves just as well as an unbroken Tab chain would.
    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').focus()
    await page.keyboard.press('Enter')
    await expect(autosOwnedCell()).toHaveText('0') // ascending — same result as the mouse-click test above

    // Space is the other native-button activation key — confirm it also
    // triggers the sort (reverses to descending here).
    await page.keyboard.press('Space')
    await expect(autosOwnedCell()).toHaveText('4')
  })

  test('sorting triggers no additional query', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    // The panel's own first fetch must have actually resolved before
    // capturing the "before" count — otherwise a real, in-flight initial
    // query races the count read and is wrongly attributed to the two
    // sort clicks below (a real bug found running this test: capturing
    // "before" immediately after the tab click, before the table itself
    // was visible, undercounted it).
    await expect(card.locator('tbody tr').first()).toBeVisible()
    const before = await page.evaluate(() =>
      window.__wftdm!.__debugQueryLog().filter((s) => s.includes('auto_ownership_summary')).length,
    )
    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').click()
    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').click()
    const after = await page.evaluate(() =>
      window.__wftdm!.__debugQueryLog().filter((s) => s.includes('auto_ownership_summary')).length,
    )
    expect(after).toBe(before)
  })
})

test.describe('User Story 3 - Page through a large result set', () => {
  test('a result set larger than the page size renders only the first page, with controls to reach the rest', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const card = panelCard(page, 'Auto Ownership by Household Segment') // pagination: 20, 239 real rows
    await expect(card.locator('tbody tr')).toHaveCount(20)
    await expect(card.getByText('Page 1 of 12')).toBeVisible()
    await card.getByRole('button', { name: 'Next' }).click()
    await expect(card.locator('tbody tr')).toHaveCount(20)
    await expect(card.getByText('Page 2 of 12')).toBeVisible()
  })

  test('config.pagination overrides the default page size', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Table Color Scale (households)') // pagination: 10 (app default is 20)
    await expect(card.locator('tbody tr')).toHaveCount(10, { timeout: 20_000 })
    await expect(card.getByText('Page 1 of 24')).toBeVisible()
  })

  test('a result set within one page shows every row reachable with no working pagination required', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    // "50" narrows Auto Ownership by Household Segment (239 rows, page
    // size 20) down to a single, real, hand-verified match — a genuinely
    // unique households value (confirmed via a live substring sweep
    // across every column: exactly one match app-wide).
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    await card.getByRole('textbox', { name: /Search/ }).fill('50')
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByText(/Page \d+ of \d+/)).not.toBeVisible()
  })

  test('paging forward on a sorted table reflects the sorted order', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    // No click needed — config.sort ({households, desc}) is already in
    // effect. The real 20th/21st-ranked rows (page 1's last, page 2's
    // first) share the exact same households value (57, hand-verified
    // via the duckdb CLI) — a real, honest tie at that boundary, not a
    // manufactured one.
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    const householdsCell = (row: number) => card.locator('tbody tr').nth(row).locator('td').last()
    await expect(householdsCell(19)).toHaveText('57') // page 1, last row (0-indexed)
    await card.getByRole('button', { name: 'Next' }).click()
    await expect(householdsCell(0)).toHaveText('57') // page 2, first row
  })
})

test.describe('User Story 4 - Search across the full result set', () => {
  test('searchable: true renders a search input; a panel without it does not', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    await expect(
      panelCard(page, 'Auto Ownership by Household Segment').getByRole('textbox', { name: /Search/ }),
    ).toBeVisible()

    await page.getByRole('tab', { name: 'Tour' }).click()
    await expect(
      panelCard(page, 'Mandatory Tour Start/End/Duration (Work Tours)').getByRole('textbox', {
        name: /Search/,
      }),
    ).toHaveCount(0)
  })

  test('a search term matching a row on a different page surfaces it in the re-paginated results', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    await expect(card.locator('tbody tr')).toHaveCount(20) // page 1 — households "50" (rank 22) is NOT here
    await expect(card.getByText('50', { exact: true })).not.toBeVisible()

    await card.getByRole('textbox', { name: /Search/ }).fill('50')
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByText('50', { exact: true })).toBeVisible()
  })

  test('search and sort combine — sort orders the filtered subset', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    // "Very High" narrows to the real 47 income_group="Very High" rows
    // (hand-verified via the duckdb CLI), then sort acts on that narrowed
    // set, not the full 239.
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    await card.getByRole('textbox', { name: /Search/ }).fill('Very High')
    await expect(card.locator('tbody tr')).toHaveCount(20) // still page 1 of the narrowed set
    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').click()
    const autosOwned = await card.locator('tbody tr td:nth-child(2)').allInnerTexts()
    const asNumbers = autosOwned.map(Number)
    expect(asNumbers).toEqual([...asNumbers].sort((a, b) => a - b))
  })

  test('a search matching nothing shows a distinct "no results" state', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const card = panelCard(page, 'Auto Ownership by Household Segment')
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
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const card = panelCard(page, 'Auto Ownership by Household Segment')

    // Establish non-default state: user-driven sort (ascending, away from
    // config.sort's own households-descending default) and a search term.
    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').click()
    await expect(card.locator('tbody tr').first().locator('td').nth(1)).toHaveText('0')
    await card.getByRole('textbox', { name: /Search/ }).fill('Very High')
    await expect(card.locator('tbody tr').first()).toBeVisible()

    // Trigger a refetch via a global filter change — every real demo
    // panel defaults to filter_ids: ['*'] (no real panel declares an
    // explicit filter_ids — confirmed via a direct grep sweep, the same
    // finding dashboardShell.spec.ts's own $filters. gap note already
    // records), so ANY global filter change still reactively refetches
    // every panel via useFilterState's wildcard subscription, even though
    // no real panel's own SQL actually references $filters.purpose.
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await page.waitForTimeout(300)

    // Search term cleared, sort reverted to config.sort's own initial
    // order (households descending — this panel DOES declare a real
    // config.sort, unlike the retired fixture's own raw/unsorted panel),
    // first page.
    await expect(card.getByRole('textbox', { name: /Search/ })).toHaveValue('')
    await expect(card.locator('tbody tr')).toHaveCount(20)
    await expect(card.locator('tbody tr').first().locator('td').last()).toHaveText('835')

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
  })

  test('a table panel gets 004\'s expand trigger with zero panel-specific wiring', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    await expect(
      page.getByRole('button', { name: 'Expand Auto Ownership by Household Segment' }),
    ).toBeVisible()
  })

  test('sort/search/page state survives an expand -> collapse round trip unchanged', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').click() // ascending
    await card.getByRole('textbox', { name: /Search/ }).fill('Very High')
    await card.getByRole('columnheader', { name: 'Autos Owned' }).getByRole('button').click() // desc, still filtered

    await page.getByRole('button', { name: 'Expand Auto Ownership by Household Segment' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /Search/ })).toHaveValue('Very High')
    const dialogFirstCell = dialog.locator('tbody tr').first().locator('td').nth(1)
    const expandedValue = await dialogFirstCell.innerText()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(card.getByRole('textbox', { name: /Search/ })).toHaveValue('Very High')
    await expect(card.locator('tbody tr').first().locator('td').nth(1)).toHaveText(expandedValue)
  })
})

// 019-baseline-diff-consumption. Reuses this file's own boot()/
// panelCard() helpers plus dashboard-8-test.yaml's own real "Table VMT
// Diff via $baseline"/"Table VMT Percent Diff via $baseline" panels (this
// feature's own real, permanent addition — see this file's own header
// comment) — real, hand-verified vmt_by_home_taz diffs between
// activitysim-baseline and activitysim-density-variant.
test.describe('019-baseline-diff-consumption', () => {
  // Matches the row whose FIRST cell (TAZ) is EXACTLY `taz` — a plain
  // `hasText: taz` substring match on the whole row is unsafe here (a
  // real, confirmed bug found while writing this test): "8" also matches
  // any row whose TAZ is 18/28/38/etc., and rows render in unsorted,
  // real-fetch order, so the wrong row's own diff value was being read.
  function rowFor(card: ReturnType<typeof panelCard>, taz: string) {
    return card.locator('tbody tr').filter({
      has: card.page().locator('td:first-child').getByText(taz, { exact: true }),
    })
  }

  test('User Story 1: $baseline resolves and computes the correct absolute diff, reactively', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Table VMT Diff via $baseline')
    await expect(card.getByRole('columnheader', { name: 'TAZ' })).toBeVisible({ timeout: 20_000 })

    // a: activitysim-baseline (fixed) — b: $baseline, resolved here to
    // activitysim-density-variant.
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-density-variant'))

    // TAZ 8: real, hand-verified diff (a.total_vmt - b.total_vmt) via the
    // duckdb CLI — -19.763957990319568, rounds to -19.8 at this column's
    // own ",.1f" format.
    await expect.poll(async () => rowFor(card, '8').locator('td').nth(1).innerText()).toBe('-19.8')
  })

  test('User Story 2: a real, non-null percent diff renders correctly; the zero-baseline N/A path is unit-tested (no real trigger exists in current demo VMT data)', async ({
    page,
  }) => {
    // A real, confirmed finding, not an assumption: every real
    // vmt_by_home_taz row, across all 3 real demo scenarios, is a
    // genuinely nonzero VMT total (confirmed via a live duckdb CLI sweep
    // — zero matching rows in any of the three real Parquet files) — this
    // synthetic 25-zone system's own real land-use/trip generation never
    // produces a home zone with exactly zero VMT. The NULLIF-guarded
    // "N/A, not a guess" rendering this sub-case originally covered has
    // no real integration-level trigger as a result; it stays covered at
    // the unit level (tests/unit/tableLogic.test.ts's own
    // cellColor(null, ...) case, which asserts the same real
    // --muted-foreground treatment this test would otherwise have
    // checked here) rather than being faked with synthetic data this
    // migration exists to retire.
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Table VMT Percent Diff via $baseline')
    await expect(card.getByRole('columnheader', { name: 'TAZ' })).toBeVisible({ timeout: 20_000 })
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-density-variant'))

    // TAZ 4: real, hand-verified percent diff — (a.total_vmt -
    // b.total_vmt) / b.total_vmt = 0.13253934469223838, rounds to 13.3%
    // at this column's own ".1%" format.
    const realCell = () => rowFor(card, '4').locator('td').nth(1)
    await expect.poll(async () => realCell().innerText()).toBe('13.3%')
    const realStyle = (await realCell().getAttribute('style')) ?? ''
    expect(realStyle).not.toContain('muted-foreground') // a real, non-null value
  })

  test('User Story 4: shows the existing error state when no baseline resolves, recovers automatically once one does', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Table VMT Diff via $baseline')
    await expect(card.getByRole('columnheader', { name: 'TAZ' })).toBeVisible({ timeout: 20_000 })

    await page.evaluate(() => {
      for (const s of window.__wftdm!.appState.list()) {
        window.__wftdm!.appState.unregister(s.name)
      }
    })
    await expect(card.getByRole('alert')).toBeVisible()

    await page.evaluate(() => {
      window.__wftdm!.appState.register('activitysim-baseline', {
        source: 'url',
        path: 'test/activitysim-baseline',
      })
      window.__wftdm!.appState.setStatus('activitysim-baseline', 'ready')
    })
    await expect(card.getByRole('alert')).not.toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'TAZ' })).toBeVisible()
  })
})
