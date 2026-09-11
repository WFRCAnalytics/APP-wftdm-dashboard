import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 030-sidebar-navigation — real-browser coverage for User Story 1 (the
// left sidebar itself). quickstart.md Scenario 1/2.
//
// 040-test-suite-migration: migrated off the retired synthetic
// tests/fixtures/dashboard-config/ 3-tab set. Asserts against the REAL
// public/demo-dashboard-config/ set: 7 calibration tabs plus the
// PERMANENT 8th dashboard-8-test.yaml entry (header.tab is a single
// space " ", so its visible label normalizes to ''). FR-003's "tracks
// whatever is discovered, zero code change" is proven by routing the
// demo index.json to a smaller subset and re-booting — no on-disk
// mutation.

// The 8th ("Test") tab's header.tab is " "; Playwright's toHaveText
// normalizes whitespace, so it appears as '' in a text array.
const REAL_TABS = [
  'Summary',
  'Person & Households',
  'Tour',
  'Mode Choice',
  'Trip',
  'Network',
  'Explore',
  '',
]

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function sidebarTablist(page: Page) {
  return page.locator('[data-sidebar="sidebar"]').getByRole('tablist')
}

test.describe('030-sidebar-navigation — User Story 1 (sidebar shell)', () => {
  test('every discovered tab renders as a sidebar item, tracking a differently-sized set with zero code change (FR-001–FR-003)', async ({
    page,
  }) => {
    // The real discovered set: 7 demo tabs + the permanent test tab.
    await boot(page)
    await expect(sidebarTablist(page).getByRole('tab')).toHaveCount(REAL_TABS.length)
    await expect(sidebarTablist(page).getByRole('tab')).toHaveText(REAL_TABS)

    // A genuinely DIFFERENT, smaller discovered set — re-verified with NO
    // code change (FR-003). Route the demo index.json to a 4-entry subset.
    await page.route('**/demo-dashboard-config/index.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          dashboards: [
            'dashboard-1-summary.yaml',
            'dashboard-2-person-household.yaml',
            'dashboard-7-explore.yaml',
            'dashboard-8-test.yaml',
          ],
          title: 'WFRC TDM Calibration Dashboard',
        }),
      }),
    )
    await boot(page)
    await expect(sidebarTablist(page).getByRole('tab')).toHaveCount(4)
    await expect(sidebarTablist(page).getByRole('tab')).toHaveText([
      'Summary',
      'Person & Households',
      'Explore',
      '',
    ])
  })

  test('the sidebar collapses/expands only on manual trigger, never on scroll (FR-002, FR-006)', async ({
    page,
  }) => {
    await boot(page)
    const sidebar = page.locator('[data-sidebar="sidebar"]')
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')

    await page.getByRole('button', { name: /toggle sidebar/i }).click()
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')

    await page.mouse.wheel(0, 2000)
    await page.waitForTimeout(200)
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')

    await page.getByRole('button', { name: /toggle sidebar/i }).click()
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  })

  test('brand/logo and Settings are visually distinct from the primary tab list (US1 acceptance)', async ({
    page,
  }) => {
    await boot(page)
    // DashboardBrand renders in the sidebar header (above the tab list);
    // Settings renders in the sidebar footer (below it). The real demo
    // branding is the WFRC logo + "WFRC TDM Calibration Dashboard" title.
    await expect(page.getByRole('img', { name: /wfrc/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  })

  test('the permanent 8th tab is an inconspicuous sliver — no icon, whitespace-only label, real aria-label (040 FR-019–FR-021)', async ({
    page,
  }) => {
    await boot(page)
    const tabs = sidebarTablist(page).getByRole('tab')
    await expect(tabs).toHaveCount(8)

    const testTab = page.getByRole('tab', { name: 'Test' })
    await expect(testTab).toHaveCount(1)
    await expect(tabs.nth(7)).toHaveAttribute('aria-label', 'Test')
    await expect(testTab.locator('svg')).toHaveCount(0)
    const labelText = await testTab.locator('span').first().textContent()
    expect((labelText ?? '').trim()).toBe('')

    // Every real tab, by contrast, has a visible label.
    await expect(tabs.first().getByText('Summary', { exact: true })).toBeVisible()
  })
})
