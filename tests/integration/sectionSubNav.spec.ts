import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 030-sidebar-navigation — real-browser coverage for User Story 3
// (accordion sub-navigation). quickstart.md Scenario 5/6/7.
//
// 040-test-suite-migration: migrated off the retired
// tests/fixtures/dashboard-config/dashboard-1-summary.yaml (deleted in
// T011 — its own `sections:` there were "KPIs & Charts"/"Tables"/
// "Explore" on a fixture "Summary" tab, with a sectionless "Basemaps"
// tab as the negative case). The real demo config's OWN "Summary" tab
// (dashboard-1-summary.yaml) deliberately has NO `sections:` at all
// (CLAUDE.md's own established Summary-tab convention — a single flat
// KPI+chart page) — the exact opposite of the fixture's shape. Real
// `sections:` live on dashboard-2/3/4/5/6 instead (confirmed via a
// direct grep sweep of public/demo-dashboard-config/*.yaml). This file
// now uses the real "Mode Choice" tab (dashboard-4-mode-choice.yaml) for
// every "has sections" case — it has a real single-row section ("Tour
// Mode Choice") AND a real two-row section ("Trip Mode Choice", rows
// [row_trip_mode_flow, row_trip_mode_by_period]) in ONE tab, matching
// this file's own two distinct needs without requiring two separate
// real tabs — and the real, sectionless "Summary" landing tab for every
// "no sections" case (replacing the fixture's "Basemaps").
async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoTab(page: Page, name: string) {
  await page.getByRole('tablist').getByRole('tab', { name, exact: true }).click()
}

test.describe('030-sidebar-navigation — User Story 3 (accordion sub-navigation)', () => {
  test('sections show only for the active tab, hidden immediately on switch (FR-013–FR-015, SC-004)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    await expect(page.getByRole('button', { name: 'Tour Mode Choice', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'At-Work Subtour Mode Choice' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Trip Mode Choice' })).toBeVisible()

    await gotoTab(page, 'Summary')
    // No residual/duplicate section entries for the now-inactive Mode
    // Choice tab — hidden, not just visually collapsed.
    await expect(page.getByRole('button', { name: 'Tour Mode Choice', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'At-Work Subtour Mode Choice' })).toHaveCount(0)

    await gotoTab(page, 'Mode Choice')
    await expect(page.getByRole('button', { name: 'Tour Mode Choice', exact: true })).toBeVisible()
  })

  test('a section sub-item scrolls to its content, no full page navigation (FR-016)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })

    await page.getByRole('button', { name: 'Trip Mode Choice' }).click()
    await page.waitForFunction(() => {
      const el = document.getElementById('section-trip-mode-choice')
      const r = el?.getBoundingClientRect()
      return r && r.top >= 0 && r.top < 150
    })
    expect(navigated).toBe(false)
  })

  test('a section grouping two rows anchors at the FIRST row in real layout order (FR-013, data-model.md §2)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    // "Trip Mode Choice" groups [row_trip_mode_flow, row_trip_mode_by_period]
    // (dashboard-4-mode-choice.yaml) — the anchor MUST land on
    // row_trip_mode_flow (the first of the two in real layout order), not
    // row_trip_mode_by_period, and row order itself must be unaffected by
    // the grouping (sections never reorder rows).
    const anchor = page.locator('#section-trip-mode-choice')
    await expect(anchor).toHaveAttribute('data-testid', 'row_trip_mode_flow')
    const rowOrder = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')),
    )
    expect(rowOrder.indexOf('row_trip_mode_flow')).toBeLessThan(rowOrder.indexOf('row_trip_mode_by_period'))
  })

  test('a tab with no sections shows no expand affordance and no sub-list (FR-013 default)', async ({
    page,
  }) => {
    await boot(page)
    // Summary is the real landing tab and has no `sections:` key at all —
    // the default, unchanged appearance for a real dashboard-*.yaml with
    // no accordion grouping.
    await gotoTab(page, 'Summary')
    const summaryItem = page.getByRole('tab', { name: 'Summary' })
    await expect(summaryItem).not.toHaveAttribute('aria-expanded', 'true')
  })

  test('collapsed sidebar shows no section sub-items regardless of active tab (FR-017)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    await expect(page.getByRole('button', { name: 'Tour Mode Choice', exact: true })).toBeVisible()

    await page.getByRole('button', { name: /toggle sidebar/i }).click()
    await expect(page.locator('[data-sidebar="sidebar"]')).toHaveAttribute('data-state', 'collapsed')
    await expect(page.getByRole('button', { name: 'Tour Mode Choice', exact: true })).toHaveCount(0)
  })
})
