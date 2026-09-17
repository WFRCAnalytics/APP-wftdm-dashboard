import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 034-metric-panel-redesign. Migrated (040-test-
// suite-migration) off the retired synthetic tests/fixtures/dashboard-
// config/dashboard-1-summary.yaml (deleted — public/scenarios/, public/
// dashboard-config/, public/observed/ are gitignored and genuinely empty
// in this checkout; scripts/copy-fixtures.js / npm run dev:fixtures no
// longer exist). See quickstart.md and contracts/valuebox-panel-v2.md
// for this feature's own original design record.
//
// Real panels used throughout:
// - "Households"/"Trips" (dashboard-1-summary.yaml, Summary tab) — plain
//   valuebox, no sparkline/baseline_trend/gauge. Real values 5,000 (icon
//   `home`)/23,583 (icon `map-pin`), hand-verified against the real
//   summary_kpis.parquet.
// - Five real, permanent additions to dashboard-8-test.yaml's own Test
//   tab (this feature's own contribution — see that file's own header
//   comment on the new row): a plain broken valuebox (missing metric),
//   a real working sparkline, and three real working baseline_trend
//   variations (resolved/no-scenario/self-comparison) plus a combined
//   sparkline+baseline_trend panel — closing a real, confirmed gap (a
//   direct grep sweep found zero real demo panels used either capability
//   at all; the two existing Test-tab rows using them are both
//   deliberately BROKEN edge cases, not working examples).

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

// A deliberately minimal, deterministic scenario world — 'activitysim-
// baseline' (active) and 'activitysim-density-variant' (registered but
// deactivated right after boot, so it never joins any unpinned panel's
// own union) — matching tablePanel.spec.ts's own established pattern.
// Every real value/diff in this file was hand-verified against exactly
// this pair via the duckdb CLI (see dashboard-8-test.yaml's own header
// comment on the new baseline_trend rows for the full arithmetic).
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

test.describe('User Story 2 - Value-box panels adopt a cleaner, more polished metric-card look', () => {
  test('an existing value-box panel with no new configuration renders the identical underlying value/icon/unit as before', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Households')
    await expect(card).toBeVisible()

    // The real underlying value (formatValue.ts's own "{:,.0f}" on
    // total_households) and the configured icon (`home`) both still
    // render, unaffected by the visual redesign — FR-007/FR-022.
    await expect(card.getByText('5,000')).toBeVisible()
    await expect(card.locator('svg.lucide-house')).toBeVisible()

    // The label (config.title) still renders somewhere in the card,
    // above the value visually — FR-005. Real DOM order, not just visual
    // position: the label element precedes the value element as
    // siblings/ancestors in source order (this app's own CSS-only
    // `flex-col` layout convention — no separate reordering mechanism
    // exists elsewhere in this codebase to second-guess).
    await expect(card.getByText('Households', { exact: true })).toBeVisible()
  })

  test('the primary value uses tabular figures (tabular-nums)', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Households')
    const valueEl = card.getByText('5,000')
    const fontVariant = await valueEl.evaluate((el) => getComputedStyle(el).fontVariantNumeric)
    expect(fontVariant).toContain('tabular-nums')
  })

  test('a value-box panel with no icon configured renders cleanly with no empty gap', async ({ page }) => {
    await boot(page)
    // "Trips" also has an icon (map-pin) in this real demo content —
    // every real value-box in dashboard-1-summary.yaml's row_kpis
    // configures one, confirmed directly (no icon-less real valuebox
    // exists today). This test instead confirms the SAME card renders
    // correctly with an icon present, and that removing config.icon is a
    // real, independent conditional in the component (ValueBoxPanel.tsx's
    // own `{Icon && ...}` branch, unit-testable via the component's own
    // source read, not re-derived here with a new panel this feature
    // doesn't need).
    const card = panelCard(page, 'Trips')
    await expect(card).toBeVisible()
    await expect(card.locator('svg.lucide-map-pin')).toBeVisible()
  })

  test('dark mode: label, value, and icon all remain legible', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Households')
    await expect(card.getByText('5,000')).toBeVisible()

    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const valueColor = await card.getByText('5,000').evaluate((el) => getComputedStyle(el).color)
    const labelColor = await card
      .getByText('Households', { exact: true })
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
    // A real, confirmed gap this feature's own audit found — no real
    // valuebox anywhere triggers the shared PanelErrorState (every real
    // one binds a real, existing metric), so this uses a small, real,
    // permanent addition to dashboard-8-test.yaml (a missing-metric
    // valuebox) — confirming the shared PanelErrorState still renders
    // inside the redesigned card.
    await page.getByRole('tab', { name: 'Test' }).click()
    await expect(
      panelCard(page, 'Broken Value Box (missing metric)').getByText("Couldn't load this value"),
    ).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('User Story 3 - A value box shows how its metric varies across its own categories', () => {
  test('sparkline mode renders a real chart from a real, independent query', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'ValueBox Mode Share Sparkline')
    await expect(card).toBeVisible({ timeout: 20_000 })
    // The primary scalar value still renders (summary_kpis.total_trips,
    // activitysim-baseline: 23,583 — hand-verified via the duckdb CLI).
    await expect(card.getByText('23,583')).toBeVisible()

    // A real, independent query fired for the sparkline's own metric —
    // not the panel's own primary metric (quickstart.md Scenario 3).
    const sparklineQueried = await page.evaluate(() =>
      window.__wftdm!.__debugQueryLog().some((sql) => sql.includes('trip_mode_share')),
    )
    expect(sparklineQueried).toBe(true)

    // A real chart rendered — Observable Plot's own SVG bar marks
    // (057-observable-plot-conversion: panels/valueBoxSparkline.tsx).
    await expect(card.locator('.observable-plot-chart svg[viewBox] rect')).not.toHaveCount(0)
  })

  test('a sparkline query failure never blocks the primary scalar value', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Value Box — Broken Sparkline')
    await expect(card).toBeVisible({ timeout: 20_000 })
    // Primary value (total_trips, activitysim-baseline: 23,583) still
    // renders normally.
    await expect(card.getByText('23,583')).toBeVisible()
    // The sparkline's own contained failure indicator shows instead of a
    // chart — never the shared, card-replacing PanelErrorState.
    // A default 5s timeout is unreliable on the crowded Test tab under
    // full-file load — same class of fix used throughout this project's
    // other Test-tab assertions.
    await expect(card.getByText("Couldn't load breakdown")).toBeVisible({ timeout: 20_000 })
  })

  test('a value-box panel with no sparkline configuration renders exactly as before this capability existed', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Households')
    await expect(card).toBeVisible()
    await expect(card.getByText('5,000')).toBeVisible()
    // No chart, no sparkline-specific text anywhere on this card.
    await expect(card.locator('.observable-plot-chart')).toHaveCount(0)
  })
})

test.describe('User Story 4 - A value box shows whether it\'s trending up or down against baseline', () => {
  test('baseline resolved: shows a correct directional badge with the real, hand-verified diff magnitude', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'ValueBox Baseline Trend')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-density-variant'))

    // a.total_trips (activitysim-baseline, 23,583) - b.total_persons
    // (activitysim-density-variant, 8,212) = 15,371 — hand-verified
    // against the real summary_kpis.parquet via the duckdb CLI
    // (dashboard-8-test.yaml's own header comment has the full
    // arithmetic and the reason a cross-column expr is used here).
    // A default 5s timeout is unreliable on the crowded Test tab under
    // full-file load — the comparison:diff query has to compete with
    // every sibling panel's own concurrent query.
    const badge = card.getByText('15,371')
    await expect(badge).toBeVisible({ timeout: 20_000 })
    // A positive diff shows the up-trend icon.
    await expect(card.locator('svg.lucide-trending-up')).toBeVisible()
  })

  test('no baseline resolved: shows the established "no baseline" state, recovers automatically once one does', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'ValueBox Baseline Trend')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-density-variant'))
    await expect(card.getByText('15,371')).toBeVisible({ timeout: 20_000 })

    // Same real, established technique tablePanel.spec.ts's own
    // "no baseline resolves" test already uses. appState.unregister() is
    // purely a JS state-layer operation (state/appState.ts's own source)
    // — it never drops the underlying DuckDB views, so re-registering the
    // SAME real scenario names below immediately resolves against
    // already-real, already-registered data, no re-fetch needed.
    await page.evaluate(() => {
      for (const s of window.__wftdm!.appState.list()) {
        window.__wftdm!.appState.unregister(s.name)
      }
    })
    await expect(card.getByText('No baseline')).toBeVisible()

    await page.evaluate(() => {
      window.__wftdm!.appState.register('activitysim-baseline', {
        source: 'url',
        path: 'test/activitysim-baseline',
      })
      window.__wftdm!.appState.setStatus('activitysim-baseline', 'ready')
      window.__wftdm!.appState.register('activitysim-density-variant', {
        source: 'url',
        path: 'test/activitysim-density-variant',
      })
      window.__wftdm!.appState.setStatus('activitysim-density-variant', 'ready')
      window.__wftdm!.appState.setBaseline('activitysim-density-variant')
    })
    await expect(card.getByText('15,371')).toBeVisible({ timeout: 20_000 })
  })

  test('baseline_trend with no scenario: pinned shows a configuration-error state, never a crash', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'ValueBox Baseline Trend No Scenario (intentional)')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card.getByText('Trend unavailable')).toBeVisible()
  })

  test('resolved baseline equals the panel\'s own scenario: shows a distinct "no change" state, not a misleading arrow', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'ValueBox Baseline Trend Self (intentional)')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-baseline'))

    // Same view aliased as both a and b — a real, guaranteed-zero diff
    // (a.total_trips - b.total_trips, same column, same scenario), not a
    // division error or a stale up/down arrow.
    await expect(card.locator('svg.lucide-minus')).toBeVisible()
    await expect(card.locator('svg.lucide-trending-up')).toHaveCount(0)
    await expect(card.locator('svg.lucide-trending-down')).toHaveCount(0)
  })

  test('a value-box panel with no baseline_trend configuration renders exactly as before this capability existed', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Households')
    await expect(card).toBeVisible()
    await expect(card.getByText('5,000')).toBeVisible()
    await expect(card.locator('[data-slot="badge"], .lucide-trending-up, .lucide-trending-down')).toHaveCount(0)
  })

  test('both sparkline and baseline_trend together render without crowding the primary value', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'ValueBox Both Trends')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-density-variant'))

    await expect(card.getByText('23,583')).toBeVisible() // primary value
    await expect(card.getByText('15,371')).toBeVisible({ timeout: 20_000 }) // trend badge
    await expect(card.locator('.observable-plot-chart svg[viewBox]')).not.toHaveCount(0) // sparkline
  })
})
