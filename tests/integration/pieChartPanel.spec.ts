import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 060-radar-pie-charts' `type: pie` panel
// (contracts/pie-panel.md). Real vehicle: "Trip Purpose Share"
// (dashboard-5-trip-models.yaml, Trip tab), metric trip_purpose_share,
// category: primary_purpose, value: share, pinned to
// activitysim-baseline. Real, confirmed live via the duckdb CLI directly
// against activitysim-baseline's own real trip_purpose_share.parquet: 10
// distinct primary_purpose values, "work" the real top (8,626 trips,
// 0.3657719543739134 share) — every real assertion below cross-checks
// against this same live data, not a guessed number.

const REAL_PIE_TITLE = 'Trip Purpose Share'
const REAL_TOP_PURPOSE = 'work'

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoTripTab(page: Page) {
  await page.getByRole('tab', { name: 'Trip' }).click()
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

test.describe('User Story 1 - Author a pie chart panel for a categorical share metric', () => {
  test('rendered wedges match a direct query of the real, pinned scenario data', async ({ page }) => {
    await boot(page)
    await gotoTripTab(page)
    const card = panelCard(page, REAL_PIE_TITLE)
    const chart = card.locator('.pie-chart svg[viewBox]')
    await expect(chart).toBeVisible()

    const rows = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT primary_purpose, trips FROM "activitysim-baseline__trip_purpose_share" ORDER BY trips DESC`,
      ),
    )
    expect(rows).toHaveLength(10) // real, confirmed live — see this file's own header comment

    const wedges = chart.locator('path[data-category]')
    await expect(wedges).toHaveCount(10)

    const values = await wedges.evaluateAll((els) =>
      Object.fromEntries(els.map((el) => [el.getAttribute('data-category'), Number(el.getAttribute('data-value'))])),
    )
    for (const row of rows as Record<string, unknown>[]) {
      // `trips` is a COUNT(*)-derived BIGINT over Arrow — arrives as a JS
      // bigint, not number (this project's own already-documented
      // formatValue.ts/ZoneMapPanel.tsx gap) — Number()-coerced here for
      // a plain numeric comparison against the SVG's own string attribute.
      expect(values[row.primary_purpose as string]).toBe(Number(row.trips))
    }
  })

  test('a legend lists every real category with a matching color swatch', async ({ page }) => {
    await boot(page)
    await gotoTripTab(page)
    const card = panelCard(page, REAL_PIE_TITLE)
    await expect(card.locator('.pie-chart svg[viewBox] path[data-category]')).toHaveCount(10)

    // The legend renders as a real, separate React-managed sibling of the
    // imperative chart container (data-model.md §6) — this proves it's
    // present and lists the real top purpose, not that the chart is
    // simply visible again.
    await expect(card.getByText(REAL_TOP_PURPOSE, { exact: true })).toBeVisible()
    const swatches = card.locator('.pie-chart').locator('xpath=following-sibling::div[1]').locator('div > div')
    await expect(swatches).toHaveCount(10)
  })

  test('hovering a wedge shows a real tooltip with its value and percentage', async ({ page }) => {
    await boot(page)
    await gotoTripTab(page)
    const card = panelCard(page, REAL_PIE_TITLE)
    const topWedge = card.locator(`.pie-chart svg[viewBox] path[data-category="${REAL_TOP_PURPOSE}"]`)
    await expect(topWedge).toBeVisible()

    await topWedge.hover()
    const tooltip = card.locator('.map-tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText(REAL_TOP_PURPOSE)
    // Real, confirmed live value (8,626) and its real share (~36.6%).
    await expect(tooltip).toContainText('8626')
    await expect(tooltip).toContainText('36.6%')

    await page.mouse.move(0, 0)
    await expect(tooltip).toBeHidden()
  })

  test('a zero-row filter shows PanelEmptyState; a broken metric shows PanelErrorState', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    // 10s, not the 5s default — the real Test tab mounts many real/broken
    // panels at once (this project's own already-documented crowding —
    // see sankeyPanel.spec.ts's identical timeout reasoning).
    await expect(
      panelCard(page, 'Pie Empty Result').getByText('No data for this selection'),
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      panelCard(page, 'Broken Pie Panel (missing metric)').getByText("Couldn't load this chart"),
    ).toBeVisible({ timeout: 20_000 })
    // The real, working pie panel on this same crowded tab is unaffected.
    await expect(
      panelCard(page, 'Pie Chart (Trip Purpose Share)').locator('.pie-chart svg[viewBox] path[data-category]'),
    ).toHaveCount(10, { timeout: 20_000 })
  })

  test('renders correctly in both light and dark theme, and redraws after 004 expand', async ({ page }) => {
    await boot(page)
    await gotoTripTab(page)
    const card = panelCard(page, REAL_PIE_TITLE)
    const wedges = card.locator('.pie-chart svg[viewBox] path[data-category]')
    await expect(wedges).toHaveCount(10)

    const lightTokens = await currentChartTokens(page)
    const lightFills = await wedges.evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))
    for (const fill of lightFills) {
      expect(lightTokens).toContain(fill)
    }

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const firstFill = wedges.first()
    await expect
      .poll(async () => firstFill.evaluate((el) => getComputedStyle(el).fill))
      .not.toBe(lightFills[0])
    const darkTokens = await currentChartTokens(page)
    const darkFills = await wedges.evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))
    for (const fill of darkFills) {
      expect(darkTokens).toContain(fill)
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'))

    // 004 expand/collapse — redraws crisply at the dialog's larger size.
    const inlineBox = await card.locator('.pie-chart svg[viewBox]').boundingBox()
    await expandTrigger(page, REAL_PIE_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.pie-chart svg[viewBox] path[data-category]')).toHaveCount(10)
    const dialogBox = await dialog.locator('.pie-chart svg[viewBox]').boundingBox()
    expect(dialogBox!.width).toBeGreaterThan(inlineBox!.width)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
  })
})
