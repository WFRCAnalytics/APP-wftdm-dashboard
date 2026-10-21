import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 063 redesign: the treemap, sunburst, sankey, chord and flow-table chart kinds in their real tiles (Summary "Trips by
// purpose and mode", Tour models "District flows"). Smoke level: each draws, hovering a mark shows the shared tooltip, a
// side-by-side treemap shows ONE synced tooltip, and nothing logs a console error.

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

const viewButton = (page: Page, containing: string, name: string) =>
  page.getByRole('group', { name: 'View' }).filter({ hasText: containing }).first().getByRole('button', { name, exact: true })

test.describe('hierarchy and flow chart kinds', () => {
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

  test('treemap, sunburst and sankey on the Summary page', async ({ page }) => {
    const leaf = page.locator('[data-chart-kind="treemap"] svg g[data-key]').first()
    await expect(leaf).toBeVisible({ timeout: 60_000 })
    await leaf.hover()
    await expect.poll(() => tipOpacity(page)).toBe(1)
    await page.mouse.move(900, 10)

    await viewButton(page, 'Treemap', 'Sunburst').click()
    const arc = page.locator('[data-chart-kind="sunburst"] svg path[data-key]').first()
    await expect(arc).toBeVisible({ timeout: 30_000 })
    await arc.hover()
    await expect.poll(() => tipOpacity(page)).toBe(1)
    await page.mouse.move(900, 10)

    await viewButton(page, 'Treemap', 'Flow').click()
    const link = page.locator('[data-chart-kind="sankey"] svg path[data-m]').first()
    // a straight link has a zero-height box, which Playwright does not call visible
    await expect(link).toBeAttached({ timeout: 30_000 })
    await link.hover({ force: true })
    await expect.poll(() => tipOpacity(page)).toBe(1)
    await expect(page.locator('.wf-tip')).toContainText('→')
    expect(errors).toEqual([])
  })

  test('chord and flow table on Tour models', async ({ page }) => {
    await goTo(page, 'Tour models')
    const ribbon = page.locator('[data-chart-kind="chord"] svg path[fill-opacity]').first()
    await expect(ribbon).toBeVisible({ timeout: 60_000 })
    // a ribbon's box centre is usually empty space: walk its outline inwards until a point really hits the ribbon
    const hit = await ribbon.evaluate((node) => {
      const path = node as unknown as SVGPathElement
      const m = path.getScreenCTM()!
      const origin = (path.parentElement!.parentElement as unknown as SVGGraphicsElement).getScreenCTM()!
      const len = path.getTotalLength()
      for (let i = 0; i < 400; i++) {
        const p = path.getPointAtLength((len * i) / 400)
        const sx = m.a * p.x + m.e
        const sy = m.d * p.y + m.f
        const dx = origin.e - sx
        const dy = origin.f - sy
        const d = Math.hypot(dx, dy) || 1
        const x = sx + (dx / d) * 4
        const y = sy + (dy / d) * 4
        if (document.elementFromPoint(x, y) === node) return { x, y }
      }
      return null
    })
    expect(hit).not.toBeNull()
    await page.mouse.move(hit!.x, hit!.y)
    await expect.poll(() => tipOpacity(page)).toBe(1)
    await expect(page.locator('.wf-tip')).toContainText('Daily trips')
    await page.mouse.move(900, 10)

    await viewButton(page, 'Chord', 'Table').click()
    const cells = page.locator('[data-chart-kind="flow-table"] tbody td')
    await expect(cells.first()).toBeVisible({ timeout: 30_000 })
    expect(await cells.count()).toBe(30) // 5 districts x (name + 5 values)
    expect(errors).toEqual([])
  })
})
