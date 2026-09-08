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
// Uses the default fixture set's own pre-existing `row_kpis` rows
// (dashboard-1-summary.yaml: 2 valuebox panels; dashboard-2-detail.yaml:
// 2 valuebox panels, one broken) — both are ALREADY genuinely all-
// valuebox rows, so no new fixture content was needed for this story at
// all: FR-018's own auto-classification applies to them automatically the
// moment isMetricStripRow()/dashboardRenderer.tsx's branch exist.
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

    // row_chart is a single plotly panel — not all-valuebox — must use
    // the ordinary gridTemplateColumns fraction math, not auto-fill.
    const chartRow = page.locator('[data-testid="row_chart"]')
    const gridTemplateColumns = await chartRow.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    // Auto-fill rows resolve to a repeat(...)-driven multi-column value at
    // this viewport width; a single-panel fraction row resolves to
    // exactly one track. Confirms this row did NOT take the Metric Strip
    // branch.
    expect(gridTemplateColumns.trim().split(/\s+/)).toHaveLength(1)
  })

  test('an existing, unmodified dashboard-*.yaml file renders unchanged apart from the automatic Metric Strip reclassification (FR-020)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    // The Summary tab's own real content (panel titles, values) renders
    // exactly as before this feature — a spot-check against a few
    // already-known-real panels, not a full pixel diff (that's T036's own
    // before/after screenshot pass).
    await expect(page.getByText('Total Households', { exact: true })).toBeVisible()
    await expect(page.getByText('Mode Share by Purpose', { exact: true })).toBeVisible()
  })
})
