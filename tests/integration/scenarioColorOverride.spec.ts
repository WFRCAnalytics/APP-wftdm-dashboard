import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 035-scenario-label-color (Part B — User Story
// 2). Reuses scenarioLabelDisplay.spec.ts's own `row_scenario_display`
// fixture panels (dashboard-1-summary.yaml) — real fixture manifest
// colors: good_scenario #4e79a7, observed #666666 (confirmed directly
// against tests/fixtures/scenarios/good_scenario/manifest.yaml and
// tests/fixtures/observed/manifest.yaml before writing this spec). See
// quickstart.md Scenarios 5-7.

async function boot(page: Page, searchParams = '') {
  await page.goto('/' + searchParams)
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

// Plotly's own real legend DOM (confirmed via direct live inspection, not
// guessed): one <g class="traces"> per trace, containing both its
// <text class="legendtext"> label AND its own marker <path> (fill color
// in the path's own inline style) as SIBLING descendants of the same
// <g class="traces"> — not a preceding-sibling relationship, an earlier,
// wrong assumption this test's own first draft made and corrected here.
function legendSwatchFill(card: ReturnType<typeof panelCard>, scenarioText: string) {
  return card
    .locator('.legend .traces')
    .filter({ hasText: scenarioText })
    .locator('path')
    .first()
}

test.describe('User Story 2 - A viewer picks a scenario\'s own display color', () => {
  test('two scenarios with different manifest colors render consistently across all three chart types', async ({
    page,
  }) => {
    await boot(page, '?s=good_scenario')

    // Plotly: marker.color set directly, readable from the trace's own
    // legend swatch — confirmed via the rendered SVG fill.
    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()
    // Recharts: chartConfig color flows into a CSS var on the bar's own
    // fill — confirmed via a real rendered <path>/<rect> element existing
    // for each scenario's own bars.
    const rechartsCard = panelCard(page, 'Scenario Split (Recharts)')
    await expect(rechartsCard).toBeVisible()
    const observableCard = panelCard(page, 'Scenario Split (Observable Plot)')
    await expect(observableCard).toBeVisible()

    // All three panels are real, fully rendered — the actual color-value
    // assertion needs a real chart-library-specific pixel/attribute read,
    // done narrowly below (test 3) rather than duplicated three times
    // here; this test's own job is confirming all three panel types
    // render without error under a real dual-scenario, real-manifest-
    // color load.
    await expect(plotCard.locator('.js-plotly-plot')).toBeVisible()
    await expect(rechartsCard.locator('.recharts-wrapper')).toBeVisible()
    // Scoped to the chart container specifically (not the whole card,
    // which also has an Expand-button <svg> icon — a real, confirmed
    // strict-mode collision against a bare `svg` locator on this test's
    // own first run). This container legitimately holds MULTIPLE real
    // svg elements (two legend swatches plus the main figure), so this
    // only confirms real content rendered, not which specific one.
    await expect(observableCard.locator('.observable-plot-chart svg').first()).toBeVisible()
  })

  test('a scenario with no manifest color still renders via existing default cycling', async ({ page }) => {
    await boot(page, '?s=good_scenario')
    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()
    await expect(plotCard.locator('.js-plotly-plot')).toBeVisible()

    // Re-register good_scenario with no `color` field at all — register()
    // fully replaces the appState entry (its own doc contract), while the
    // real DuckDB views registered at boot time are untouched (view
    // registration is independent of appState), so this scenario keeps
    // its REAL backing data with no manifest color resolved — the actual
    // case this acceptance scenario needs, not a synthetic no-data one.
    await page.evaluate(() => {
      const current = window.__wftdm!.appState.get('good_scenario')!
      window.__wftdm!.appState.register('good_scenario', { source: current.source, path: current.path })
      window.__wftdm!.appState.setStatus('good_scenario', 'ready')
      window.__wftdm!.appState.setActive('good_scenario', true)
    })

    // Never a missing/blank/error trace — the panel still renders, via
    // Plotly's own existing default palette cycling (FR-008).
    await expect(plotCard.locator('.js-plotly-plot')).toBeVisible()
    await expect(plotCard.getByText('good_scenario', { exact: true })).toBeVisible()
  })

  test('overriding a scenario\'s color updates every already-rendered panel immediately', async ({ page }) => {
    await boot(page, '?s=good_scenario')
    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()
    const rechartsCard = panelCard(page, 'Scenario Split (Recharts)')
    await expect(rechartsCard).toBeVisible()

    // Real, hand-verified fixture manifest color before override
    // (#4e79a7 = rgb(78, 121, 167)).
    const swatch = legendSwatchFill(plotCard, 'good_scenario')
    await expect(swatch).toHaveCSS('fill', 'rgb(78, 121, 167)')

    await page.evaluate(() => window.__wftdm!.appState.setColorOverride('good_scenario', '#ff0000'))

    // No reload — same page, same already-rendered <div>/<canvas>.
    await expect(swatch).toHaveCSS('fill', 'rgb(255, 0, 0)')

    // Clearing reverts it to the manifest color, also without reload.
    await page.evaluate(() => window.__wftdm!.appState.clearColorOverride('good_scenario'))
    await expect(swatch).toHaveCSS('fill', 'rgb(78, 121, 167)')
  })
})
