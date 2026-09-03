import { test, expect } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser dashboard shell/navigation/panel tests — extends
// boot.spec.ts's pattern (real DuckDB-WASM, fixture Parquet from
// tests/fixtures/generate.py, dashboard-config fixtures copied to
// public/dashboard-config/ by tests/global-setup.js). See quickstart.md.

test.describe('User Story 1 - An analyst navigates a real, professionally-styled dashboard shell', () => {
  test('the visible tab set matches discovered config, and switching tabs changes content with no reload', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // SC-001: tab set exactly matches dashboard-config's header.tab entries.
    // "Basemaps" added by 011-basemap-style-system's own fixture tab
    // (dashboard-3-basemaps.yaml) — a real, permanent addition to the
    // shared fixture set, not a stray leftover.
    //
    // Scoped to navBar.tsx's own TabsList (a real role="tablist" region) —
    // a real, confirmed regression found during 014-graphic-walker-panel's
    // own implementation: a page-level, unscoped page.getByRole('tab')
    // query also picks up @kanaries/graphic-walker's own internal chart-
    // navigation UI (its "Data"/"Visualization" view switcher and "Chart
    // 1" tab strip both use role="tab" too, confirmed live), once a
    // graphic-walker panel exists on the Summary/landing tab. The app now
    // legitimately has two independent role="tablist" regions on one
    // page — scoping to the specific one this test actually means is the
    // correct fix, not a workaround.
    const navTabs = page.getByRole('tablist').first()
    const tabs = await navTabs.getByRole('tab').allTextContents()
    expect(tabs).toEqual(['Summary', 'Detail', 'Basemaps'])

    // FR-002: switching tabs changes content, no full page reload.
    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })
    await page.getByRole('tab', { name: 'Detail' }).click()
    await expect(page.getByText('Average Trip Distance')).toBeVisible()
    expect(navigated).toBe(false)

    // SC-004 (checkable properties): panel cards use border/shadow tokens,
    // not unstyled default HTML. Known DOM depth: CardTitle text ->
    // CardHeader -> Card (panelCard.tsx), so two parent hops from the
    // title text lands on the actual Card element.
    const cardEl = page.getByText('Average Trip Distance').locator('..').locator('..')
    await expect(cardEl).toHaveClass(/border/)
    const borderStyle = await cardEl.evaluate((el) => getComputedStyle(el).borderStyle)
    expect(borderStyle).toBe('solid')
  })
})

test.describe('User Story 2 - An analyst sees a real number, computed from real data', () => {
  test('a value-box panel displays a number matching its underlying fixture data', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // SC-002: matches tests/fixtures/generate.py's SUMMARY_KPIS_ROWS
    // (total_households: 1500, total_trips: 9200, both rows).
    await expect(page.getByText('Total Households')).toBeVisible()
    await expect(page.getByText('1,500')).toBeVisible()
    await expect(page.getByText('Total Trips')).toBeVisible()
    await expect(page.getByText('9,200')).toBeVisible()
  })
})

test.describe('User Story 3 - An analyst sees a real, filter-reactive chart', () => {
  test('a plotly panel renders real data and redraws in place when a filter changes', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await expect(page.locator('.js-plotly-plot')).toBeVisible({ timeout: 10_000 })

    // SC-003: changing the purpose filter re-queries and redraws without
    // a page reload, and — same container, not torn down and rebuilt.
    const before = await page.evaluate(() => {
      const gd = document.querySelector('.js-plotly-plot')
      return gd ? (gd as unknown as { data: unknown[] }).data.length : 0
    })
    expect(before).toBeGreaterThan(0)

    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NONEXISTENT'))
    // Scoped to this specific plotly panel's card, not the whole page —
    // other panels bound to the same global purpose filter (e.g.
    // 007-observable-plot-panel's fixture panels) legitimately also show
    // this same empty-state text when purpose matches nothing, which
    // would make an unscoped page-wide locator ambiguous (and flaky,
    // since how many have finished their own async fetch by the time
    // this assertion polls varies run to run).
    const plotlyCard = page.getByText('Mode Share by Purpose', { exact: true }).locator('..').locator('..')
    await expect(plotlyCard.getByText('No data for this selection')).toBeVisible()
    expect(navigated).toBe(false)

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await expect(page.locator('.js-plotly-plot')).toBeVisible()
    const plotlyDivCount = await page.locator('.js-plotly-plot').count()
    expect(plotlyDivCount).toBe(1) // same container reused, not duplicated
  })
})

test.describe('Panel error isolation (SC-006, FR-010)', () => {
  test("a broken panel's failure does not prevent sibling panels from rendering", async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.getByRole('tab', { name: 'Detail' }).click()

    // The deliberately-broken panel (dashboard-2-detail.yaml) shows a
    // scoped error...
    await expect(page.getByText("Couldn't load this value")).toBeVisible()
    // ...while its sibling on the same tab still renders correctly.
    await expect(page.getByText('Average Trip Distance')).toBeVisible()
    await expect(page.getByText('6.4')).toBeVisible()
  })
})
