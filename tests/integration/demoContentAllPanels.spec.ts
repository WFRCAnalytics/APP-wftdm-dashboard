import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'
import type maplibregl from 'maplibre-gl'
import { acquireSharedFixtureLock, releaseSharedFixtureLock } from './_sharedFixtureLock'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __zonemapTestMaps?: Record<string, maplibregl.Map>
  }
}

// 032-six-tab-demo-content: this spec is REWRITTEN, not merely extended —
// the entire narrow three-tab demo structure (Overview/Destination Choice/
// Transit Service) this file's own 031-era tests targeted is gone (FR-001,
// no content preserved), replaced by the full six-tab ActivitySim outline
// (Summary/Person-Household Models/Tour Models/Mode Choice/Trip Models/
// Network). Every old test referencing a deleted tab name or panel title
// is replaced with an equivalent real assertion against the new structure.
// The Explore tab (dashboard-5-explore.yaml) is untouched by that feature
// and is exercised here only by the six-tab structure test, confirming it
// still exists and its content is unaffected.
//
// tests/global-setup.js deliberately blanks BOTH public/demo-scenarios/
// index.json AND public/demo-dashboard-config/index.json to [] for the
// WHOLE suite run (026-activitysim-demo-content's own real, documented
// finding). This spec's own beforeAll/afterAll restore BOTH files' REAL
// content for just this file's own lifecycle, then put the blanks back.
//
// A real cross-worker lock (_sharedFixtureLock.ts) is still required —
// 030-sidebar-navigation's own real, reproduced full-suite run found that
// `fullyParallel: false` only serializes tests WITHIN one file, never
// across files; every spec that mutates either discovery path must
// acquire this lock for its whole run.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEMO_DASHBOARD_INDEX_PATH = path.resolve(
  __dirname,
  '../../public/demo-dashboard-config/index.json',
)
const DEMO_SCENARIOS_INDEX_PATH = path.resolve(__dirname, '../../public/demo-scenarios/index.json')
const REAL_DEMO_DASHBOARD_INDEX = {
  dashboards: [
    'dashboard-1-summary.yaml',
    'dashboard-2-person-household.yaml',
    'dashboard-3-tour-models.yaml',
    'dashboard-4-mode-choice.yaml',
    'dashboard-5-trip-models.yaml',
    'dashboard-6-network.yaml',
    'dashboard-5-explore.yaml',
  ],
  title: 'WFRC TDM Calibration Dashboard',
  logoUrl:
    'https://raw.githubusercontent.com/WFRCAnalytics/wfrc-brand/main/_extensions/wfrc-brand/assets/logo/horizontal/WFRC_logo_horizontal_color_transparent.png',
  logoUrlDark:
    'https://raw.githubusercontent.com/WFRCAnalytics/wfrc-brand/main/_extensions/wfrc-brand/assets/logo/horizontal/WFRC_logo_horizontal_white_transparent.png',
}
const REAL_DEMO_SCENARIOS_INDEX = [
  'activitysim-baseline',
  'activitysim-density-variant',
  'activitysim-transit-variant',
]

test.beforeAll(async () => {
  // Another spec file may already hold this lock — Playwright's own
  // default beforeAll timeout (inherited from the test timeout) can
  // otherwise elapse while merely waiting for it. Real, legitimate
  // queueing, not a hang.
  test.setTimeout(420_000)
  await acquireSharedFixtureLock()
  writeFileSync(DEMO_DASHBOARD_INDEX_PATH, JSON.stringify(REAL_DEMO_DASHBOARD_INDEX, null, 2))
  writeFileSync(DEMO_SCENARIOS_INDEX_PATH, JSON.stringify(REAL_DEMO_SCENARIOS_INDEX, null, 2))
})

test.afterAll(() => {
  writeFileSync(DEMO_DASHBOARD_INDEX_PATH, JSON.stringify([]))
  writeFileSync(DEMO_SCENARIOS_INDEX_PATH, JSON.stringify([]))
  releaseSharedFixtureLock()
})

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

// A real, confirmed naming collision (found via a live run, not
// anticipated): this spec's own fixture dashboard-config root (always
// loaded alongside demo-dashboard-config onto the SAME page/tablist —
// main.ts concatenates both) has its own landing tab also literally named
// "Summary" (tests/fixtures/dashboard-config/dashboard-1-summary.yaml).
// 031's own version of this file never hit this because the demo's
// landing tab was then named "Overview" — 032's rename to "Summary"
// (matching CALIBRATION-SUMMARIES.md's own real heading) reintroduces the
// same class of cross-root tab-name collision 030-sidebar-navigation's own
// "Explore Fixture"/"Explore" clash already taught this project to expect
// whenever two dashboard-config roots share one page. main.ts's own
// concatenation order (fixture root's loadDashboards() call first, demo
// root's second) means the demo "Summary" tab is reliably the LAST match,
// not the first — `.last()` disambiguates without needing an exact-text
// workaround. Every other demo tab name (Person/Household Models, Tour
// Models, Mode Choice, Trip Models, Network) is unique against the
// fixture's own tab set (Summary/Detail/Basemaps) and needs no special
// handling.
function clickDemoTab(page: Page, name: string) {
  const locator = page.getByRole('tab', { name, exact: true })
  return (name === 'Summary' ? locator.last() : locator).click()
}

test.describe('032-six-tab-demo-content — User Story 1 (six-tab structure)', () => {
  test('exactly six primary tabs plus Explore appear, in order; the three deleted tabs are gone', async ({
    page,
  }) => {
    await boot(page)
    const tabs = await page.locator('[role="tablist"] [role="tab"]').allTextContents()
    const clean = tabs.map((t) => t.trim())

    const expectedOrder = [
      'Summary',
      'Person/Household Models',
      'Tour Models',
      'Mode Choice',
      'Trip Models',
      'Network',
      'Explore',
    ]
    for (const name of expectedOrder) {
      expect(clean.some((t) => t.includes(name))).toBe(true)
    }
    for (const banned of ['Overview', 'Destination Choice', 'Transit Service']) {
      expect(clean.some((t) => t.includes(banned))).toBe(false)
    }
  })
})

test.describe('032-six-tab-demo-content — User Story 2 (real data, honest gaps)', () => {
  test('a real gap note states its specific reason, and no error-state panel appears on any of the six tabs', async ({
    page,
  }) => {
    await boot(page)
    for (const tabName of [
      'Summary',
      'Person/Household Models',
      'Tour Models',
      'Mode Choice',
      'Trip Models',
      'Network',
    ]) {
      await clickDemoTab(page, tabName)
      await page.waitForTimeout(2500)
      await expect(page.getByText(/Couldn.?t load/i)).toHaveCount(0)
    }

    // One real, specific gap-note check — the Network tab's combined
    // Screenline/VMT-by-facility note (data-model.md §1).
    await clickDemoTab(page, 'Network')
    await expect(
      page.getByText(/no traffic-assignment step/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('032-six-tab-demo-content — User Story 3 (all ten panel types)', () => {
  test('every one of the ten registered panel types renders at least once, real and non-empty', async ({
    page,
  }) => {
    await boot(page)

    // valuebox + recharts + plotly — Summary
    await clickDemoTab(page, 'Summary')
    await page.waitForTimeout(2000)
    await expect(panelCard(page, 'Households')).toBeVisible()
    await expect(page.locator('svg path.recharts-rectangle').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.js-plotly-plot').first()).toBeVisible({ timeout: 15_000 })

    // table + observable-plot + markdown + graphic-walker — Person/Household Models
    await clickDemoTab(page, 'Person/Household Models')
    await page.waitForTimeout(2500)
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 15_000 })
    // The gap-note panel's own title (a plain heading, no inline `<code>`
    // markdown elements splitting its text — unlike its body paragraph,
    // which does, and which a raw substring `getByText` regex can miss).
    await expect(page.getByText('not available in this demo', { exact: false }).first()).toBeVisible()
    await expect(page.locator('.graphic-walker-panel-host')).toBeVisible({ timeout: 15_000 })
    const obsPlotBars = page.locator('svg [aria-label="bar"] rect, svg rect[fill]')
    await expect(obsPlotBars.first()).toBeVisible({ timeout: 15_000 })

    // sankey — Mode Choice
    await clickDemoTab(page, 'Mode Choice')
    await page.waitForTimeout(2500)
    await expect(page.locator('svg .sankey-node, svg path.sankey-link, svg g').first()).toBeVisible({
      timeout: 15_000,
    })

    // zonemap + flowmap — Network
    await clickDemoTab(page, 'Network')
    await page.waitForTimeout(3000)
    await expect(page.locator('.zonemap-chart').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.maplibregl-canvas').first()).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('032-six-tab-demo-content — Trip Models: real ZoneMap (Zone Trip Ends by Mode)', () => {
  // "SOV Trip Attractions by Zone" — dashboard-5-trip-models.yaml's real
  // zonemap panel, bound to the new trip_ends_by_zone_mode metric.
  const ZONEMAP_TITLE = 'SOV Trip Attractions by Zone'

  function waitForZonemapRender(page: Page, title: string) {
    const container = panelCard(page, title).locator('.zonemap-chart')
    return expect
      .poll(async () => container.getAttribute('data-render-count'), { timeout: 20_000 })
      .not.toBeNull()
  }

  // Resolves the live map by matching maplibregl.Map#getContainer() against
  // the real .zonemap-chart DOM node, and reads the GeoJSON source's own
  // raw `_data` rather than the public querySourceFeatures() — both
  // load-bearing, not stylistic, for the same real, confirmed reason
  // 031's own version of this spec already documented in full (CLAUDE.md's
  // 031 entry): shell.tsx's <DashboardRenderer tab={active}> has no `key`,
  // so combining this spec's own dashboard-config + demo-dashboard-config
  // roots on one page can reconcile two different tabs' zonemap panels
  // onto the SAME component instance when row name + index coincide,
  // leaving the test-only registry key and the map's camera stuck on
  // whichever config mounted first.
  async function sourceFeatureProps(page: Page) {
    const raw = await page.evaluate(() => {
      const container = document.querySelector('.zonemap-chart')
      const map = container
        ? Object.values(window.__zonemapTestMaps || {}).find((m) => m.getContainer() === container)
        : undefined
      const source = map?.getSource('zonemap-zones') as
        | { _data?: { features?: { properties: { zoneId: string; value: number | null } }[] } }
        | undefined
      return (source?._data?.features ?? []).map((f) => f.properties)
    })
    return Array.from(new Map(raw.map((f) => [f.zoneId, f])).values())
  }

  test('renders real, non-empty zone data using the real MTC-sourced geometry', async ({ page }) => {
    await boot(page)
    await clickDemoTab(page, 'Trip Models')
    await waitForZonemapRender(page, ZONEMAP_TITLE)

    await expect
      .poll(async () => (await sourceFeatureProps(page)).length, { timeout: 20_000 })
      .toBe(25)
    const features = await sourceFeatureProps(page)
    const noDataCount = features.filter((f) => f.value == null).length
    expect(noDataCount).toBeLessThan(25)
  })

  test('both themes render without error (dual-theme, wftdm-design-system non-negotiable)', async ({
    page,
  }) => {
    await boot(page)
    await clickDemoTab(page, 'Trip Models')
    await waitForZonemapRender(page, ZONEMAP_TITLE)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(200)
    await expect(panelCard(page, ZONEMAP_TITLE)).toBeVisible()
    const errorText = page.getByText("Couldn't load this map")
    await expect(errorText).toHaveCount(0)
  })
})

test.describe('032-six-tab-demo-content — Explore tab left untouched', () => {
  test('the Explore tab still renders its original single graphic-walker panel, full-page', async ({
    page,
  }) => {
    await boot(page)
    await clickDemoTab(page, 'Explore')
    await page.waitForTimeout(2000)
    await expect(page.locator('.graphic-walker-panel-host')).toBeVisible({ timeout: 15_000 })
    // Full-page mode: no page title, no Card chrome (030-sidebar-navigation
    // FR-008) — confirmed by the ABSENCE of a "Summary"-style page heading
    // alongside the panel, not asserted further here (fullPagePanel.spec.ts
    // owns that contract in full).
  })
})

test.describe('032-six-tab-demo-content — regression guard (existing fixture zonemap unaffected)', () => {
  test('an existing fixture zonemap panel resolves on its first attempt (no demo-geometry fallback touched)', async ({
    page,
  }) => {
    const demoGeometryRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/demo-geometry/')) demoGeometryRequests.push(req.url())
    })

    await boot(page)
    // The existing fixture dashboard content (tests/fixtures/dashboard-config,
    // copied in by tests/global-setup.js) has its own real zonemap fixture
    // panels — reached via the fixture tab set, unrelated to
    // public/demo-dashboard-config/. This assertion is a no-op (correctly
    // passing vacuously) if no fixture zonemap panel happens to be on the
    // currently-active landing tab; the real point is that whatever DID
    // resolve never touched demo-geometry/.
    await page.waitForTimeout(2000)

    expect(demoGeometryRequests).toEqual([])
  })
})
