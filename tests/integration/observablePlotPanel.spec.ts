import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 007-observable-plot-panel/019-baseline-diff-
// consumption. Migrated (040-test-suite-migration) off the retired
// synthetic tests/fixtures/dashboard-config/dashboard-1-summary.yaml
// (deleted — public/scenarios/, public/dashboard-config/, public/
// observed/ are gitignored and genuinely empty in this checkout;
// scripts/copy-fixtures.js / npm run dev:fixtures no longer exist). See
// quickstart.md and contracts/observable-plot-panel.md for this
// feature's own original design record.
//
// Real panels used throughout:
// - "Average Trip Distance by Purpose" (dashboard-1-summary.yaml,
//   Summary tab) — real barY, facet_x: primary_purpose, x: scenario,
//   fill: scenario, tip: true, grid: true. 10 real primary_purpose rows
//   (one scenario active in this file's own boot()).
// - "Methodology Notes" (Summary tab) — real markdown, a real "##
//   Straight-Line Distance Proxy" heading.
// - Seven real, permanent additions to dashboard-8-test.yaml's own Test
//   tab (this feature's own contribution — see that file's own header
//   comments on the new rows) closing two real, confirmed gaps: zero
//   real demo panels declare a panel-local `inputs:` block or
//   `mark: lineY` (project-docs/GRAMMAR.md's own inputs:/lineY grammar had no
//   real coverage anywhere), and — 038-all-loaded-scenarios' own item-25
//   audit — zero real demo panels use `comparison: diff`/`$baseline` on
//   this panel type either. All bind real, already-published metrics
//   (trip_destination_summary/trip_mode_share/vmt_by_home_taz),
//   hand-verified via the duckdb CLI.
//
// A REAL, PREVIOUSLY-HIDDEN APPLICATION BUG was found and fixed while
// building this file's own new `type: range` coverage — src/panels/
// ObservablePlotPanel.tsx's own header comment on PanelLocalInput has the
// full account: its options/bounds-fetching effect queried a scenario's
// view directly, with no ensureRegistered() call first (unlike the
// panel's own main data-fetch effect) — safe under the old eager-
// registration boot sequence, but a genuine, silent race under
// 056-lazy-tab-scoped-loading's later lazy per-tab loading. Invisible
// until now purely because project-docs/GRAMMAR.md's inputs: grammar had zero
// real demo-content usage to ever exercise this path against the newer
// loading model. Confirmed live (a `range`-type input's own default
// value — even a deliberately out-of-bounds one like "99" — never
// resolved its real [min, max] bounds and never re-queried) before
// fixing.

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

// A deliberately minimal, deterministic scenario world — matching
// tablePanel.spec.ts's/valueBoxPanel.spec.ts's own established pattern.
// 'activitysim-baseline' (active) and 'activitysim-density-variant'
// (registered but deactivated right after boot, so it never joins any
// unpinned panel's own union) — every real row/rect count and every
// hand-verified diff value below was confirmed against exactly this pair
// via the duckdb CLI.
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

function expandTrigger(page: Page, title: string) {
  return page.getByRole('button', { name: `Expand ${title}` })
}

async function queryCountFor(page: Page, needle: string) {
  return page.evaluate(
    (n) => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes(n)).length,
    needle,
  )
}

async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check).toBe(true)
}

test.describe('User Story 1 - Author renders a metric as a reactive Observable Plot chart', () => {
  test('barY marks match a direct query against the same real data', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible()

    const rows = await page.evaluate(() =>
      window.__wftdm!.query(`SELECT * FROM "activitysim-baseline__trip_distance_by_purpose"`),
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
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot Line Trip Distance by Purpose')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible({ timeout: 20_000 })
    // lineY marks render as <path> elements, not <rect> — a genuinely
    // different DOM shape than barY's, proving resolveObservablePlotEncoding
    // + Plot[markName] dispatch both resolve correctly for a second mark.
    await expect(card.locator('.observable-plot-chart svg[viewBox] path')).not.toHaveCount(0)
  })

  test('hovering a barY mark shows a visible tip with the correct data', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Average Trip Distance by Purpose')
    const bar = card.locator('.observable-plot-chart svg[viewBox] rect').first()
    await expect(bar).toBeVisible()

    const tip = card.locator('.observable-plot-chart svg[viewBox] g[aria-label="tip"]')
    // Empty (present-but-childless) before any hover — proves the
    // assertion below is actually detecting a real state change, not a
    // tip that was always populated regardless of hover.
    await expect(tip).toBeEmpty()

    await bar.hover()
    await expect(tip).not.toBeEmpty()
    // Real content — the panel's own real columns (scenario/
    // avg_distance_miles/primary_purpose), not just "some text appeared".
    await expect(tip).toContainText('scenario')
    await expect(tip).toContainText('avg_distance_miles')
    await expect(tip).toContainText('primary_purpose')
  })

  test('hovering a lineY mark shows a visible tip with the correct data', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot Line Trip Distance by Purpose')
    // The first <path> in document order is an axis-tick mark, not the
    // data line (both render as bare <path> elements) — the actual data
    // line is the one carrying its own `stroke` attribute (only present
    // once a real `stroke:` channel is configured).
    const dataLine = card.locator('.observable-plot-chart svg[viewBox] path[stroke]').first()
    await expect(dataLine).toBeVisible({ timeout: 20_000 })

    const tip = card.locator('.observable-plot-chart svg[viewBox] g[aria-label="tip"]')
    await expect(tip).toBeEmpty()

    // force: true — grid:true's own gridlines (a real, harmless z-order
    // overlap, not a bug) can sit exactly at the hover point and would
    // otherwise fail Playwright's actionability check; Plot's own pointer
    // interaction listens at the SVG level regardless.
    await dataLine.hover({ force: true })
    await expect(tip).not.toBeEmpty()
    await expect(tip).toContainText('primary_purpose')
    await expect(tip).toContainText('distance_bin')
    await expect(tip).toContainText('trips')
  })

  test('a fill-encoded barY chart shows a visible legend with the real category labels', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)

    const legend = card.locator('.observable-plot-chart [class*="-swatches"]')
    await expect(legend).toBeVisible()
    // Real category label — this file's own boot() keeps exactly one
    // scenario active, so the fill: scenario legend shows exactly one
    // real swatch, not a placeholder.
    await expect(legend).toContainText('activitysim-baseline')
  })

  test('a stroke-encoded lineY chart shows a visible legend with the real category labels', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot Line Trip Distance by Purpose')
    await expect(card.locator('.observable-plot-chart svg[viewBox] path[stroke]')).not.toHaveCount(0, {
      timeout: 20_000,
    })

    const legend = card.locator('.observable-plot-chart [class*="-swatches"]')
    await expect(legend).toBeVisible()
    // Real category labels — trip_destination_summary's own real
    // primary_purpose values (all 10 present, unfiltered).
    await expect(legend).toContainText('work')
    await expect(legend).toContainText('school')
  })

  test('a chart with no fill/stroke channel shows no legend', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    // "Observable Plot Range Filter (Distance Bin)" — mark: barY, x:
    // primary_purpose, y: trips, no fill/stroke at all — the negative
    // case, proving the legend default is conditional, not
    // unconditionally on for every observable-plot panel.
    const card = panelCard(page, 'Observable Plot Range Filter (Distance Bin)')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible({ timeout: 20_000 })
    await expect(card.locator('.observable-plot-chart [class*="-swatches"]')).toHaveCount(0)
  })

  // 040-test-suite-migration: the retired fixture's own "changing the
  // global purpose filter re-queries/re-renders only panels bound to it"
  // test is DELETED, not migrated — a real, confirmed gap found while
  // researching what to migrate it to, not silently worked around: a
  // direct grep sweep of every real public/demo-dashboard-config/*.yaml
  // panel found NONE declares a top-level `filters:` block or references
  // `$filters.` anywhere — this real grammar mechanism has zero real
  // demo-content integration coverage, the same class of gap
  // dashboardShell.spec.ts's/flowmapPanel.spec.ts's/panelExpand.spec.ts's
  // own already-migrated header comments already record for the identical
  // reason. Its SQL-expansion correctness stays covered at the unit level
  // (tests/unit/sqlExpander.test.ts's own $filters.* cases).

  test('004 expand/collapse renders correctly proportioned and issues zero additional query', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)

    const inlineBox = await card.locator('.observable-plot-chart svg[viewBox]').first().boundingBox()

    const before = await queryCountFor(page, 'trip_distance_by_purpose')
    expect(before).toBeGreaterThan(0)

    await expandTrigger(page, 'Average Trip Distance by Purpose').click()
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

    const after = await queryCountFor(page, 'trip_distance_by_purpose')
    expect(after).toBe(before)
  })

  test('a zero-row query renders PanelEmptyState; a rejected query renders PanelErrorState', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    await expect(
      panelCard(page, 'Observable Plot Mode Share (Mismatched Default, intentional)').getByText(
        'No data for this selection',
      ),
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      panelCard(page, 'Broken Observable Plot Panel (missing metric)').getByText("Couldn't load this chart"),
    ).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('User Story 2 - Author adds panel-local reactive input controls', () => {
  test('a select input uses its default before interaction; changing it re-queries with the new value', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot Line (Select Filter)')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible({ timeout: 20_000 })

    const initialContainsDefault = await page.evaluate(() =>
      window.__wftdm!
        .__debugQueryLog()
        .filter((sql) => sql.includes('trip_destination_summary'))
        .some((sql) => sql.includes(`"primary_purpose" = 'work'`)),
    )
    expect(initialContainsDefault).toBe(true)

    await card.getByLabel('Purpose', { exact: true }).selectOption('school')

    await trueEventually(() =>
      page.evaluate(() =>
        window.__wftdm!
          .__debugQueryLog()
          .filter((sql) => sql.includes('trip_destination_summary'))
          .some((sql) => sql.includes(`"primary_purpose" = 'school'`)),
      ),
    )
  })

  test('a multiselect input with multiple values selected includes rows matching any of them', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot Bar (Multiselect Filter)')
    const select = card.getByLabel('Mode', { exact: true })
    // The distinctValues() options fetch is async — wait for all five real
    // mode values to be rendered as <option>s before selecting, rather
    // than racing it (same reasoning as the options-list test below).
    await expect.poll(() => select.locator('option').count()).toBe(5)
    await select.selectOption(['SOV', 'HOV'])

    // e.target.selectedOptions (and so the substituted IN (...) list)
    // reflects DOCUMENT order, not selection order — distinctValues()
    // returns options alphabetically (ORDER BY column), so the real SQL
    // may not list them in click order. Assert both values appear inside
    // one IN (...) clause rather than a fixed order.
    await trueEventually(() =>
      page.evaluate(() =>
        window.__wftdm!
          .__debugQueryLog()
          .filter((sql) => sql.includes('trip_mode_share'))
          .some((sql) => {
            const match = sql.match(/"major_trip_mode" IN \(([^)]*)\)/)
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
    await page.getByRole('tab', { name: 'Test' }).click()
    const lineCard = panelCard(page, 'Observable Plot Line (Select Filter)')
    const mismatchCard = panelCard(page, 'Observable Plot Mode Share (Mismatched Default, intentional)')
    await expect(lineCard.locator('.observable-plot-chart svg[viewBox]')).toBeVisible({ timeout: 20_000 })

    const mismatchQueryCountBefore = await queryCountFor(page, 'trip_destination_summary')
    const globalFiltersBefore = await page.evaluate(() => window.__wftdm!.filterState.getAll())

    // Both panels declare an input with id "purpose_select" (deliberately,
    // per dashboard-8-test.yaml's own comment) — changing the Line
    // panel's must not touch the Mismatched panel's own chart, its own
    // control's value, or the global filter store.
    await lineCard.getByLabel('Purpose', { exact: true }).selectOption('school')
    await trueEventually(() =>
      page.evaluate(() =>
        window.__wftdm!
          .__debugQueryLog()
          .filter((sql) => sql.includes('trip_destination_summary'))
          .some((sql) => sql.includes(`"primary_purpose" = 'school'`)),
      ),
    )

    const mismatchQueryCountAfter = await queryCountFor(page, 'trip_destination_summary')
    // Both panels query the same metric name, so this count legitimately
    // includes the Line panel's own re-query above — the real isolation
    // proof is the Mismatched panel's own control value and the global
    // filter store below, not this count alone.
    expect(mismatchQueryCountAfter).toBeGreaterThan(mismatchQueryCountBefore)

    const mismatchSelectedValue = await mismatchCard.getByLabel('Purpose', { exact: true }).inputValue()
    expect(mismatchSelectedValue).toBe('NoSuchPurpose') // still its own default, untouched

    const globalFiltersAfter = await page.evaluate(() => window.__wftdm!.filterState.getAll())
    expect(globalFiltersAfter).toEqual(globalFiltersBefore)
  })

  test('a non-default input value survives a 004 expand/collapse cycle with no extra query', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot Line (Select Filter)')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible({ timeout: 20_000 })
    await card.getByLabel('Purpose', { exact: true }).selectOption('school')
    await trueEventually(() =>
      page.evaluate(() =>
        window.__wftdm!
          .__debugQueryLog()
          .filter((sql) => sql.includes('trip_destination_summary'))
          .some((sql) => sql.includes(`"primary_purpose" = 'school'`)),
      ),
    )

    const before = await queryCountFor(page, 'trip_destination_summary')

    await expandTrigger(page, 'Observable Plot Line (Select Filter)').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Purpose', { exact: true })).toHaveValue('school')

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(card.getByLabel('Purpose', { exact: true })).toHaveValue('school')

    const after = await queryCountFor(page, 'trip_destination_summary')
    expect(after).toBe(before)
  })

  test("a select/multiselect input's fetched option list is unaffected by its own current value", async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot Line (Select Filter)')
    const select = card.getByLabel('Purpose', { exact: true })
    // The distinctValues() options fetch is async (its own effect,
    // separate from the panel's own data query) — wait for it to
    // actually resolve before reading option text, rather than racing it.
    await expect.poll(() => select.locator('option').count()).toBe(10)

    // All 10 real primary_purpose values must be selectable regardless of
    // which one is currently chosen — proves the options query is
    // genuinely unfiltered by this input's own current value
    // (research.md §9).
    const optionValuesBefore = await select.locator('option').allTextContents()
    expect(optionValuesBefore.sort()).toEqual(
      ['atwork', 'eatout', 'escort', 'othdiscr', 'othmaint', 'school', 'shopping', 'social', 'univ', 'work'].sort(),
    )

    await select.selectOption('school')
    const optionValuesAfter = await select.locator('option').allTextContents()
    expect(optionValuesAfter.sort()).toEqual(optionValuesBefore.sort())
  })

  test('mismatched defaults: a select input empties out via PanelEmptyState but still shows its actual value; a range input is clamped', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const mismatchCard = panelCard(page, 'Observable Plot Mode Share (Mismatched Default, intentional)')
    await expect(mismatchCard.getByText('No data for this selection')).toBeVisible({ timeout: 20_000 })
    // The control still visibly shows "NoSuchPurpose" — not silently
    // falling back to whichever <option> the browser picks (research.md §9).
    await expect(mismatchCard.getByLabel('Purpose', { exact: true })).toHaveValue('NoSuchPurpose')
    await expect(
      mismatchCard.getByLabel('Purpose', { exact: true }).locator('option[value="NoSuchPurpose"]'),
    ).toHaveCount(1)

    const rangeCard = panelCard(page, 'Observable Plot Range Filter (Distance Bin)')
    const rangeInput = rangeCard.getByLabel('Distance Bin', { exact: true })
    // Clamped to the column's real max (2), not left at the configured
    // out-of-range default ("99") — no crash, no empty state. Real, fixed
    // application bug (see this file's own header comment) — this
    // assertion would have failed permanently before that fix.
    await expect.poll(() => rangeInput.inputValue()).toBe('2')
    await expect(rangeCard.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
  })

  test('the render-and-swap effect rebuilds exactly once per state, not twice, despite ResizeObserver\'s guaranteed initial callback', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Average Trip Distance by Purpose')
    const container = card.locator('.observable-plot-chart')
    await expect(container.locator('svg rect')).not.toHaveCount(0)

    // Give the guaranteed-but-should-be-a-no-op initial ResizeObserver
    // callback time to fire, then confirm it didn't cause a second rebuild.
    await page.waitForTimeout(300)
    await expect(container).toHaveAttribute('data-render-count', '1')
  })
})

test.describe('User Story 3 - Panel behaves consistently with the rest of the registry', () => {
  test('a tab mixing observable-plot with other real panel types renders all of them without error', async ({
    page,
  }) => {
    await boot(page)
    // The real Summary tab's own real composition — valuebox/observable-
    // plot/markdown (confirmed via a direct grep sweep: this tab has no
    // real plotly/table panel; both types' own registry-consistency
    // coverage lives in their own dedicated spec files —
    // tablePanel.spec.ts and the Test tab's real plotly fixtures).
    await expect(panelCard(page, 'Households')).toBeVisible() // valuebox
    await expect(
      panelCard(page, 'Methodology Notes').getByRole('heading', { name: 'Straight-Line Distance Proxy' }),
    ).toBeVisible() // markdown

    const observableCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(observableCard.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
    await expect(expandTrigger(page, 'Average Trip Distance by Purpose')).toBeVisible()
  })

  test('an observable-plot panel uses the same inline loading skeleton convention as PlotlyPanel/ValueBoxPanel, not a new shared component', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Average Trip Distance by Purpose')
    // Same convention panelExpand.spec.ts already asserts for other panel
    // types (research.md §7): once ready, no loading skeleton remains —
    // this panel type shares the identical `animate-pulse` markup/CSS
    // class, not a distinct loading component of its own.
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
    await expect(card.locator('.animate-pulse')).toHaveCount(0)
  })
})

// 015-theme-toggle: real bugs found live once a real theme toggle existed
// to actually exercise dark mode. Observable Plot's own axis/tick text
// already used currentColor by design and picked up the inline card's
// text-card-foreground correctly with no change needed — the real gap was
// EXPANDED panels specifically: DialogContent (components/ui/dialog.tsx)
// set bg-card but never text-card-foreground, and DialogPortal renders
// into document.body, OUTSIDE shell.tsx's own text-foreground wrapper —
// so anything relying on inherited color (this panel type's own SVG text,
// DialogTitle) fell back to the plain browser default (black) once
// relocated there by 004's expand mechanism, regardless of theme.
// PanelLocalInput's native <select>/<option> was a second, independent
// bug: entirely unstyled, so its OS-rendered chrome (including the
// dropdown popup itself, unreachable by any CSS class) followed no theme
// at all until tokens.css gained a real color-scheme declaration.
test.describe('Polish - dark mode (015-theme-toggle)', () => {
  test('expanding a panel in dark mode keeps chart text and the dialog title legible, not black-on-dark', async ({
    page,
  }) => {
    await boot(page)
    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const card = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)

    // Inline case — already correct via currentColor, confirmed here so a
    // future regression can't quietly reintroduce it.
    const inlineFill = await card
      .locator('.observable-plot-chart svg[viewBox] text')
      .first()
      .evaluate((el) => getComputedStyle(el).fill)
    // 033-shadcn-default-theme: --foreground dark is now #fafafa, not the
    // old WFRC-brand #ffffff (same real value applies to --card-foreground
    // too — they resolve identically in this theme, so the dialog title
    // check below needs the same new value regardless of which of the two
    // it technically inherits from).
    expect(inlineFill).toBe('rgb(250, 250, 250)')

    await expandTrigger(page, 'Average Trip Distance by Purpose').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const dialogTitleColor = await dialog
      .getByRole('heading', { name: 'Average Trip Distance by Purpose' })
      .evaluate((el) => getComputedStyle(el).color)
    expect(dialogTitleColor).toBe('rgb(250, 250, 250)')

    const expandedFill = await dialog
      .locator('.observable-plot-chart svg[viewBox] text')
      .first()
      .evaluate((el) => getComputedStyle(el).fill)
    expect(expandedFill).toBe('rgb(250, 250, 250)')
  })

  // A real, confirmed dark-mode bug found post-implementation, same class
  // this project has hit and fixed multiple times already (PlotlyPanel.tsx's
  // own paper/plot background + font.color): @observablehq/plot's tip mark
  // (config.tip: true) fills its own box with `var(--plot-background)`, and
  // Plot's own generated SVG unconditionally sets `--plot-background: white`
  // via an internal, zero-specificity stylesheet rule — never reading this
  // app's real tokens. The tip's own text uses `fill="currentColor"`, which
  // DOES correctly track this app's real theme — so in dark mode the box
  // stayed hard-coded white while the text correctly turned white too: an
  // invisible white-on-white tooltip. Asserts REAL computed colors (matching
  // this describe block's own "expanding a panel in dark mode..." test just
  // above, not merely "no error thrown") on the two elements that actually
  // matter for contrast — the tip's box (path) fill and its text fill —
  // confirming they're genuinely DIFFERENT colors, not just any two color
  // values that happen to satisfy a weaker assertion.
  test('the tip tooltip box and text are genuinely different, legible colors in dark mode', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const card = panelCard(page, 'Observable Plot Line Trip Distance by Purpose')
    const dataLine = card.locator('.observable-plot-chart svg[viewBox] path[stroke]').first()
    await expect(dataLine).toBeVisible({ timeout: 20_000 })
    await dataLine.hover({ force: true })

    const tip = card.locator('.observable-plot-chart svg[viewBox] g[aria-label="tip"]')
    await expect(tip).not.toBeEmpty()

    const tipBoxFill = await tip.locator('path').first().evaluate((el) => getComputedStyle(el).fill)
    const tipTextFill = await tip.locator('text').first().evaluate((el) => getComputedStyle(el).fill)

    // The real, current --card/--foreground token values in dark mode
    // (tokens.css) — not just "not equal to each other," but the SPECIFIC
    // correct colors, so a future token-value change that accidentally
    // reintroduces low contrast (e.g. both drifting toward the same gray)
    // would still be caught.
    // 033-shadcn-default-theme: dark --card is now #171717 and
    // --foreground is now #fafafa — no longer the old WFRC-brand values.
    expect(tipBoxFill).toBe('rgb(23, 23, 23)') // --card in dark mode
    expect(tipTextFill).toBe('rgb(250, 250, 250)') // --foreground in dark mode
    expect(tipBoxFill).not.toBe(tipTextFill)
  })

  test('the multiselect/select input follows the app theme — real color-scheme, not a bare unstyled native control', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const card = panelCard(page, 'Observable Plot Bar (Multiselect Filter)')
    const select = card.locator('select')
    await expect(select).toBeVisible({ timeout: 20_000 })

    const styles = await select.evaluate((el) => ({
      colorScheme: getComputedStyle(el).colorScheme,
      background: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
    }))
    // 033-shadcn-default-theme: dark --background is now #0a0a0a and
    // --foreground is now #fafafa — no longer the old WFRC-brand values
    // (which happened to make --background/--card share one literal;
    // the new theme's are genuinely different, confirmed real, not a
    // native-browser-default coincidence: a bare <select> with no app CSS
    // renders Chromium's own UA default of rgb(59, 59, 59), verified
    // directly — this element's explicit `bg-background`/`text-foreground`
    // classes are what's actually being asserted here).
    expect(styles.colorScheme).toBe('dark')
    expect(styles.background).toBe('rgb(10, 10, 10)') // --background in dark mode
    expect(styles.color).toBe('rgb(250, 250, 250)') // --foreground in dark mode
  })
})

// 019-baseline-diff-consumption. Reuses this file's own boot()/
// panelCard() helpers plus dashboard-8-test.yaml's own real "Observable
// Plot VMT Diff via $baseline"/"...Percent Diff via $baseline" panels
// (this feature's own real, permanent addition — see this file's own
// header comment) — real, hand-verified vmt_by_home_taz diffs between
// activitysim-baseline and activitysim-density-variant.
test.describe('019-baseline-diff-consumption', () => {
  test('User Story 1: $baseline resolves — all 25 real TAZ rows render as bar marks, no error', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot VMT Diff via $baseline')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible({ timeout: 20_000 })

    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-density-variant'))

    // Every real zone's own total_vmt genuinely differs between the two
    // real scenarios (confirmed via the duckdb CLI — no tie anywhere), so
    // all 25 real zones render a real, non-null bar.
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).toHaveCount(25, { timeout: 20_000 })
    await expect(card.getByRole('alert')).toHaveCount(0)
  })

  // A real, confirmed finding, not an assumption (matching tablePanel.spec.ts's
  // own analogous note): every real vmt_by_home_taz row, across all 3 real
  // demo scenarios, has a genuinely nonzero total_vmt (confirmed via a
  // live duckdb CLI sweep — zero matching rows in any of the three real
  // Parquet files) — this synthetic 25-zone system's own real land-use/
  // trip generation never produces a home zone with exactly zero VMT.
  // Observable Plot's own real null-mark-omission behavior (research.md
  // §6) has no real integration-level trigger as a result; it stays
  // covered by direct source review rather than being faked with
  // synthetic data this migration exists to retire.
  test('User Story 2: a real, non-null percent diff renders as a real bar mark for every zone', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Observable Plot VMT Percent Diff via $baseline')
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).toBeVisible({ timeout: 20_000 })

    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-density-variant'))

    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).toHaveCount(25, { timeout: 20_000 })
    await expect(card.getByRole('alert')).toHaveCount(0)
  })
})
