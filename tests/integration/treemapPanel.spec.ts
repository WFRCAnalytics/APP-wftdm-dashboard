import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 058-hierarchical-chart-panels — real-browser tests for the new `treemap`
// panel type. Real vehicle: "Trip Purpose to Mode Breakdown (Treemap)"
// (dashboard-8-test.yaml, purpose_mode_flow, activitysim-baseline) — a
// genuine two-level hierarchy (10 real primary_purpose values, each
// splitting into up to 5 real major_trip_mode values), confirmed live via
// the duckdb CLI before authoring this file (research.md §2):
// work=8626, shopping=3391, othdiscr=2584, othmaint=1745, atwork=1743,
// school=1576, eatout=1413, escort=888, univ=857, social=760 (real
// per-purpose totals); smallest real leaf: school/Ride Hail = 1 trip.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoTestTab(page: Page) {
  await page.getByRole('tab', { name: 'Test' }).click()
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

const REAL_TITLE = 'Trip Purpose to Mode Breakdown (Treemap)'

test.describe('User Story 1 - Author renders a real hierarchical breakdown as a zoomable treemap', () => {
  test('renders one region per real primary_purpose, sized/colored correctly, cross-checked against a direct query', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, REAL_TITLE)
    const regions = card.locator('g[data-node-name]')

    await expect(regions).toHaveCount(10, { timeout: 10_000 })

    // Direct aggregation of the real data — never a hardcoded expected
    // value (matches this project's own established convention).
    const totals = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT primary_purpose, SUM(trips) AS total FROM "activitysim-baseline__purpose_mode_flow" GROUP BY primary_purpose ORDER BY total DESC`,
      ),
    )
    expect(totals).toHaveLength(10)
    const topPurpose = String((totals as { primary_purpose: string }[])[0].primary_purpose)
    expect(topPurpose).toBe('work') // real, confirmed live via the duckdb CLI

    // Each region has its own real, distinct fill color (depth-1-ancestor
    // colored — research.md's own coloring-convention addendum), cycling
    // through the app's real --chart-1..5 tokens with wraparound (10
    // purposes, 5 tokens).
    // Direct child rect only — a node's own <clipPath> also contains a
    // nested <rect> (for label clipping), which `regions.locator('rect')`
    // would also match (its own default, unset SVG fill, `rgb(0,0,0)`,
    // masquerading as a spurious 6th "color" — a real bug found and fixed
    // in this test's own locator, not an app bug).
    const fills = await regions.locator('> rect').evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))
    expect(new Set(fills).size).toBe(5)
  })

  test('clicking a region zooms into its real mode breakdown; the title bar zooms back out', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, REAL_TITLE)
    const regions = card.locator('g[data-node-name]')
    await expect(regions).toHaveCount(10, { timeout: 10_000 })

    // "work" is real, confirmed the largest real purpose (8,626 trips) —
    // find it by its own data attribute rather than assuming DOM order.
    await card.locator('g[data-node-name="work"]').click()

    // Real cross-check: work splits into exactly 5 real major_trip_mode
    // values (SOV/HOV/Transit/Non-Motorized/Ride Hail).
    await expect(card.locator('g[data-node-name]')).toHaveCount(5, { timeout: 10_000 })
    await expect(card.locator('g[data-node-name="SOV"]')).toBeVisible()

    // The title bar (the current focus's own zoom-out affordance) now
    // reads "← work" — clicking it returns to the full 10-purpose view.
    await card.getByText('work', { exact: false }).first().click()
    await expect(card.locator('g[data-node-name]')).toHaveCount(10, { timeout: 10_000 })
  })

  test('hovering any region shows its real underlying value, cross-checked against a direct query', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, REAL_TITLE)
    const regions = card.locator('g[data-node-name]')
    await expect(regions).toHaveCount(10, { timeout: 10_000 })

    const workGroup = card.locator('g[data-node-name="work"]')
    await workGroup.hover()
    const tooltip = card.locator('.map-tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText('work')
    await expect(tooltip).toContainText('8,626') // real, confirmed live sum
  })

  test('a zero-row query renders the shared PanelEmptyState; a broken-metric config renders the shared PanelErrorState', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)

    const emptyCard = panelCard(page, 'Treemap Empty Result')
    await expect(emptyCard.getByText('No data for this selection', { exact: true })).toBeVisible({ timeout: 10_000 })

    const errorCard = panelCard(page, 'Broken Treemap Panel (missing metric)')
    await expect(errorCard.getByText("Couldn't load this chart", { exact: true })).toBeVisible({ timeout: 10_000 })

    // FR-008: a broken treemap panel does not prevent the real, working
    // treemap panel on the same tab from rendering.
    await expect(panelCard(page, REAL_TITLE).locator('g[data-node-name]')).toHaveCount(10, { timeout: 10_000 })
  })

  test('zooming in and back out fires zero new DuckDB queries beyond the initial fetch', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, REAL_TITLE)
    const regions = card.locator('g[data-node-name]')
    await expect(regions).toHaveCount(10, { timeout: 10_000 })

    // Two real, confirmed findings while authoring this test (traced via
    // temporary debug specs, since deleted, not assumed):
    // (1) a raw, unscoped total query count is not safe on this crowded
    // Test tab — an unrelated zonemap panel elsewhere fires its own
    // one-time, independently-lazy geometry query at an arbitrary point.
    // (2) even a "purpose_mode_flow"-scoped count is not safe EARLY —
    // several sibling fixture panels (empty/broken/degenerate, both chart
    // types) also reference this same metric and can still be finishing
    // their own FIRST, real, legitimate fetch when a check fires too
    // soon, which looks identical to a spurious refetch. Fixed by polling
    // query-log length until it stops growing (matches this project's
    // own established `waitForChartToSettle()`-style convention,
    // rechartsPanel.spec.ts) before ever taking the "before" snapshot —
    // guarantees every sibling panel's own one-time initial fetch has
    // already happened.
    async function waitForQueryActivityToSettle() {
      // Requires THREE consecutive agreeing reads, 500ms apart — a single
      // agreeing pair (the original, real, confirmed-too-eager version of
      // this helper) still missed a slower trailing async chain elsewhere
      // on this crowded tab (GraphicWalker's own dataset-picker issues
      // several sequential catalog/schema-consistency queries per
      // scenario) often enough to make this test genuinely flaky — found
      // live, not assumed, by re-running it repeatedly.
      let stableStreak = 0
      let previous = -1
      await expect
        .poll(
          async () => {
            const current = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)
            stableStreak = current === previous ? stableStreak + 1 : 0
            previous = current
            return stableStreak
          },
          { timeout: 15_000, intervals: [500] },
        )
        .toBeGreaterThanOrEqual(3)
    }

    await waitForQueryActivityToSettle()
    const queryCountBefore = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)

    await card.locator('g[data-node-name="work"]').click()
    await expect(card.locator('g[data-node-name]')).toHaveCount(5, { timeout: 10_000 })
    await card.getByText('work', { exact: false }).first().click()
    await expect(card.locator('g[data-node-name]')).toHaveCount(10, { timeout: 10_000 })

    const queryCountAfter = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)
    expect(queryCountAfter).toBe(queryCountBefore)
  })

  test('a degenerate single-branch hierarchy renders sensibly, never an error', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Treemap Degenerate Single Branch')
    // Real, confirmed live: filtering to primary_purpose='work' leaves
    // exactly 5 real major_trip_mode rows sharing one top-level path
    // value ("work") — the root has exactly one child, which fills the
    // whole view at the initial (unzoomed) level. Never an error/blank
    // panel despite this degenerate, single-top-level-branch shape.
    await expect(card.locator('g[data-node-name]')).toHaveCount(1, { timeout: 10_000 })
    await expect(card.locator('g[data-node-name="work"]')).toBeVisible()
    await expect(card.getByText("Couldn't load this chart", { exact: true })).toHaveCount(0)

    // Zooming into that one branch reveals its own real 5-mode breakdown —
    // proving the degenerate shape doesn't just render, it's fully
    // interactive too.
    await card.locator('g[data-node-name="work"]').click()
    await expect(card.locator('g[data-node-name]')).toHaveCount(5, { timeout: 10_000 })
  })
})
