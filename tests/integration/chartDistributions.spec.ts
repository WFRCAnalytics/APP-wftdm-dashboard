import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 063 redesign: the waffle, ridgeline, pyramid and dumbbell chart kinds in their real tiles (Person and household,
// Tour models, Network). Smoke level: each draws, hovering a mark shows the shared tooltip, a side-by-side waffle
// shows one synced tooltip, and nothing logs a console error.

const errors: string[] = []

async function goTo(page: Page, tab: string) {
  const link = page.getByRole('tab', { name: tab }).first()
  await expect(async () => {
    await page.hover('[data-sidebar=sidebar]')
    await link.click()
    await expect(link).toHaveAttribute('aria-selected', 'true', { timeout: 3000 })
  }).toPass({ timeout: 60_000 })
  await page.mouse.move(900, 10)
}

async function tipOpacity(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('.wf-tip')
    return el ? Number(getComputedStyle(el).opacity) : 0
  })
}

test.describe('distribution chart kinds', () => {
  test.setTimeout(180_000)
  test.beforeEach(async ({ page }) => {
    errors.length = 0
    page.on('console', (m) => {
      // Parquet registration races of the surrounding dashboard are not these charts' errors.
      if (m.type() === 'error' && !/tabDataLoader|registerFileURL|summary_kpis|chart data: failed/.test(m.text())) errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 60_000 })
  })

  test('waffle (side by side), pyramid and dumbbell on Person and household', async ({ page }) => {
    await goTo(page, 'Person and household')
    const rect = page.locator('svg rect[data-key]').first()
    await expect(rect).toBeVisible({ timeout: 60_000 })
    // Side-by-side cells: ONE synced tooltip listing the scenarios.
    await rect.hover()
    await expect.poll(() => tipOpacity(page)).toBe(1)
    expect(await page.locator('.wf-tip .tt-r').count()).toBeGreaterThan(1)
    await page.mouse.move(900, 10)

    // Pyramid
    const bar = page.locator('svg rect[data-wf]').first()
    await expect(bar).toBeVisible({ timeout: 30_000 })
    await bar.hover()
    await expect.poll(() => tipOpacity(page)).toBe(1)
    await expect(page.locator('.wf-tip')).toContainText('Census estimate')
    await page.mouse.move(900, 10)

    // Dumbbell view: tooltip lists scenarios and the observed row
    await page.getByText('Dumbbell', { exact: true }).first().click()
    const dot = page.locator('svg circle[data-wf]').first()
    await expect(dot).toBeVisible({ timeout: 30_000 })
    await dot.hover()
    await expect.poll(() => tipOpacity(page)).toBe(1)
    await expect(page.locator('.wf-tip')).toContainText('Observed')
    expect(errors).toEqual([])
  })

  test('ridgeline on Tour models', async ({ page }) => {
    await goTo(page, 'Tour models')
    const ridge = page.locator('svg path[data-key="Work"]').first()
    await expect(ridge).toBeVisible({ timeout: 60_000 })
    // Just above the baseline, a little right of the peak: always inside the filled area.
    const box = (await ridge.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height - 4)
    await page.mouse.move(box.x + box.width * 0.21, box.y + box.height - 4)
    await expect.poll(() => tipOpacity(page)).toBe(1)
    expect(errors).toEqual([])
  })

  test('dumbbell on Network', async ({ page }) => {
    await goTo(page, 'Network')
    const dot = page.locator('svg circle[data-wf]').first()
    await expect(dot).toBeVisible({ timeout: 60_000 })
    await dot.hover()
    await expect.poll(() => tipOpacity(page)).toBe(1)
    await expect(page.locator('.wf-tip')).toContainText('Observed')
    expect(errors).toEqual([])
  })
})
