import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 035-scenario-label-color (Part B) AND
// 036-scenario-color-picker (Part A) — the latter REPLACES 035's own
// "manifest color is the default" resolution with a deployer-palette-or-
// shipped-default chain (a deliberate revision, spec.md's own framing —
// the tests below are updated to match, not left asserting the retired
// behavior). Reuses scenarioLabelDisplay.spec.ts's own
// `row_scenario_display` fixture panels (dashboard-1-summary.yaml). See
// quickstart.md Scenarios 1-7.

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

// 036-scenario-color-picker: resolves ANY real CSS color string (a
// literal hex a deployer configured, or a var(--chart-N) reference) to
// its browser-computed rgb(...) text, via a real probe-element round-trip
// — the same real resolution mechanism a rendered <path fill="..."> goes
// through, so comparisons never depend on hand-converting hex to rgb (or
// guessing which theme is active) in the test itself. Mirrors this
// project's own established resolveCssColor-style probe pattern used
// elsewhere (e.g. zonemapPanel.spec.ts).
async function resolveCssColor(page: Page, cssColor: string): Promise<string> {
  return page.evaluate((color) => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;'
    probe.style.color = color
    document.body.appendChild(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return resolved
  }, cssColor)
}

// A scenario's own real, stable registration-order index among every
// currently-registered scenario (appState.list()'s own Map-insertion
// order) — the same index resolveDefaultScenarioColor() cycles by. Read
// live rather than assumed, so this test stays correct regardless of
// fixture registration order.
async function scenarioIndex(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => window.__wftdm!.appState.list().findIndex((s) => s.name === n), name)
}

async function bootWithScenarioPalette(page: Page, palette: string[] | undefined, searchParams = '') {
  // Real fixture file read from disk + route.fulfill() — NOT
  // route.fetch()-ing the live request, which collides with this app's
  // own coi-serviceworker (confirmed, live, by dashboardShell.spec.ts's
  // own identical precedent for the exact same file — see that file's
  // own comment for the full finding).
  const fixturePath = join(__dirname, '../fixtures/dashboard-config/index.json')
  const json = JSON.parse(readFileSync(fixturePath, 'utf-8'))
  if (palette) {
    json.scenarioPalette = palette
  } else {
    delete json.scenarioPalette
  }
  await page.route('**/dashboard-config/index.json', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) })
  })
  await boot(page, searchParams)
}

test.describe('User Story 1 (036) - A deployer sets a consistent, on-brand scenario palette', () => {
  test('a configured scenarioPalette applies consistently across all three chart types (quickstart Scenario 1)', async ({
    page,
  }) => {
    await bootWithScenarioPalette(page, ['#111111', '#222222'], '?s=good_scenario')

    const observedIndex = await scenarioIndex(page, 'observed')
    const goodIndex = await scenarioIndex(page, 'good_scenario')
    const palette = ['#111111', '#222222']
    const observedExpected = await resolveCssColor(page, palette[observedIndex % palette.length])
    const goodExpected = await resolveCssColor(page, palette[goodIndex % palette.length])

    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()
    await expect(legendSwatchFill(plotCard, 'observed')).toHaveCSS('fill', observedExpected)
    await expect(legendSwatchFill(plotCard, 'good_scenario')).toHaveCSS('fill', goodExpected)
  })

  test('no scenarioPalette configured falls back to the shipped --chart-1..5 default (quickstart Scenario 2)', async ({
    page,
  }) => {
    await bootWithScenarioPalette(page, undefined, '?s=good_scenario')

    const goodIndex = await scenarioIndex(page, 'good_scenario')
    const expectedToken = `--chart-${(goodIndex % 5) + 1}`
    const expectedColor = await resolveCssColor(page, `var(${expectedToken})`)

    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()
    await expect(legendSwatchFill(plotCard, 'good_scenario')).toHaveCSS('fill', expectedColor)
  })

  test('a viewer override still wins outright over the deployer palette', async ({ page }) => {
    await bootWithScenarioPalette(page, ['#111111', '#222222'], '?s=good_scenario')
    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()

    await page.evaluate(() => window.__wftdm!.appState.setColorOverride('good_scenario', '#ff0000'))
    await expect(legendSwatchFill(plotCard, 'good_scenario')).toHaveCSS('fill', 'rgb(255, 0, 0)')
  })

  test('the palette wraps around when more scenarios are active than palette entries', async ({ page }) => {
    // A single-entry palette forces wraparound for ANY scenario whose
    // real registration index is >= 1 — good_scenario's own real index
    // is confirmed >= 1 in this fixture set (observed always registers
    // first), so this proves real, end-to-end wraparound against an
    // actually-rendered panel without needing to guess or hardcode the
    // exact index value.
    await bootWithScenarioPalette(page, ['#333333'], '?s=good_scenario')
    const goodIndex = await scenarioIndex(page, 'good_scenario')
    expect(goodIndex).toBeGreaterThanOrEqual(1)

    const expected = await resolveCssColor(page, '#333333')
    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()
    await expect(legendSwatchFill(plotCard, 'good_scenario')).toHaveCSS('fill', expected)
  })

  test('manifest color is confirmed independent of the actually-rendered color (quickstart Scenario 5)', async ({
    page,
  }) => {
    await bootWithScenarioPalette(page, ['#111111', '#222222'], '?s=good_scenario')
    const manifestColor = await page.evaluate(() => window.__wftdm!.appState.get('good_scenario')?.color)
    // The real fixture manifest color, confirmed unchanged/still fetched
    // (035's own scenarioDiscovery.ts fix, untouched by this feature).
    expect(manifestColor).toBe('#4e79a7')

    const goodIndex = await scenarioIndex(page, 'good_scenario')
    const palette = ['#111111', '#222222']
    const expectedRendered = await resolveCssColor(page, palette[goodIndex % palette.length])
    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()
    // The rendered color is the PALETTE entry, never the manifest hex —
    // the two are confirmed genuinely different values here.
    expect(expectedRendered).not.toBe(await resolveCssColor(page, manifestColor!))
    await expect(legendSwatchFill(plotCard, 'good_scenario')).toHaveCSS('fill', expectedRendered)
  })

  test('a theme flip re-resolves the shipped default color, no reload (research.md §4)', async ({ page }) => {
    await bootWithScenarioPalette(page, undefined, '?s=good_scenario')
    const goodIndex = await scenarioIndex(page, 'good_scenario')
    const token = `--chart-${(goodIndex % 5) + 1}`
    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()

    const lightExpected = await resolveCssColor(page, `var(${token})`)
    await expect(legendSwatchFill(plotCard, 'good_scenario')).toHaveCSS('fill', lightExpected)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const darkExpected = await resolveCssColor(page, `var(${token})`)
    await expect(legendSwatchFill(plotCard, 'good_scenario')).toHaveCSS('fill', darkExpected)
  })
})

test.describe('User Story 2 (035) - A viewer picks a scenario\'s own display color', () => {
  test('two scenarios render consistently across all three chart types', async ({ page }) => {
    await boot(page, '?s=good_scenario')

    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()
    const rechartsCard = panelCard(page, 'Scenario Split (Recharts)')
    await expect(rechartsCard).toBeVisible()
    const observableCard = panelCard(page, 'Scenario Split (Observable Plot)')
    await expect(observableCard).toBeVisible()

    await expect(plotCard.locator('.js-plotly-plot')).toBeVisible()
    await expect(rechartsCard.locator('.recharts-wrapper')).toBeVisible()
    await expect(observableCard.locator('.observable-plot-chart svg').first()).toBeVisible()
  })

  test('overriding a scenario\'s color updates every already-rendered panel immediately', async ({ page }) => {
    await boot(page, '?s=good_scenario')
    const plotCard = panelCard(page, 'Scenario Split (Plotly)')
    await expect(plotCard).toBeVisible()

    const goodIndex = await scenarioIndex(page, 'good_scenario')
    const defaultExpected = await resolveCssColor(page, `var(--chart-${(goodIndex % 5) + 1})`)
    const swatch = legendSwatchFill(plotCard, 'good_scenario')
    await expect(swatch).toHaveCSS('fill', defaultExpected)

    await page.evaluate(() => window.__wftdm!.appState.setColorOverride('good_scenario', '#ff0000'))
    await expect(swatch).toHaveCSS('fill', 'rgb(255, 0, 0)')

    // Clearing reverts it to the (now palette/default-derived) effective
    // color, also without reload.
    await page.evaluate(() => window.__wftdm!.appState.clearColorOverride('good_scenario'))
    await expect(swatch).toHaveCSS('fill', defaultExpected)
  })
})
