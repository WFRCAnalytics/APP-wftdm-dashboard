import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 061-appearance-controls (US1) — SC-001 regression proof: consolidating
// panels/sankeyColor.ts/hierarchyColor.ts/polarChartColor.ts into one
// panels/chartColor.ts must not change the rendered color of any existing
// panel that already specifies an explicit `color_scheme:`. Real, live
// demo panels are used throughout (no fixture dependency) — see
// public/demo-dashboard-config/dashboard-4-mode-choice.yaml (Sankey,
// explicit `color_scheme: Tableau10`) and dashboard-8-test.yaml
// (treemap/sunburst/pie, all with no explicit color_scheme — the
// default-consistency half of this proof).

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('activitysim-baseline')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

test.describe('Category color consolidation — zero regression', () => {
  test('a Sankey panel with an explicit color_scheme still renders the exact Tableau10 first color', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Mode Choice' }).click()
    const card = panelCard(page, 'Trip Purpose to Mode Flow')
    await expect(card).toBeVisible()
    const firstNodeFill = await card.locator('.sankey-chart rect[data-node-id]').first().getAttribute('fill')
    // schemeTableau10's own real first color.
    expect(firstNodeFill).toBe('#4e79a7')
  })

  test('a Sankey panel with no color_scheme falls back to the real token-derived default (--chart-1)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Mode Choice' }).click()
    const card = panelCard(page, 'Trip Purpose to Mode Flow (No Color Scheme)')
    await expect(card).toBeVisible()
    const firstNodeFill = await card.locator('.sankey-chart rect[data-node-id]').first().getAttribute('fill')
    const chart1 = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim(),
    )
    expect(firstNodeFill).toBe(chart1)
  })

  test('treemap, sunburst, and pie panels with no color_scheme all resolve their first category to the same --chart-1 default', async ({
    page,
  }) => {
    await boot(page)
    const chart1 = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim(),
    )

    await page.getByRole('tab', { name: 'Test' }).click()
    const treemapCard = panelCard(page, 'Trip Purpose to Mode Breakdown (Treemap)')
    await expect(treemapCard).toBeVisible()
    const treemapFirstFill = await treemapCard
      .locator('g[data-node-name] rect[fill]')
      .first()
      .getAttribute('fill')
    expect(treemapFirstFill).toBe(chart1)

    const sunburstCard = panelCard(page, 'Trip Purpose to Mode Breakdown (Sunburst)')
    await expect(sunburstCard).toBeVisible()
    const sunburstFirstFill = await sunburstCard
      .locator('path[data-node-name]')
      .first()
      .getAttribute('fill')
    expect(sunburstFirstFill).toBe(chart1)

    const pieCard = panelCard(page, 'Trip Purpose Share')
    await page.getByRole('tab', { name: 'Trip' }).click()
    await expect(pieCard).toBeVisible()
    const pieFirstFill = await pieCard.locator('.pie-chart path[data-category]').first().getAttribute('fill')
    expect(pieFirstFill).toBe(chart1)
  })
})
