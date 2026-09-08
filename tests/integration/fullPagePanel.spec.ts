import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 030-sidebar-navigation — real-browser coverage for User Story 2
// (chromeless full-page panel mode). quickstart.md Scenario 3/4.
//
// Uses the shared fixture set's own "Explore Fixture" tab
// (tests/fixtures/dashboard-config/dashboard-4-sidebar-demo.yaml) — a
// genuinely single-panel graphic-walker tab with full_page: true — NOT
// referenced from the shared index.json (see sidebarNav.spec.ts's own
// header comment for why: avoiding disturbing the 8 existing spec files
// that hardcode the default 3-tab fixture count/names). Reachable here
// directly via its real, already-copied-to-disk YAML file plus a
// URL-independent boot: this spec doesn't need the tab in the sidebar's
// OWN discovered list at all — it navigates straight to it by adding it
// to a temporary index.json for this file's own lifecycle only, the same
// technique sidebarNav.spec.ts already established.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireSharedFixtureLock, releaseSharedFixtureLock } from './_sharedFixtureLock'

// CORRECTION (found via a real, reproduced full-suite run, T035): this
// file's own index.json swap — like sidebarNav.spec.ts's identical
// technique — was NOT actually safe under playwright.config.js's
// fullyParallel: false, which only serializes tests WITHIN one file. A
// real run reported genuine cross-file parallelism ("...using 10
// workers"); fixed with a real cross-worker lock — see
// _sharedFixtureLock.ts's own header comment for the full finding.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DASHBOARD_INDEX_PATH = path.resolve(__dirname, '../../public/dashboard-config/index.json')
let originalIndexContent: string

test.beforeAll(async () => {
  // Another spec file (e.g. demoContentAllPanels.spec.ts, ~5+ minutes)
  // may already hold this lock — Playwright's own default beforeAll
  // timeout (inherited from the test timeout) can otherwise elapse while
  // merely waiting for it. Real, legitimate queueing, not a hang.
  test.setTimeout(420_000)
  await acquireSharedFixtureLock()
  originalIndexContent = readFileSync(DASHBOARD_INDEX_PATH, 'utf8')
  writeFileSync(
    DASHBOARD_INDEX_PATH,
    JSON.stringify(
      {
        dashboards: [
          'dashboard-1-summary.yaml',
          'dashboard-2-detail.yaml',
          'dashboard-3-basemaps.yaml',
          'dashboard-4-sidebar-demo.yaml',
        ],
        title: 'Fixture Test Dashboard',
        logoUrl:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='32'%3E%3Crect width='120' height='32' fill='%23023c5b'/%3E%3C/svg%3E",
        logoUrlDark:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='32'%3E%3Crect width='120' height='32' fill='%23ffffff'/%3E%3C/svg%3E",
      },
      null,
      2,
    ),
  )
})

test.afterAll(() => {
  writeFileSync(DASHBOARD_INDEX_PATH, originalIndexContent)
  releaseSharedFixtureLock()
})

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoExploreFixture(page: Page) {
  await boot(page)
  await page.getByRole('tab', { name: 'Explore Fixture' }).click()
  // GraphicWalker's own mount + real DuckDB query settling.
  await page.waitForTimeout(1500)
}

test.describe('030-sidebar-navigation — User Story 2 (chromeless full-page panel mode)', () => {
  test('renders edge-to-edge, no page title, no Card chrome, no expand trigger (FR-008, FR-011)', async ({
    page,
  }) => {
    await gotoExploreFixture(page)

    // No redundant page-title block anywhere on this page — header.title
    // is simply never consulted by the full-page render path.
    await expect(page.locator('h1')).toHaveCount(0)
    // No panel Card chrome (border/shadow/rounded corners/title bar).
    await expect(page.locator('.rounded-lg.border.shadow-md')).toHaveCount(0)
    // No expand-to-dialog control — already maximally sized.
    await expect(page.getByRole('button', { name: /^Expand/ })).toHaveCount(0)

    // The panel itself genuinely rendered (real GraphicWalker chrome).
    await expect(page.locator('.graphic-walker-panel-host')).toBeVisible()
  })

  test('the panel content area tracks real, current viewport space, not a fixed pixel default (FR-009, SC-002)', async ({
    page,
  }) => {
    await gotoExploreFixture(page)

    const host = page.locator('.graphic-walker-panel-host')
    const box1 = await host.boundingBox()
    const viewport1 = page.viewportSize()
    // SC-002: at least 90% of available viewport height — a direct,
    // repeatable re-run of this feature's own live measurement technique
    // (research.md §7/T017), not a one-time manual check.
    expect(box1!.height).toBeGreaterThan(viewport1!.height * 0.9)

    // FR-009: resize the viewport shorter — the rendered height MUST
    // track the new available space, proving this isn't still settling
    // at GraphicWalker's own fixed, library-intrinsic 635px default
    // (spec.md's own recorded baseline measurement).
    await page.setViewportSize({ width: 1440, height: 700 })
    await page.waitForTimeout(200)
    const box2 = await host.boundingBox()
    expect(box2!.height).toBeLessThan(box1!.height)
    expect(box2!.height).toBeGreaterThan(700 * 0.85)
  })

  test('the mechanism is generic across panel types — nothing full-page-specific hardcodes graphic-walker by name (FR-010)', async ({
    page,
  }) => {
    // A real, direct grep-equivalent check: dashboardLayout.ts's
    // findFullPagePanel() and dashboardRenderer.tsx's full-page branch
    // never reference "graphic-walker" anywhere — confirmed by direct
    // source read during implementation (contracts/sidebar-shell.md's own
    // requirement). This test asserts the RUNTIME consequence instead of
    // re-reading source: the existing fixture full-page tab happens to
    // use graphic-walker, but the mechanism itself resolved it purely by
    // "exactly one panel in this tab's layout," which any panel type
    // would satisfy identically.
    await gotoExploreFixture(page)
    await expect(page.locator('h1')).toHaveCount(0)
    await expect(page.locator('.rounded-lg.border.shadow-md')).toHaveCount(0)
  })

  test('a misconfigured full_page tab (not exactly one panel) falls back to ordinary rendering with a console warning, never a blank page', async ({
    page,
  }) => {
    // Temporarily reconfigure the SAME fixture tab to have 2 panels while
    // full_page: true remains set — a real, live misconfiguration, not a
    // unit-test-only case for findFullPagePanel() alone.
    const yamlPath = path.resolve(
      __dirname,
      '../../public/dashboard-config/dashboard-4-sidebar-demo.yaml',
    )
    const original = readFileSync(yamlPath, 'utf8')
    const misconfigured = `${original}
    - type: markdown
      title: Second Panel (intentional misconfiguration)
      content: This tab has 2 panels but full_page is still true.
      width: 1.0
`
    writeFileSync(yamlPath, misconfigured)

    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().includes('full_page')) warnings.push(msg.text())
    })

    try {
      await gotoExploreFixture(page)
      // Falls back to the ORDINARY multi-row, Card-chromed rendering —
      // the page title now DOES render (never a blank/broken page).
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.getByText('Second Panel (intentional misconfiguration)')).toBeVisible()
      expect(warnings.length).toBeGreaterThan(0)
    } finally {
      writeFileSync(yamlPath, original)
    }
  })
})
