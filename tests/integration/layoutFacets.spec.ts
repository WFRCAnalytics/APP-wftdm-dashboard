import { test, expect, type Page } from '@playwright/test'

// Compared scenarios in one tile: the radar lists every scenario, and a zoom made in one facet is made in all of them.

async function boot(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/summary/mode')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

test('the radar names every compared scenario in its legend, with one marker ring each', async ({ page }) => {
  await boot(page)
  const tile = page.getByTestId('tab-body')
  await tile.getByRole('button', { name: 'Radar' }).first().click()
  const radar = page.locator('[data-chart-kind="purpose-radar"]')
  await expect(radar.locator('svg')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('chart-legend').first().locator('[data-sc]')).toHaveCount(3)
  // three scenarios, three markers on the first axis point at distinct sizes
  const radii = await radar.locator('circle').evaluateAll((c) => new Set(c.map((x) => x.getAttribute('r'))).size)
  expect(radii).toBe(3)
})

test('zooming one sunburst facet zooms them all, and going back resets them all', async ({ page }) => {
  await boot(page)
  const tile = page.getByTestId('tab-body')
  await tile.getByRole('button', { name: 'Sunburst' }).first().click()
  const facets = page.locator('[data-chart-kind="sunburst"]')
  await expect(facets).toHaveCount(3, { timeout: 30_000 })
  await expect(facets.first().locator('path[data-key^="grp|"]').first()).toBeVisible({ timeout: 30_000 })
  const back = page.locator('[data-chart-kind="sunburst"] text', { hasText: 'tap to go back' })
  await expect(back).toHaveCount(0)
  await facets.first().locator('path[data-key^="grp|"]').first().dispatchEvent('click')
  await expect(back).toHaveCount(3)
  await facets.nth(1).locator('text', { hasText: 'tap to go back' }).dispatchEvent('click')
  await expect(back).toHaveCount(0)
})

test('the sankey keeps its labels inside the chart, and a node click keeps only its flows', async ({ page }) => {
  await boot(page)
  await page.getByTestId('tab-body').getByRole('button', { name: 'Flow' }).first().click()
  const chart = page.locator('[data-chart-kind="sankey"]')
  await expect(chart.locator('svg rect').first()).toBeVisible({ timeout: 30_000 })
  const box = await chart.boundingBox()
  const over = await chart.locator('svg text').evaluateAll((ts, right) => ts.filter((t) => t.getBoundingClientRect().right > (right as number) + 1).length, box!.x + box!.width)
  expect(over).toBe(0)

  const links = () => chart.locator('svg path[data-m]').count()
  const all = await links()
  await chart.locator('svg rect[data-m="Transit"]').dispatchEvent('click')
  await expect(chart.locator('svg text', { hasText: 'Only flows through Transit' })).toBeVisible()
  await expect.poll(links).toBeLessThan(all)
  await chart.locator('svg text', { hasText: 'Only flows through Transit' }).dispatchEvent('click')
  await expect.poll(links).toBe(all)
})
