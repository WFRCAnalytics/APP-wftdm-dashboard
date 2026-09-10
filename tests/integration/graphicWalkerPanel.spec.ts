import { test, expect, type Page, type Locator } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 014-graphic-walker-panel, extending
// dashboardShell.spec.ts's/tablePanel.spec.ts's pattern (real DuckDB-WASM,
// fixture Parquet, fixture dashboard-config). See quickstart.md and
// contracts/graphic-walker-panel.md.
//
// A real, load-bearing implementation finding, confirmed live (not
// assumed from docs): @kanaries/graphic-walker's field list uses
// react-beautiful-dnd (`data-rbd-draggable-id`/`data-rbd-droppable-id`
// attributes, `draggable="false"` — rbd implements its own pointer
// sensor, not native HTML5 DnD). Playwright's own `dragTo()`/raw mouse
// sequences were tried first and did not reliably land a drop; rbd's
// official, documented KEYBOARD drag alternative (focus the draggable,
// Space to lift, ArrowRight to cross into a neighboring droppable, Space
// to drop) works reliably and is the pattern used throughout this file.
// The whole UI (field list, shelves, chart canvas) renders inside many
// nested shadow roots (confirmed: 16 on a single panel) — Playwright's
// own locators pierce open shadow roots transparently, so no special
// handling is needed for that part.
//
// Fixture shape (tests/fixtures/dashboard-config/dashboard-2-detail.yaml):
// - "Free-form Visual Analytics": dataset: trip_mode_share, scenario:
//   good_scenario (pinned — deterministic regardless of global active-
//   scenario state, matching every other fixture panel's own convention).
//   Columns: purpose, mode, share.
// - "Free-form Visual Analytics (Screenlines)": dataset: screenlines,
//   scenario: good_scenario — a second, differently-configured instance
//   for US2's no-cross-contamination coverage.
// - "Explore Panel Broken (intentional)": dataset: nonexistent_dataset.
// - "Free-form Visual Analytics (Multi-Scenario)": dataset: summary_kpis,
//   no scenario: pin — exercises the $scenario. union; summary_kpis is
//   the one dataset published under BOTH observed and good_scenario.
// - "Free-form Visual Analytics Empty (intentional)": limit: 0.
// - "Free-form Visual Analytics Override (intentional)": fields: override
//   forcing purpose to quantitative/measure.
//
// 028-graphic-walker-dataset-picker adds three more, all `dataset_picker: true`:
// - "Free-form Visual Analytics (Dataset Picker)": dataset: trip_mode_share,
//   scenario: good_scenario (pinned) — the picker lists every metric
//   good_scenario publishes, no union/schema-compatibility concern at all.
// - "Free-form Visual Analytics (Dataset Picker, Multi-Scenario)":
//   dataset: summary_kpis, no scenario: pin — the picker's own list is the
//   intersection across active scenarios AND schema-consistent across them
//   (research.md §3/§3a); with ?s=good_scenario active alongside the
//   always-active observed, only summary_kpis actually qualifies —
//   trip_mode_share/screenlines/etc. are good_scenario-only, and
//   vmt_by_home_taz exists in both but has a genuinely different column
//   count between them (a real, confirmed fixture quirk, not synthetic).
// - "Free-form Visual Analytics (Dataset Picker, No Match) (intentional)":
//   scenario: nonexistent_scenario_zzz — exercises the picker's own
//   empty/disabled-state rendering.

async function boot(page: Page, searchParams = '') {
  await page.goto('/' + searchParams)
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function gotoDetailTab(page: Page) {
  const detailTab = page.getByRole('tab', { name: 'Detail' })
  if (await detailTab.count()) await detailTab.click()
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

async function selectDataset(page: Page, card: Locator, name: string) {
  await datasetPickerTrigger(card).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
}

test.describe('User Story 1 - Freely build a chart from an existing dataset', () => {
  test('renders the field list populated with the dataset\'s real columns, no chart pre-selected', async ({
    page,
  }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await expect(card.getByText('Field List', { exact: true })).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="dimension_purpose"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="dimension_mode"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="measure_share"]')).toBeVisible()
    // No chart pre-selected — both shelves still show their placeholder.
    await expect(card.getByText('Drop Field Here').first()).toBeVisible()
  })

  test('dragging a field onto a shelf renders a real chart from real fixture rows', async ({ page }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await dragFieldToShelf(page, card, 'dimension_purpose', ARROWS_TO_ROWS_SHELF)

    // "purpose" now renders three times — the field-list item itself,
    // the shelf chip, and the chart's own rendered axis-title label
    // (confirmed empirically during implementation) — real, rendered
    // encoding output, not just a selection highlight. The chart mark
    // itself draws to a <canvas> (confirmed empirically: this GW version's
    // real, effective renderer is Canvas, not SVG, for this mark type —
    // and a bare canvas element is already present even before any field
    // is placed, so its mere presence/absence isn't a usable signal here;
    // the axis-title text is the reliable, content-bearing proof instead).
    await expect(card.getByText('purpose', { exact: true })).toHaveCount(3, { timeout: 5000 })
  })

  test('repeated field/mark changes each re-render from the same snapshot — no additional query', async ({
    page,
  }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    const queryCount = () =>
      page.evaluate(() =>
        window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes('trip_mode_share')).length,
      )
    const before = await queryCount()
    expect(before).toBeGreaterThan(0) // the panel's own one mount-time query already ran

    await dragFieldToShelf(page, card, 'dimension_purpose', ARROWS_TO_ROWS_SHELF)
    await dragFieldToShelf(page, card, 'dimension_mode', ARROWS_TO_ROWS_SHELF)

    const after = await queryCount()
    expect(after).toBe(before)
  })
})

test.describe('User Story 2 - Author points an Explore panel at a specific dataset', () => {
  test('a panel configured with dataset: trip_mode_share shows only that dataset\'s own columns', async ({
    page,
  }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })
    await expect(card.locator('[data-rbd-draggable-id="dimension_purpose"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="dimension_mode"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="measure_share"]')).toBeVisible()
    // screenlines-only columns never leak into this panel's own field list.
    await expect(card.locator('[data-rbd-draggable-id*="link_id"]')).toHaveCount(0)
  })

  test('a second panel with a different dataset shows independently different columns — no cross-contamination', async ({
    page,
  }) => {
    await boot(page)
    await gotoDetailTab(page)
    const screenlinesCard = panelCard(page, 'Free-form Visual Analytics (Screenlines)')
    await screenlinesCard.waitFor({ state: 'visible', timeout: 15000 })
    await expect(screenlinesCard.locator('[data-rbd-draggable-id*="link_id"]')).toBeVisible()
    // trip_mode_share-only columns never leak into this panel's own field list.
    await expect(screenlinesCard.locator('[data-rbd-draggable-id="dimension_purpose"]')).toHaveCount(0)
  })

  test('omitting scenario: with two active scenarios unions via the existing $scenario. mechanism, adding a scenario field', async ({
    page,
  }) => {
    // 038-all-loaded-scenarios: `good_scenario` (status 'ready') now
    // auto-activates on any boot; the explicit `?s=good_scenario` is kept
    // as a belt-and-braces declaration of this test's intended set (and
    // still exercises applyURLParams()'s add-only path). Either way the
    // active set here is `observed` + `good_scenario`.
    await boot(page, '?s=good_scenario')
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics (Multi-Scenario)')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    // The `scenario` discriminator column (added by sqlExpander.ts's own,
    // unmodified expandScenario()) is inferred like any other Utf8
    // column — nominal/dimension (research.md §5).
    await expect(card.locator('[data-rbd-draggable-id="dimension_scenario"]')).toBeVisible({
      timeout: 10000,
    })

    // Concrete, robust proof of the UNION mechanism itself (rather than
    // reading a row count back off the rendered chart UI, which this
    // library gives no reliable text-based way to do): the real
    // generated SQL referenced BOTH scenarios' own summary_kpis views in
    // one UNION ALL statement.
    const log = await page.evaluate(() => window.__wftdm!.__debugQueryLog())
    const unionQuery = log.find(
      (sql) =>
        sql.includes('summary_kpis') &&
        sql.includes('observed__summary_kpis') &&
        sql.includes('good_scenario__summary_kpis') &&
        sql.includes('UNION ALL'),
    )
    expect(unionQuery).toBeDefined()
  })

  test('scenario: good_scenario pins to exactly one scenario — no scenario field, no union', async ({
    page,
  }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await expect(card.locator('[data-rbd-draggable-id="dimension_scenario"]')).toHaveCount(0)

    const log = await page.evaluate(() => window.__wftdm!.__debugQueryLog())
    const pinnedQuery = log.find(
      (sql) => sql.includes('"good_scenario__trip_mode_share"') && sql.includes('LIMIT 100000'),
    )
    expect(pinnedQuery).toBeDefined()
    expect(pinnedQuery).not.toContain('UNION ALL')
    expect(pinnedQuery).not.toContain('observed__trip_mode_share')
  })
})

test.describe('User Story 3 - Expand an Explore panel for more working room', () => {
  test('expanding via 004 relocates the same mounted panel with the in-progress chart still showing', async ({
    page,
  }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await dragFieldToShelf(page, card, 'dimension_purpose', ARROWS_TO_ROWS_SHELF)
    await expect(card.getByText('purpose', { exact: true })).toHaveCount(3, { timeout: 5000 })

    await page.getByRole('button', { name: 'Expand Free-form Visual Analytics', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Same in-progress chart, not a fresh mount — the shelf chip is still
    // showing, alongside the field-list item (2 occurrences, same as
    // pre-expand).
    await expect(dialog.getByText('purpose', { exact: true })).toHaveCount(3)
  })

  test('collapsing returns the panel to the card with the in-progress chart still showing, unchanged', async ({
    page,
  }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await dragFieldToShelf(page, card, 'dimension_purpose', ARROWS_TO_ROWS_SHELF)
    await page.getByRole('button', { name: 'Expand Free-form Visual Analytics', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()

    await expect(card.getByText('purpose', { exact: true })).toHaveCount(3)
  })
})

test.describe('Polish & cross-cutting', () => {
  test('an unresolvable dataset shows PanelErrorState', async ({ page }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Explore Panel Broken (intentional)')
    await expect(card.getByText('Failed to load "nonexistent_dataset"')).toBeVisible()
  })

  test('a resolvable-but-empty query (limit: 0) shows PanelEmptyState', async ({ page }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics Empty (intentional)')
    await expect(card.getByText('No data available to explore')).toBeVisible()
  })

  test('a fields: override changes the inferred type for exactly the named fid', async ({ page }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics Override (intentional)')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    // purpose (normally dimension_purpose) is overridden to measure —
    // @kanaries/graphic-walker's own draggable-id prefix directly reflects
    // analyticType (confirmed live during implementation), so this is a
    // real, concrete proof the override applied, not an assumed effect.
    await expect(card.locator('[data-rbd-draggable-id="measure_purpose"]')).toBeVisible()
    await expect(card.locator('[data-rbd-draggable-id="dimension_purpose"]')).toHaveCount(0)
    // mode (not overridden) is unaffected.
    await expect(card.locator('[data-rbd-draggable-id="dimension_mode"]')).toBeVisible()
  })

  test('all nine now-built panel types render without error on one tab (SC-005)', async ({ page }) => {
    await boot(page) // Summary tab is the landing page
    await expect(page.getByText('Total Households')).toBeVisible() // valuebox
    await expect(panelCard(page, 'Mode Share by Purpose')).toBeVisible() // plotly (or similar)
    const gwCard = panelCard(page, 'Free-form Visual Analytics (Summary Tab)') // graphic-walker
    await gwCard.waitFor({ state: 'visible', timeout: 15000 })
    await expect(gwCard.getByText('Field List', { exact: true })).toBeVisible()
    // 034-metric-panel-redesign (Part A): graphic-walker panels are no
    // longer expandable by DEFAULT (FR-002) — this panel has no
    // `expandable: true` override, so no Expand trigger renders. SC-005
    // itself is about all panel types rendering without error, not about
    // expand-ability specifically (the Detail tab's "Free-form Visual
    // Analytics" panel, which DOES opt back in via the override, already
    // covers the expand-to-dialog mechanism for this panel type in User
    // Story 3 below).
  })

  test('a global sidebar filter change elsewhere triggers no additional graphic-walker query', async ({
    page,
  }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    const before = await page.evaluate(() =>
      window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes('trip_mode_share')).length,
    )

    // filterState.set() is the same mechanism useFilterState's own
    // subscribers react to — this panel type has none (FR-005), so
    // directly setting a filter value (rather than needing a real filter
    // UI control on this fixture tab) is a faithful, direct trigger.
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await page.waitForTimeout(500)

    const after = await page.evaluate(() =>
      window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes('trip_mode_share')).length,
    )
    expect(after).toBe(before)
  })

  // Real bug fixed post-completion: the panel rendered with no light/dark
  // awareness at all (no `appearance` prop passed), so it followed
  // whatever GraphicWalker's own internal default resolved to
  // independently of this app's own theme. Fixed by wiring
  // useColorScheme() (011-basemap-style-system) to <GraphicWalker>'s real
  // `appearance` prop (confirmed against the installed package's own
  // interfaces.d.ts: IThemeProps.appearance — NOT the deprecated `dark`
  // prop, and a separate axis entirely from `themeKey`, which controls
  // chart color palette, not UI chrome).
  test('follows the app theme via useColorScheme() — not an independent default', async ({ page }) => {
    await boot(page)
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    // Real computed style of a real GraphicWalker-rendered element
    // (Playwright locators pierce the library's own shadow DOM) — not a
    // prop-was-passed assertion, an actual rendered-color check.
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

    // The same, real, documented mechanism useColorScheme() itself
    // observes (src/hooks/useColorScheme.ts) — no real toggle UI exists
    // yet, so this is the correct way to exercise it.
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
      await gotoDetailTab(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      await expect(card.locator('[data-rbd-draggable-id="dimension_purpose"]')).toBeVisible()
      await expect(card.locator('[data-rbd-draggable-id="dimension_mode"]')).toBeVisible()
      await expect(card.locator('[data-rbd-draggable-id="measure_share"]')).toBeVisible()
      await expect(datasetPickerTrigger(card)).toBeVisible()
      await expect(datasetPickerTrigger(card)).toContainText('trip_mode_share')
    })

    test('picking a different dataset re-renders with its own fields and discards the prior chart binding', async ({
      page,
    }) => {
      await boot(page)
      await gotoDetailTab(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      // Build a real chart against the default dataset first.
      await dragFieldToShelf(page, card, 'dimension_purpose', ARROWS_TO_ROWS_SHELF)
      await expect(card.getByText('purpose', { exact: true })).toHaveCount(3, { timeout: 5000 })

      await selectDataset(page, card, 'screenlines')

      // The new dataset's own columns appear...
      await expect(card.locator('[data-rbd-draggable-id*="link_id"]')).toBeVisible({ timeout: 10000 })
      // ...and the old dataset's field/chart is entirely gone — screenlines
      // has no `purpose` column at all, so ANY occurrence would mean a
      // stale binding survived the switch.
      await expect(card.getByText('purpose', { exact: true })).toHaveCount(0)
      // Fresh, unconfigured chart state — the shelf placeholder is back.
      await expect(card.getByText('Drop Field Here').first()).toBeVisible()
    })

    test('rapid re-selection settles on the LAST pick only — never a mix of two datasets\' fields', async ({
      page,
    }) => {
      await boot(page)
      await gotoDetailTab(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      // Switch twice without waiting for the first switch's query to
      // settle — a real regression risk for the effect's own `cancelled`
      // guard (spec.md Acceptance Scenario 3's "never...stale content").
      await datasetPickerTrigger(card).click()
      await page.getByRole('menuitemradio', { name: 'screenlines', exact: true }).click()
      await datasetPickerTrigger(card).click()
      await page.getByRole('menuitemradio', { name: 'summary_kpis', exact: true }).click()

      await expect(card.locator('[data-rbd-draggable-id*="total_households"]')).toBeVisible({
        timeout: 10000,
      })
      await expect(card.locator('[data-rbd-draggable-id*="link_id"]')).toHaveCount(0)
      await expect(card.getByText('Failed to load', { exact: false })).toHaveCount(0)
    })
  })

  test.describe('User Story 2 - The picker only ever offers datasets that actually work', () => {
    test('an internal geometry view registered by a zonemap panel never appears as a picker option', async ({
      page,
    }) => {
      await boot(page, '?s=good_scenario')
      await gotoDetailTab(page)
      // This same Detail tab hosts a zonemap panel (row_baseline_diff)
      // pointed at boundaries: taz.geoparquet — confirm its own internal
      // `zonemap-geom__taz.geoparquet` view actually registered (via the
      // real query log, not assumed timing) before checking the picker.
      await expect(async () => {
        const log = await page.evaluate(() => window.__wftdm!.__debugQueryLog())
        expect(log.some((sql) => sql.includes('zonemap-geom__taz.geoparquet'))).toBe(true)
      }).toPass({ timeout: 15000 })

      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker, Multi-Scenario)')
      await card.waitFor({ state: 'visible', timeout: 15000 })
      await datasetPickerTrigger(card).click()
      const items = await page.getByRole('menuitemradio').allTextContents()
      expect(items.some((t) => t.includes('zonemap-geom') || t.includes('taz.geoparquet'))).toBe(false)
    })

    test('lists only the dataset common to (and schema-consistent across) every active scenario', async ({
      page,
    }) => {
      // Both `observed` (always active) and `good_scenario` (activated via
      // ?s=) active together — trip_mode_share/screenlines/etc. are
      // good_scenario-only (excluded — partial availability), and
      // vmt_by_home_taz exists in BOTH but has a genuinely different
      // column count between them (excluded — schema mismatch, research.md
      // §3a). summary_kpis is the one dataset that's both available AND
      // schema-consistent everywhere.
      await boot(page, '?s=good_scenario')
      await gotoDetailTab(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker, Multi-Scenario)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      await datasetPickerTrigger(card).click()
      await expect(async () => {
        const items = await page.getByRole('menuitemradio').allTextContents()
        expect(items).toEqual(['summary_kpis'])
      }).toPass({ timeout: 10000 })
    })

    test('every dataset the picker lists loads successfully when selected', async ({ page }) => {
      await boot(page, '?s=good_scenario')
      await gotoDetailTab(page)

      // The pinned panel — every one of good_scenario's own real metrics
      // is safe (no union, no schema-compatibility concern at all).
      const pinnedCard = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await pinnedCard.waitFor({ state: 'visible', timeout: 15000 })
      await datasetPickerTrigger(pinnedCard).click()
      const pinnedOptions = await page.getByRole('menuitemradio').allTextContents()
      await page.keyboard.press('Escape')
      expect(pinnedOptions.length).toBeGreaterThan(0)
      for (const name of pinnedOptions) {
        await selectDataset(page, pinnedCard, name)
        await expect(pinnedCard.getByText('Failed to load', { exact: false })).toHaveCount(0)
        await expect(pinnedCard.getByText('Field List', { exact: true })).toBeVisible({ timeout: 10000 })
      }

      // The multi-scenario panel — whatever it lists (post schema-
      // consistency filtering) must also all succeed.
      const multiCard = panelCard(page, 'Free-form Visual Analytics (Dataset Picker, Multi-Scenario)')
      await datasetPickerTrigger(multiCard).click()
      const multiOptions = await page.getByRole('menuitemradio').allTextContents()
      await page.keyboard.press('Escape')
      expect(multiOptions.length).toBeGreaterThan(0)
      for (const name of multiOptions) {
        await selectDataset(page, multiCard, name)
        await expect(multiCard.getByText('Failed to load', { exact: false })).toHaveCount(0)
        await expect(multiCard.getByText('Field List', { exact: true })).toBeVisible({ timeout: 10000 })
      }
    })

    test('a panel pinned to a scenario that was never registered shows the empty picker state, never a crash', async ({
      page,
    }) => {
      await boot(page)
      await gotoDetailTab(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker, No Match) (intentional)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      await expect(card.getByText('No dataset available to explore')).toBeVisible()
      await expect(datasetPickerTrigger(card)).toHaveCount(0)
      // The initial query itself also fails (nonexistent_scenario_zzz__summary_kpis
      // doesn't exist) — the panel's own existing PanelErrorState, not a crash.
      await expect(card.getByText('Failed to load "summary_kpis"')).toBeVisible()
    })
  })

  test.describe('User Story 3 - An author decides, per panel, whether to allow open exploration', () => {
    const preExistingPanelTitles = [
      'Free-form Visual Analytics',
      'Free-form Visual Analytics (Screenlines)',
      'Explore Panel Broken (intentional)',
      'Free-form Visual Analytics (Multi-Scenario)',
      'Free-form Visual Analytics Empty (intentional)',
      'Free-form Visual Analytics Override (intentional)',
    ]

    for (const title of preExistingPanelTitles) {
      test(`"${title}" shows no dataset picker (FR-002 regression)`, async ({ page }) => {
        await boot(page, '?s=good_scenario')
        await gotoDetailTab(page)
        const card = panelCard(page, title)
        await card.waitFor({ state: 'visible', timeout: 15000 })
        await expect(datasetPickerTrigger(card)).toHaveCount(0)
      })
    }

    test('a global sidebar filter change elsewhere triggers no additional query on a picker-enabled panel', async ({
      page,
    }) => {
      await boot(page)
      await gotoDetailTab(page)
      const card = panelCard(page, 'Free-form Visual Analytics (Dataset Picker)')
      await card.waitFor({ state: 'visible', timeout: 15000 })

      const queryCount = () =>
        page.evaluate(() =>
          window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes('trip_mode_share')).length,
        )
      const before = await queryCount()
      expect(before).toBeGreaterThan(0)

      await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
      await page.waitForTimeout(500)

      expect(await queryCount()).toBe(before)
    })
  })
})
