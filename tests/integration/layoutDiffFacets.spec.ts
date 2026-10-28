import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Change / % change draws one facet per compared scenario except the reference (not the focus alone), each measured against it (the tile's badge names the reference),
// all on one shared scale.

async function boot(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/summary/mode')
  await page.waitForFunction(() => window.__wftdm !== undefined && document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

test('Change shows one facet per scenario besides the reference, on one shared axis', async ({ page }) => {
  await boot(page)
  const tile = page.getByTestId('tab-body')
  await tile.getByRole('button', { name: 'Donut' }).first().click()
  await page.evaluate(() => window.__wftdm!.compareState.setDisplay('abs'))
  const facets = tile.getByTestId('compare-cells').first().locator('[data-testid^="compare-cell-"]')
  // three scenarios in the compare set: the reference is not drawn, the other two each get a facet
  await expect(facets).toHaveCount(2, { timeout: 30_000 })
  await expect(facets.first().locator('svg').first()).toBeVisible({ timeout: 30_000 })
  await expect(facets.last().locator('svg').first()).toBeVisible({ timeout: 30_000 })
  const axis = (i: number) => facets.nth(i).locator('svg g[aria-label="y-axis tick label"] text').allTextContents()
  await expect.poll(async () => (await axis(0)).join('|')).toBe((await axis(1)).join('|'))
  await page.screenshot({ path: 'test-results/diff-facets.png' })

})

test('treemap labels in narrow facets stay inside their boxes', async ({ page }) => {
  await boot(page)
  const tile = page.getByTestId('tab-body')
  await page.evaluate(() => window.__wftdm!.compareState.setDisplay('abs'))
  const facets = tile.locator('[data-chart-kind="treemap"]')
  await expect(facets).toHaveCount(2, { timeout: 30_000 })
  await expect(facets.first().locator('svg rect').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  for (const f of await facets.all()) {
    const over = await f.locator('svg g[data-key] text, svg g[data-key] tspan').evaluateAll((ts) =>
      ts.filter((t) => {
        const box = t.closest('g[data-key]')!.querySelector('rect')!.getBoundingClientRect()
        const r = t.getBoundingClientRect()
        return r.width > 0 && r.right > box.right + 1
      }).length,
    )
    expect(over).toBe(0)
  }
  await page.screenshot({ path: 'test-results/treemap-fit.png' })
})
