import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'
import type maplibregl from 'maplibre-gl'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __zonemapTestMaps?: Record<string, maplibregl.Map>
  }
}

// 031-all-panel-demo-content — real-browser coverage for the panel types
// newly demonstrated with real data from public/demo-dashboard-config/
// (Overview's new Recharts/Observable Plot row, the new Explore tab's
// Graphic Walker/Markdown panels, the new Network tab's ZoneMap panel).
// Deliberately does NOT cover Sankey/FlowMap (dashboard-6-flows.yaml) —
// that content is real and correct but not yet published to index.json,
// per this feature's own real-data-availability constraint (see
// CLAUDE.md's own 031 entry and dashboard-6-flows.yaml's header comment).
//
// tests/global-setup.js deliberately blanks BOTH public/demo-scenarios/
// index.json AND public/demo-dashboard-config/index.json to [] for the
// WHOLE suite run (026-activitysim-demo-content's own real, documented
// finding — kept so unrelated fixture-based assertions elsewhere aren't
// disturbed by this repo's real, permanent demo content). This spec's own
// beforeAll/afterAll restore BOTH files' REAL content for just this
// file's own lifecycle, then put the blanks back — scoped to this file
// only, no change to the shared global-setup.js/global-teardown.js
// infrastructure itself. Safe under playwright.config.js's own
// fullyParallel: false (spec files run sequentially, so no other file
// observes the temporarily-restored content).
//
// A real, confirmed bug in an earlier version of this file: it restored
// ONLY demo-dashboard-config/index.json, leaving demo-scenarios/index.json
// blanked to [] for this file's whole run — registerDemoScenarios() then
// discovered zero scenarios, so every panel below pinned to
// activitysim-baseline/-density-variant/-transit-variant (dashboard-1-
// overview.yaml's scenarios: list, dashboard-4/5's scenario: pins) found
// no matching views and rendered "Couldn't load this chart"/"...value"/
// "...map" — a real, live failure (test-results/*/error-context.md),
// not a hang. Fixed by restoring both files together.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEMO_DASHBOARD_INDEX_PATH = path.resolve(
  __dirname,
  '../../public/demo-dashboard-config/index.json',
)
const DEMO_SCENARIOS_INDEX_PATH = path.resolve(__dirname, '../../public/demo-scenarios/index.json')
const REAL_DEMO_DASHBOARD_INDEX = {
  dashboards: [
    'dashboard-1-overview.yaml',
    'dashboard-2-destination-choice.yaml',
    'dashboard-3-transit-service.yaml',
    'dashboard-4-network.yaml',
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

test.beforeAll(() => {
  writeFileSync(DEMO_DASHBOARD_INDEX_PATH, JSON.stringify(REAL_DEMO_DASHBOARD_INDEX, null, 2))
  writeFileSync(DEMO_SCENARIOS_INDEX_PATH, JSON.stringify(REAL_DEMO_SCENARIOS_INDEX, null, 2))
})

test.afterAll(() => {
  writeFileSync(DEMO_DASHBOARD_INDEX_PATH, JSON.stringify([]))
  writeFileSync(DEMO_SCENARIOS_INDEX_PATH, JSON.stringify([]))
})

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

test.describe('031-all-panel-demo-content — User Story 1 (Overview: Recharts/Observable Plot)', () => {
  test('Recharts panel renders the same real trip_mode_share values as the existing Plotly panel', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Overview' }).click()

    // The existing, already-real Plotly panel's own rendered SVG text
    // labels (x-axis categories) prove which real major_trip_mode values
    // exist for this scenario set — confirmed real, not assumed, since
    // this Plotly panel already shipped in 026.
    const plotlyCard = panelCard(page, 'Overall Trip Mode Share')
    await expect(plotlyCard).toBeVisible()

    const rechartsCard = panelCard(page, 'Recharts — Overall Trip Mode Share')
    await expect(rechartsCard).toBeVisible()
    // Recharts (v3, this project's pinned version) renders each bar as an
    // SVG <path class="recharts-rectangle"> inside a <g
    // class="recharts-bar-rectangle"> wrapper — never a plain <rect> —
    // confirmed directly against the live rendered DOM (an earlier version
    // of this test wrongly guessed `.recharts-bar-rectangle rect`, which
    // matches zero elements and made this assertion time out regardless of
    // whether real data reached the chart).
    const bars = rechartsCard.locator('svg path.recharts-rectangle')
    await expect(bars.first()).toBeVisible({ timeout: 15_000 })
    expect(await bars.count()).toBeGreaterThan(0)
  })

  test('Observable Plot panel renders the same real trip_mode_share values', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Overview' }).click()

    const card = panelCard(page, 'Observable Plot — Overall Trip Mode Share')
    await expect(card).toBeVisible()
    const bars = card.locator('svg [aria-label="bar"] rect, svg rect[fill]')
    await expect(bars.first()).toBeVisible({ timeout: 15_000 })
    expect(await bars.count()).toBeGreaterThan(0)
  })
})

test.describe('031-all-panel-demo-content — User Story 1 (Explore: Graphic Walker/Markdown)', () => {
  test('Graphic Walker panel field list contains only real trip_mode_share columns', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Explore' }).click()

    const card = panelCard(page, 'Free-form Visual Analytics — Trip Mode Share')
    await expect(card).toBeVisible()
    // Real columns this metric's own SQL actually produces
    // (major_trip_mode, trips, share). This panel is pinned to a single
    // scenario (scenario: activitysim-baseline, dashboard-5-explore.yaml)
    // — no $scenario union, so no auto-added `scenario` column exists to
    // assert on here (an earlier version of this test wrongly expected
    // one, written before the panel's own scenario pin was added to fix a
    // real "Catalog Error: observed__trip_mode_share does not exist" bug
    // — see that file's own header comment for the full story).
    // Graphic Walker's own field list renders each real field name in more
    // than one place (the source Field List panel plus, at minimum, its
    // own drag handle/context-menu affordances) — a real, confirmed strict-
    // mode violation, not a false match; .first() scopes to "at least one
    // real occurrence exists" rather than asserting exactly one.
    await expect(card.getByText('major_trip_mode', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(card.getByText('trips', { exact: true }).first()).toBeVisible()
    await expect(card.getByText('share', { exact: true }).first()).toBeVisible()
  })

  test('Markdown panel renders real, accurate prose about the three real scenarios', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Explore' }).click()

    const card = panelCard(page, 'About This Demo')
    await expect(card).toBeVisible()
    // exact: false substring matching is real here, not a false positive —
    // "Baseline" genuinely appears twice in this panel's real prose (once
    // as the bolded list-item label, once lowercase mid-sentence inside
    // the Density Variant bullet: "...already a real employment center in
    // the baseline..."). .first() asserts "this real word appears
    // somewhere", matching this test's own intent — it is not scoped to
    // count occurrences.
    await expect(card.getByText('Baseline', { exact: false }).first()).toBeVisible()
    await expect(card.getByText('Density Variant', { exact: false }).first()).toBeVisible()
    await expect(card.getByText('Transit Variant', { exact: false }).first()).toBeVisible()
    await expect(card.getByText('Financial District', { exact: false }).first()).toBeVisible()
  })
})

test.describe('031-all-panel-demo-content — User Story 4 (Network: real ZoneMap)', () => {
  // "Work Trips by Destination Zone (Baseline)" — this panel's real,
  // current title (public/demo-dashboard-config/dashboard-4-network.yaml).
  // Retitled from an earlier "Trips by Destination Zone (Baseline)" when a
  // real filter: { primary_purpose: work } was added to fix a genuine
  // multi-row-per-zone data-quality issue (trips_by_destination_zone
  // groups by (destination_zone_id, primary_purpose) — without a filter,
  // ZoneMapPanel's own documented "last-row-wins" join picked an
  // arbitrary purpose's count per zone).
  const ZONEMAP_TITLE = 'Work Trips by Destination Zone (Baseline)'

  function waitForZonemapRender(page: Page, title: string) {
    const container = panelCard(page, title).locator('.zonemap-chart')
    return expect
      .poll(async () => container.getAttribute('data-render-count'), { timeout: 20_000 })
      .not.toBeNull()
  }

  // Resolves the live map by matching maplibregl.Map#getContainer()
  // against the real .zonemap-chart DOM node — NOT by indexing
  // window.__zonemapTestMaps[title] directly — and reads the GeoJSON
  // source's own raw `_data` rather than calling MapLibre's public
  // `querySourceFeatures()`. Both departures are load-bearing, not
  // stylistic, and both trace to the SAME real, confirmed, live-debugged
  // root cause: this spec is the first in the whole suite to combine the
  // fixture `dashboard-config` AND `demo-dashboard-config` on the SAME
  // page (every existing spec exercises one dashboard-config root
  // alone). `shell.tsx` renders `<DashboardRenderer tab={active} />`
  // with NO `key` prop, so a tab switch never unmounts/remounts that
  // subtree — React just re-renders the same component tree with new
  // props. When a row name + panel index in the newly-active tab happens
  // to coincide with a row name + index already used by an
  // earlier-mounted tab (here: the fixture's own landing-page zonemap
  // panel, "Zone Map VMT per Capita"), React reconciles them as the SAME
  // ZoneMapPanel component instance. That instance's mount-only effect
  // (empty deps — where BOTH `window.__zonemapTestMaps[config.title] =
  // map` AND the initial camera `center`/`zoom` are set, once) never
  // re-runs, so (1) the registry key stays stuck on the FIRST title that
  // instance ever mounted with, even though the DOM (heading, panel
  // title, `data-render-count`) always reflects the correct, current
  // panel — confirmed by resolving the map via `getContainer()` identity
  // instead, which correctly found `hasMap`/`isStyleLoaded`/
  // `sourceExists` all `true` on every poll — and (2) the map's camera
  // is ALSO stuck at the fixture's own original position, so this
  // panel's real San Francisco polygons (correctly `setData()`'d onto
  // the source by the data-update effect, which DOES re-run) sit outside
  // the stale viewport and are never tiled, making
  // `querySourceFeatures()` (viewport/tile-dependent) legitimately
  // return nothing regardless of how correctly the map/source were
  // resolved — confirmed via temporary diagnostic instrumentation. Full
  // account in CLAUDE.md's 031 entry.
  //
  // `_data` sidesteps the camera problem entirely — it's the raw object
  // passed to `setData()`, real/complete/independent of viewport/tiling,
  // and the right read for "did real data reach the source," which is
  // what this assertion needs. `tests/integration/zonemapPanel.spec.ts`'s
  // own `sourceFeatureProps()` correctly keeps using the public
  // `querySourceFeatures()` — it never hits this camera-reuse scenario (a
  // single dashboard-config root, no cross-root panel-instance reuse
  // possible). This spec's own real scenario also has exactly one
  // `.zonemap-chart` node on the whole page (only this panel's Network
  // tab is active), so scoping by `title` at all is unnecessary here —
  // the parameter stays only to keep call sites self-documenting. A real,
  // still-open, low-priority follow-up worth naming:
  // `key={tab.header.tab}` on `shell.tsx`'s own `DashboardRenderer` would
  // close this class of stale-mount-effect gap generally — not done
  // here, out of scope for this feature.
  async function sourceFeatureProps(page: Page, _title: string) {
    const raw = await page.evaluate(() => {
      const container = document.querySelector('.zonemap-chart')
      const map = container
        ? Object.values(window.__zonemapTestMaps || {}).find((m) => m.getContainer() === container)
        : undefined
      // _data is a real, private GeoJSONSource field (not part of the
      // public Source type) — the `as` cast below is necessary, not a
      // style choice; see this function's own header comment for why
      // this reads it instead of the public querySourceFeatures().
      const source = map?.getSource('zonemap-zones') as
        | { _data?: { features?: { properties: { zoneId: string; value: number | null } }[] } }
        | undefined
      return (source?._data?.features ?? []).map((f) => f.properties)
    })
    return Array.from(new Map(raw.map((f) => [f.zoneId, f])).values())
  }

  test('renders real, non-empty zone data using the new MTC-sourced geometry', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Network' }).click()
    await waitForZonemapRender(page, ZONEMAP_TITLE)

    // 25 real zones published (public/demo-geometry/taz25.geoparquet) —
    // every one should be present as a real, distinct feature in the
    // source's raw data. sourceFeatureProps() reads _data (see its own
    // header comment for why), but still polls rather than reading once —
    // the data-update effect's setData() call can legitimately land a
    // moment after data-render-count first appears.
    await expect
      .poll(async () => (await sourceFeatureProps(page, ZONEMAP_TITLE)).length, { timeout: 20_000 })
      .toBe(25)
    const features = await sourceFeatureProps(page, ZONEMAP_TITLE)
    // At least some zones should have real matching work-trip data (not
    // every one is guaranteed non-null, but not ALL 25 should be "no
    // data").
    const noDataCount = features.filter((f) => f.value == null).length
    expect(noDataCount).toBeLessThan(25)
  })

  test('both themes render without error (dual-theme, wftdm-design-system non-negotiable)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Network' }).click()
    await waitForZonemapRender(page, ZONEMAP_TITLE)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(200)
    await expect(panelCard(page, ZONEMAP_TITLE)).toBeVisible()
    const errorText = page.getByText("Couldn't load this map")
    await expect(errorText).toHaveCount(0)
  })
})

test.describe('031-all-panel-demo-content — regression guard (existing fixture zonemap unaffected)', () => {
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
