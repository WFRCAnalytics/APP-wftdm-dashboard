import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 035-scenario-label-color (Part A — User Story
// 1).
//
// 040-test-suite-migration: migrated off the retired
// tests/fixtures/dashboard-config/dashboard-1-summary.yaml (deleted in
// T011 — its own `row_scenario_display` four Scenario-Split-* panels,
// all bound to one shared `summary_kpis` metric). The real demo config
// has no single shared-metric panel set like that, so this file instead
// reuses the SAME real, already-validated unpinned panels
// `demoMultiScenario.spec.ts` (038) established for exactly this kind of
// per-scenario-series check, one per real panel type: "Total Trips by
// Mode" (recharts, `series: scenario`) and "Average Trip Distance by
// Purpose" (plotly, `name: $scenario`) — both Summary tab — plus "Auto
// Ownership by Household Segment" (table, unpinned, real `scenario`
// column labeled "Scenario") and "Workplace Location Distance
// Distribution" (observable-plot, `fill: scenario`) — both Person &
// Households tab. All three real demo scenarios
// (activitysim-baseline/-density-variant/-transit-variant) auto-activate
// by default (038) — no `?s=` param needed.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('activitysim-transit-variant')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function gotoTab(page: Page, name: string) {
  await page.getByRole('tablist').getByRole('tab', { name, exact: true }).click()
}

async function setLabel(page: Page, name: string, label: string) {
  await page.evaluate(([n, l]) => window.__wftdm!.appState.setLabel(n, l), [name, label])
}

async function clearLabel(page: Page, name: string) {
  await page.evaluate((n) => window.__wftdm!.appState.clearLabel(n), name)
}

test.describe('User Story 1 - Scenario labels appear everywhere a name is shown', () => {
  test('a labeled scenario\'s name resolves to the label in a Plotly legend', async ({ page }) => {
    await boot(page)
    await setLabel(page, 'activitysim-baseline', 'Preferred Alternative')

    const card = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(card).toBeVisible()
    // Plotly's own legend renders trace names as real, visible <text>
    // nodes inside the plot's own legend group.
    await expect(card.getByText('Preferred Alternative')).toBeVisible()
    // The other two real scenarios have no label set — their real names
    // still render unchanged.
    await expect(card.getByText('activitysim-density-variant', { exact: true })).toBeVisible()
    await expect(card.getByText('activitysim-transit-variant', { exact: true })).toBeVisible()
  })

  test('a labeled scenario\'s name resolves to the label in Recharts/Observable Plot/Table', async ({
    page,
  }) => {
    await boot(page)
    await setLabel(page, 'activitysim-baseline', 'Preferred Alternative')

    const rechartsCard = panelCard(page, 'Total Trips by Mode')
    await expect(rechartsCard).toBeVisible()
    await expect(rechartsCard.getByText('Preferred Alternative')).toBeVisible()

    await gotoTab(page, 'Person & Households')
    const plotCard = panelCard(page, 'Workplace Location Distance Distribution')
    await expect(plotCard).toBeVisible()
    await expect(plotCard.getByText('Preferred Alternative').first()).toBeVisible()

    const tableCard = panelCard(page, 'Auto Ownership by Household Segment')
    await expect(tableCard).toBeVisible()
    // Cell values in the scenario column show the label — real, multiple
    // matching rows is expected (many households per scenario).
    await expect(tableCard.getByText('Preferred Alternative').first()).toBeVisible()
    // ...but the column HEADER is still the literal configured label
    // ("Scenario"), never a scenario name (contracts §1.4) — it was
    // never affected either way.
    await expect(tableCard.getByRole('columnheader', { name: 'Scenario' })).toBeVisible()
  })

  test('an unlabeled scenario displays its real name exactly as before', async ({ page }) => {
    await boot(page)
    // No label set on any scenario at all.
    const card = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(card).toBeVisible()
    await expect(card.getByText('activitysim-baseline', { exact: true })).toBeVisible()
    await expect(card.getByText('activitysim-density-variant', { exact: true })).toBeVisible()
    await expect(card.getByText('activitysim-transit-variant', { exact: true })).toBeVisible()
  })

  test('label change/clear on an already-rendered panel updates immediately, no reload', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Total Trips by Mode')
    await expect(card).toBeVisible()
    await expect(card.getByText('activitysim-baseline', { exact: true })).toBeVisible()

    await setLabel(page, 'activitysim-baseline', 'Preferred Alternative')
    await expect(card.getByText('Preferred Alternative')).toBeVisible()
    await expect(card.getByText('activitysim-baseline', { exact: true })).toHaveCount(0)

    await clearLabel(page, 'activitysim-baseline')
    await expect(card.getByText('activitysim-baseline', { exact: true })).toBeVisible()
    await expect(card.getByText('Preferred Alternative')).toHaveCount(0)
  })

  test('the underlying SQL never references the label — real scenario names only', async ({ page }) => {
    await boot(page)
    await setLabel(page, 'activitysim-baseline', 'Preferred Alternative')
    const card = panelCard(page, 'Total Trips by Mode')
    await expect(card).toBeVisible()
    // Wait for the panel's own real chart to actually render — the title
    // text becomes visible before the underlying query fires, so reading
    // the query log immediately after the title check alone is a real
    // race (found live: it read an empty log on the first attempt).
    // activitysim-baseline itself now shows the label, so wait on one of
    // the other two real, still-unlabeled scenario names instead.
    await expect(card.getByText('activitysim-density-variant', { exact: true })).toBeVisible()

    const queryLog = await page.evaluate(() => window.__wftdm!.__debugQueryLog())
    // The recharts panel's own real, unpinned $scenario union.
    const tripModeQueries = queryLog.filter(
      (sql) => sql.includes('trip_mode_share') && sql.includes('UNION ALL'),
    )
    expect(tripModeQueries.length).toBeGreaterThan(0)
    for (const sql of tripModeQueries) {
      expect(sql).not.toContain('Preferred Alternative')
      expect(sql).toContain('activitysim-baseline')
    }
  })
})
