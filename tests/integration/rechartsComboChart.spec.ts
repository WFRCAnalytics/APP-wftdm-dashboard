import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser coverage for type: recharts's new chart_type: combo — a
// real dual-axis bar+line chart (dashboard-5-trip-models.yaml's "Trip
// Volume vs. Average Distance by Purpose") plus the Test tab's own
// runtime-validation fixture (a combo panel with no `layers`). Same
// boot()/route pattern as demoContentAllPanels.spec.ts/
// observablePlotMarkVariety.spec.ts — serves the real demo indexes
// without mutating on-disk fixture files.

const REAL_DEMO_DASHBOARD_INDEX = {
  dashboards: [
    'dashboard-1-summary.yaml',
    'dashboard-2-person-household.yaml',
    'dashboard-3-tour-models.yaml',
    'dashboard-4-mode-choice.yaml',
    'dashboard-5-trip-models.yaml',
    'dashboard-6-network.yaml',
    'dashboard-7-explore.yaml',
    'dashboard-8-test.yaml',
  ],
  title: 'WFRC TDM Calibration Dashboard',
}
const REAL_DEMO_SCENARIOS_INDEX = [
  'activitysim-baseline',
  'activitysim-density-variant',
  'activitysim-transit-variant',
]

async function boot(page: Page) {
  await page.route('**/demo-dashboard-config/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_DASHBOARD_INDEX) }),
  )
  await page.route('**/demo-scenarios/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_SCENARIOS_INDEX) }),
  )
  await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/scenarios/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/dashboard-config/index.json', (r) => r.fulfill({ status: 404, body: '' }))

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

function clickDemoTab(page: Page, name: string) {
  return page.getByRole('tab', { name, exact: true }).click()
}

test.describe('chart_type: combo (Trip tab, "Trip Volume vs. Average Distance by Purpose")', () => {
  const TITLE = 'Trip Volume vs. Average Distance by Purpose'

  test('renders both a real bar layer and a real line layer — no error state', async ({ page }) => {
    await boot(page)
    await clickDemoTab(page, 'Trip')
    const card = panelCard(page, TITLE)
    await expect(card.getByText("Couldn't load", { exact: false })).toHaveCount(0)

    // 10 real primary_purpose categories (confirmed live, matching every
    // other real panel bound to this same real category domain elsewhere
    // in this app).
    const bars = card.locator('.recharts-bar-rectangle')
    await expect(bars).toHaveCount(10, { timeout: 20_000 })
    // One <path> draws the whole line series.
    const line = card.locator('.recharts-line-curve')
    await expect(line).toHaveCount(1)
  })

  test('the line layer uses its own independent right-axis scale, not the bar layer\'s left-axis range', async ({
    page,
  }) => {
    await boot(page)
    await clickDemoTab(page, 'Trip')
    const card = panelCard(page, TITLE)
    await expect(card.locator('.recharts-bar-rectangle')).toHaveCount(10, { timeout: 20_000 })

    const info = await card.locator('svg.recharts-surface').first().evaluate((svg) => {
      const linePath = svg.querySelector('.recharts-line-curve')
      const d = linePath?.getAttribute('d') ?? ''
      const yCoords = [...d.matchAll(/[-\d.]+,([-\d.]+)/g)].map((m) => parseFloat(m[1]))
      const barPaths = Array.from(svg.querySelectorAll('.recharts-bar-rectangle path'))
      const barTops = barPaths.map((p) => (p as SVGGraphicsElement).getBBox().y)
      const barBottoms = barPaths.map((p) => {
        const box = (p as SVGGraphicsElement).getBBox()
        return box.y + box.height
      })
      return {
        lineYRange: yCoords.length ? [Math.min(...yCoords), Math.max(...yCoords)] : null,
        barBottomMax: barBottoms.length ? Math.max(...barBottoms) : null,
        barTopMin: barTops.length ? Math.min(...barTops) : null,
      }
    })

    // A real, confirmed finding from building this feature: if the line
    // wrongly shared the bar's own left-axis scale (0..~8600 trips), its
    // real ~0.65-0.7 mile values would collapse to a near-flat line
    // sitting right at the axis baseline (indistinguishable from a
    // rendering bug). The real, correct dual-axis render instead spans a
    // genuine vertical range well above the chart's own bottom edge.
    expect(info.lineYRange).not.toBeNull()
    const [lineTop, lineBottom] = info.lineYRange as [number, number]
    expect(lineBottom - lineTop).toBeGreaterThan(10) // real, non-degenerate vertical spread
    expect(lineBottom).toBeLessThan(info.barBottomMax as number) // clear of the bars' own bottom edge
  })

  test('a legend lists both real layer labels, and hovering shows both real values in one tooltip', async ({
    page,
  }) => {
    await boot(page)
    await clickDemoTab(page, 'Trip')
    const card = panelCard(page, TITLE)
    await expect(card.locator('.recharts-bar-rectangle')).toHaveCount(10, { timeout: 20_000 })

    await expect(card.getByText('Trips', { exact: true })).toBeVisible()
    await expect(card.getByText('Avg. Distance (mi)', { exact: true })).toBeVisible()

    await card.locator('.recharts-bar-rectangle').first().hover()
    const tooltip = card.locator('.recharts-tooltip-wrapper')
    await expect(tooltip).toBeVisible({ timeout: 5_000 })
    await expect(tooltip).toContainText('Trips')
    await expect(tooltip).toContainText('Avg. Distance (mi)')
  })
})

test.describe('chart_type: combo — runtime validation (Test tab)', () => {
  test('a combo panel with no `layers` shows PanelErrorState, not a silent blank chart', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    // 20s, not the 5s default — this real Test tab mounts many real/
    // broken panels at once (this project's own already-documented
    // crowding — see sankeyPanel.spec.ts/pieChartPanel.spec.ts's
    // identical timeout reasoning).
    await expect(
      panelCard(page, 'Recharts Invalid Combo (no layers)').getByText('requires a non-empty', { exact: false }),
    ).toBeVisible({ timeout: 20_000 })
  })
})
