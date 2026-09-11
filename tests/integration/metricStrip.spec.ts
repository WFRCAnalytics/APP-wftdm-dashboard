import { test, expect } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 030-sidebar-navigation — real-browser coverage for User Story 4 (Metric
// Strip auto-fill layout). quickstart.md Scenario 8's own integration
// half (the unit half lives in tests/unit/dashboardLayout.test.ts).
//
// 040-test-suite-migration: migrated off the retired synthetic
// tests/fixtures/dashboard-config/ set. The real
// public/demo-dashboard-config/dashboard-1-summary.yaml (Summary tab)
// happens to use the SAME row key names the retired fixture did —
// `row_kpis` (5 valuebox panels: Households/Persons/Tours/Trips/Total
// VMT — already genuinely all-valuebox, FR-018's own auto-classification
// applies with no YAML change needed) and `row_charts` (plural in the
// real file, singular `row_chart` in the retired fixture — the one real
// difference) holding 2 non-valuebox panels (a recharts bar chart + a
// plotly chart), so it still correctly does NOT qualify as a Metric
// Strip row.
test.describe('030-sidebar-navigation — User Story 4 (Metric Strip layout)', () => {
  test('an all-valuebox row lays out as an auto-filling grid of minimum-width cards (FR-018)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    const strip = page.locator('[data-testid="row_kpis"]')
    await expect(strip).toHaveCSS('display', 'grid')

    // Column count varies by viewport width (auto-fill) — assert card
    // min-width instead of a fixed column count, per quickstart.md.
    const firstCard = strip.locator('> *').first()
    const box = await firstCard.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(200)
  })

  test('a mixed-panel-type row keeps the existing fraction-based layout, unaffected (FR-018/FR-020)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // row_charts (real Summary tab) holds a recharts panel + a plotly
    // panel — not all-valuebox — must use the ordinary gridTemplateColumns
    // fraction math, not auto-fill.
    const chartRow = page.locator('[data-testid="row_charts"]')
    const gridTemplateColumns = await chartRow.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    // Auto-fill rows resolve to a repeat(...)-driven multi-column value at
    // this viewport width; a real two-panel fraction row (0.5/0.5 width)
    // resolves to exactly two tracks. Confirms this row did NOT take the
    // Metric Strip branch.
    expect(gridTemplateColumns.trim().split(/\s+/)).toHaveLength(2)
  })

  test('an existing, unmodified dashboard-*.yaml file renders unchanged apart from the automatic Metric Strip reclassification (FR-020)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    // The Summary tab's own real content (panel titles, values) renders
    // exactly as before this feature — a spot-check against a few
    // already-known-real panels, not a full pixel diff.
    await expect(page.getByText('Households', { exact: true })).toBeVisible()
    await expect(page.getByText('Total Trips by Mode', { exact: true })).toBeVisible()
  })
})
