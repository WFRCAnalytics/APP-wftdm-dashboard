import { test, expect } from '@playwright/test'

// 065-chart-builder: the Explore tab is the chart builder, Graphic Walker (still registered, code kept) is never loaded by the
// demo, and the builder's code is only fetched when the Explore tab opens.
test('Explore opens the builder, Graphic Walker is never requested, and other tabs never load the builder', async ({ page }) => {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.hover('[data-sidebar=sidebar]')
  const builder = /ExploreBuilderPanel|\/src\/explore\/|explore-builder|assets\/ExploreBuilder/i
  const beforeExplore = urls.filter((u) => builder.test(u))
  expect(beforeExplore).toEqual([])
  await page.getByRole('tab', { name: 'Explore' }).first().click()
  await expect(page.getByTestId('explore-builder')).toBeVisible({ timeout: 30_000 })
  expect(urls.filter((u) => builder.test(u)).length).toBeGreaterThan(0)
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Network' }).first().click()
  await page.waitForTimeout(1_000)
  expect(urls.filter((u) => /graphic-?walker|kanaries/i.test(u))).toEqual([])
})
