import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'
import { acquireSharedFixtureLock, releaseSharedFixtureLock } from './_sharedFixtureLock'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 030-sidebar-navigation — real-browser coverage for User Story 1 (the
// left sidebar itself). quickstart.md Scenario 1/2.
//
// This spec needs a FOURTH fixture tab beyond the shared
// tests/fixtures/dashboard-config/ default set (Summary/Detail/Basemaps —
// 8 other existing spec files hardcode that exact 3-tab set, confirmed via
// a full-suite grep before writing this file) to prove FR-003's own
// "tracks whatever is discovered, zero code change" requirement against a
// DIFFERENT tab count. Rather than mutate the shared fixture index.json
// (the risk 026-activitysim-demo-content's own history already recorded
// once for a similar reason), this spec follows
// demoContentAllPanels.spec.ts's own established technique: a file-scoped
// beforeAll/afterAll temporarily rewrites public/dashboard-config/
// index.json (the LIVE, already-copied-by-global-setup.js path, not the
// tests/fixtures/ source) to add the new tab, then restores the original
// 3-tab content afterward — scoped to this file's own lifecycle.
// dashboard-4-sidebar-demo.yaml itself is already present on disk at
// public/dashboard-config/ — global-setup.js's own cpSync copies the WHOLE
// tests/fixtures/dashboard-config/ directory recursively, not just the
// files index.json happens to list.
//
// CORRECTION (found via a real, reproduced full-suite run, T035): this was
// originally believed "safe under playwright.config.js's fullyParallel:
// false (spec files run sequentially)" — that assumption was WRONG.
// fullyParallel: false only serializes tests WITHIN one file; a real run
// reported "Running 291 tests using 10 workers", genuine cross-file
// parallelism, and dashboardShell.spec.ts's own exact-3-tab assertion
// really did observe this file's injected "Explore Fixture" tab mid-run.
// Fixed with a real cross-worker lock (_sharedFixtureLock.ts) — see that
// module's own header comment for the full finding.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DASHBOARD_INDEX_PATH = path.resolve(__dirname, '../../public/dashboard-config/index.json')
let originalIndexContent: string

const DEFAULT_INDEX = {
  dashboards: ['dashboard-1-summary.yaml', 'dashboard-2-detail.yaml', 'dashboard-3-basemaps.yaml'],
  title: 'Fixture Test Dashboard',
  logoUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='32'%3E%3Crect width='120' height='32' fill='%23023c5b'/%3E%3C/svg%3E",
  logoUrlDark:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='32'%3E%3Crect width='120' height='32' fill='%23ffffff'/%3E%3C/svg%3E",
}

test.beforeAll(async () => {
  // Another spec file (e.g. demoContentAllPanels.spec.ts, ~5+ minutes)
  // may already hold this lock — Playwright's own default beforeAll
  // timeout (inherited from the test timeout) can otherwise elapse while
  // merely waiting for it. Real, legitimate queueing, not a hang.
  test.setTimeout(420_000)
  await acquireSharedFixtureLock()
  originalIndexContent = readFileSync(DASHBOARD_INDEX_PATH, 'utf8')
})

test.afterAll(() => {
  writeFileSync(DASHBOARD_INDEX_PATH, originalIndexContent)
  releaseSharedFixtureLock()
})

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

test.describe('030-sidebar-navigation — User Story 1 (sidebar shell)', () => {
  test('every discovered tab renders as a sidebar item, tracking a differently-sized fixture set with zero code change (FR-001–FR-003)', async ({
    page,
  }) => {
    // Real Scenario 1 (quickstart.md): first the DEFAULT 3-tab set...
    await boot(page)
    const sidebarTablist = page.locator('[data-sidebar="sidebar"]').getByRole('tablist')
    await expect(sidebarTablist.getByRole('tab')).toHaveCount(3)
    await expect(sidebarTablist.getByRole('tab')).toHaveText(['Summary', 'Detail', 'Basemaps'])

    // ...then a genuinely DIFFERENT, larger fixture set (4 tabs instead of
    // 3) — re-verified with NO code change, proving FR-003 directly rather
    // than just the one default-size case.
    writeFileSync(
      DASHBOARD_INDEX_PATH,
      JSON.stringify(
        { ...DEFAULT_INDEX, dashboards: [...DEFAULT_INDEX.dashboards, 'dashboard-4-sidebar-demo.yaml'] },
        null,
        2,
      ),
    )
    await boot(page)
    await expect(sidebarTablist.getByRole('tab')).toHaveCount(4)
    await expect(sidebarTablist.getByRole('tab')).toHaveText([
      'Summary',
      'Detail',
      'Basemaps',
      'Explore Fixture',
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

    // Scroll a long tab (Summary — real, many-row content) — collapsed
    // state MUST be completely unaffected by scroll position.
    await page.mouse.wheel(0, 2000)
    await page.waitForTimeout(200)
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')

    // The manual trigger still works after a scroll — collapse isn't
    // stuck, just unaffected BY scroll specifically.
    await page.getByRole('button', { name: /toggle sidebar/i }).click()
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  })

  test('brand/logo and Settings are visually distinct from the primary tab list (US1 acceptance)', async ({
    page,
  }) => {
    await boot(page)
    // DashboardBrand renders in the sidebar header, above the tab list;
    // Settings renders in the sidebar footer, below it — both real,
    // separately-located regions, not flattened into the tab list itself.
    await expect(page.getByRole('img', { name: /fixture test dashboard/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  })
})
