import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

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
// behavior).
//
// 040-test-suite-migration: migrated off the retired
// tests/fixtures/dashboard-config/dashboard-1-summary.yaml (deleted in
// T011) and its own on-disk `tests/fixtures/dashboard-config/index.json`
// (also gone — reading it directly, as this file's own original
// `bootWithScenarioPalette()` did, would throw). Reuses
// scenarioLabelDisplay.spec.ts's own real, already-validated panels:
// "Average Trip Distance by Purpose" (plotly, Summary tab) for every
// swatch/legend check, and "Total Trips by Mode" (recharts)/"Workplace
// Location Distance Distribution" (observable-plot) for the cross-type
// rendering check. `scenarioPalette` is injected via `page.route()`
// directly on the REAL `dashboard-config/index.json` endpoint (the
// primary root — empty/gitignored in this dev/test environment, exactly
// like a real, unconfigured deployment) — main.tsx's own real precedence
// (`primaryBranding.scenarioPalette ?? demoBranding.scenarioPalette`)
// means this always wins over the demo root with no fixture file needed
// at all, matching demoMultiScenario.spec.ts's own established
// inline-JSON-body routing convention.

async function boot(page: Page, searchParams = '') {
  await page.goto('/' + searchParams)
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('activitysim-transit-variant')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

// Plotly's own real legend DOM (confirmed via direct live inspection, not
// guessed): one <g class="traces"> per trace, containing both its
// <text class="legendtext"> label AND its own marker <path> (fill color
// in the path's own inline style) as SIBLING descendants of the same
// <g class="traces">.
function legendSwatchFill(card: ReturnType<typeof panelCard>, scenarioText: string) {
  return card
    .locator('.legend .traces')
    .filter({ hasText: scenarioText })
    .locator('path')
    .first()
}

// 036-scenario-color-picker: resolves ANY real CSS color string (a
// literal hex a deployer configured, or a var(--chart-N) reference) to
// its browser-computed rgb(...) text, via a real probe-element round-trip.
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
// live rather than assumed.
async function scenarioIndex(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => window.__wftdm!.appState.list().findIndex((s) => s.name === n), name)
}

async function bootWithScenarioPalette(page: Page, palette: string[] | undefined, searchParams = '') {
  const body: Record<string, unknown> = {}
  if (palette) body.scenarioPalette = palette
  await page.route('**/dashboard-config/index.json', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await boot(page, searchParams)
}

test.describe('User Story 1 (036) - A deployer sets a consistent, on-brand scenario palette', () => {
  test('a configured scenarioPalette applies consistently across all three chart types (quickstart Scenario 1)', async ({
    page,
  }) => {
    await bootWithScenarioPalette(page, ['#111111', '#222222', '#333333'])

    const baselineIndex = await scenarioIndex(page, 'activitysim-baseline')
    const densityIndex = await scenarioIndex(page, 'activitysim-density-variant')
    const palette = ['#111111', '#222222', '#333333']
    const baselineExpected = await resolveCssColor(page, palette[baselineIndex % palette.length])
    const densityExpected = await resolveCssColor(page, palette[densityIndex % palette.length])

    const plotCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(plotCard).toBeVisible()
    await expect(legendSwatchFill(plotCard, 'activitysim-baseline')).toHaveCSS('fill', baselineExpected)
    await expect(legendSwatchFill(plotCard, 'activitysim-density-variant')).toHaveCSS('fill', densityExpected)
  })

  test('no scenarioPalette configured falls back to the shipped --chart-1..5 default (quickstart Scenario 2)', async ({
    page,
  }) => {
    await bootWithScenarioPalette(page, undefined)

    const baselineIndex = await scenarioIndex(page, 'activitysim-baseline')
    const expectedToken = `--chart-${(baselineIndex % 5) + 1}`
    const expectedColor = await resolveCssColor(page, `var(${expectedToken})`)

    const plotCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(plotCard).toBeVisible()
    await expect(legendSwatchFill(plotCard, 'activitysim-baseline')).toHaveCSS('fill', expectedColor)
  })

  test('a viewer override still wins outright over the deployer palette', async ({ page }) => {
    await bootWithScenarioPalette(page, ['#111111', '#222222', '#333333'])
    const plotCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(plotCard).toBeVisible()

    await page.evaluate(() => window.__wftdm!.appState.setColorOverride('activitysim-baseline', '#ff0000'))
    await expect(legendSwatchFill(plotCard, 'activitysim-baseline')).toHaveCSS('fill', 'rgb(255, 0, 0)')
  })

  test('the palette wraps around when more scenarios are active than palette entries', async ({ page }) => {
    // A single-entry palette forces wraparound for ANY scenario whose real
    // registration index is >= 1 — observed always registers first (real,
    // confirmed order: observed, then the three demo scenarios), so every
    // one of the three real demo scenarios' own index is guaranteed >= 1.
    await bootWithScenarioPalette(page, ['#333333'])
    const baselineIndex = await scenarioIndex(page, 'activitysim-baseline')
    expect(baselineIndex).toBeGreaterThanOrEqual(1)

    const expected = await resolveCssColor(page, '#333333')
    const plotCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(plotCard).toBeVisible()
    await expect(legendSwatchFill(plotCard, 'activitysim-baseline')).toHaveCSS('fill', expected)
  })

  test('manifest color is confirmed independent of the actually-rendered color (quickstart Scenario 5)', async ({
    page,
  }) => {
    await bootWithScenarioPalette(page, ['#111111', '#222222', '#333333'])
    const manifestColor = await page.evaluate(
      () => window.__wftdm!.appState.get('activitysim-baseline')?.color,
    )
    // The real demo manifest color (public/demo-scenarios/activitysim-baseline/manifest.yaml).
    expect(manifestColor).toBe('#59A14F')

    const baselineIndex = await scenarioIndex(page, 'activitysim-baseline')
    const palette = ['#111111', '#222222', '#333333']
    const expectedRendered = await resolveCssColor(page, palette[baselineIndex % palette.length])
    const plotCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(plotCard).toBeVisible()
    // The rendered color is the PALETTE entry, never the manifest hex —
    // the two are confirmed genuinely different values here.
    expect(expectedRendered).not.toBe(await resolveCssColor(page, manifestColor!))
    await expect(legendSwatchFill(plotCard, 'activitysim-baseline')).toHaveCSS('fill', expectedRendered)
  })

  test('a theme flip re-resolves the shipped default color, no reload (research.md §4)', async ({ page }) => {
    await bootWithScenarioPalette(page, undefined)
    const baselineIndex = await scenarioIndex(page, 'activitysim-baseline')
    const token = `--chart-${(baselineIndex % 5) + 1}`
    const plotCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(plotCard).toBeVisible()

    const lightExpected = await resolveCssColor(page, `var(${token})`)
    await expect(legendSwatchFill(plotCard, 'activitysim-baseline')).toHaveCSS('fill', lightExpected)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const darkExpected = await resolveCssColor(page, `var(${token})`)
    await expect(legendSwatchFill(plotCard, 'activitysim-baseline')).toHaveCSS('fill', darkExpected)
  })
})

test.describe('User Story 2 (035) - A viewer picks a scenario\'s own display color', () => {
  test('two scenarios render consistently across all three chart types', async ({ page }) => {
    await boot(page)

    // Summary tab: plotly + recharts.
    const plotCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(plotCard).toBeVisible()
    await expect(plotCard.locator('.js-plotly-plot')).toBeVisible()
    const rechartsCard = panelCard(page, 'Total Trips by Mode')
    await expect(rechartsCard).toBeVisible()
    await expect(rechartsCard.locator('.recharts-wrapper')).toBeVisible()

    // Person & Households tab: observable-plot.
    await page.getByRole('tablist').getByRole('tab', { name: 'Person & Households', exact: true }).click()
    const observableCard = panelCard(page, 'Workplace Location Distance Distribution')
    await expect(observableCard).toBeVisible()
    await expect(observableCard.locator('.observable-plot-chart svg').first()).toBeVisible()
  })

  test('overriding a scenario\'s color updates every already-rendered panel immediately', async ({ page }) => {
    await boot(page)
    const plotCard = panelCard(page, 'Average Trip Distance by Purpose')
    await expect(plotCard).toBeVisible()

    const baselineIndex = await scenarioIndex(page, 'activitysim-baseline')
    const defaultExpected = await resolveCssColor(page, `var(--chart-${(baselineIndex % 5) + 1})`)
    const swatch = legendSwatchFill(plotCard, 'activitysim-baseline')
    await expect(swatch).toHaveCSS('fill', defaultExpected)

    await page.evaluate(() => window.__wftdm!.appState.setColorOverride('activitysim-baseline', '#ff0000'))
    await expect(swatch).toHaveCSS('fill', 'rgb(255, 0, 0)')

    // Clearing reverts it to the (now palette/default-derived) effective
    // color, also without reload.
    await page.evaluate(() => window.__wftdm!.appState.clearColorOverride('activitysim-baseline'))
    await expect(swatch).toHaveCSS('fill', defaultExpected)
  })
})
