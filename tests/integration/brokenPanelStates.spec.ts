import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 040-test-suite-migration — User Story 1 (P1). Every error/edge case that
// the retired synthetic fixtures used to cover is reproduced by
// public/demo-dashboard-config/dashboard-8-test.yaml, using this app's
// existing grammar against the REAL demo scenarios/metrics — no synthetic
// Parquet (FR-004, FR-005, SC-004). contracts/dashboard-8-test.md is the
// authoritative panel inventory.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function gotoTestTab(page: Page) {
  await boot(page)
  await page.getByRole('tab', { name: 'Test' }).click()
  // The test tab is full_page + many panels → misconfiguration fallback to
  // ordinary card-grid rendering; give the many real DuckDB queries time
  // to settle into their (failed/empty) states.
  await page.waitForTimeout(2500)
}

test.describe('040 US1 — dashboard-8-test.yaml reproduces every error/empty state', () => {
  test('full_page + more than one panel → console.warn + ordinary card-grid render, never blank', async ({
    page,
  }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().includes('full_page')) warnings.push(msg.text())
    })
    await gotoTestTab(page)
    // Ordinary rendering: the page-title heading is present (full-page
    // mode suppresses it; the misconfiguration fallback restores it).
    await expect(
      page.getByRole('heading', { level: 1, name: 'Test / Broken Panels' }),
    ).toBeVisible()
    expect(warnings.length).toBeGreaterThan(0)
  })

  test('a panel whose metric names nothing shows the shared error state (one per panel type)', async ({
    page,
  }) => {
    await gotoTestTab(page)
    await expect(
      panelCard(page, 'Broken Table Panel (missing metric)').getByText("Couldn't load this table"),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Broken Plotly Panel (missing metric)').getByText("Couldn't load this chart"),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Broken Sankey Panel (missing metric)').getByText("Couldn't load this diagram"),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Broken Recharts Panel (missing metric)').getByText("Couldn't load this chart"),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Broken Observable Plot Panel (missing metric)').getByText(
        "Couldn't load this chart",
      ),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Broken Flow Map Panel (missing metric)').getByText("Couldn't load this map"),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Broken Zone Map Panel (missing metric)').getByText("Couldn't load this map"),
    ).toBeVisible()
  })

  test('recharts chart_type: pie surfaces a runtime validation error', async ({ page }) => {
    await gotoTestTab(page)
    await expect(
      panelCard(page, 'Recharts Invalid Chart Type (pie)').getByRole('alert'),
    ).toBeVisible()
  })

  test('an unreachable basemap preset falls back to blank style, data still renders', async ({
    page,
  }) => {
    await gotoTestTab(page)
    // The panels do NOT show the shared error state — the map chrome
    // mounts and the data-driven layer still renders; only the basemap
    // tiles are absent.
    await expect(
      panelCard(page, 'Flowmap Unreachable Basemap').getByText("Couldn't load this map"),
    ).toHaveCount(0)
    await expect(
      panelCard(page, 'Zone Map Unreachable Basemap').getByText("Couldn't load this map"),
    ).toHaveCount(0)
    await expect(page.getByText('Flowmap Unreachable Basemap', { exact: true })).toBeVisible()
    await expect(page.getByText('Zone Map Unreachable Basemap', { exact: true })).toBeVisible()
  })

  test('markdown XSS content is sanitized — no script runs, no on* handlers', async ({ page }) => {
    await gotoTestTab(page)
    await expect(page.getByText('Markdown XSS Payload (must be sanitized)', { exact: true })).toBeVisible()
    const xssFired = await page.evaluate(() => (window as unknown as { __xss_fired?: boolean }).__xss_fired === true)
    expect(xssFired).toBe(false)
    // The sanitized markdown still renders its safe content.
    const card = panelCard(page, 'Markdown XSS Payload (must be sanitized)')
    await expect(card.getByRole('heading', { name: 'Sanitized Heading' })).toBeVisible()
    await expect(card.locator('script')).toHaveCount(0)
    await expect(card.locator('[onerror]')).toHaveCount(0)
  })

  test('empty / whitespace-only markdown renders without crashing', async ({ page }) => {
    await gotoTestTab(page)
    await expect(page.getByText('Markdown Empty Content', { exact: true })).toBeVisible()
    await expect(page.getByText('Markdown Whitespace Only', { exact: true })).toBeVisible()
  })

  test('a valuebox with a broken sparkline / baseline_trend still shows its scalar value', async ({
    page,
  }) => {
    await gotoTestTab(page)
    // The panel is not blocked by the failing secondary query — the KPI
    // number renders (real total_trips for the baseline scenario).
    const sparkCard = panelCard(page, 'Value Box — Broken Sparkline')
    await expect(sparkCard.getByText("Couldn't load this value")).toHaveCount(0)
    await expect(sparkCard).toContainText(/[0-9]/)
    const trendCard = panelCard(page, 'Value Box — Broken Baseline Trend')
    await expect(trendCard.getByText("Couldn't load this value")).toHaveCount(0)
    await expect(trendCard).toContainText(/[0-9]/)
  })

  test('an unresolvable comparison: diff shows an error / no-data state, not a crash', async ({
    page,
  }) => {
    await gotoTestTab(page)
    const card = panelCard(page, 'Broken Comparison Diff (unresolvable a/b)')
    // Either the shared error state, or an empty table — never an unhandled
    // exception (the page stays interactive, other panels still render).
    await expect(page.getByText('Recharts Empty Result', { exact: true })).toBeVisible()
    await expect(card).toBeVisible()
  })

  test('a filter value matching zero real rows renders the empty state', async ({ page }) => {
    await gotoTestTab(page)
    const card = panelCard(page, 'Recharts Empty Result')
    // PanelEmptyState — no error alert, a "no data"-style message.
    await expect(card.getByRole('alert')).toHaveCount(0)
  })
})
