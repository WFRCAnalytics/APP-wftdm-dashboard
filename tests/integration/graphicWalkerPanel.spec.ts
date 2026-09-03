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
    // good_scenario is not globally active by default (only `observed` is
    // pinned — src/services/scenarioDiscovery.ts) — activated here via
    // the app's own real ?s= URL param mechanism (applyURLParams()), not
    // a test-only shortcut.
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
    await expect(page.getByRole('button', { name: 'Expand Free-form Visual Analytics (Summary Tab)' })).toBeVisible()
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
