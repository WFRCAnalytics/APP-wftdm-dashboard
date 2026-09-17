import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 060-radar-pie-charts' `type: radar` panel
// (contracts/radar-panel.md). Real vehicle: "Trip Mode Share by
// Scenario" (dashboard-4-mode-choice.yaml, Mode Choice tab), metric
// trip_mode_share, axis: major_trip_mode, value: share, series:
// scenario — UNPINNED (one polygon per currently-active scenario,
// matching sankeyPanel.spec.ts's own real "Trip Purpose to Mode Flow"
// vehicle). On a plain boot the active set is the 3 real 'ready'
// activitysim-* scenarios (038's own auto-activation rule; 'observed'
// has no trip_mode_share data in this environment and is never active —
// confirmed, matching sankeyPanel.spec.ts's own identical finding for
// purpose_mode_flow). Real, confirmed live via the duckdb CLI directly
// against activitysim-baseline's own real trip_mode_share.parquet: 5
// distinct major_trip_mode values, "Non-Motorized" the real top
// (16,480 trips, 0.6988084637238688 share).

const REAL_RADAR_TITLE = 'Trip Mode Share by Scenario'
const REAL_TOP_MODE = 'Non-Motorized'

const ACTIVE_SCENARIO_VIEWS = [
  '"activitysim-baseline__trip_mode_share"',
  '"activitysim-density-variant__trip_mode_share"',
  '"activitysim-transit-variant__trip_mode_share"',
]

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoModeChoiceTab(page: Page) {
  await page.getByRole('tab', { name: 'Mode Choice' }).click()
}

async function gotoTestTab(page: Page) {
  await page.getByRole('tab', { name: 'Test' }).click()
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

function expandTrigger(page: Page, title: string) {
  return page.getByRole('button', { name: `Expand ${title}`, exact: true })
}

async function currentChartTokens(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement)
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const colors = [1, 2, 3, 4, 5].map((n) => {
      probe.style.color = rootStyle.getPropertyValue(`--chart-${n}`).trim()
      return getComputedStyle(probe).color
    })
    probe.remove()
    return colors
  })
}

test.describe('User Story 2 - Author a radar chart panel comparing categories across one or more series', () => {
  test('renders one labeled axis per real mode and one polygon per active scenario', async ({ page }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_RADAR_TITLE)
    const chart = card.locator('.radar-chart svg[viewBox]')
    await expect(chart).toBeVisible()

    const rows = await page.evaluate(
      (views) =>
        window.__wftdm!.query(
          `SELECT DISTINCT major_trip_mode FROM (${views.map((v) => `SELECT * FROM ${v}`).join(' UNION ALL ')})`,
        ),
      ACTIVE_SCENARIO_VIEWS,
    )
    expect(rows).toHaveLength(5) // real, confirmed live — see this file's own header comment

    // 5 real axis labels + 3 real series polygons (one per active scenario).
    await expect(chart.locator('text')).toHaveCount(5)
    const polygons = chart.locator('path[data-series]')
    await expect(polygons).toHaveCount(3)
    const seriesNames = await polygons.evaluateAll((els) => els.map((el) => el.getAttribute('data-series')))
    expect(new Set(seriesNames)).toEqual(
      new Set(['activitysim-baseline', 'activitysim-density-variant', 'activitysim-transit-variant']),
    )

    // Each polygon has one vertex per axis.
    await expect(chart.locator('circle[data-series]')).toHaveCount(3 * 5)
  })

  test('vertex values match a direct query of the real data', async ({ page }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_RADAR_TITLE)
    const chart = card.locator('.radar-chart svg[viewBox]')
    await expect(chart.locator('circle[data-series]')).toHaveCount(15)

    const baselineRow = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT major_trip_mode, share FROM "activitysim-baseline__trip_mode_share" WHERE major_trip_mode = 'Non-Motorized'`,
      ),
    )
    const expectedShare = (baselineRow as Record<string, unknown>[])[0].share as number

    const vertex = chart.locator(
      `circle[data-series="activitysim-baseline"][data-axis="${REAL_TOP_MODE}"]`,
    )
    await expect(vertex).toHaveCount(1)
    const actualValue = Number(await vertex.getAttribute('data-value'))
    expect(actualValue).toBeCloseTo(expectedShare)
  })

  test('a legend lists every active scenario as a series', async ({ page }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_RADAR_TITLE)
    await expect(card.locator('.radar-chart svg[viewBox] path[data-series]')).toHaveCount(3)
    await expect(card.getByText('activitysim-baseline', { exact: true })).toBeVisible()
    await expect(card.getByText('activitysim-density-variant', { exact: true })).toBeVisible()
    await expect(card.getByText('activitysim-transit-variant', { exact: true })).toBeVisible()
  })

  test('hovering a vertex shows a real tooltip with that mode\'s share for that scenario', async ({ page }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_RADAR_TITLE)
    // A real, confirmed characteristic of this specific real data (not a
    // bug): the three real scenarios' own Non-Motorized shares are all
    // within ~0.005 of each other (confirmed live via the duckdb CLI,
    // this file's own header comment), so their vertices render nearly
    // coincident — the same inherent overlapping-marker limitation any
    // multi-series radar chart has when series values are this close.
    // `.last()` targets whichever series was drawn LAST (topmost in
    // z-order, so it genuinely receives the hover) rather than assuming
    // a specific scenario is reachable — this test's own purpose is
    // proving the mousemove->tooltip mechanism itself works correctly
    // with real, dynamically-read content, not pixel-targeting a
    // specific obscured series in this particular real dataset.
    const vertex = card
      .locator(`.radar-chart svg[viewBox] circle[data-axis="${REAL_TOP_MODE}"]`)
      .last()
    await expect(vertex).toBeVisible()
    const [expectedSeries, expectedValue] = await Promise.all([
      vertex.getAttribute('data-series'),
      vertex.getAttribute('data-value'),
    ])

    await vertex.hover()
    const tooltip = card.locator('.map-tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText(expectedSeries!)
    await expect(tooltip).toContainText(REAL_TOP_MODE)
    await expect(tooltip).toContainText(expectedValue!)

    await page.mouse.move(0, 0)
    await expect(tooltip).toBeHidden()
  })

  // A real, confirmed bug: previously the ONLY hoverable elements on this
  // whole chart were the r=4 (8px-diameter) vertex dots — hovering the
  // polygon's own visibly colored fill/stroke area (what a viewer
  // naturally tries first, matching every other chart type in this app)
  // did nothing at all. The polygon <path> itself now responds too,
  // showing the series name.
  test('hovering the polygon\'s own fill area (not a vertex) shows a real tooltip naming the series', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_RADAR_TITLE)
    // `.last()`, matching the "hovering a vertex" test's own established
    // reasoning above: this real data's three polygons overlap heavily
    // (near-identical real values), so whichever path was drawn LAST is
    // the one that actually receives the hover at its own center —
    // proving the mousemove->tooltip mechanism itself works, not
    // pixel-targeting a specific obscured series in this particular
    // dataset.
    const path = card.locator('.radar-chart svg[viewBox] path[data-series]').last()
    await expect(path).toBeVisible()
    const expectedSeries = await path.getAttribute('data-series')

    await path.hover({ force: true })
    const tooltip = card.locator('.map-tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText(expectedSeries!)

    await page.mouse.move(0, 0)
    await expect(tooltip).toBeHidden()
  })

  // A real, confirmed bug: a bare 8px-diameter vertex dot is hard to hit
  // precisely with a real mouse. A wider (r=10), fully invisible
  // companion hit-target now sits under each visible dot — this proves a
  // hover NEAR (not exactly on) a vertex's own center still resolves to
  // that vertex's real tooltip.
  test('hovering near (not exactly on) a vertex still shows its real tooltip — a widened hit target', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_RADAR_TITLE)
    const vertex = card.locator(`.radar-chart svg[viewBox] circle[data-axis="${REAL_TOP_MODE}"]`).last()
    await expect(vertex).toBeVisible()
    const [expectedSeries, expectedValue] = await Promise.all([
      vertex.getAttribute('data-series'),
      vertex.getAttribute('data-value'),
    ])
    const box = await vertex.boundingBox()

    // 6px off the vertex's own center — outside the old 4px visible-dot
    // radius, inside the new 10px invisible hit-target radius.
    await vertex.hover({ position: { x: box!.width / 2 + 6, y: box!.height / 2 + 6 }, force: true })
    const tooltip = card.locator('.map-tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText(expectedSeries!)
    await expect(tooltip).toContainText(REAL_TOP_MODE)
    await expect(tooltip).toContainText(expectedValue!)
  })

  test('a zero-row filter shows PanelEmptyState; a broken metric shows PanelErrorState', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    await expect(
      panelCard(page, 'Radar Empty Result').getByText('No data for this selection'),
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      panelCard(page, 'Broken Radar Panel (missing metric)').getByText("Couldn't load this chart"),
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      panelCard(page, 'Radar Chart (Trip Mode Share)').locator('.radar-chart svg[viewBox] path[data-series]'),
    ).toHaveCount(1, { timeout: 20_000 })
  })

  test('renders correctly in both light and dark theme, and redraws after 004 expand', async ({ page }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_RADAR_TITLE)
    const polygons = card.locator('.radar-chart svg[viewBox] path[data-series]')
    await expect(polygons).toHaveCount(3)

    const lightTokens = await currentChartTokens(page)
    const lightStrokes = await polygons.evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke))
    for (const stroke of lightStrokes) {
      expect(lightTokens).toContain(stroke)
    }

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const firstPolygon = polygons.first()
    await expect
      .poll(async () => firstPolygon.evaluate((el) => getComputedStyle(el).stroke))
      .not.toBe(lightStrokes[0])
    const darkTokens = await currentChartTokens(page)
    const darkStrokes = await polygons.evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke))
    for (const stroke of darkStrokes) {
      expect(darkTokens).toContain(stroke)
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'))

    const inlineBox = await card.locator('.radar-chart svg[viewBox]').boundingBox()
    await expandTrigger(page, REAL_RADAR_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.radar-chart svg[viewBox] path[data-series]')).toHaveCount(3)
    const dialogBox = await dialog.locator('.radar-chart svg[viewBox]').boundingBox()
    expect(dialogBox!.width).toBeGreaterThan(inlineBox!.width)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
  })
})
