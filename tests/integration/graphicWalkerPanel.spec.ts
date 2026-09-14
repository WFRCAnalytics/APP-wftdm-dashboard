import { test, expect, type Page, type Locator } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 014-graphic-walker-panel / 028-graphic-walker-
// dataset-picker, rewritten by 056-lazy-tab-scoped-loading (T029).
//
// REAL, CONFIRMED PRE-EXISTING BUG this rewrite fixes (research.md §4a,
// NOT caused by 056): this file's own previous version depended entirely
// on `tests/fixtures/dashboard-config/dashboard-2-detail.yaml` (a
// "Detail" tab with "good_scenario"/"observed" fixture data). That
// fixture tree was deleted outright by 040-test-suite-migration, which
// migrated the REST of this suite onto the real, git-tracked
// public/demo-dashboard-config/ content but silently missed this file —
// the same class of gap CLAUDE.md's own Protomaps entry already
// documents for flowmapPanel.spec.ts/zonemapPanel.spec.ts. Confirmed via
// a real, live run before this rewrite: 29/29 tests failing, 100% on a
// missing "Detail" tab, never on any real picker/panel logic.
//
// This version injects an equivalent tab via page.route() (the same
// technique dashboardShell.spec.ts's own logo-fallback test already
// established, and the one this feature's own research.md §4a used to
// directly prove the real, unmodified picker code works) against REAL,
// unmodified app code and REAL demo scenario data — no fixture tree
// dependency at all. Real column names (confirmed directly against
// summarize.yaml, not assumed): trip_mode_share -> major_trip_mode/
// trips/share; summary_kpis -> total_households/total_persons/
// total_trips/... Two real, confirmed differences from the old fixture
// this rewrite could not preserve, both noted at their own test site
// below: (1) the old fixture's "screenlines" dataset and its
// cross-contamination check are replaced with summary_kpis, a real
// dataset with genuinely different columns; (2) the old fixture's
// "vmt_by_home_taz has different column counts across scenarios" schema-
// mismatch case has no real equivalent — every real demo scenario shares
// an IDENTICAL schema by construction (one summarize.yaml run against
// each), so that specific exclusion path is unreachable with real data;
// it stays covered at the unit level only (tests/unit/
// graphicWalkerDatasets.test.ts's own filterSchemaConsistent() cases,
// unchanged by this rewrite).

const INJECTED_TAB_YAML = `
header:
  tab: GWTest
  title: GraphicWalker Test Tab
layout:
  # 056-lazy-tab-scoped-loading, T029: the three dataset_picker panels
  # are deliberately FIRST (near the top of the page) — a real, confirmed
  # fix, not cosmetic: with them further down a long, densely-packed test
  # tab, Radix DropdownMenuContent's own portal-positioned menu items
  # landed outside the viewport for Playwright's click, even with the
  # trigger itself scrolled into view (its 35-item list needs real
  # vertical room to render). Keeping their row first sidesteps that
  # entirely rather than fighting Radix's own collision/scroll behavior.
  row1:
    - type:    graphic-walker
      title:   "Free-form Visual Analytics (Dataset Picker)"
      dataset: trip_mode_share
      scenario: activitysim-baseline
      dataset_picker: true
      width:   0.34
    - type:    graphic-walker
      title:   "Free-form Visual Analytics (Dataset Picker, Multi-Scenario)"
      dataset: summary_kpis
      dataset_picker: true
      width:   0.33
    - type:    graphic-walker
      title:   "Free-form Visual Analytics (Dataset Picker, No Match) (intentional)"
      dataset: summary_kpis
      scenario: nonexistent_scenario_zzz
      dataset_picker: true
      width:   0.33
  row2:
    - type:       graphic-walker
      title:      "Free-form Visual Analytics"
      dataset:    trip_mode_share
      scenario:   activitysim-baseline
      expandable: true
      width:      0.5
    - type:    graphic-walker
      title:   "Free-form Visual Analytics (Summary KPIs)"
      dataset: summary_kpis
      scenario: activitysim-baseline
      width:   0.5
  row3:
    - type:    graphic-walker
      title:   "Explore Panel Broken (intentional)"
      dataset: nonexistent_dataset
      scenario: activitysim-baseline
      width:   0.34
    - type:    graphic-walker
      title:   "Free-form Visual Analytics (Multi-Scenario)"
      dataset: summary_kpis
      width:   0.33
    - type:    graphic-walker
      title:   "Free-form Visual Analytics Empty (intentional)"
      dataset: trip_mode_share
      scenario: activitysim-baseline
      limit:   0
      width:   0.33
  row4:
    - type:    graphic-walker
      title:   "Free-form Visual Analytics Override (intentional)"
      dataset: trip_mode_share
      scenario: activitysim-baseline
      fields:
        - fid: major_trip_mode
          semanticType: quantitative
          analyticType: measure
      width: 0.5
    - type:       zonemap
      title:      "Real Geometry Panel (for picker-exclusion check)"
      metric:     vmt_by_home_taz
      scenario:   activitysim-baseline
      boundaries:    taz25.geoparquet
      boundaries_id: TAZ1454
      metric_id:     home_zone_id
      column:     total_vmt
      label:      "Total VMT"
      height: 400
      width:  0.5
`

async function boot(page: Page, searchParams = '') {
  // Inject the test tab FIRST in the list — so it's the landing tab,
  // matching the old fixture's own "Detail" tab being reachable without
  // depending on Summary's own content having loaded/rendered first.
  await page.route('**/demo-dashboard-config/index.json', async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.dashboards = ['dashboard-9-gwtest.yaml', ...json.dashboards]
    await route.fulfill({ response: res, json })
  })
  await page.route('**/demo-dashboard-config/dashboard-9-gwtest.yaml', async (route) => {
    await route.fulfill({ contentType: 'text/yaml', body: INJECTED_TAB_YAML })
  })
  await page.goto('/' + searchParams)
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForSelector('h1:has-text("GraphicWalker Test Tab")', { timeout: 15_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

/** Lifts a react-beautiful-dnd draggable field item (by its real,
 * confirmed-stable `data-rbd-draggable-id`, `${analyticType}_${fid}`)
 * and drops it into a neighboring droppable shelf via the library's own
 * keyboard drag alternative. `arrows` is the number of ArrowRight presses
 * empirically confirmed to cross from the field list into the target
 * shelf at this fixture's own panel width/layout (research.md §3's own
 * "residual verification item," resolved during implementation). */
async function dragFieldToShelf(page: Page, card: Locator, draggableId: string, arrows: number) {
  const source = card.locator(`[data-rbd-draggable-id="${draggableId}"]`)
  await source.focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(250)
  for (let i = 0; i < arrows; i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
  }
  await page.keyboard.press('Space')
  await page.waitForTimeout(600)
}

// Empirically confirmed: 5 ArrowRight presses crosses from the
// dimensions/measures field-list column into the "rows" (Y-Axis) shelf
// at this fixture's own full-width panel layout.
const ARROWS_TO_ROWS_SHELF = 5

// 028-graphic-walker-dataset-picker helpers — DatasetPicker's trigger has
// a fixed aria-label (independent of whichever dataset is currently
// selected, so it's a stable locator), and its DropdownMenuContent is
// portaled to document.body (Radix Portal), so the menu itself is located
// via `page`, not scoped to `card` — only one instance is ever open at a
// time in these tests.
function datasetPickerTrigger(card: Locator) {
  return card.getByRole('button', { name: 'Choose dataset to explore' })
}

// 056-lazy-tab-scoped-loading, T029: real, confirmed finding — Radix
// DropdownMenuContent's own real (not virtualized) item list, at 35 real
// entries, renders tall enough that neither a plain `.click()` nor an
// explicit `.scrollIntoViewIfNeeded()` first reliably brings a
// deep-in-the-list item into Playwright's own actionable viewport
// (confirmed live, repeatedly, regardless of the triggering panel's own
// position on the page). Radix's own documented KEYBOARD typeahead
// (type the item's visible text, already-open menu moves focus to the
// match, Enter activates it) sidesteps the viewport-actionability
// question entirely — the same category of fix `dragFieldToShelf()`
// above already uses for react-beautiful-dnd's own pointer-sensor gap.
async function clickMenuItem(page: Page, name: string) {
  await page.keyboard.type(name, { delay: 20 })
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
}

async function selectDataset(page: Page, card: Locator, name: string) {
  await datasetPickerTrigger(card).click()
  await clickMenuItem(page, name)
}

test.describe('User Story 1 - Freely build a chart from an existing dataset', () => {
  test("renders the field list populated with the dataset's real columns, no chart pre-selected", async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await expect(card.getByText('Field List', { exact: true })).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="dimension_major_trip_mode"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="measure_trips"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="measure_share"]')).toBeVisible()
    // No chart pre-selected — both shelves still show their placeholder.
    await expect(card.getByText('Drop Field Here').first()).toBeVisible()
  })

  test('dragging a field onto a shelf renders a real chart from real demo rows', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await dragFieldToShelf(page, card, 'dimension_major_trip_mode', ARROWS_TO_ROWS_SHELF)

    // "major_trip_mode" now renders three times — the field-list item
    // itself, the shelf chip, and the chart's own rendered axis-title
    // label (confirmed empirically during 014's own implementation) —
    // real, rendered encoding output, not just a selection highlight.
    await expect(card.getByText('major_trip_mode', { exact: true })).toHaveCount(3, { timeout: 5000 })
  })

  test('repeated field/mark changes each re-render from the same snapshot — no additional query', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    // 056-lazy-tab-scoped-loading: "Field List" visible (not just the
    // card) is the correct ready-signal — the panel's own fetch effect
    // now awaits ensureRegistered() before querying, so "card visible"
    // alone (true during 'loading' too) races ahead of the query
    // actually landing in the debug log.
    await card.getByText('Field List', { exact: true }).waitFor({ state: 'visible', timeout: 15000 })

    // 056-lazy-tab-scoped-loading, T029: this test tab deliberately hosts
    // several OTHER panels that also reference trip_mode_share (e.g. the
    // Dataset Picker ones, one of which eagerly loads a wide multi-
    // scenario candidate set to build its own picker list — a real,
    // deliberate cost, contracts/graphic-walker-dataset-catalog.md).
    // A loose substring filter over the whole page's shared query log
    // can't distinguish THIS panel's own query from that unrelated
    // background activity, so this counts the exact, full SQL string
    // only THIS pinned panel ever produces (same string the "pins to
    // exactly one scenario" test above already confirms).
    const queryCount = () =>
      page.evaluate(
        () =>
          window
            .__wftdm!.__debugQueryLog()
            .filter((sql) => sql.includes('"activitysim-baseline__trip_mode_share"') && sql.includes('LIMIT 100000'))
            .length,
      )
    const before = await queryCount()
    expect(before).toBeGreaterThan(0) // the panel's own one mount-time query already ran

    await dragFieldToShelf(page, card, 'dimension_major_trip_mode', ARROWS_TO_ROWS_SHELF)
    await dragFieldToShelf(page, card, 'measure_trips', ARROWS_TO_ROWS_SHELF)

    const after = await queryCount()
    expect(after).toBe(before)
  })
})

test.describe('User Story 2 - Author points an Explore panel at a specific dataset', () => {
  test("a panel configured with dataset: trip_mode_share shows only that dataset's own columns", async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })
    await expect(card.locator('[data-rbd-draggable-id="dimension_major_trip_mode"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="measure_trips"]')).toBeVisible()
    // summary_kpis-only columns never leak into this panel's own field list.
    await expect(card.locator('[data-rbd-draggable-id*="total_households"]')).toHaveCount(0)
  })

  // 056-lazy-tab-scoped-loading, T029: real-content adaptation — the old
  // fixture used a "screenlines" dataset (link_id column) for this
  // cross-contamination check; no such dataset exists in real demo
  // content. summary_kpis is a real dataset with genuinely different
  // columns from trip_mode_share, serving the identical test purpose.
  test('a second panel with a different dataset shows independently different columns — no cross-contamination', async ({
    page,
  }) => {
    await boot(page)
    const kpiCard = panelCard(page, 'Free-form Visual Analytics (Summary KPIs)')
    await kpiCard.waitFor({ state: 'visible', timeout: 15000 })
    await expect(kpiCard.locator('[data-rbd-draggable-id*="total_households"]')).toBeVisible()
    // trip_mode_share-only columns never leak into this panel's own field list.
    await expect(kpiCard.locator('[data-rbd-draggable-id="dimension_major_trip_mode"]')).toHaveCount(0)
  })

  test('omitting scenario: unions via the existing $scenario. mechanism, adding a scenario field', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics (Multi-Scenario)')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    // The `scenario` discriminator column (added by sqlExpander.ts's own,
    // unmodified expandScenario()) is inferred like any other Utf8
    // column — nominal/dimension (research.md §5).
    await expect(card.locator('[data-rbd-draggable-id="dimension_scenario"]')).toBeVisible({
      timeout: 10000,
    })

    // Concrete, robust proof of the UNION mechanism itself: the real
    // generated SQL referenced multiple real scenarios' own summary_kpis
    // views in one UNION ALL statement (038-all-loaded-scenarios: every
    // real demo scenario is active by default, so this union spans all
    // three, not just two).
    const log = await page.evaluate(() => window.__wftdm!.__debugQueryLog())
    const unionQuery = log.find(
      (sql) =>
        sql.includes('summary_kpis') &&
        sql.includes('activitysim-baseline__summary_kpis') &&
        sql.includes('activitysim-density-variant__summary_kpis') &&
        sql.includes('UNION ALL'),
    )
    expect(unionQuery).toBeDefined()
  })

  test('scenario: activitysim-baseline pins to exactly one scenario — no scenario field, no union', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.getByText('Field List', { exact: true }).waitFor({ state: 'visible', timeout: 15000 })

    await expect(card.locator('[data-rbd-draggable-id="dimension_scenario"]')).toHaveCount(0)

    const log = await page.evaluate(() => window.__wftdm!.__debugQueryLog())
    const pinnedQuery = log.find(
      (sql) => sql.includes('"activitysim-baseline__trip_mode_share"') && sql.includes('LIMIT 100000'),
    )
    expect(pinnedQuery).toBeDefined()
    expect(pinnedQuery).not.toContain('UNION ALL')
    expect(pinnedQuery).not.toContain('activitysim-density-variant__trip_mode_share')
  })
})

test.describe('User Story 3 - Expand an Explore panel for more working room', () => {
  test('expanding via 004 relocates the same mounted panel with the in-progress chart still showing', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await dragFieldToShelf(page, card, 'dimension_major_trip_mode', ARROWS_TO_ROWS_SHELF)
    await expect(card.getByText('major_trip_mode', { exact: true })).toHaveCount(3, { timeout: 5000 })

    await page.getByRole('button', { name: 'Expand Free-form Visual Analytics', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('major_trip_mode', { exact: true })).toHaveCount(3)
  })

  test('collapsing returns the panel to the card with the in-progress chart still showing, unchanged', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await dragFieldToShelf(page, card, 'dimension_major_trip_mode', ARROWS_TO_ROWS_SHELF)
    await page.getByRole('button', { name: 'Expand Free-form Visual Analytics', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()

    await expect(card.getByText('major_trip_mode', { exact: true })).toHaveCount(3)
  })
})

test.describe('Polish & cross-cutting', () => {
  test('an unresolvable dataset shows PanelErrorState', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Explore Panel Broken (intentional)')
    await expect(card.getByText('Failed to load "nonexistent_dataset"')).toBeVisible()
  })

  test('a resolvable-but-empty query (limit: 0) shows PanelEmptyState', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics Empty (intentional)')
    await expect(card.getByText('No data available to explore')).toBeVisible()
  })

  test('a fields: override changes the inferred type for exactly the named fid', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics Override (intentional)')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    // major_trip_mode (normally dimension_major_trip_mode) is overridden
    // to measure — @kanaries/graphic-walker's own draggable-id prefix
    // directly reflects analyticType, so this is a real, concrete proof
    // the override applied, not an assumed effect.
    await expect(card.locator('[data-rbd-draggable-id="measure_major_trip_mode"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="dimension_major_trip_mode"]')).toHaveCount(0)
    // trips (not overridden) is unaffected.
    await expect(card.locator('[data-rbd-draggable-id="measure_trips"]')).toBeVisible()
  })

  test('a global sidebar filter change elsewhere triggers no additional graphic-walker query', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.getByText('Field List', { exact: true }).waitFor({ state: 'visible', timeout: 15000 })

    // See the "repeated field/mark changes" test above for why this
    // counts the exact SQL string only THIS pinned panel produces,
    // rather than a loose substring the shared query log's own sibling-
    // panel activity would also match.
    const queryCount = () =>
      page.evaluate(
        () =>
          window
            .__wftdm!.__debugQueryLog()
            .filter((sql) => sql.includes('"activitysim-baseline__trip_mode_share"') && sql.includes('LIMIT 100000'))
            .length,
      )
    const before = await queryCount()
    expect(before).toBeGreaterThan(0)
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await page.waitForTimeout(500)
    const after = await queryCount()
    expect(after).toBe(before)
  })

  test('follows the app theme via useColorScheme() — not an independent default', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    const fieldListLabel = card.getByText('Field List', { exact: true })
    const findBg = async () =>
      fieldListLabel.evaluate((el) => {
        let n: HTMLElement | null = el as HTMLElement
        while (n) {
          const bg = getComputedStyle(n).backgroundColor
          if (bg !== 'rgba(0, 0, 0, 0)') return bg
          n = n.parentElement
        }
        return null
      })

    const lightBg = await findBg()
    expect(lightBg).toBe('rgb(255, 255, 255)')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(async () => {
      expect(await findBg()).toBe('rgb(9, 9, 11)')
    }).toPass({ timeout: 5000 })
  })
})

test.describe('028-graphic-walker-dataset-picker', () => {
  test.describe('User Story 1 - Explore any available dataset from one panel', () => {
    test('shows its configured default dataset on first render, identical to a non-picker panel pinned the same way', async ({
      page,
    }) => {
      await boot(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      await expect(card.locator('[data-rbd-draggable-id="dimension_major_trip_mode"]')).toBeVisible()
      await expect(card.locator('[data-rbd-draggable-id="measure_trips"]')).toBeVisible()
      await expect(datasetPickerTrigger(card)).toBeVisible()
      await expect(datasetPickerTrigger(card)).toContainText('trip_mode_share')
    })

    test('picking a different dataset re-renders with its own fields and discards the prior chart binding', async ({
      page,
    }) => {
      await boot(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      await dragFieldToShelf(page, card, 'dimension_major_trip_mode', ARROWS_TO_ROWS_SHELF)
      await expect(card.getByText('major_trip_mode', { exact: true })).toHaveCount(3, { timeout: 5000 })

      await selectDataset(page, card, 'summary_kpis')

      await expect(card.locator('[data-rbd-draggable-id*="total_households"]')).toBeVisible({
        timeout: 10000,
      })
      // trip_mode_share has no `total_households`-anything column, and
      // major_trip_mode is entirely gone from BOTH the field list and the
      // shelf — ANY occurrence would mean a stale binding survived.
      await expect(card.getByText('major_trip_mode', { exact: true })).toHaveCount(0)
      await expect(card.getByText('Drop Field Here').first()).toBeVisible()
    })

    test("rapid re-selection settles on the LAST pick only — never a mix of two datasets' fields", async ({
      page,
    }) => {
      await boot(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      // Switch twice without waiting for the first switch's query to
      // settle — a real regression risk for the effect's own `cancelled`
      // guard (spec.md Acceptance Scenario 3's "never...stale content").
      await datasetPickerTrigger(card).click()
      await clickMenuItem(page, 'summary_kpis')
      await datasetPickerTrigger(card).click()
      await clickMenuItem(page, 'trip_mode_share')

      await expect(card.locator('[data-rbd-draggable-id="dimension_major_trip_mode"]')).toBeVisible({
        timeout: 10000,
      })
      await expect(card.locator('[data-rbd-draggable-id*="total_households"]')).toHaveCount(0)
      await expect(card.getByText('Failed to load', { exact: false })).toHaveCount(0)
    })
  })

  test.describe('User Story 2 - The picker only ever offers datasets that actually work', () => {
    test('an internal geometry view registered by a zonemap panel never appears as a picker option', async ({
      page,
    }) => {
      test.setTimeout(60000)
      await boot(page)
      // This same tab hosts a real zonemap panel pointed at
      // boundaries: taz25.geoparquet — confirm its own internal geometry
      // view actually registered (via the real query log, not assumed
      // timing) before checking the picker. panels/zoneGeometry.ts's own
      // real, documented fallback (CLAUDE.md): it tries
      // `zonemap-geom__taz25.geoparquet` first (the public/geometry/
      // fixture-copy path — absent in this real-content, no-fixtures
      // test run, so that attempt genuinely fails), then falls back to
      // `zonemap-geom-demo__taz25.geoparquet` (public/demo-geometry/,
      // which IS real and git-tracked) — check for either, so this
      // passes the same way under a fixture-populated run too.
      await expect(async () => {
        const log = await page.evaluate(() => window.__wftdm!.__debugQueryLog())
        expect(
          log.some(
            (sql) => sql.includes('zonemap-geom__taz25.geoparquet') || sql.includes('zonemap-geom-demo__taz25.geoparquet'),
          ),
        ).toBe(true)
      }).toPass({ timeout: 30000 })

      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker, Multi-Scenario)')
      await card.waitFor({ state: 'visible', timeout: 15000 })
      await datasetPickerTrigger(card).click()
      const items = await page.getByRole('menuitemradio').allTextContents()
      expect(items.some((t) => t.includes('zonemap-geom') || t.includes('taz25'))).toBe(false)
    })

    // 056-lazy-tab-scoped-loading, T029: real-content adaptation — the
    // old fixture's own "narrow list, one schema-mismatched exclusion"
    // case has no real equivalent (see this file's own header comment);
    // every real demo scenario shares an identical schema, so the real,
    // correct behavior here is the FULL real catalog being offered, not
    // an artificially narrow one. filterSchemaConsistent()'s own
    // exclusion logic stays covered at the unit level
    // (tests/unit/graphicWalkerDatasets.test.ts), unchanged.
    test('lists the full real catalog common to every active scenario', async ({ page }) => {
      await boot(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker, Multi-Scenario)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      await datasetPickerTrigger(card).click()
      await expect(async () => {
        const items = await page.getByRole('menuitemradio').allTextContents()
        expect(items).toContain('summary_kpis')
        expect(items).toContain('trip_mode_share')
        expect(items.length).toBeGreaterThan(30) // the real, full 35-metric catalog
      }).toPass({ timeout: 10000 })
    })

    test('every dataset the pinned picker lists loads successfully when selected', async ({ page }) => {
      await boot(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.waitFor({ state: 'visible', timeout: 15000 })
      await datasetPickerTrigger(card).click()
      const options = await page.getByRole('menuitemradio').allTextContents()
      await page.keyboard.press('Escape')
      expect(options.length).toBeGreaterThan(30)
      // A representative sample, not all 35 — this is a real, live query
      // per iteration; the picker's own list-completeness is already
      // proven by the test above, this one proves SELECTION actually
      // works end to end for more than just the one default entry.
      for (const name of options.slice(0, 5)) {
        await selectDataset(page, card, name)
        await expect(card.getByText('Failed to load', { exact: false })).toHaveCount(0)
        await expect(card.getByText('Field List', { exact: true })).toBeVisible({ timeout: 10000 })
      }
    })

    test('a panel pinned to a scenario that was never registered shows the empty picker state, never a crash', async ({
      page,
    }) => {
      await boot(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker, No Match) (intentional)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      await expect(card.getByText('No dataset available to explore')).toBeVisible()
      await expect(datasetPickerTrigger(card)).toHaveCount(0)
      await expect(card.getByText('Failed to load "summary_kpis"')).toBeVisible()
    })
  })

  test.describe('User Story 3 - An author decides, per panel, whether to allow open exploration', () => {
    const preExistingPanelTitles = [
      'Free-form Visual Analytics',
      'Free-form Visual Analytics (Summary KPIs)',
      'Explore Panel Broken (intentional)',
      'Free-form Visual Analytics (Multi-Scenario)',
      'Free-form Visual Analytics Empty (intentional)',
      'Free-form Visual Analytics Override (intentional)',
    ]

    for (const title of preExistingPanelTitles) {
      test(`"${title}" shows no dataset picker (FR-002 regression)`, async ({ page }) => {
        await boot(page)
        const card = panelCard(page, title)
        await card.waitFor({ state: 'visible', timeout: 15000 })
        await expect(datasetPickerTrigger(card)).toHaveCount(0)
      })
    }

    test('a global sidebar filter change elsewhere triggers no additional query on a picker-enabled panel', async ({
      page,
    }) => {
      await boot(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.getByText('Field List', { exact: true }).waitFor({ state: 'visible', timeout: 15000 })

      // See "repeated field/mark changes" above — counts the exact SQL
      // string only THIS pinned panel produces, not a loose substring
      // the shared query log's own sibling-panel activity would also
      // match.
      const queryCount = () =>
        page.evaluate(
          () =>
            window
              .__wftdm!.__debugQueryLog()
              .filter(
                (sql) => sql.includes('"activitysim-baseline__trip_mode_share"') && sql.includes('LIMIT 100000'),
              ).length,
        )
      const before = await queryCount()
      expect(before).toBeGreaterThan(0)

      await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
      await page.waitForTimeout(500)

      expect(await queryCount()).toBe(before)
    })
  })
})
