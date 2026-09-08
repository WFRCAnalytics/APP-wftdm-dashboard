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
// Uses tests/fixtures/dashboard-config/dashboard-1-summary.yaml's own
// real `sections:` addition (3 sections, one grouping 2 rows) — no new
// fixture file needed; this tab is already part of the DEFAULT 3-tab
// fixture set every other spec depends on, so this file does NOT need
// sidebarNav.spec.ts's/fullPagePanel.spec.ts's own temporary index.json
// swap technique at all.
async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

test.describe('030-sidebar-navigation — User Story 3 (accordion sub-navigation)', () => {
  test('sections show only for the active tab, hidden immediately on switch (FR-013–FR-015, SC-004)', async ({
    page,
  }) => {
    await boot(page)
    // Summary is the landing tab — already active on load.
    await expect(page.getByRole('button', { name: 'KPIs & Charts' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tables' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Explore' })).toBeVisible()

    await page.getByRole('tab', { name: 'Detail' }).click()
    // No residual/duplicate section entries for the now-inactive Summary
    // tab — hidden, not just visually collapsed.
    await expect(page.getByRole('button', { name: 'KPIs & Charts' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tables' })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Summary' }).click()
    await expect(page.getByRole('button', { name: 'KPIs & Charts' })).toBeVisible()
  })

  test('a section sub-item scrolls to its content, no full page navigation (FR-016)', async ({
    page,
  }) => {
    await boot(page)
    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })

    await page.getByRole('button', { name: 'Tables' }).click()
    await page.waitForFunction(() => {
      const el = document.getElementById('section-tables')
      const r = el?.getBoundingClientRect()
      return r && r.top >= 0 && r.top < 150
    })
    expect(navigated).toBe(false)
  })

  test('a section grouping two rows anchors at the FIRST row in real layout order (FR-013, data-model.md §2)', async ({
    page,
  }) => {
    await boot(page)
    // "KPIs & Charts" groups [row_kpis, row_chart] — the anchor MUST land
    // on row_kpis (the first of the two in real layout order), not
    // row_chart, and row order itself must be unaffected by the grouping
    // (sections never reorder rows).
    const anchor = page.locator('#section-kpis_and_charts')
    await expect(anchor).toHaveAttribute('data-testid', 'row_kpis')
    const rowOrder = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')),
    )
    expect(rowOrder.indexOf('row_kpis')).toBeLessThan(rowOrder.indexOf('row_chart'))
  })

  test('a tab with no sections shows no expand affordance and no sub-list (FR-013 default)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    // Basemaps' own fixture has no sections: key at all — the default,
    // unchanged appearance for every existing dashboard-*.yaml today.
    const basemapsItem = page.getByRole('tab', { name: 'Basemaps' })
    await expect(basemapsItem).not.toHaveAttribute('aria-expanded', 'true')
  })

  test('collapsed sidebar shows no section sub-items regardless of active tab (FR-017)', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.getByRole('button', { name: 'KPIs & Charts' })).toBeVisible()

    await page.getByRole('button', { name: /toggle sidebar/i }).click()
    await expect(page.locator('[data-sidebar="sidebar"]')).toHaveAttribute('data-state', 'collapsed')
    await expect(page.getByRole('button', { name: 'KPIs & Charts' })).toHaveCount(0)
  })
})
