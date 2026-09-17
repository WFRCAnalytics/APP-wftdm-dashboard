import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser coverage for a genuine, pre-existing bug found via a
// systematic audit (not introduced by any recent feature — confirmed via
// a direct A/B against the commit before this session's own chart-type
// work): the real, already-published "School Location Distance
// Distribution" panel (dashboard-2-person-household.yaml, mark: barY,
// fill: school_segment) rendered NO bars at all — just axes — because
// resolveObservablePlotEncoding()'s categorical color-domain branch
// stringified the DOMAIN array (a clean legend display) but left the
// underlying DATA's own fill value as a raw number. school_segment is a
// real integer CODE (1/2/3 for K-8/9-12/university), so Plot's own
// ordinal scale matched a raw number against a domain of strings via
// strict equality, resolved to undefined for every row, and silently
// dropped the whole mark — confirmed via an isolated, app-independent
// Plot.plot() reproduction before this fix. Same boot()/route pattern as
// this session's other new specs — serves the real demo indexes without
// mutating on-disk fixture files.

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

test.describe('a categorical fill/stroke column that is numeric-typed (school_segment: integer codes 1/2/3)', () => {
  const TITLE = 'School Location Distance Distribution'

  test('renders real bars, not just empty axes', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households', exact: true }).click()
    const card = panelCard(page, TITLE)

    const bars = card.locator('.observable-plot-chart [aria-label="bar"] rect')
    await expect(bars.first()).toBeVisible({ timeout: 20_000 })
    const count = await bars.count()
    expect(count).toBeGreaterThan(0)
  })

  test('colors bars with real, distinct --chart-N tokens, not all falling back to one default color', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households', exact: true }).click()
    const card = panelCard(page, TITLE)
    const bars = card.locator('.observable-plot-chart [aria-label="bar"] rect')
    await expect(bars.first()).toBeVisible({ timeout: 20_000 })

    const fills = await bars.evaluateAll((els) => els.map((el) => el.getAttribute('fill')))
    expect(new Set(fills).size).toBeGreaterThan(1)
  })

  test('the legend lists each real school_segment code as its own swatch', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households', exact: true }).click()
    const card = panelCard(page, TITLE)
    await expect(card.locator('.observable-plot-chart [aria-label="bar"] rect').first()).toBeVisible({
      timeout: 20_000,
    })

    // school_segment's real, confirmed distinct values (1, 2, 3) — scoped
    // to Plot's own legend swatch wrapper specifically (`[class*="swatch"]`,
    // a dynamically-namespaced class per panel instance), not the whole
    // card: a bare, unscoped text match also collides with the x-axis's
    // own real numeric tick labels (distance_bin includes the value 1).
    const swatches = card.locator('span[class*="swatch"]')
    await expect(swatches.filter({ hasText: '1' })).toBeVisible()
    await expect(swatches.filter({ hasText: '2' })).toBeVisible()
    await expect(swatches.filter({ hasText: '3' })).toBeVisible()
  })
})
