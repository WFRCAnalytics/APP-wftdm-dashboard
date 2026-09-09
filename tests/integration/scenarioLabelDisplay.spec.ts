import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 035-scenario-label-color (Part A — User Story
// 1). Fixture: tests/fixtures/dashboard-config/dashboard-1-summary.yaml's
// `row_scenario_display` — four panels (plotly/recharts/observable-plot/
// table), all bound to `summary_kpis` (the one metric with matching
// columns published under both `good_scenario` and `observed`), all
// splitting/keying by the bare `scenario` column, no `scenario:`/
// `scenarios:` pin. See quickstart.md Scenarios 1-4.

async function boot(page: Page, searchParams = '') {
  await page.goto('/' + searchParams)
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function setLabel(page: Page, name: string, label: string) {
  await page.evaluate(([n, l]) => window.__wftdm!.appState.setLabel(n, l), [name, label])
}

async function clearLabel(page: Page, name: string) {
  await page.evaluate((n) => window.__wftdm!.appState.clearLabel(n), name)
}

test.describe('User Story 1 - Scenario labels appear everywhere a name is shown', () => {
  test('a labeled scenario\'s name resolves to the label in a Plotly legend', async ({ page }) => {
    await boot(page, '?s=good_scenario')
    await setLabel(page, 'good_scenario', 'Preferred Alternative')

    const card = panelCard(page, 'Scenario Split (Plotly)')
    await expect(card).toBeVisible()
    // Plotly's own legend renders trace names as real, visible <text>
    // nodes inside the plot's own legend group.
    await expect(card.getByText('Preferred Alternative')).toBeVisible()
    // observed has no label set — its real name still renders unchanged.
    await expect(card.getByText('observed', { exact: true })).toBeVisible()
  })

  test('a labeled scenario\'s name resolves to the label in Recharts/Observable Plot/Table', async ({
    page,
  }) => {
    await boot(page, '?s=good_scenario')
    await setLabel(page, 'good_scenario', 'Preferred Alternative')

    const rechartsCard = panelCard(page, 'Scenario Split (Recharts)')
    await expect(rechartsCard).toBeVisible()
    await expect(rechartsCard.getByText('Preferred Alternative')).toBeVisible()

    const plotCard = panelCard(page, 'Scenario Split (Observable Plot)')
    await expect(plotCard).toBeVisible()
    await expect(plotCard.getByText('Preferred Alternative')).toBeVisible()

    const tableCard = panelCard(page, 'Scenario Split (Table)')
    await expect(tableCard).toBeVisible()
    // Cell values in the scenario column show the label — summary_kpis
    // has 2 rows per scenario, so 2 matching cells is real and expected.
    await expect(tableCard.getByText('Preferred Alternative').first()).toBeVisible()
    // ...but the column HEADER is still the literal field name, never a
    // scenario name (contracts §1.4) — it was never affected either way.
    await expect(tableCard.getByRole('columnheader', { name: 'scenario' })).toBeVisible()
  })

  test('an unlabeled scenario displays its real name exactly as before', async ({ page }) => {
    await boot(page, '?s=good_scenario')
    // No label set on either scenario at all.
    const card = panelCard(page, 'Scenario Split (Plotly)')
    await expect(card).toBeVisible()
    await expect(card.getByText('good_scenario', { exact: true })).toBeVisible()
    await expect(card.getByText('observed', { exact: true })).toBeVisible()
  })

  test('label change/clear on an already-rendered panel updates immediately, no reload', async ({
    page,
  }) => {
    await boot(page, '?s=good_scenario')
    const card = panelCard(page, 'Scenario Split (Recharts)')
    await expect(card).toBeVisible()
    await expect(card.getByText('good_scenario', { exact: true })).toBeVisible()

    await setLabel(page, 'good_scenario', 'Preferred Alternative')
    await expect(card.getByText('Preferred Alternative')).toBeVisible()
    await expect(card.getByText('good_scenario', { exact: true })).toHaveCount(0)

    await clearLabel(page, 'good_scenario')
    await expect(card.getByText('good_scenario', { exact: true })).toBeVisible()
    await expect(card.getByText('Preferred Alternative')).toHaveCount(0)
  })

  test('the underlying SQL never references the label — real scenario names only', async ({ page }) => {
    await boot(page, '?s=good_scenario')
    await setLabel(page, 'good_scenario', 'Preferred Alternative')
    await expect(panelCard(page, 'Scenario Split (Plotly)')).toBeVisible()

    const queryLog = await page.evaluate(() => window.__wftdm!.__debugQueryLog())
    // Scoped to THIS feature's own row_scenario_display panels
    // specifically: buildPanelQuery() emits `SELECT *` for a metric-bound
    // panel (no column names appear literally in the SQL at all — a real,
    // confirmed finding from this test's own first run, corrected here),
    // so the real distinguishing signal is the $scenario.<metric> UNION
    // ALL itself — the unrelated "Total Households" valuebox panel
    // elsewhere on this tab is pinned to one scenario and never unions.
    const summaryQueries = queryLog.filter((sql) => sql.includes('summary_kpis') && sql.includes('UNION ALL'))
    expect(summaryQueries.length).toBeGreaterThan(0)
    for (const sql of summaryQueries) {
      expect(sql).not.toContain('Preferred Alternative')
      expect(sql).toContain('good_scenario')
    }
  })
})
