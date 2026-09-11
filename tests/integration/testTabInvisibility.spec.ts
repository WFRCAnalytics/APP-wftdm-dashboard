import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 040-test-suite-migration — User Story 1 (P1).
//
// DESIGN REVERSAL (2026-09-10): dashboard-8-test.yaml is a PERMANENT 8th
// entry in the real public/demo-dashboard-config/index.json, present in
// every build. It is NOT test-only-injected. It is kept unobtrusive by
// its sidebar rendering: header.tab is a single space " " (a real, valid
// non-empty string that renders as a barely-visible sliver),
// header.icon is omitted, header.aria_label gives it a real accessible
// name ("Test"). contracts/dashboard-8-test.md — "Sidebar entry contract".

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

const REAL_SEVEN_TABS = [
  'Summary',
  'Person & Households',
  'Tour',
  'Mode Choice',
  'Trip',
  'Network',
  'Explore',
]

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function sidebarTabs(page: Page) {
  return page.locator('[data-sidebar="sidebar"]').getByRole('tablist').getByRole('tab')
}

test.describe('040 US1 — dashboard-8-test.yaml is a permanent, inconspicuous 8th tab', () => {
  test('the shipped, git-committed index.json lists dashboard-8-test.yaml as the permanent 8th entry (FR-002)', () => {
    const raw = readFileSync(
      path.join(REPO_ROOT, 'public/demo-dashboard-config/index.json'),
      'utf8',
    )
    const parsed = JSON.parse(raw)
    expect(parsed.dashboards).toEqual([
      'dashboard-1-summary.yaml',
      'dashboard-2-person-household.yaml',
      'dashboard-3-tour-models.yaml',
      'dashboard-4-mode-choice.yaml',
      'dashboard-5-trip-models.yaml',
      'dashboard-6-network.yaml',
      'dashboard-7-explore.yaml',
      'dashboard-8-test.yaml',
    ])
    // No leftover test-only-injection backup file (FR-003).
    expect(() =>
      readFileSync(
        path.join(REPO_ROOT, 'public/demo-dashboard-config/index.json.original-during-tests'),
      ),
    ).toThrow()
  })

  test('the sidebar has 8 tabs — the 8th is an inconspicuous sliver: no icon, whitespace-only label, accessible name "Test" (SC-001, SC-008, FR-019–FR-021)', async ({
    page,
  }) => {
    await boot(page)

    await expect(sidebarTabs(page)).toHaveCount(8)

    // Resolved purely by its aria-label accessible name.
    const testTab = page.getByRole('tab', { name: 'Test' })
    await expect(testTab).toHaveCount(1)
    // It is the 8th (last) sidebar tab.
    await expect(sidebarTabs(page).nth(7)).toHaveAttribute('aria-label', 'Test')

    // No icon glyph.
    await expect(testTab.locator('svg')).toHaveCount(0)

    // The visible label is whitespace only (a single space) — present,
    // technically visible as a thin sliver, but carrying no readable text.
    const labelText = await testTab.locator('span').first().textContent()
    expect((labelText ?? '').trim()).toBe('')

    // Still keyboard-navigable / activatable.
    await testTab.focus()
    await expect(testTab).toBeFocused()
    await testTab.press('Enter')
    await expect(testTab).toHaveAttribute('aria-selected', 'true')
  })

  test('the 7 real tabs are unchanged — each keeps its own icon and visible label', async ({
    page,
  }) => {
    await boot(page)
    for (const name of REAL_SEVEN_TABS) {
      const tab = page.getByRole('tab', { name, exact: true })
      await expect(tab).toBeVisible()
      await expect(tab.locator('svg')).not.toHaveCount(0)
      await expect(tab.getByText(name, { exact: true })).toBeVisible()
    }
  })

  test('opening the 8th tab renders the broken-panel test dashboard', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Test / Broken Panels' }),
    ).toBeVisible()
  })
})
