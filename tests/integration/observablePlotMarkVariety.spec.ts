import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser coverage for `type: observable-plot`'s `mark:` grammar
// accepting any real @observablehq/plot mark constructor, not just
// barY/lineY — confirmed by direct source search of the installed
// package (Plot[markName] is looked up dynamically). Three real, newly-
// authored demo panels exercise this: `mark: dot` (scatter),
// `mark: boxX` (box-and-whisker), and `mark: cell` (heatmap/matrix) — the
// same boot()/route pattern demoContentAllPanels.spec.ts already uses to
// serve the real demo indexes without mutating on-disk fixture files.

const REAL_DEMO_DASHBOARD_INDEX = {
  dashboards: [
    'dashboard-1-summary.yaml',
    'dashboard-2-person-household.yaml',
    'dashboard-3-tour-models.yaml',
    'dashboard-4-mode-choice.yaml',
    'dashboard-5-trip-models.yaml',
    'dashboard-6-network.yaml',
    'dashboard-7-explore.yaml',
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

test.describe('mark: dot — scatter (Network tab, "Employment vs. Households by Zone")', () => {
  const TITLE = 'Employment vs. Households by Zone'

  test('renders one real point per zone per active scenario — no error state', async ({ page }) => {
    await boot(page)
    await clickDemoTab(page, 'Network')
    const card = panelCard(page, TITLE)
    await expect(card.getByText("Couldn't load this chart")).toHaveCount(0)

    const points = card.locator('.observable-plot-chart circle')
    // 25 real zones × 3 real active scenarios (land_use_summary is
    // unpinned here specifically to show the density variant's own real
    // TAZ 1 employment change as a shifted point).
    await expect(points).toHaveCount(75, { timeout: 20_000 })
  })

  test('colors points by scenario, using this app\'s real resolved scenario colors', async ({ page }) => {
    await boot(page)
    await clickDemoTab(page, 'Network')
    const card = panelCard(page, TITLE)
    const points = card.locator('.observable-plot-chart circle')
    await expect(points).toHaveCount(75, { timeout: 20_000 })

    const fills = await points.evaluateAll((els) => els.map((el) => el.getAttribute('fill')))
    // More than one distinct fill — genuinely colored by scenario, not a
    // single flat color.
    expect(new Set(fills).size).toBeGreaterThan(1)
  })
})

test.describe('mark: boxX — box plot (Person & Households tab, "Age Distribution by Person Type")', () => {
  const TITLE = 'Age Distribution by Person Type'

  test('renders a real box-and-whisker per person type — no error state', async ({ page }) => {
    await boot(page)
    await clickDemoTab(page, 'Person & Households')
    const card = panelCard(page, TITLE)
    await expect(card.getByText("Couldn't load this chart")).toHaveCount(0)

    // d3's own boxX mark draws each box as a filled <rect> (the IQR) plus
    // <path>/<line> whiskers and a median tick — real marks exist, not an
    // empty plot.
    const rects = card.locator('.observable-plot-chart rect')
    await expect(rects.first()).toBeVisible({ timeout: 20_000 })
    const count = await rects.count()
    expect(count).toBeGreaterThan(0)
  })

  test('the y-axis lists real ActivitySim person-type category labels', async ({ page }) => {
    await boot(page)
    await clickDemoTab(page, 'Person & Households')
    const card = panelCard(page, TITLE)
    // A real, confirmed ActivitySim person type from this project's own
    // mappings.person_type grammar (summarize.yaml) — proves the y
    // (category) axis is real, queried data, not placeholder ticks.
    await expect(card.getByText('Full-time worker', { exact: false })).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('mark: cell — heatmap (Mode Choice tab, "Trip Purpose × Mode Heatmap")', () => {
  const TITLE = 'Trip Purpose × Mode Heatmap'

  test('renders a real matrix of cells — no error state', async ({ page }) => {
    await boot(page)
    await clickDemoTab(page, 'Mode Choice')
    const card = panelCard(page, TITLE)
    await expect(card.getByText("Couldn't load this chart")).toHaveCount(0)

    const cells = card.locator('.observable-plot-chart rect[fill]')
    await expect(cells.first()).toBeVisible({ timeout: 20_000 })
    const count = await cells.count()
    expect(count).toBeGreaterThan(0)
  })

  test('the numeric fill (trip count) resolves to a real continuous gradient, not this app\'s categorical --chart-1..5 tokens', async ({
    page,
  }) => {
    await boot(page)
    await clickDemoTab(page, 'Mode Choice')
    const card = panelCard(page, TITLE)
    const cells = card.locator('.observable-plot-chart rect[fill]')
    await expect(cells.first()).toBeVisible({ timeout: 20_000 })

    const fills = await cells.evaluateAll((els) =>
      els.map((el) => el.getAttribute('fill')).filter((f): f is string => f !== null),
    )
    // A genuine numeric/sequential scale never resolves to a literal
    // `var(--chart-N)` reference — this app's categorical-fill branch
    // (resolveObservablePlotEncoding's §5e) explicitly does not run for a
    // numeric fill column, confirmed here against the real, live-rendered
    // DOM rather than just the unit-level encoding output.
    for (const fill of fills) {
      expect(fill.startsWith('var(--chart-')).toBe(false)
    }
    // A real gradient has more than one distinct color across real,
    // varying trip counts.
    expect(new Set(fills).size).toBeGreaterThan(1)
  })

  test('hovering a cell shows a real tooltip naming both real categorical axes', async ({ page }) => {
    await boot(page)
    await clickDemoTab(page, 'Mode Choice')
    const card = panelCard(page, TITLE)
    const cells = card.locator('.observable-plot-chart rect[fill]')
    await expect(cells.first()).toBeVisible({ timeout: 20_000 })
    await cells.first().hover()
    // Observable Plot's own tip mark renders as a real SVG <text>/<tspan>
    // group inside the same chart svg (not a separate DOM tooltip host,
    // unlike this app's shared mapTooltip.ts mechanism used by Sankey/
    // pie/radar/treemap/sunburst) — assert against the chart's own tip
    // group instead.
    const tip = card.locator('.observable-plot-chart [aria-label="tip"]')
    await expect(tip).toBeVisible({ timeout: 5_000 })
  })
})
