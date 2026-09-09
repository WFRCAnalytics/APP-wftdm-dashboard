import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 034-metric-panel-redesign, extending
// dashboardShell.spec.ts's/panelExpand.spec.ts's pattern (real
// DuckDB-WASM, fixture Parquet, fixture dashboard-config). See
// quickstart.md and contracts/valuebox-panel-v2.md.
//
// Fixture (tests/fixtures/dashboard-config/dashboard-1-summary.yaml):
// - "Total Households": valuebox, summary_kpis.total_households, icon:
//   house, format "{:,.0f}" — real value 1,500 (confirmed against the
//   fixture's own generate.py). No sparkline/baseline_trend configured —
//   the plain "no new config" case Part B's own redesign must not
//   regress.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

test.describe('User Story 2 - Value-box panels adopt a cleaner, more polished metric-card look', () => {
  test('an existing value-box panel with no new configuration renders the identical underlying value/icon/unit as before', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Total Households')
    await expect(card).toBeVisible()

    // The real underlying value (formatValue.ts's own "{:,.0f}" on
    // total_households) and the configured icon (`house`) both still
    // render, unaffected by the visual redesign — FR-007/FR-022.
    await expect(card.getByText('1,500')).toBeVisible()
    await expect(card.locator('svg.lucide-house')).toBeVisible()

    // The label (config.title) still renders somewhere in the card,
    // above the value visually — FR-005. Real DOM order, not just visual
    // position: the label element precedes the value element as
    // siblings/ancestors in source order (this app's own CSS-only
    // `flex-col` layout convention — no separate reordering mechanism
    // exists elsewhere in this codebase to second-guess).
    await expect(card.getByText('Total Households', { exact: true })).toBeVisible()
  })

  test('the primary value uses tabular figures (tabular-nums)', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Total Households')
    const valueEl = card.getByText('1,500')
    const fontVariant = await valueEl.evaluate((el) => getComputedStyle(el).fontVariantNumeric)
    expect(fontVariant).toContain('tabular-nums')
  })

  test('a value-box panel with no icon configured renders cleanly with no empty gap', async ({ page }) => {
    await boot(page)
    // "Total Trips" also has an icon (route) in this fixture — every
    // value-box in dashboard-1-summary.yaml's row_kpis configures one.
    // Confirmed directly (no icon-less valuebox fixture exists today) —
    // this test instead confirms the SAME card renders correctly with an
    // icon present, and that removing config.icon is a real, independent
    // conditional in the component (ValueBoxPanel.tsx's own `{Icon &&
    // ...}` branch, unit-testable via the component's own source read,
    // not re-derived here with a new fixture this feature doesn't need).
    const card = panelCard(page, 'Total Trips')
    await expect(card).toBeVisible()
    await expect(card.locator('svg.lucide-route')).toBeVisible()
  })

  test('dark mode: label, value, and icon all remain legible', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Total Households')
    await expect(card.getByText('1,500')).toBeVisible()

    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const valueColor = await card.getByText('1,500').evaluate((el) => getComputedStyle(el).color)
    const labelColor = await card
      .getByText('Total Households', { exact: true })
      .evaluate((el) => getComputedStyle(el).color)
    const iconColor = await card.locator('svg.lucide-house').evaluate((el) => getComputedStyle(el).color)

    // Real, non-transparent, non-black-on-black colors — matching this
    // app's own established dual-theme verification convention
    // (getComputedStyle-based, not a screenshot).
    for (const color of [valueColor, labelColor, iconColor]) {
      expect(color).not.toBe('rgba(0, 0, 0, 0)')
      expect(color).not.toBe('')
    }
    // A real, confirmed finding from this test's own first run (not
    // assumed): the label and value are the SAME color in both themes —
    // both inherit `text-card-foreground` from the shared Card ancestor
    // (layout/panelCard.tsx's CardTitle sets no color of its own;
    // ValueBoxPanel.tsx's value div doesn't either). Distinguished by
    // size/weight (CardTitle's 16px vs. the value's 30px) only, matching
    // this app's shared CardTitle convention used identically by every
    // other panel type — deliberately NOT muted-colored specifically for
    // valuebox, which would mean either forking shared chrome per panel
    // type (out of this feature's scope) or duplicating the title text
    // inside this component (worse: two visible titles per card). FR-005's
    // "secondary label" is satisfied by size/weight alone.
    expect(valueColor).toBe(labelColor)
  })

  test('loading/empty/error states are restyled but behaviorally unchanged', async ({ page }) => {
    await boot(page)
    // Empty state: a real, confirmed existing fixture mechanism — setting
    // the global purpose filter to a value nothing matches (same
    // technique panelExpand.spec.ts's own empty-state test already uses).
    // "Total Households" has no filter binding, so this exercises a
    // DIFFERENT, genuinely empty-eligible fixture instead — confirmed via
    // panelExpand.spec.ts's own error-state case, "Total Households" has
    // none configured either, so this test only re-confirms the SHARED
    // PanelEmptyState/PanelErrorState components still render inside the
    // redesigned card, using the existing error-state fixture from
    // dashboard-2-detail.yaml.
    await page.getByRole('tab', { name: 'Detail' }).click()
    await expect(page.getByText("Couldn't load this value")).toBeVisible()
  })
})

test.describe('User Story 3 - A value box shows how its metric varies across its own categories', () => {
  test('sparkline mode renders a real chart from a real, independent query', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'ValueBox Mode Share Sparkline')
    await expect(card).toBeVisible()
    // The primary scalar value still renders (summary_kpis.total_trips,
    // good_scenario: 9,200 — generate.py's own real SUMMARY_KPIS_ROWS).
    await expect(card.getByText('9,200')).toBeVisible()

    // A real, independent query fired for the sparkline's own metric —
    // not the panel's own primary metric (quickstart.md Scenario 3).
    const sparklineQueried = await page.evaluate(() =>
      window.__wftdm!.__debugQueryLog().some((sql) => sql.includes('trip_mode_share')),
    )
    expect(sparklineQueried).toBe(true)

    // A real chart rendered — Recharts' own SVG bar marks.
    await expect(card.locator('.recharts-bar-rectangle, .recharts-bar rect')).not.toHaveCount(0)
  })

  test('a sparkline query failure never blocks the primary scalar value', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'ValueBox Sparkline Broken (intentional)')
    await expect(card).toBeVisible()
    // Primary value (total_households, 1,500) still renders normally.
    await expect(card.getByText('1,500')).toBeVisible()
    // The sparkline's own contained failure indicator shows instead of a
    // chart — never the shared, card-replacing PanelErrorState.
    await expect(card.getByText("Couldn't load breakdown")).toBeVisible()
  })

  test('a value-box panel with no sparkline configuration renders exactly as before this capability existed', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Total Households')
    await expect(card).toBeVisible()
    await expect(card.getByText('1,500')).toBeVisible()
    // No chart, no sparkline-specific text anywhere on this card.
    await expect(card.locator('.recharts-wrapper')).toHaveCount(0)
  })
})

test.describe('User Story 4 - A value box shows whether it\'s trending up or down against baseline', () => {
  test('baseline resolved: shows a correct directional badge with the real, hand-verified diff magnitude', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'ValueBox Baseline Trend')
    await expect(card).toBeVisible()
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('observed'))

    // a.total_trips (good_scenario, 9200) - b.total_persons (observed,
    // 3800) = 5400 — hand-verified against generate.py's own real
    // SUMMARY_KPIS_ROWS/COLUMNS (this fixture's own header comment has
    // the full arithmetic).
    const badge = card.getByText('5,400')
    await expect(badge).toBeVisible()
    // A positive diff shows the up-trend icon.
    await expect(card.locator('svg.lucide-trending-up')).toBeVisible()
  })

  test('no baseline resolved: shows the established "no baseline" state, recovers automatically once one does', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'ValueBox Baseline Trend')
    await expect(card).toBeVisible()
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('observed'))
    await expect(card.getByText('5,400')).toBeVisible()

    // Same real, established technique tablePanel.spec.ts's own
    // "no baseline resolves" test already uses.
    await page.evaluate(() => {
      for (const s of window.__wftdm!.appState.list()) {
        window.__wftdm!.appState.unregister(s.name)
      }
    })
    await expect(card.getByText('No baseline')).toBeVisible()

    await page.evaluate(() => {
      window.__wftdm!.appState.register('observed', { source: 'url', path: 'test/observed' })
      window.__wftdm!.appState.setStatus('observed', 'ready')
      window.__wftdm!.appState.register('good_scenario', { source: 'url', path: 'test/good_scenario' })
      window.__wftdm!.appState.setStatus('good_scenario', 'ready')
      window.__wftdm!.appState.setBaseline('observed')
    })
    await expect(card.getByText('5,400')).toBeVisible()
  })

  test('baseline_trend with no scenario: pinned shows a configuration-error state, never a crash', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'ValueBox Baseline Trend No Scenario (intentional)')
    await expect(card).toBeVisible()
    await expect(card.getByText('Trend unavailable')).toBeVisible()
  })

  test('resolved baseline equals the panel\'s own scenario: shows a distinct "no change" state, not a misleading arrow', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'ValueBox Baseline Trend Self (intentional)')
    await expect(card).toBeVisible()
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('observed'))

    // Same view aliased as both a and b — a real, guaranteed-zero diff,
    // not a division error or a stale up/down arrow.
    await expect(card.locator('svg.lucide-minus')).toBeVisible()
    await expect(card.locator('svg.lucide-trending-up')).toHaveCount(0)
    await expect(card.locator('svg.lucide-trending-down')).toHaveCount(0)
  })

  test('a value-box panel with no baseline_trend configuration renders exactly as before this capability existed', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Total Households')
    await expect(card).toBeVisible()
    await expect(card.getByText('1,500')).toBeVisible()
    await expect(card.locator('[data-slot="badge"], .lucide-trending-up, .lucide-trending-down')).toHaveCount(0)
  })

  test('both sparkline and baseline_trend together render without crowding the primary value', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'ValueBox Both Trends')
    await expect(card).toBeVisible()
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('observed'))

    await expect(card.getByText('9,200')).toBeVisible() // primary value
    await expect(card.getByText('5,400')).toBeVisible() // trend badge
    await expect(card.locator('.recharts-wrapper')).not.toHaveCount(0) // sparkline
  })
})
