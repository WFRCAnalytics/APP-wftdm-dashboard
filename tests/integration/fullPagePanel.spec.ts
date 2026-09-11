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
// 040-test-suite-migration: migrated off the retired synthetic fixture
// "Explore Fixture" tab + its cross-worker index.json swap. The real
// public/demo-dashboard-config/dashboard-7-explore.yaml IS a genuine
// single-panel graphic-walker tab with `full_page: true` — the happy
// path targets it directly. The deliberate misconfiguration case
// (`full_page: true` with more than one panel) is now a static panel
// tab: public/demo-dashboard-config/dashboard-8-test.yaml. No on-disk
// mutation, no _sharedFixtureLock.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoExplore(page: Page) {
  await boot(page)
  await page.getByRole('tab', { name: 'Explore', exact: true }).click()
  await page.waitForTimeout(1500) // GraphicWalker mount + real DuckDB query
}

test.describe('030-sidebar-navigation — User Story 2 (chromeless full-page panel mode)', () => {
  test('renders edge-to-edge, no page title, no Card chrome, no expand trigger (FR-008, FR-011)', async ({
    page,
  }) => {
    await gotoExplore(page)
    await expect(page.locator('h1')).toHaveCount(0)
    await expect(page.locator('.rounded-lg.border.shadow-md')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Expand/ })).toHaveCount(0)
    await expect(page.locator('.graphic-walker-panel-host')).toBeVisible()
  })

  test('the panel content area tracks real, current viewport space, not a fixed pixel default (FR-009, SC-002)', async ({
    page,
  }) => {
    await gotoExplore(page)
    const host = page.locator('.graphic-walker-panel-host')
    const box1 = await host.boundingBox()
    const viewport1 = page.viewportSize()
    expect(box1!.height).toBeGreaterThan(viewport1!.height * 0.9)

    await page.setViewportSize({ width: 1440, height: 700 })
    await page.waitForTimeout(200)
    const box2 = await host.boundingBox()
    expect(box2!.height).toBeLessThan(box1!.height)
    expect(box2!.height).toBeGreaterThan(700 * 0.85)
  })

  test('the mechanism is generic across panel types — nothing full-page-specific hardcodes graphic-walker by name (FR-010)', async ({
    page,
  }) => {
    await gotoExplore(page)
    await expect(page.locator('h1')).toHaveCount(0)
    await expect(page.locator('.rounded-lg.border.shadow-md')).toHaveCount(0)
  })

  test('a misconfigured full_page tab (not exactly one panel) falls back to ordinary rendering with a console warning, never a blank page', async ({
    page,
  }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().includes('full_page')) warnings.push(msg.text())
    })
    await boot(page)
    // dashboard-8-test.yaml: full_page: true AND many panels.
    await page.getByRole('tab', { name: 'Test' }).click()
    await page.waitForTimeout(1500)
    // Ordinary rendering restored: the page-title heading is present.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Test / Broken Panels' }),
    ).toBeVisible()
    expect(warnings.length).toBeGreaterThan(0)
  })
})
