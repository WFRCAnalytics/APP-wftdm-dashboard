import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 007-observable-plot-panel, extending
// dashboardShell.spec.ts's/tablePanel.spec.ts's/markdownPanel.spec.ts's
// pattern (real DuckDB-WASM, fixture Parquet, fixture dashboard-config).
// See quickstart.md and contracts/observable-plot-panel.md.
//
// Fixture shape (tests/fixtures/dashboard-config/dashboard-1-summary.yaml's
// row_observable_plot):
// - "Observable Plot Mode Share (Bar)": mark: barY, no inputs:, reactive to
//   $filters.purpose — US1's primary vehicle.
// - "Trip Length Frequency Distribution": mark: lineY, a select-type
//   input (mode_select) mixed with $filters.purpose.
// - "Observable Plot Mode Share (Multiselect Filter)": mark: barY, a
//   multiselect-type input — deliberately reuses input id "mode_select"
//   from the panel above, for cross-panel-isolation-under-collision
//   coverage.
// - "Trip Length by Distance Bin (Range Filter)": mark: barY, a
//   range-type input with an out-of-bounds default: "99" (real domain is
//   [1, 5]) — exercises native clamping.
// - "Mode Share (Mismatched Default, intentional)": a select input whose
//   default ("Bike") matches no row — legitimately empty on load.
// - "Observable Plot Broken Panel (intentional)": metric no scenario
//   publishes — error state.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

function expandTrigger(page: Page, title: string) {
  return page.getByRole('button', { name: `Expand ${title}` })
}

async function queryCountFor(page: Page, needle: string) {
  return page.evaluate(
    (n) => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes(n)).length,
    needle,
  )
}

test.describe('User Story 1 - Author renders a metric as a reactive Observable Plot chart', () => {
  test('barY marks match a direct query against the same fixture data', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Observable Plot Mode Share (Bar)')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible()

    const rows = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT * FROM good_scenario__trip_mode_share`,
      ),
    )
    expect(rows.length).toBeGreaterThan(0)

    // One <rect> per rendered bar mark — proves the chart drew one mark
    // per row the direct query returned, not a placeholder/stale count.
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).toHaveCount(rows.length)
  })

  test('lineY renders real line-mark DOM elements — a second, structurally different mark type', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Trip Length Frequency Distribution')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible()
    // lineY marks render as <path> elements, not <rect> — a genuinely
    // different DOM shape than barY's, proving resolveObservablePlotEncoding
    // + Plot[markName] dispatch both resolve correctly for a second mark.
    await expect(card.locator('.observable-plot-chart svg[viewBox] path')).not.toHaveCount(0)
  })

  // Real hover bug found post-implementation (not caught by any prior
  // test — every existing assertion checked that a chart rendered, never
  // that hovering it actually produced a visible tooltip with real
  // content): the fixture never set tip: true on any panel, so no tip
  // ever rendered at all; separately, @observablehq/plot's tip: true
  // shorthand resolves to "xy" (2D) pointer mode for every mark
  // regardless of shape, which creates "dead spots" on bar marks per
  // Plot's own documented caveat — resolved by resolving barY to "x"
  // pointer mode internally (observablePlotEncoding.ts's resolveTipMode).
  test('hovering a barY mark shows a visible tip with the correct data', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Observable Plot Mode Share (Bar)')
    const bar = card.locator('.observable-plot-chart svg[viewBox] rect').first()
    await expect(bar).toBeVisible()

    const tip = card.locator('.observable-plot-chart svg[viewBox] g[aria-label="tip"]')
    // Empty (present-but-childless) before any hover — proves the
    // assertion below is actually detecting a real state change, not a
    // tip that was always populated regardless of hover.
    await expect(tip).toBeEmpty()

    await bar.hover()
    await expect(tip).not.toBeEmpty()
    // Real content — the fixture's own trip_mode_share columns
    // (purpose/mode/share), not just "some text appeared".
    await expect(tip).toContainText('mode')
    await expect(tip).toContainText('share')
    await expect(tip).toContainText('purpose')
  })

  test('hovering a lineY mark shows a visible tip with the correct data', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Trip Length Frequency Distribution')
    // The first <path> in document order is an axis-tick mark, not the
    // data line (both render as bare <path> elements) — the actual data
    // line is the one carrying its own `stroke` attribute.
    const dataLine = card.locator('.observable-plot-chart svg[viewBox] path[stroke]').first()
    await expect(dataLine).toBeVisible()

    const tip = card.locator('.observable-plot-chart svg[viewBox] g[aria-label="tip"]')
    await expect(tip).toBeEmpty()

    // force: true — grid:true's own gridlines (a real, harmless z-order
    // overlap, not a bug) can sit exactly at the hover point and would
    // otherwise fail Playwright's actionability check; Plot's own pointer
    // interaction listens at the SVG level regardless.
    await dataLine.hover({ force: true })
    await expect(tip).not.toBeEmpty()
    await expect(tip).toContainText('purpose')
    await expect(tip).toContainText('distance_bin')
    await expect(tip).toContainText('trips')
  })

  // A second real visual bug found post-implementation, same category as
  // the tip bug above: docs/GRAMMAR.md documents no legend: key at all
  // for this panel type, and @observablehq/plot's color: {legend: true}
  // (confirmed a top-level Plot.plot() option) is NOT automatic — a
  // fill/stroke channel with no explicit legend option shows no legend.
  // observablePlotEncoding.ts now defaults to showing one whenever fill
  // or stroke is set, matching PlotlyPanel's own auto-legend behavior.
  // Plot's legend swatch container class carries a per-render hash
  // suffix (e.g. "plot-d6a7b5-swatches") — never literal-matched here.
  test('a fill-encoded barY chart shows a visible legend with the real category labels', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Observable Plot Mode Share (Bar)')
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)

    const legend = card.locator('.observable-plot-chart [class*="-swatches"]')
    await expect(legend).toBeVisible()
    // Real category labels from trip_mode_share.mode, not just "some
    // legend-shaped element appeared".
    await expect(legend).toContainText('SOV')
    await expect(legend).toContainText('HOV')
    await expect(legend).toContainText('Transit')
    await expect(legend).toContainText('Non-Motorized')
  })

  test('a stroke-encoded lineY chart shows a visible legend with the real category labels', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Trip Length Frequency Distribution')
    await expect(card.locator('.observable-plot-chart svg[viewBox] path[stroke]')).not.toHaveCount(0)

    const legend = card.locator('.observable-plot-chart [class*="-swatches"]')
    await expect(legend).toBeVisible()
    // Real category labels from trip_destination_dist.purpose.
    await expect(legend).toContainText('HBW')
    await expect(legend).toContainText('NHB')
  })

  test('a chart with no fill/stroke channel shows no legend', async ({ page }) => {
    await boot(page)
    // "Trip Length by Distance Bin (Range Filter)" — mark: barY, x: mode,
    // y: trips, no fill/stroke at all — the negative case, proving the
    // legend default is conditional, not unconditionally on for every
    // observable-plot panel.
    const card = panelCard(page, 'Trip Length by Distance Bin (Range Filter)')
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
    await expect(card.locator('.observable-plot-chart [class*="-swatches"]')).toHaveCount(0)
  })

  test('changing the global purpose filter re-queries/re-renders only panels bound to it', async ({
    page,
  }) => {
    await boot(page)
    const barCard = panelCard(page, 'Observable Plot Mode Share (Bar)')
    await expect(barCard.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)

    // A panel with NO filter: binding at all — must stay exactly as it
    // was, proving the filter change doesn't over-trigger unrelated panels.
    await expect(page.getByText('Total Households')).toBeVisible()
    const totalHouseholdsBefore = await page.getByText('1,500').count()

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NONEXISTENT'))
    await expect(barCard.getByText('No data for this selection')).toBeVisible()

    const totalHouseholdsAfter = await page.getByText('1,500').count()
    expect(totalHouseholdsAfter).toBe(totalHouseholdsBefore)

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
    await expect(barCard.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
  })

  test('004 expand/collapse renders correctly proportioned and issues zero additional query', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Observable Plot Mode Share (Bar)')
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)

    const inlineBox = await card.locator('.observable-plot-chart svg[viewBox]').first().boundingBox()

    const before = await queryCountFor(page, 'trip_mode_share')
    expect(before).toBeGreaterThan(0)

    await expandTrigger(page, 'Observable Plot Mode Share (Bar)').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)

    const dialogBox = await dialog.locator('.observable-plot-chart svg[viewBox]').first().boundingBox()
    // The dialog's own chart is measurably larger than the inline card's
    // — proves it actually re-rendered at the dialog's size, not still
    // stretched/clipped at the small card's dimensions.
    expect(dialogBox!.width).toBeGreaterThan(inlineBox!.width)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)

    const after = await queryCountFor(page, 'trip_mode_share')
    expect(after).toBe(before)
  })

  test('a zero-row query renders PanelEmptyState; a rejected query renders PanelErrorState', async ({
    page,
  }) => {
    await boot(page)
    await expect(
      panelCard(page, 'Mode Share (Mismatched Default, intentional)').getByText(
        'No data for this selection',
      ),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Observable Plot Broken Panel (intentional)').getByText(
        "Couldn't load this chart",
      ),
    ).toBeVisible()
  })
})

async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check).toBe(true)
}

test.describe('User Story 2 - Author adds panel-local reactive input controls', () => {
  test('a select input uses its default before interaction; changing it re-queries with the new value', async ({
    page,
  }) => {
    await boot(page)
    const initialContainsDefault = await page.evaluate(() =>
      window.__wftdm!
        .__debugQueryLog()
        .filter((sql) => sql.includes('trip_destination_dist'))
        .some((sql) => sql.includes(`"mode" = 'SOV'`)),
    )
    expect(initialContainsDefault).toBe(true)

    const card = panelCard(page, 'Trip Length Frequency Distribution')
    await card.getByLabel('Mode', { exact: true }).selectOption('Transit')

    await trueEventually(() =>
      page.evaluate(() =>
        window.__wftdm!
          .__debugQueryLog()
          .filter((sql) => sql.includes('trip_destination_dist'))
          .some((sql) => sql.includes(`"mode" = 'Transit'`)),
      ),
    )
  })

  test('a multiselect input with multiple values selected includes rows matching any of them', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Observable Plot Mode Share (Multiselect Filter)')
    const select = card.getByLabel('Mode', { exact: true })
    // The distinctValues() options fetch is async — wait for all four real
    // mode values to be rendered as <option>s before selecting, rather
    // than racing it (same reasoning as the options-list test below).
    await expect.poll(() => select.locator('option').count()).toBe(4)
    await select.selectOption(['SOV', 'HOV'])

    // e.target.selectedOptions (and so the substituted IN (...) list)
    // reflects DOCUMENT order, not selection order — distinctValues()
    // returns options alphabetically (ORDER BY column), so the real SQL
    // is "mode" IN ('HOV','SOV'), not ('SOV','HOV'). Assert both values
    // appear inside one IN (...) clause rather than a fixed order.
    await trueEventually(() =>
      page.evaluate(() =>
        window.__wftdm!
          .__debugQueryLog()
          .filter((sql) => sql.includes('trip_mode_share'))
          .some((sql) => {
            const match = sql.match(/"mode" IN \(([^)]*)\)/)
            if (!match) return false
            const values = match[1].split(',').map((v) => v.trim())
            return values.includes(`'SOV'`) && values.includes(`'HOV'`) && values.length === 2
          }),
      ),
    )
    // The chart itself still renders (a real, non-empty result) — proves
    // the IN (...) query actually matched rows, not just that the right
    // SQL text was issued.
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
  })

  test('changing one panel\'s input never affects a sibling panel sharing the same input id, or the global filter store', async ({
    page,
  }) => {
    await boot(page)
    const tlfdCard = panelCard(page, 'Trip Length Frequency Distribution')
    const multiselectCard = panelCard(page, 'Observable Plot Mode Share (Multiselect Filter)')

    const multiselectQueryCountBefore = await queryCountFor(page, 'trip_mode_share')
    const globalFiltersBefore = await page.evaluate(() => window.__wftdm!.filterState.getAll())

    // Both panels declare an input with id "mode_select" (deliberately,
    // per the fixture) — changing the TLFD panel's must not touch the
    // multiselect panel's own chart, its own control's value, or the
    // global filter store.
    await tlfdCard.getByLabel('Mode', { exact: true }).selectOption('Transit')
    await trueEventually(() =>
      page.evaluate(() =>
        window.__wftdm!
          .__debugQueryLog()
          .filter((sql) => sql.includes('trip_destination_dist'))
          .some((sql) => sql.includes(`"mode" = 'Transit'`)),
      ),
    )

    const multiselectQueryCountAfter = await queryCountFor(page, 'trip_mode_share')
    expect(multiselectQueryCountAfter).toBe(multiselectQueryCountBefore)

    const multiselectSelectedValues = await multiselectCard.getByLabel('Mode', { exact: true }).inputValue()
    expect(multiselectSelectedValues).toBe('SOV') // still its own default, untouched

    const globalFiltersAfter = await page.evaluate(() => window.__wftdm!.filterState.getAll())
    expect(globalFiltersAfter).toEqual(globalFiltersBefore)
  })

  test('a non-default input value survives a 004 expand/collapse cycle with no extra query', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Trip Length Frequency Distribution')
    await card.getByLabel('Mode', { exact: true }).selectOption('Transit')
    await trueEventually(() =>
      page.evaluate(() =>
        window.__wftdm!
          .__debugQueryLog()
          .filter((sql) => sql.includes('trip_destination_dist'))
          .some((sql) => sql.includes(`"mode" = 'Transit'`)),
      ),
    )

    const before = await queryCountFor(page, 'trip_destination_dist')

    await expandTrigger(page, 'Trip Length Frequency Distribution').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Mode', { exact: true })).toHaveValue('Transit')

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(card.getByLabel('Mode', { exact: true })).toHaveValue('Transit')

    const after = await queryCountFor(page, 'trip_destination_dist')
    expect(after).toBe(before)
  })

  test("a select/multiselect input's fetched option list is unaffected by its own current value", async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Trip Length Frequency Distribution')
    const select = card.getByLabel('Mode', { exact: true })
    // The distinctValues() options fetch is async (its own effect, separate
    // from the panel's own data query) — wait for it to actually resolve
    // before reading option text, rather than racing it.
    await expect.poll(() => select.locator('option').count()).toBe(2)

    // Both real mode values from trip_destination_dist must be selectable
    // regardless of which one is currently chosen — proves the options
    // query is genuinely unfiltered by this input's own current value
    // (research.md §9).
    const optionValues = await select.locator('option').allTextContents()
    expect(optionValues.sort()).toEqual(['SOV', 'Transit'])

    await select.selectOption('Transit')
    const optionValuesAfter = await select.locator('option').allTextContents()
    expect(optionValuesAfter.sort()).toEqual(['SOV', 'Transit'])
  })

  test('mismatched defaults: a select input empties out via PanelEmptyState but still shows its actual value; a range input is clamped', async ({
    page,
  }) => {
    await boot(page)
    const mismatchCard = panelCard(page, 'Mode Share (Mismatched Default, intentional)')
    await expect(mismatchCard.getByText('No data for this selection')).toBeVisible()
    // The control still visibly shows "Bike" — not silently falling back
    // to whichever <option> the browser picks (research.md §9).
    await expect(mismatchCard.getByLabel('Mode', { exact: true })).toHaveValue('Bike')
    await expect(mismatchCard.getByLabel('Mode', { exact: true }).locator('option[value="Bike"]')).toHaveCount(1)

    const rangeCard = panelCard(page, 'Trip Length by Distance Bin (Range Filter)')
    const rangeInput = rangeCard.getByLabel('Distance Bin', { exact: true })
    // Clamped to the column's real max (5), not left at the configured
    // out-of-range default ("99") — no crash, no empty state.
    await expect(rangeInput).toHaveValue('5')
    await expect(rangeCard.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
  })

  test('the render-and-swap effect rebuilds exactly once per state, not twice, despite ResizeObserver\'s guaranteed initial callback', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Observable Plot Mode Share (Bar)')
    const container = card.locator('.observable-plot-chart')
    await expect(container.locator('svg rect')).not.toHaveCount(0)

    // Give the guaranteed-but-should-be-a-no-op initial ResizeObserver
    // callback time to fire, then confirm it didn't cause a second rebuild.
    await page.waitForTimeout(300)
    await expect(container).toHaveAttribute('data-render-count', '1')
  })
})

test.describe('User Story 3 - Panel behaves consistently with the rest of the registry', () => {
  test('a tab mixing observable-plot with valuebox/plotly/table/markdown panels renders all of them without error', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.getByText('Total Households')).toBeVisible() // valuebox
    await expect(page.getByText('Mode Share by Purpose', { exact: true })).toBeVisible() // plotly
    await expect(panelCard(page, 'Screenline Validation').locator('table')).toBeVisible() // table
    await expect(
      panelCard(page, 'Methodology Notes').getByRole('heading', { name: 'Highway Assignment Validation' }),
    ).toBeVisible() // markdown

    const observableCard = panelCard(page, 'Observable Plot Mode Share (Bar)')
    await expect(observableCard.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
    await expect(expandTrigger(page, 'Observable Plot Mode Share (Bar)')).toBeVisible()
  })

  test('an observable-plot panel uses the same inline loading skeleton convention as PlotlyPanel/ValueBoxPanel, not a new shared component', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Observable Plot Mode Share (Bar)')
    // Same convention panelExpand.spec.ts already asserts for other panel
    // types (research.md §7): once ready, no loading skeleton remains —
    // this panel type shares the identical `animate-pulse` markup/CSS
    // class, not a distinct loading component of its own.
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
    await expect(card.locator('.animate-pulse')).toHaveCount(0)
  })
})
