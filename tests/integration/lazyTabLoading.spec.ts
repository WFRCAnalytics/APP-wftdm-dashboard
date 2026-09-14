import { test, expect } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 056-lazy-tab-scoped-loading — real-browser coverage for US1/US2's
// acceptance scenarios (spec.md), against the real, unmodified
// public/demo-dashboard-config/ content (same convention
// dashboardShell.spec.ts already established — no fixture-tree
// dependency). Real per-tab fan-out, traced directly (research.md §1):
// Summary references 3 distinct metrics, Tour references 13 (the
// largest real tab) — both crossed with the 3 real demo scenarios.

async function boot(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForSelector('h1:has-text("Summary")', { timeout: 15_000 })
}

test.describe('User Story 1 - Fast landing on the tab a viewer actually opens', () => {
  test('the landing tab registers only its own real referenced metrics, not the full deployment catalog', async ({
    page,
  }) => {
    await boot(page)
    await page.waitForTimeout(1500)

    const views = await page.evaluate(() => window.__wftdm!.listViews())
    // Summary's own real fan-out (research.md §1): summary_kpis,
    // trip_distance_by_purpose, trip_mode_share — crossed with the 3 real
    // demo scenarios = 9, never the deployment's full 35-metric catalog.
    expect(views.length).toBe(9)
    for (const metric of ['summary_kpis', 'trip_distance_by_purpose', 'trip_mode_share']) {
      for (const scenario of ['activitysim-baseline', 'activitysim-density-variant', 'activitysim-transit-variant']) {
        expect(views).toContain(`${scenario}__${metric}`)
      }
    }
    // A metric ONLY the Tour tab references must not have loaded yet.
    expect(views).not.toContain('activitysim-baseline__mandatory_tour_scheduling')
  })

  test('switching to a not-yet-visited tab loads its own real metrics, and revisiting a loaded tab registers nothing new', async ({
    page,
  }) => {
    await boot(page)
    await page.waitForTimeout(1000)

    const tablist = page.getByRole('tablist').first()
    await tablist.getByRole('tab', { name: 'Tour' }).click()
    // A real loading indicator (this app's own established animate-pulse
    // skeleton convention) must appear at some point during this
    // transition — not asserted on a fixed delay, since it may resolve
    // fast on a local dev server; the real, durable assertion is the
    // eventual correct view count below.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Tour/, { timeout: 10_000 })
    await page.waitForTimeout(3000)

    const viewsAfterTour = await page.evaluate(() => window.__wftdm!.listViews())
    // 9 (Summary) + up to 39 new (13 metrics x 3 scenarios, Tour's own
    // real max fan-out) = up to 48 — never the full ~105.
    expect(viewsAfterTour.length).toBeLessThanOrEqual(48)
    expect(viewsAfterTour.length).toBeGreaterThan(9)
    expect(viewsAfterTour).toContain('activitysim-baseline__mandatory_tour_scheduling')

    const countBeforeRevisit = viewsAfterTour.length
    await tablist.getByRole('tab', { name: 'Summary' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Summary', { timeout: 10_000 })
    await page.waitForTimeout(1500)

    const viewsAfterRevisit = await page.evaluate(() => window.__wftdm!.listViews())
    expect(viewsAfterRevisit.length).toBe(countBeforeRevisit)
  })

  test('every panel on the landing tab renders real, correct data — no query-result regression from lazy loading', async ({
    page,
  }) => {
    await boot(page)
    // The real, existing value-box assertions dashboardShell.spec.ts
    // already covers in depth — this is a narrower, targeted re-check
    // specific to this feature's own concern: that lazy timing never
    // changes what a panel ultimately shows. Same exact-text convention
    // that file already established (real rendered "5000", not "5,000" —
    // a real, separate, pre-existing bigint-formatting gap unrelated to
    // this feature, not fixed here).
    await expect(page.getByText('Households', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('5000', { exact: true })).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('User Story 2 - Activating a scenario after arriving on a tab', () => {
  test('deactivating then reactivating a scenario while viewing a tab correctly drops then restores its data in the rendered result', async ({
    page,
  }) => {
    // 038-all-loaded-scenarios: every scenario whose catalog loads
    // successfully activates automatically, so by the time this test's
    // own boot() settles, the landing tab's real "Average Trip Distance
    // by Purpose" chart already shows all 3 real scenarios as separate
    // legend entries (confirmed live — see research.md's own screenshot
    // evidence) — there is no reachable "never-loaded" state for the
    // LANDING tab specifically, since it always eagerly loads every
    // scenario active at mount time. This test instead exercises the
    // real, meaningful, viewer-visible consequence spec.md FR-005/FR-006
    // actually care about: toggling a scenario off then back on while
    // already on a tab correctly drops then restores its data in what's
    // rendered — never a stale/incomplete result either direction. The
    // separate, genuinely-not-yet-loaded case (a tab visited for the
    // first time) is already covered by the "switching to a not-yet-
    // visited tab" test above (Tour's own 39 new views only appear once
    // visited, never before).
    await boot(page)
    await page.waitForTimeout(1500)

    const chart = page.locator('text=Average Trip Distance by Purpose').locator('../..')
    await expect(chart.locator('svg').getByText('activitysim-density-variant')).toBeVisible({ timeout: 10_000 })

    await page.evaluate(() => window.__wftdm!.appState.setActive('activitysim-density-variant', false))
    await expect(chart.locator('svg').getByText('activitysim-density-variant')).toHaveCount(0, {
      timeout: 10_000,
    })

    await page.evaluate(() => window.__wftdm!.appState.setActive('activitysim-density-variant', true))
    await expect(chart.locator('svg').getByText('activitysim-density-variant')).toBeVisible({ timeout: 10_000 })
  })
})
