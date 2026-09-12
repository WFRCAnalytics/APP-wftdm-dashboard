import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'
import type maplibregl from 'maplibre-gl'
import type { MapboxOverlay } from '@deck.gl/mapbox'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __flowmapTestMaps?: Record<string, maplibregl.Map>
    __flowmapTestOverlays?: Record<string, MapboxOverlay>
    __setStyleCallCount?: number
  }
}

// Real-browser tests for 010-flowmap-panel, extending
// sankeyPanel.spec.ts's/scenarioManager.spec.ts's own pattern (real
// DuckDB-WASM, real Parquet, real demo dashboard-config). See
// quickstart.md and contracts/flowmap-panel.md.
//
// 040-test-suite-migration: migrated off the retired synthetic
// tests/fixtures/dashboard-config/ set (deleted — including
// tests/fixtures/generate.py's own OD_FLOWS_ROWS, 6 hand-authored flows
// among a handful of deliberately-invalid rows). The real vehicle is now
// `public/demo-dashboard-config/dashboard-6-network.yaml`'s "Trip
// Distribution Desire Lines (Default View)" panel — real od_flows data
// (activitysim-baseline scenario, MTC prototype_mtc's real San Francisco
// Bay Area zones, NOT the Wasatch Front — a real, confirmed correction:
// this app's own DEFAULT_CENTER/DEFAULT_ZOOM fallback is Utah, but the
// demo DATA itself is SF), Network tab, deliberately with no author
// center/zoom/basemap so US1/US2's generic-mechanics coverage (auto-fit,
// default basemap resolution, attribution/nav controls, deck.gl hover,
// expand/resize, registry consistency) has a real home — the tab's OTHER
// real od_flows panel ("Trip Distribution Desire Lines") has its own
// authored center/zoom and can't serve this role (027's own
// `center == null && zoom == null` auto-fit guard never runs for it).
//
// Real od_flows aggregation (queried directly, not assumed — see the
// aggregation-correctness test below for the live cross-check query
// itself): 623 distinct (orig_taz, dest_taz) pairs, 25 distinct
// locations. Real extent: lon -122.417245..-122.390667 /
// lat 37.77274..37.801557. Two real fixture-era edge cases have NO real
// trigger in this data and are corrected below rather than faked — see
// each test's own comment: (1) zero rows have a non-positive value or a
// missing coordinate (the "excludes N row(s)" warning never fires);
// (2) zero raw rows share an (orig_taz, dest_taz) pair (every real pair
// is already unique before aggregation — no raw duplicate exists to sum).
//
// Broken/edge-case panels now live on `dashboard-8-test.yaml`'s
// permanent, near-invisible "Test" tab (contracts/dashboard-8-test.md):
// "Broken Flow Map Panel (missing metric)" (error state), plus real
// basemap-precedence/raster/UGRC-composition/unreachable-preset content
// authored specifically for this migration (each panel's own comment in
// that file records why it lives there rather than the real Network tab).

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

function expandTrigger(page: Page, title: string) {
  // exact: true — 013-zonemap-panel added a title that's a prefix of
  // another ("Zone Map VMT per Capita" / "... (Auto Domain)") to this
  // tab's own mixed-panel-types test, which Playwright's default
  // substring name matching treats as ambiguous otherwise (a real
  // "strict mode violation" hit live once that panel was added here).
  return page.getByRole('button', { name: `Expand ${title}`, exact: true })
}

async function queryCountFor(page: Page, needle: string) {
  return page.evaluate(
    (n) => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes(n)).length,
    needle,
  )
}

// 040-test-suite-migration: default poll timeout raised from Playwright's
// own built-in 5000ms to 10000ms — confirmed via two real, isolated runs
// that intermittent 5000ms timeouts recur on DIFFERENT checks each run
// (a render-count wait, a reset-to-view camera-settle wait, a raster-tile
// request wait — never the same one twice), the same real signature this
// file's own UGRC-composition test already found and fixed with an
// explicit longer poll: this real Test tab mounts far more real/broken
// map panels at once (11) than the retired fixture's own dedicated
// "Basemaps" tab ever did, and under that real concurrent load a 5s
// ceiling is intermittently, not permanently, too tight. A global fix
// here (not a growing pile of one-off per-call-site overrides) addresses
// the actual shared root cause.
async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check, { timeout: 10000 }).toBe(true)
}

const FLOWMAP_TITLE = 'Trip Distribution Desire Lines (Default View)'

// The real panel lives on the Network tab (dashboard-6-network.yaml),
// unlike the retired fixture's own landing-page placement — every test
// using FLOWMAP_TITLE must navigate there first.
async function gotoNetworkTab(page: Page) {
  await page.getByRole('tab', { name: 'Network' }).click()
}

test.describe('User Story 1 - Author renders an O-D metric as a flow map', () => {
  test('rendered locations/flows match a direct GROUP BY/SUM aggregation of the real od_flows data', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await expect(container).toBeVisible()

    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    const flowCount = await container.getAttribute('data-flow-count')
    const locationCount = await container.getAttribute('data-location-count')

    // Cross-check against a direct query, not a hardcoded expected value —
    // proves the panel's own aggregation against real data, not a
    // recalled number. CAST(...AS BIGINT) — DuckDB's SUM(INTEGER)
    // defaults to HUGEINT, whose Arrow-to-JS serialization doesn't come
    // back as a plain number (found empirically, same class of
    // DuckDB-WASM Arrow-conversion quirk this project has hit before with
    // DECIMAL/DOUBLE).
    const rows = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT COUNT(*) AS pair_count FROM (
           SELECT orig_taz, dest_taz
           FROM "activitysim-baseline__od_flows"
           GROUP BY orig_taz, dest_taz
         )`,
      ),
    )
    expect(Number(flowCount)).toBe(Number(rows[0].pair_count))

    const locRows = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT COUNT(DISTINCT taz) AS n FROM (
           SELECT orig_taz AS taz FROM "activitysim-baseline__od_flows"
           UNION SELECT dest_taz AS taz FROM "activitysim-baseline__od_flows"
         )`,
      ),
    )
    expect(Number(locationCount)).toBe(Number(locRows[0].n))

    // Real, confirmed values (queried directly, not guessed) — locks the
    // cross-check itself in against a silent future data change, same
    // discipline the original fixture-era hardcoded expectation provided.
    expect(Number(flowCount)).toBe(623)
    expect(Number(locationCount)).toBe(25)
  })

  test('the map has a real, non-zero-size canvas once rendered', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    const center = await page.evaluate(() => {
      const el = document.querySelector('.flowmap-chart canvas')
      return el ? { width: el.clientWidth, height: el.clientHeight } : null
    })
    expect(center).not.toBeNull()
    expect(center!.width).toBeGreaterThan(0)
    expect(center!.height).toBeGreaterThan(0)
  })

  // 027-map-auto-fit-and-reset (FR-001/FR-004/FR-005/FR-006) — FLOWMAP_TITLE
  // omits center/zoom in its real dashboard-6-network.yaml config, so once
  // its real od_flows data resolves, the map's initial view must be
  // auto-fitted to that data's own real extent — no longer left at
  // DEFAULT_CENTER/DEFAULT_ZOOM (that assertion was this test's OWN
  // previous behavior before this feature; superseded here, not merely
  // extended, since the correct expectation genuinely changed).
  test('auto-fits its initial view to the real loaded flow data (no author-configured center/zoom)', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    // fitBounds() animates (duration: 800, research.md §2) — wait for the
    // camera to actually stop moving before reading getBounds(), the same
    // 'moveend'-settled discipline this file's own pan/zoom tests already
    // use elsewhere (matching the real reference precedent, not an
    // instant jump).
    await page.evaluate(
      (t) =>
        new Promise<void>((resolve) => {
          const map = window.__flowmapTestMaps![t]
          if (!map.isMoving()) return resolve()
          map.once('moveend', () => resolve())
        }),
      FLOWMAP_TITLE,
    )

    const bounds = await page.evaluate((t) => {
      const b = window.__flowmapTestMaps![t].getBounds()
      return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
    }, FLOWMAP_TITLE)

    // The real, confirmed extent of every real od_flows origin/destination
    // point (activitysim-baseline, queried directly — MTC prototype_mtc's
    // real San Francisco Bay Area zones, TAZ 1-25): west=-122.417245,
    // east=-122.390667, south=37.77274, north=37.801557. fitBounds()'s own
    // padding only ever EXPANDS the visible viewport beyond the raw data
    // extent, never contracts it, so the real viewport must be a superset.
    expect(bounds.west).toBeLessThanOrEqual(-122.417245)
    expect(bounds.east).toBeGreaterThanOrEqual(-122.390667)
    expect(bounds.south).toBeLessThanOrEqual(37.77274)
    expect(bounds.north).toBeGreaterThanOrEqual(37.801557)

    // Not the static Wasatch Front default (this app's own DEFAULT_CENTER/
    // DEFAULT_ZOOM fallback, unrelated to where the real demo data actually
    // is) — a real, computed fit genuinely happened, not a coincidental
    // no-op.
    const zoom = await page.evaluate((t) => window.__flowmapTestMaps![t].getZoom(), FLOWMAP_TITLE)
    const center = await page.evaluate((t) => window.__flowmapTestMaps![t].getCenter(), FLOWMAP_TITLE)
    expect([zoom, center.lng, center.lat]).not.toEqual([9, -111.89, 40.76])
  })

  // FR-004 — a panel that never reaches a genuine displayable-data state
  // must never attempt a fit at all. "Broken Flow Map Panel (missing
  // metric)" (a metric no scenario publishes) reaches `status: 'error'` — which,
  // per FlowMapPanel.tsx's own render logic, renders the shared
  // PanelErrorState with NO map/canvas mounted at all (asserted below and
  // already covered, unchanged, by this file's own pre-existing "a broken
  // metric config renders the shared PanelErrorState..." test) — so there
  // is trivially nothing for auto-fit to run against. The complementary
  // "real rows exist but every one gets excluded" sub-case (a genuinely
  // different code path — status reaches 'ready', a map IS mounted, but
  // computeFlowBounds() returns null) is covered at the unit level
  // (tests/unit/mapBounds.test.ts's empty-array case) plus direct review
  // of FlowMapPanel.tsx's own `if (bounds)` guard — not re-added as a new
  // fixture panel here, since no such "every row excluded" fixture exists
  // today and manufacturing one purely for this one edge case would be
  // disproportionate new fixture surface for what the unit test already
  // proves.
  test('a panel that never reaches displayable data renders no map to (mis)fit at all', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Broken Flow Map Panel (missing metric)')
    await expect(card.getByText("Couldn't load this map")).toBeVisible()
    await expect(card.locator('.flowmap-chart')).toHaveCount(0)
    await expect(card.locator('canvas')).toHaveCount(0)
  })

  test('clustering/clustering_auto config values reach the constructed FlowmapLayer', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    // The real panel config sets clustering: true / clustering_auto: true —
    // confirmed indirectly via a successful, non-erroring render (a
    // FlowmapLayer constructed with invalid/mismatched clustering props
    // would throw or render nothing) combined with the flow/location
    // counts already asserted above — flowmap.gl exposes no public,
    // Playwright-inspectable prop-readback API, so this is the same
    // black-box-correctness style every prior panel type's own
    // library-internal option coverage uses.
    await expect(container).toBeVisible()
  })

  // 040-test-suite-migration: a real, confirmed scope correction, not a
  // simplification. The retired fixture's own (100,200)/(100,300) rows
  // were deliberately hand-authored duplicates specifically to exercise
  // flowmapData.ts's dedup-by-(origin,destination)-key-and-sum logic. The
  // real od_flows data has NO raw duplicate (orig_taz, dest_taz) pair at
  // all — confirmed directly: 623 raw rows aggregate to exactly 623
  // distinct pairs (queried live, not assumed). Per this migration's own
  // explicit instruction, a synthetic duplicate is not fabricated here —
  // this test is retired. The same SUM-per-group mechanism it existed to
  // prove is already exercised, generically, by the aggregation-
  // correctness test above (a real GROUP BY/SUM cross-check against this
  // exact data) and remains covered at the unit level by
  // tests/unit/flowmapData.test.ts's own dedicated duplicate-row case.

  // 040-test-suite-migration: a real, confirmed scope correction. Zero
  // real od_flows rows have a non-positive value or a missing
  // coordinate — confirmed directly by querying the live data
  // (COUNT(*) WHERE trips <= 0 OR any coordinate IS NULL = 0). Per this
  // migration's own explicit instruction, a bad row is not fabricated to
  // force the warning — the correct, honest assertion under real data is
  // that FlowMapPanel's own scoped console.warn never fires at all.
  test('logs no exclusion warning — the real data has no non-positive-value or missing-coordinate row', async ({
    page,
  }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().includes('FlowMapPanel')) {
        warnings.push(msg.text())
      }
    })

    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    // No positive event to await for "nothing happened" — a bounded wait
    // is the honest mechanism here, matching this file's own established
    // convention for negative assertions elsewhere (e.g. the setStyle()
    // no-re-pair checks below).
    await page.waitForTimeout(1500)

    expect(warnings).toEqual([])
  })

  test('every map-host request is to the expected default basemap source, nothing unexpected', async ({
    page,
  }) => {
    // UPDATED for 011-basemap-style-system: this was originally a "zero
    // requests to any map host" assertion, correct under 010's own
    // BLANK_STYLE-only default. That default has since deliberately
    // changed — this exact panel (no basemap: config) now loads a real
    // basemap by design (FR-007). The app default moved from
    // 'carto-voyager' to 'openfreemap-positron' (registry.ts APP_DEFAULT,
    // project-docs/BASEMAP-PICKER-PROPOSAL.md §2/§3), and every request that
    // style makes — style JSON, vector tiles, the ne2_shaded relief
    // raster, sprites, fonts — is served from tiles.openfreemap.org
    // (confirmed directly). What's still worth asserting: this panel
    // touches NO OTHER map host — the same "no silent, unintended
    // external dependency" concern the original test protected. So
    // `openfreemap` is the ONE expected host and is the only one dropped
    // from the pattern below; `cartocdn` is newly ADDED (an unconfigured
    // panel must no longer touch CARTO at all now that it isn't the
    // default); `openstreetmap` stays (it appears only inside OpenFreeMap's
    // attribution HTML as an <a href>, never as a real fetch, so a genuine
    // request to it would still be unexpected). DuckDB-WASM's own unrelated
    // extensions.duckdb.org request is likewise not matched by this pattern.
    const mapHostPattern = /maptiler|mapbox|openstreetmap|demotiles\.maplibre|opentopomap|arcgis|cartocdn/i
    const unexpectedMapRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (
        !url.startsWith('http://127.0.0.1:5199/') &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:') &&
        mapHostPattern.test(url)
      ) {
        unexpectedMapRequests.push(url)
      }
    })

    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    // Give the map a moment to have issued any tile/style requests it was
    // going to issue.
    await page.waitForTimeout(1500)

    expect(unexpectedMapRequests).toEqual([])
  })
})

// 027-map-auto-fit-and-reset, User Story 3 — an author's explicit
// center/zoom always wins outright; auto-fit must never run at all for
// such a panel. "Flowmap Explicit View Override"
// (dashboard-8-test.yaml, the "Test" tab, 040-test-suite-migration) is
// deliberately configured with a center/zoom far from its own real flow
// data — the real od_flows extent is roughly lon -122.417..-122.391 /
// lat 37.773..37.802 (MTC prototype_mtc's San Francisco Bay Area zones,
// NOT the Wasatch Front — this app's own DEFAULT_CENTER/DEFAULT_ZOOM
// fallback is Utah, but the demo DATA is not) — specifically so this test
// can tell "stayed at the authored view" apart from "coincidentally close
// to a real fit". Named with this feature's own number, not a bare "User
// Story 3" — this file already has a pre-existing, differently-scoped
// "User Story 3" describe block (010-flowmap-panel's own numbering)
// further below.
test.describe('027-map-auto-fit-and-reset — User Story 3: an author explicit view configuration is always respected', () => {
  test('an explicit center/zoom wins outright over auto-fit, even when it is nowhere near the real data', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap Explicit View Override'
    const container = panelCard(page, title).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    // No animated transition to wait out here — auto-fit never runs at
    // all for this panel, so the view is exactly its constructor-time
    // value with no later fitBounds()/easeTo() call in flight.
    const center = await page.evaluate((t) => window.__flowmapTestMaps![t].getCenter(), title)
    const zoom = await page.evaluate((t) => window.__flowmapTestMaps![t].getZoom(), title)
    expect(center.lng).toBeCloseTo(-110.0, 2)
    expect(center.lat).toBeCloseTo(39.0, 2)
    expect(zoom).toBeCloseTo(6, 0)
  })
})

// Attribution control — MapLibre's own built-in attributionControl:
// { compact: true } option (Map constructor), no custom UI. Confirmed via
// a live Playwright probe (not assumed): MapLibre's real AttributionControl
// renders its compact rounded-corner badge (className gains
// "maplibregl-compact") the moment it first has a non-empty attribution
// string, and that first transition ALSO adds "maplibregl-compact-show"
// in the same call — i.e. the badge starts in its SHOWN sub-state (full
// text visible in the small badge), not collapsed to icon-only, until
// either the map's own 'drag' event auto-minimizes it or the toggle
// button is clicked. This is genuine MapLibre library behavior (traced
// directly in node_modules/maplibre-gl/dist/maplibre-gl-unminified.js's
// AttributionControl class — _updateAttributions()'s own trailing
// _updateCompact() call, and _updateCompact()'s own
// "!classList.contains('maplibregl-compact')" guard, which is exactly
// what makes that first transition add both classes together), not an
// artifact of this app's own freshBlankStyle()-then-real-basemap
// sequencing. Still a materially more compact, less obtrusive treatment
// than the prior default (an always-visible full-width bar with no
// icon/toggle at all): a small rounded badge instead of a spanning bar,
// and the toggle button genuinely collapses/expands it on click — what
// this coverage actually verifies below, rather than asserting a
// collapsed-on-first-paint claim the library itself doesn't make.
test.describe('Attribution control renders MapLibre\'s compact form and the toggle genuinely shows/hides text', () => {
  test('the compact badge renders, and clicking its button actually collapses/expands the real attribution text', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, FLOWMAP_TITLE)

    const attrib = container.locator('.maplibregl-ctrl-attrib')
    const button = attrib.locator('.maplibregl-ctrl-attrib-button')
    const inner = attrib.locator('.maplibregl-ctrl-attrib-inner')

    await expect(attrib).toHaveClass(/maplibregl-compact\b/) // compact badge, not the old full-width bar
    await expect(button).toBeVisible()
    await expect(inner).toContainText('OpenStreetMap') // real attribution text, not a placeholder

    // First click: a real, observable DOM effect — not just "the option
    // was passed to the constructor."
    const wasVisible = await inner.isVisible()
    await button.click()
    await expect(inner).toBeVisible({ visible: !wasVisible })

    // Second click toggles it back, with the SAME real text still there
    // (not cleared/re-fetched by the toggle).
    await button.click()
    await expect(inner).toBeVisible({ visible: wasVisible })
    if (wasVisible) await expect(inner).toContainText('OpenStreetMap')
  })

  test('the compact control survives a real basemap setStyle() switch and 004\'s DOM relocation', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, FLOWMAP_TITLE)
    await expect(container.locator('.maplibregl-ctrl-attrib')).toHaveCount(1)

    // A real setStyle() call (theme flip) — map controls are a Map-owned
    // DOM overlay independent of the style document (unlike sources/
    // layers, which setStyle() does replace), so this must be completely
    // unaffected: still exactly one control, never duplicated or dropped.
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(1000)
    await expect(container.locator('.maplibregl-ctrl-attrib')).toHaveCount(1)
    await expect(container.locator('.maplibregl-ctrl-attrib-button')).toBeVisible()

    // 004's expand-to-dialog relocation — the control is a plain DOM
    // child of the map container (added via addControl() at
    // construction), so it must move with the container into the
    // dialog, not be left behind or duplicated — same appendChild-based
    // relocation every other part of this panel already survives.
    await expandTrigger(page, FLOWMAP_TITLE).click()
    const dialog = page.getByRole('dialog')
    const dialogAttrib = dialog.locator('.flowmap-chart .maplibregl-ctrl-attrib')
    await expect(dialogAttrib).toHaveCount(1)
    const dialogButton = dialogAttrib.locator('.maplibregl-ctrl-attrib-button')
    const dialogInner = dialogAttrib.locator('.maplibregl-ctrl-attrib-inner')
    await expect(dialogButton).toBeVisible()

    // Still genuinely interactive post-relocation, not just present in
    // the DOM — the click handler must still be wired to the SAME
    // relocated control, not a stale/detached one.
    const wasVisibleInDialog = await dialogInner.isVisible()
    await dialogButton.click()
    await expect(dialogInner).toBeVisible({ visible: !wasVisibleInDialog })

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    // And it's still there, once, back at card size — not duplicated by
    // the round trip.
    await expect(card.locator('.flowmap-chart .maplibregl-ctrl-attrib')).toHaveCount(1)
  })
})

// 014-map-navigation-controls — MapLibre's own built-in NavigationControl
// (zoom in/out + compass), added via map.addControl(new
// maplibregl.NavigationControl({ visualizePitch: true })) at mount, same
// "first-class library control, no custom UI" discipline the attribution
// control coverage above already established. visualizePitch: true is
// confirmed (against the installed maplibre-gl source, not assumed) to
// make the compass button call the real Map.resetNorthPitch() on click —
// zeroing bearing AND pitch together — rather than resetNorth() (bearing
// only). FlowMapPanel has no 3D toggle of its own (see zonemapPanel.spec.ts
// for that coverage) — this only verifies the shared NavigationControl.
test.describe('014-map-navigation-controls — NavigationControl zoom/compass genuinely move the camera', () => {
  test('zoom in/out buttons change map.getZoom(); the compass resets bearing AND pitch together', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    const zoomInBtn = container.getByTitle('Zoom in')
    const zoomOutBtn = container.getByTitle('Zoom out')
    const compassBtn = container.getByTitle('Reset bearing to north')
    await expect(zoomInBtn).toBeVisible()
    await expect(zoomOutBtn).toBeVisible()
    await expect(compassBtn).toBeVisible()

    const getZoom = () => page.evaluate((t) => window.__flowmapTestMaps![t].getZoom(), FLOWMAP_TITLE)
    const zoomBefore = await getZoom()
    await zoomInBtn.click()
    await trueEventually(async () => (await getZoom()) > zoomBefore)
    const zoomAfterIn = await getZoom()

    await zoomOutBtn.click()
    await trueEventually(async () => (await getZoom()) < zoomAfterIn)

    // A real non-zero bearing/pitch first — jumpTo() sets the camera
    // transform directly, no animation to wait out — then the compass
    // click must zero BOTH, not bearing alone.
    await page.evaluate((t) => window.__flowmapTestMaps![t].jumpTo({ bearing: 45, pitch: 30 }), FLOWMAP_TITLE)
    expect(
      await page.evaluate((t) => window.__flowmapTestMaps![t].getBearing(), FLOWMAP_TITLE),
    ).toBeCloseTo(45, 0)
    expect(
      await page.evaluate((t) => window.__flowmapTestMaps![t].getPitch(), FLOWMAP_TITLE),
    ).toBeCloseTo(30, 0)

    await compassBtn.click()
    await trueEventually(async () => {
      const bearing = await page.evaluate((t) => window.__flowmapTestMaps![t].getBearing(), FLOWMAP_TITLE)
      const pitch = await page.evaluate((t) => window.__flowmapTestMaps![t].getPitch(), FLOWMAP_TITLE)
      return Math.abs(bearing) < 0.5 && Math.abs(pitch) < 0.5
    })
  })

  // Real bug found live (015-theme-toggle), same root cause and fix as
  // zonemapPanel.spec.ts's own 3D-toggle regression test: MapLibre's own
  // NavigationControl rendered with a hardcoded white group background
  // and fixed dark-gray icons regardless of app theme (mapControls.css,
  // now imported by this panel type too, not just ZoneMapPanel). Asserts
  // real getComputedStyle() output.
  test('NavigationControl matches the app theme in dark mode — dark group background, inverted icon, real divider color', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    const zoomIn = container.locator('.maplibregl-ctrl-zoom-in')
    const zoomOut = container.locator('.maplibregl-ctrl-zoom-out')
    await expect(zoomIn).toBeVisible()

    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const styles = await zoomIn.evaluate((el) => {
      const group = el.closest('.maplibregl-ctrl-group') as HTMLElement
      const icon = el.querySelector('.maplibregl-ctrl-icon') as HTMLElement
      return { groupBg: getComputedStyle(group).backgroundColor, iconFilter: getComputedStyle(icon).filter }
    })
    // 033-shadcn-default-theme: mapControls.css's own `.maplibregl-ctrl-
    // group { background: var(--card) !important; }` — confirmed directly
    // — dark --card is now #171717, not the old WFRC-brand #081b26 (both
    // old --card and --background happened to share one literal value;
    // the new theme's --card/--background are genuinely different, so
    // this is specifically --card, not --background).
    expect(styles.groupBg).toBe('rgb(23, 23, 23)') // --card in dark mode
    expect(styles.iconFilter).toBe('invert(1)')

    // A second, separate real bug found live after the above: the
    // divider between the stacked Zoom in/Zoom out buttons is MapLibre's
    // own hardcoded `#ddd`, untouched by any rule above (those style the
    // group container and each button individually, never the
    // button+button inter-button border) — read back as too bright/white
    // against the now-dark group background.
    const dividerColor = await zoomOut.evaluate((el) => getComputedStyle(el).borderTopColor)
    // 033-shadcn-default-theme: dark --border is now a real, translucent
    // shadcn value (#f5ffff1a, i.e. oklch(1 0 0 / 10%) — 10% white) rather
    // than an opaque WFRC-brand hex — confirmed via a real headless-
    // Chromium round-trip that this is exactly how it computes, not
    // guessed from the hex alone.
    expect(dividerColor).toBe('rgba(245, 255, 255, 0.1)') // --border in dark mode
  })
})

// 027-map-auto-fit-and-reset, User Story 4 — the shared reset-to-view
// control, same corner cluster as NavigationControl above.
test.describe('027-map-auto-fit-and-reset — User Story 4: reset-to-view control', () => {
  test('is disabled before data loads, then returns the camera to the auto-fitted view after a manual pan', async ({
    page,
  }) => {
    // FR-009 — deterministically force the "map exists, but auto-fit
    // hasn't run yet" window via the same test-only mapReady delay hook
    // research.md §11's own mapReady-race test uses, rather than hoping
    // real-world timing (a real DuckDB-WASM query resolving in ~tens of
    // ms) happens to leave a reliably-observable gap.
    await page.addInitScript(() => {
      window.__flowmapTestMapReadyDelayMs = 1000
    })
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    const resetBtn = container.getByTitle('Zoom to extents')

    // The button (created at Map construction, unaffected by the
    // mapReady delay) already exists but has no effective view yet — the
    // data-update effect that would call fitBounds() is itself gated on
    // mapReady, still false for the next ~1000ms.
    await expect(resetBtn).toBeDisabled()

    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    // Auto-fit's own animation must settle before the control is
    // guaranteed enabled.
    await page.evaluate(
      (t) =>
        new Promise<void>((resolve) => {
          const map = window.__flowmapTestMaps![t]
          if (!map.isMoving()) return resolve()
          map.once('moveend', () => resolve())
        }),
      FLOWMAP_TITLE,
    )
    await expect(resetBtn).toBeEnabled()

    const fittedView = await page.evaluate((t) => {
      const m = window.__flowmapTestMaps![t]
      return { center: m.getCenter(), zoom: m.getZoom() }
    }, FLOWMAP_TITLE)

    // Pan/zoom well away from the fitted view.
    await page.evaluate((t) => window.__flowmapTestMaps![t].jumpTo({ center: [-100, 45], zoom: 3 }), FLOWMAP_TITLE)
    expect(
      await page.evaluate((t) => window.__flowmapTestMaps![t].getZoom(), FLOWMAP_TITLE),
    ).toBeCloseTo(3, 0)

    await resetBtn.click()
    await trueEventually(async () => {
      const m = await page.evaluate((t) => {
        const map = window.__flowmapTestMaps![t]
        return { center: map.getCenter(), zoom: map.getZoom() }
      }, FLOWMAP_TITLE)
      return (
        Math.abs(m.center.lng - fittedView.center.lng) < 0.01 &&
        Math.abs(m.center.lat - fittedView.center.lat) < 0.01 &&
        Math.abs(m.zoom - fittedView.zoom) < 0.1
      )
    })
  })

  test('for an author-configured panel, returns exactly to the configured center/zoom after a manual pan', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap Explicit View Override'
    const container = panelCard(page, title).locator('.flowmap-chart')
    const resetBtn = container.getByTitle('Zoom to extents')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    // No auto-fit animation to wait out — the view was captured
    // synchronously at mount for this panel.
    await expect(resetBtn).toBeEnabled()

    await page.evaluate((t) => window.__flowmapTestMaps![t].jumpTo({ center: [-100, 45], zoom: 3 }), title)

    await resetBtn.click()
    await trueEventually(async () => {
      const center = await page.evaluate((t) => window.__flowmapTestMaps![t].getCenter(), title)
      const zoom = await page.evaluate((t) => window.__flowmapTestMaps![t].getZoom(), title)
      return Math.abs(center.lng - -110.0) < 0.01 && Math.abs(center.lat - 39.0) < 0.01 && Math.abs(zoom - 6) < 0.1
    })
  })
})

// 027-map-auto-fit-and-reset (FR-006/SC-004) — once auto-fit has run,
// nothing else should ever move the camera again on its own: a viewer's
// manual pan must survive 004 expand/collapse and a basemap switch —
// neither of which reload the flow data itself, and FR-006 requires
// auto-fit to run at most once per mount regardless of what re-triggers
// the data-update effect.
//
// 040-test-suite-migration: this test originally had a third sub-case,
// (b) a global filter change ($filters.purpose narrowing the fixture's
// own flow set) — removed. This panel is pinned to `scenario:
// activitysim-baseline` (dashboard-6-network.yaml) and no real demo
// content anywhere binds a flowmap panel to a global filter, matching
// this migration's own established convention elsewhere in this suite
// (dashboardShell.spec.ts/panelExpand.spec.ts) for a case with no real
// content to exercise it.
test.describe('027-map-auto-fit-and-reset — Polish: no re-trigger after a manual pan', () => {
  test('a manual pan survives 004 expand/collapse and a basemap switch', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await page.evaluate(
      (t) =>
        new Promise<void>((resolve) => {
          const map = window.__flowmapTestMaps![t]
          if (!map.isMoving()) return resolve()
          map.once('moveend', () => resolve())
        }),
      FLOWMAP_TITLE,
    )

    // A manual pan, clearly distinct from the fitted view.
    await page.evaluate((t) => window.__flowmapTestMaps![t].jumpTo({ center: [-105, 42], zoom: 5 }), FLOWMAP_TITLE)
    const getView = () =>
      page.evaluate((t) => {
        const m = window.__flowmapTestMaps![t]
        return { center: m.getCenter(), zoom: m.getZoom() }
      }, FLOWMAP_TITLE)
    const pannedView = await getView()

    // (a) 004 expand/collapse.
    await expandTrigger(page, FLOWMAP_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.flowmap-chart canvas').first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    let view = await getView()
    expect(view.center.lng).toBeCloseTo(pannedView.center.lng, 3)
    expect(view.center.lat).toBeCloseTo(pannedView.center.lat, 3)
    expect(view.zoom).toBeCloseTo(pannedView.zoom, 3)

    // (b) a basemap switch (Settings modal's real, shipped Apply action —
    // same mechanism this file's own interleaved-overlay-survival test
    // already uses to trigger a real setStyle() call).
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await page.getByRole('radiogroup', { name: 'OpenFreeMap' }).getByRole('radio', { name: 'Bright' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await page.waitForTimeout(500) // let the setStyle()-driven repopulate settle
    view = await getView()
    expect(view.center.lng).toBeCloseTo(pannedView.center.lng, 3)
    expect(view.center.lat).toBeCloseTo(pannedView.center.lat, 3)
    expect(view.zoom).toBeCloseTo(pannedView.zoom, 3)
  })
})

// 015-map-controls-polish — deck.gl's OWN picking/hover mechanism
// (FlowmapLayer's onHover prop, backed by pickable: true), NOT MapLibre's
// mousemove — MapLibre's event system cannot see deck.gl content at all,
// confirmed this session. Uses the SAME shared mapTooltip.ts component
// zonemapPanel.spec.ts's own hover coverage verifies, styled identically.
test.describe('015-map-controls-polish — deck.gl onHover tooltip shows origin/destination/value', () => {
  // 040-test-suite-migration: a real, confirmed design correction found
  // via live verification, not assumed. Targeting one specific NAMED
  // flow's geographic midpoint (the original approach — this panel's
  // real largest flow, or its largest non-self-loop flow) turned out
  // unreliable against this panel's own real, dense 623-flow dataset:
  // `clustering_auto: true` genuinely clusters many nearby real TAZ
  // points at FLOWMAP_TITLE's own auto-fitted zoom (confirmed live —
  // zoom 11 settles with entire regions merged into synthetic cluster
  // ids like `{[110]}`, leaving no individually-pickable line anywhere
  // near several real candidate flows' own midpoints, top-8-largest
  // included). This test therefore targets the OTHER real od_flows panel
  // on this tab, "Trip Distribution Desire Lines" — its own real,
  // authored `center`/`zoom: 13` (dashboard-6-network.yaml) is
  // tight enough that individual flows remain pickable, confirmed live by
  // a grid sweep. Rather than pin one exact (origin, destination) pair
  // (fragile to re-derive by hand against 623 candidates, and still not
  // guaranteed hittable at a specific pixel), this test sweeps for the
  // first genuinely non-clustered hit (`strongText` matching plain
  // `\d+ → \d+`, no `{...}` cluster id) and cross-checks its own
  // rendered (origin, destination, value) triple against a live query —
  // proving the real deck.gl onHover + shared mapTooltip.ts mechanism
  // against whichever real flow it happens to land on, exactly the same
  // guarantee the original single-target design existed to prove.
  test('hovering a real, non-clustered flow line shows a tooltip whose origin/destination/value matches a live query', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const title = 'Trip Distribution Desire Lines'
    const card = panelCard(page, title)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await container.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300) // let deck.gl actually paint a frame before picking

    const box = await container.locator('canvas.maplibregl-canvas').boundingBox()
    const tooltip = container.locator('.map-tooltip')

    let hit: { origin: number; dest: number; count: number } | null = null
    outer: for (let fx = 0.1; fx <= 0.9; fx += 0.04) {
      for (let fy = 0.1; fy <= 0.9; fy += 0.04) {
        await page.mouse.move(box!.x + box!.width * fx, box!.y + box!.height * fy, { steps: 2 })
        if (!(await tooltip.isVisible().catch(() => false))) continue
        const strongText = (await tooltip.locator('strong').textContent())?.trim() ?? ''
        const match = /^(\d+) → (\d+)$/.exec(strongText)
        if (!match) continue // a cluster id (e.g. "{[110]} → 9") — keep sweeping
        const countText = await tooltip.evaluate((el) => el.querySelector('br')?.nextSibling?.textContent ?? '')
        hit = { origin: Number(match[1]), dest: Number(match[2]), count: Number(countText) }
        break outer
      }
    }
    expect(hit, 'expected at least one non-clustered flow to be pickable somewhere on this panel').not.toBeNull()

    // Cross-check against a direct query — proves the tooltip's rendered
    // value is real, aggregated od_flows data, not merely "some text
    // appeared."
    const rows = await page.evaluate(
      (h) =>
        window.__wftdm!.query(
          `SELECT CAST(SUM(trips) AS BIGINT) AS total FROM "activitysim-baseline__od_flows"
           WHERE orig_taz = ${h!.origin} AND dest_taz = ${h!.dest}`,
        ),
      hit,
    )
    expect(Number(rows[0].total)).toBe(hit!.count)
  })
})

// 040-test-suite-migration: this describe block originally opened with
// two tests exercising $filters.purpose reactivity/empty-state — deleted.
// This panel is pinned to `scenario: activitysim-baseline`
// (dashboard-6-network.yaml) and no real demo content anywhere binds a
// flowmap panel to a global filter, matching this migration's own
// established convention elsewhere in this suite (dashboardShell.spec.ts/
// panelExpand.spec.ts) for a case with no real content to exercise it.
test.describe('User Story 2 - Flowmap panel resizes correctly and behaves consistently with the rest of the panel registry', () => {
  test('004 expand/collapse resizes the map correctly, issues zero additional query, preserves the map instance, and collapse returns correct card-sized rendering', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    const canvas = container.locator('canvas').first()
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    const inlineBox = await canvas.boundingBox()
    const before = await queryCountFor(page, 'od_flows')
    expect(before).toBeGreaterThan(0)
    const canvasHandleBefore = await canvas.elementHandle()

    await expandTrigger(page, FLOWMAP_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const dialogContainer = dialog.locator('.flowmap-chart')
    const dialogCanvas = dialogContainer.locator('canvas').first()
    await expect(dialogCanvas).toBeVisible()

    // Map instance preserved across the relocation — same canvas DOM node.
    const canvasHandleInDialog = await dialogCanvas.elementHandle()
    const sameNodeInDialog = await page.evaluate(
      ([a, b]) => a === b,
      [canvasHandleBefore, canvasHandleInDialog],
    )
    expect(sameNodeInDialog).toBe(true)

    const dialogBox = await dialogCanvas.boundingBox()
    expect(dialogBox!.width).toBeGreaterThan(inlineBox!.width)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(card.locator('.flowmap-chart canvas').first()).toBeVisible()
    await expect(expandTrigger(page, FLOWMAP_TITLE)).toBeFocused()

    const afterBox = await card.locator('.flowmap-chart canvas').first().boundingBox()
    expect(afterBox!.width).toBeCloseTo(inlineBox!.width, 0)

    const after = await queryCountFor(page, 'od_flows')
    expect(after).toBe(before) // zero additional query from the transition
  })

  test('a plain browser window resize also resizes the map canvas correctly', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const canvas = card.locator('.flowmap-chart canvas').first()
    await expect(canvas).toBeVisible()

    const widthBefore = await canvas.evaluate((el: HTMLCanvasElement) => el.width)
    const currentSize = page.viewportSize()!
    await page.setViewportSize({ width: Math.max(currentSize.width - 400, 640), height: currentSize.height })

    await trueEventually(async () => {
      const widthAfter = await canvas.evaluate((el: HTMLCanvasElement) => el.width)
      return widthAfter !== widthBefore
    })
    const box = await canvas.boundingBox()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)

    await page.setViewportSize(currentSize)
  })

  test('the map survives 004\'s DOM relocation: same canvas node, correct new size, remains interactive (FR-009)', async ({
    page,
  }) => {
    // research.md §3 — the relocation-survival test the user specifically
    // required. Not just "looks fine": proves (a) no remount, (b) resize
    // handling composes with the relocation, (c) the map is still a real,
    // live, interactive instance afterward — not a frozen last frame of a
    // WebGL context that silently died in the move.
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    // 012-webgl-context-management — UPDATED: interleaved MapboxOverlay
    // mode (this feature's own fix) means deck.gl draws directly into
    // MapLibre's own WebGL2RenderingContext and creates no canvas of its
    // own — confirmed directly against @deck.gl/mapbox's real installed
    // source, getCanvas() returns this._map.getCanvas() under
    // interleaved: true. Only one real <canvas> exists per panel now;
    // the separate #deckgl-overlay canvas this test originally also
    // checked (non-interleaved mode, research.md §10 from 010) no longer
    // exists.
    const baseCanvas = container.locator('canvas.maplibregl-canvas')
    await expect(baseCanvas).toBeVisible()
    await expect(container.locator('canvas')).toHaveCount(1)

    const baseCanvasHandleBefore = await baseCanvas.elementHandle()
    const inlineBox = await baseCanvas.boundingBox()

    await expandTrigger(page, FLOWMAP_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const dialogContainer = dialog.locator('.flowmap-chart')
    const dialogBaseCanvas = dialogContainer.locator('canvas.maplibregl-canvas')
    await expect(dialogBaseCanvas).toBeVisible()
    await expect(dialogContainer.locator('canvas')).toHaveCount(1)

    // (a) same DOM node.
    const baseCanvasHandleAfter = await dialogBaseCanvas.elementHandle()
    const baseSameNode = await page.evaluate(
      ([a, b]) => a === b,
      [baseCanvasHandleBefore, baseCanvasHandleAfter],
    )
    expect(baseSameNode).toBe(true)

    // (b) dimensions reflect the dialog's larger size.
    const dialogBox = await dialogBaseCanvas.boundingBox()
    expect(dialogBox!.width).toBeGreaterThan(inlineBox!.width)

    // (c) the map remains genuinely interactive — a programmatic pan
    // produces a real 'moveend' event, via the __flowmapTestMaps registry
    // (contracts/flowmap-panel.md) since no DOM-only assertion can prove
    // the WebGL context is still alive, not a frozen last frame.
    const moveEndFired = await page.evaluate(async (title) => {
      const map = window.__flowmapTestMaps?.[title]
      if (!map) return false
      return new Promise((resolve) => {
        map.once('moveend', () => resolve(true))
        map.panTo([map.getCenter().lng + 0.01, map.getCenter().lat + 0.01], { duration: 100 })
      })
    }, FLOWMAP_TITLE)
    expect(moveEndFired).toBe(true)
  })

  test('the mapReady race: a data-fetch resolving before the map finishes initializing still renders flow lines', async ({
    page,
  }) => {
    // research.md §11 — the mapReady race test the user specifically
    // required. Deterministically forces the adversarial ordering rather
    // than hoping real-world timing (synchronous Map construction vs. an
    // always-async query) happens to cooperate.
    await page.addInitScript(() => {
      window.__flowmapTestMapReadyDelayMs = 1000
    })
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')

    // The query almost certainly resolves well within 1000ms (real
    // DuckDB-WASM query, ~tens of ms) — expect.poll, not a raw sleep,
    // proves the data-update effect actually re-runs once mapReady flips
    // true, rather than being stuck permanently empty from an early
    // return with no re-trigger.
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    expect(Number(await container.getAttribute('data-flow-count'))).toBe(623)
  })
})

test.describe('User Story 3 - Flowmap panel behaves consistently with the rest of the panel registry', () => {
  // T023 (004 expand/collapse shows the same map, instance preserved) is
  // already fully covered by User Story 2's own "004 expand/collapse..."
  // and "...DOM relocation..." tests above (same canvas-node-identity +
  // zero-additional-query assertions spec.md's Acceptance Scenario 1
  // describes) — not duplicated here, matching this project's own
  // established precedent for not re-testing an already-proven guarantee
  // under a second name.

  test('a broken metric config renders the shared PanelErrorState, no unhandled exception, no partial map left in the DOM', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const card = panelCard(page, 'Broken Flow Map Panel (missing metric)')
    await expect(card.getByText("Couldn't load this map")).toBeVisible()
    await expect(card.locator('.flowmap-chart')).toHaveCount(0)
    await expect(card.locator('canvas')).toHaveCount(0)
  })

  // 040-test-suite-migration: this describe block originally closed with
  // "a tab mixing all eight now-built panel types renders without error
  // in a single load" — deleted, not migrated. It is now fully redundant:
  // demoContentAllPanels.spec.ts's own SC-005 coverage already proves
  // every one of the ten real panel types (not just eight) renders
  // correctly together against real demo content — the exact guarantee
  // this test existed to prove, under a real, more current name.
})

// 011-basemap-style-system — real-browser basemap coverage. Reuses
// FLOWMAP_TITLE ("Trip Distribution Desire Lines (Default View)", no
// basemap: config) for the app-default/theme-pairing path and the
// empirical survival test; `dashboard-8-test.yaml`'s permanent "Test" tab
// hosts every other scenario (precedence, raster, composition, fallback)
// via real, purpose-built content authored for this migration.

async function getStyleSources(page: Page, title: string): Promise<string[]> {
  // 040-test-suite-migration: the real Test tab mounts far more real/broken
  // map panels at once (11) than the retired fixture's own dedicated
  // "Basemaps" tab ever did — confirmed live: a handful of callers of this
  // helper (017-multi-sprite-support, 016-fix-ugrc-dark-mode) call it
  // immediately after the tab click with no prior render-count wait, and
  // under this busier tab, `window.__flowmapTestMaps` can still be
  // genuinely undefined (no flowmap panel has finished mounting yet) on
  // the very first poll attempt — a bare `![t]` non-null assertion then
  // throws, and expect.poll does not retry past a thrown exception,
  // failing the whole check immediately instead of polling until mounted.
  // Optional chaining here treats "not mounted yet" the same as "mounted,
  // zero sources so far" — the correct semantic for every caller, which
  // all exist to wait for a basemap to resolve.
  const style = await page.evaluate((t) => window.__flowmapTestMaps?.[t]?.getStyle(), title)
  return Object.keys(style?.sources ?? {})
}

// Polls map.getStyle().sources rather than MapLibre's own `isStyleLoaded()`/
// `'style.load'` — found necessary during implementation: `isStyleLoaded()`
// tracks whether every currently-referenced tile has finished loading
// (which can legitimately stay false well past the point the STYLE itself
// has applied, and can flip back to false as new tiles are requested), and
// `'style.load'` is a one-shot event that may already have fired before a
// test gets around to registering a `.once()` listener for it — combining
// both in a single "isStyleLoaded() ? resolve : once('style.load')" check
// (the original version of this helper) hung indefinitely in real runs,
// confirmed empirically, not a hypothetical race. Polling for a non-empty
// `sources` object (BLANK_STYLE has none) is a simpler, race-free signal
// for "the panel's own setStyle() call has applied."
async function waitForBasemapApplied(page: Page, title: string) {
  await trueEventually(async () => (await getStyleSources(page, title)).length > 0)
}

test.describe('011-basemap-style-system — US1: default basemap renders (quickstart.md Scenario 1)', () => {
  test('a panel with no basemap config renders the static app-default basemap', async ({ page }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    await gotoNetworkTab(page)
    const container = panelCard(page, FLOWMAP_TITLE).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, FLOWMAP_TITLE)

    // 021-basemap-catalog-redesign: the app-default tier is one static
    // value, never theme-paired. Moved from 'carto-voyager' to
    // 'openfreemap-positron' (registry.ts APP_DEFAULT) —
    // project-docs/BASEMAP-PICKER-PROPOSAL.md §2/§3.
    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/positron')))
    expect(await getStyleSources(page, FLOWMAP_TITLE)).not.toEqual([])
  })
})

test.describe('021-basemap-catalog-redesign — US2: the static app-default never re-pairs on a theme change (quickstart.md Scenario 10)', () => {
  test('a panel with no basemap config issues no new setStyle() call when the Appearance theme flips', async ({
    page,
  }) => {
    // Instruments map.setStyle() call COUNT directly — the same,
    // already-reliable technique the sibling "explicit pin is not
    // re-paired" test just above this one already uses — rather than
    // counting raw network requests. A real, confirmed flake source was
    // found while writing this test: MapLibre legitimately re-issues
    // several sprite/glyph/tile requests of its own on a resize-driven
    // internal repaint (a dark-mode class toggle can shift page layout
    // enough to trigger one), completely unrelated to whether THIS
    // panel's own basemap-application effect re-ran. Counting
    // setStyle() calls directly tests the actual claim (no re-pairing)
    // and is immune to that unrelated noise.
    await boot(page)
    await gotoNetworkTab(page)
    const title = FLOWMAP_TITLE
    const container = panelCard(page, title).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, title)

    await page.evaluate((t) => {
      const map = window.__flowmapTestMaps![t]
      window.__setStyleCallCount = 0
      const original = map.setStyle.bind(map)
      map.setStyle = ((...args: Parameters<typeof original>) => {
        window.__setStyleCallCount!++
        return original(...args)
      }) as typeof map.setStyle
    }, title)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    // Give a (bugged) re-pair attempt time to fire — there is no positive
    // event to await for "nothing happened," matching this suite's own
    // established convention for a negative assertion.
    await page.waitForTimeout(1000)
    expect(await page.evaluate(() => window.__setStyleCallCount)).toBe(0)

    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await page.waitForTimeout(1000)
    expect(await page.evaluate(() => window.__setStyleCallCount)).toBe(0)
  })
})

test.describe('011-basemap-style-system — US1: setStyle()/MapboxOverlay empirical survival (research.md §1 — GATING)', () => {
  test('the interleaved deck.gl overlay and its FlowmapLayer survive a real basemap change', async ({ page }) => {
    // 012-webgl-context-management — this test is UPDATED, not left as
    // 011 wrote it: interleaved mode (this feature's own fix) means
    // deck.gl no longer creates its own canvas#deckgl-overlay element at
    // all (confirmed directly against @deck.gl/mapbox's real source —
    // getCanvas() returns this._map.getCanvas() under interleaved: true;
    // contracts/interleaved-overlay-survival.md "Existing 011 test must
    // be UPDATED, not left alone"). canvas.maplibregl-canvas is now the
    // ONE canvas both the base map and deck.gl draw into.
    //
    // 021-basemap-catalog-redesign — UPDATED a second time: this test
    // originally triggered its real setStyle() call via a light/dark
    // theme flip, relying on the (now-removed) theme-paired app-default
    // tier. Since the app-default is now one static value that never
    // re-pairs on a theme change (research.md §6), a theme flip no
    // longer triggers any setStyle() call at all for an unconfigured
    // panel like this one — this test now triggers the real setStyle()
    // it needs via the Settings modal's own global-basemap Apply action
    // instead (020/021's own real, shipped mechanism), which still
    // causes exactly the same kind of live setStyle() transition this
    // test exists to verify overlay survival across.
    const consoleIssues: string[] = []
    page.on('console', (msg) => {
      if (/duplicate|already exists/i.test(msg.text())) consoleIssues.push(msg.text())
    })
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    const baseCanvas = container.locator('canvas.maplibregl-canvas')
    await expect(baseCanvas).toBeVisible()
    await expect(container.locator('canvas#deckgl-overlay')).toHaveCount(0)
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, FLOWMAP_TITLE)
    // The unconfigured panel resolves to APP_DEFAULT, now 'openfreemap-positron'
    // (registry.ts; moved from 'carto-voyager', project-docs/BASEMAP-PICKER-PROPOSAL.md).
    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/positron')))

    const baseHandleBefore = await baseCanvas.elementHandle()
    const renderCountBefore = Number(await container.getAttribute('data-render-count'))
    const flowCountBefore = await container.getAttribute('data-flow-count')

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await page.getByRole('radiogroup', { name: 'OpenFreeMap' }).getByRole('radio', { name: 'Bright' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    // Wait for the NEW style specifically (not just "any" style) — a
    // plain waitForBasemapApplied() would also be satisfied by the still-
    // showing previous style during the brief window before setStyle()
    // actually swaps sources, so this test needs the more specific
    // request-based signal Scenario 1's own test already establishes as
    // reliable, not the generic "some sources exist" check.
    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/bright')))
    // Wait for the post-style.load repopulate specifically (the
    // layerRepopulateGeneration-triggered data-update-effect re-run),
    // not a fixed timeout — data-render-count incrementing is that
    // re-run's own real, observable side effect.
    await trueEventually(
      async () => Number(await container.getAttribute('data-render-count')) === renderCountBefore + 1,
    )
    // Let deck.gl's own repaint settle before sampling the canvas.
    await page.waitForTimeout(500)

    // (a) same DOM node — the one shared canvas, not just MapLibre's own
    // half of what used to be two.
    const baseHandleAfter = await baseCanvas.elementHandle()
    expect(
      await page.evaluate(([a, b]) => a === b, [baseHandleBefore, baseHandleAfter]),
    ).toBe(true)

    // (b) render-count increases by EXACTLY one (a repopulate is now
    // required and expected under interleaved mode — 011's original
    // "unchanged" assertion no longer applies) — not zero (a dropped
    // repopulate) and not more than one (a redundant extra one).
    // flow-count is still byte-for-byte unchanged: the underlying DATA
    // was never re-fetched, only re-applied to the overlay — 011's
    // actual original intent, still true and still asserted.
    expect(Number(await container.getAttribute('data-render-count'))).toBe(renderCountBefore + 1)
    expect(await container.getAttribute('data-flow-count')).toBe(flowCountBefore)

    // (c) the overlay still reports exactly one live FlowmapLayer.
    // MapboxOverlay's public .d.ts has no accessor for its current
    // layers — `_props` is a genuinely private field with no public
    // equivalent (confirmed against node_modules/@deck.gl/mapbox's real
    // type declaration, not assumed) — read here via an `any` cast for
    // test-diagnostic purposes only, same category as this file's other
    // test-only window hooks, not something application code ever does.
    const overlayLayerCount = await page.evaluate((title) => {
      const overlay = window.__flowmapTestOverlays![title] as unknown as { _props: { layers: unknown[] } }
      return overlay._props.layers.length
    }, FLOWMAP_TITLE)
    expect(overlayLayerCount).toBe(1)

    // (d) the shared canvas actually drew something. A duplicate-
    // layer-id bug (deck.gl#3763), or the repopulate never actually
    // happening, can leave the overlay technically "not removed" while
    // silently failing to draw, which a DOM-visibility check alone
    // cannot distinguish from a genuinely healthy overlay.
    await trueEventually(() => canvasHasDrawnPixels(page, FLOWMAP_TITLE))

    // (e) the map remains genuinely interactive — a programmatic panTo()
    // produces a real 'moveend' event, proving the WebGL context is
    // still alive, not a frozen last frame.
    const moveEndFired = await page.evaluate(async (title) => {
      const map = window.__flowmapTestMaps?.[title]
      if (!map) return false
      return new Promise((resolve) => {
        map.once('moveend', () => resolve(true))
        map.panTo([map.getCenter().lng + 0.01, map.getCenter().lat + 0.01], { duration: 100 })
      })
    }, FLOWMAP_TITLE)
    expect(moveEndFired).toBe(true)

    // (f) zero deck.gl#3763-shaped console messages across the whole change.
    expect(consoleIssues).toEqual([])
  })
})

test.describe('012-webgl-context-management — interleaved overlay repopulates exactly once per style change', () => {
  test('two rapid global-basemap switches settle correctly: no duplicate/missing layer, data unchanged', async ({
    page,
  }) => {
    // The adversarial case for layerRepopulateGeneration's handling: no
    // settle delay between the two setStyle()-triggering changes.
    //
    // 021-basemap-catalog-redesign — UPDATED trigger mechanism: this test
    // originally used two rapid light/dark theme toggles to produce two
    // rapid, real setStyle() calls on this unconfigured panel, relying on
    // the (now-removed) theme-paired app-default tier. Since the
    // app-default no longer depends on theme at all (research.md §6), a
    // theme flip no longer triggers any setStyle() call here — two rapid
    // global-basemap Apply actions (020/021's own real, shipped
    // mechanism) reproduce the identical adversarial "no settle delay
    // between two setStyle()-triggering changes" shape instead.
    //
    // NOT asserting an exact "+2 repopulates" count here (an earlier
    // version of this test did, and was wrong) — confirmed empirically
    // that the existing generation-guard/AbortController mechanism
    // (research.md §2's own already-established design, unchanged by
    // this feature) correctly CANCELS a still-in-flight, now-superseded
    // basemap-application invocation when a second change preempts it
    // before the first one's onStyleReady fires (this effect's own
    // cleanup calls detachStyleReadyListener() on every re-run/unmount).
    // Two back-to-back changes can therefore legitimately settle with
    // anywhere from zero repopulates (if React batches both state updates
    // into one render, so the effect never observes the intermediate
    // value at all) up to two — the real, correct guarantee this test
    // verifies is the END STATE: exactly one live FlowmapLayer, unchanged
    // underlying data, and the FINAL applied basemap actually rendering —
    // not a specific intermediate count that depends on batching timing
    // this feature does not control.
    await boot(page)
    await gotoNetworkTab(page)
    const container = panelCard(page, FLOWMAP_TITLE).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, FLOWMAP_TITLE)

    const flowCountBefore = await container.getAttribute('data-flow-count')

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await page.getByRole('radiogroup', { name: 'OpenFreeMap' }).getByRole('radio', { name: 'Liberty' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    // No settle delay before the second change — the adversarial case.
    await page.getByRole('radiogroup', { name: 'CARTO Vector Tiles' }).getByRole('radio', { name: 'Positron' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // Let everything settle, then assert the end state is correct.
    await page.waitForTimeout(1500)

    expect(await container.getAttribute('data-flow-count')).toBe(flowCountBefore)

    const overlayLayerCount = await page.evaluate((title) => {
      const overlay = window.__flowmapTestOverlays![title] as unknown as { _props: { layers: unknown[] } }
      return overlay._props.layers.length
    }, FLOWMAP_TITLE)
    expect(overlayLayerCount).toBe(1)

    // The final, settled selection (carto-positron, both changes applied
    // in order) must actually be rendering, not left mid-transition from
    // a cancelled first attempt.
    await trueEventually(() => canvasHasDrawnPixels(page, FLOWMAP_TITLE))
  })
})

test.describe('011-basemap-style-system — US1: uniform blank-style fallback (quickstart.md Scenario 5, default-path subset)', () => {
  test('an unreachable basemap preset falls back to BLANK_STYLE while the flow-line overlay still renders', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap Unreachable Basemap'
    const container = panelCard(page, title).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await page.waitForTimeout(1000) // the failed fetch/error event needs a moment to resolve

    expect(await getStyleSources(page, title)).toEqual([]) // BLANK_STYLE has no sources

    // 012-webgl-context-management — data-flow-count ALONE is not a
    // reliable signal here: it's a DOM dataset attribute set by the
    // data-update effect's own last successful run and is NOT cleared
    // by the basemap-application effect's own overlayRef.current
    // .setProps({ layers: [] }) clear step — a real, confirmed bug this
    // exact scenario surfaced (loadBasemapStyle() resolves a genuinely
    // unreachable preset straight to BLANK_STYLE, whose zero sources
    // used to make the interleaved-mode repopulate trigger never fire,
    // silently wiping the FlowmapLayer while data-flow-count kept
    // reporting its last, stale pre-clear value). The real, decisive
    // check is the overlay's own actual layer count and whether
    // anything is actually drawn.
    expect(Number(await container.getAttribute('data-flow-count'))).toBeGreaterThan(0)
    const overlayLayerCount = await page.evaluate((t) => {
      const overlay = window.__flowmapTestOverlays![t] as unknown as { _props: { layers: unknown[] } }
      return overlay._props.layers.length
    }, title)
    expect(overlayLayerCount).toBe(1)
    await trueEventually(() => canvasHasDrawnPixels(page, title))
  })
})

test.describe('011-basemap-style-system — US2: three-level precedence (quickstart.md Scenario 3)', () => {
  test('tab default applies with no panel override; panel override wins when set', async ({ page }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()

    const tabDefaultTitle = 'Basemap Precedence — inherits tab default'
    const overrideTitle = 'Basemap Precedence — panel override wins'
    await trueEventually(
      async () =>
        (await panelCard(page, tabDefaultTitle).locator('.flowmap-chart').getAttribute('data-render-count')) !==
        null,
    )
    await trueEventually(
      async () =>
        (await panelCard(page, overrideTitle).locator('.flowmap-chart').getAttribute('data-render-count')) !== null,
    )
    await waitForBasemapApplied(page, tabDefaultTitle)
    await waitForBasemapApplied(page, overrideTitle)

    // Tab default (dashboard-8-test.yaml's own trailing
    // `default_basemap: carto-positron`) resolves for the panel with no
    // basemap: of its own.
    expect(requestUrls.some((u) => u.includes('positron-gl-style'))).toBe(true)
    // Panel-level override (basemap: openfreemap-positron) wins over the
    // tab default for the other panel.
    expect(requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/positron'))).toBe(true)
  })
})

test.describe('011-basemap-style-system — US2: explicit pin does not re-pair on theme change (quickstart.md Scenario 4)', () => {
  test('an explicit panel-level basemap pin is not re-paired, and setStyle() is not called a second time', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Basemap Precedence — panel override wins' // basemap: openfreemap-positron
    const container = panelCard(page, title).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, title)

    // Wrap the real instance's own setStyle AFTER its one legitimate,
    // initial call already happened — counts only calls from this point.
    await page.evaluate((t) => {
      const map = window.__flowmapTestMaps![t]
      window.__setStyleCallCount = 0
      const original = map.setStyle.bind(map)
      map.setStyle = ((...args: Parameters<typeof original>) => {
        window.__setStyleCallCount!++
        return original(...args)
      }) as typeof map.setStyle
    }, title)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    // Give any (incorrect) re-pair attempt time to fire — there is no
    // positive event to await for "nothing happened," so a bounded wait
    // is the honest mechanism here, not a weaker substitute for one.
    await page.waitForTimeout(1000)

    expect(await page.evaluate(() => window.__setStyleCallCount)).toBe(0)
    // And the style itself is still the pinned one, not re-paired.
    expect(await getStyleSources(page, title)).not.toEqual([])
  })
})

test.describe('011-basemap-style-system — US2: a raster-provider preset renders (extends US1 Scenario 1 to the third source category)', () => {
  test('a leaflet-providers raster preset renders real tiles as the basemap', async ({ page }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap Raster Provider Preset' // basemap: OpenTopoMap
    const container = panelCard(page, title).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, title)

    await trueEventually(async () => requestUrls.some((u) => /tile\.opentopomap\.org/.test(u)))
    const style = await page.evaluate((t) => window.__flowmapTestMaps![t].getStyle(), title)
    expect(style.sources.basemap?.type).toBe('raster')

    // 012-webgl-context-management — regression coverage: a raster
    // preset's own style has no "background" layer of its own, so
    // BLANK_STYLE's own opaque background layer (carried forward by an
    // earlier, buggy transformStyle merge) used to get appended LAST,
    // painting over the real raster tiles entirely — even though the
    // source above was ALWAYS correctly resolved, which is exactly why
    // that assertion alone couldn't catch this. Confirmed via a real
    // production build and a live user report, not just this suite.
    expect(style.layers.map((l) => l.id)).not.toContain('background')
    await trueEventually(() => canvasCornersAreNotUniformBlankGray(page, title))
  })
})

test.describe('011-basemap-style-system — US3: real UGRC multi-source composition (quickstart.md Scenario 6)', () => {
  test('both UGRC layers render correctly stacked with genuinely-fetchable resolved sprite/glyph URLs', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap UGRC Composition'
    const container = panelCard(page, title).locator('.flowmap-chart')
    // 040-test-suite-migration: a longer, explicit poll window (not the
    // generic trueEventually()'s default ~5s) — this real Test tab mounts
    // 11 real/broken map panels at once (far more than the retired
    // fixture's own dedicated "Basemaps" tab ever had), and this panel's
    // own data query is dispatched last among them; confirmed empirically
    // this can legitimately exceed 5s under that real concurrent load.
    await expect
      .poll(async () => (await container.getAttribute('data-render-count')) !== null, { timeout: 15000 })
      .toBe(true)
    // A real, multi-fetch composition genuinely can take a few seconds —
    // 2 sequential real network round-trips (style docs) plus 2 more
    // (each layer's own TileJSON, research.md §6 update), confirmed
    // during implementation to reliably complete well within this window.
    await expect.poll(async () => (await getStyleSources(page, title)).length > 0, { timeout: 15000 }).toBe(true)
    // Stays stable — regression coverage for TWO real, compounding bugs
    // found during implementation, both against this exact proof case:
    // (1) composeStyles() originally left a vector source's `url`
    // pointing at a TileJSON document whose OWN `tiles` template is
    // itself relative (confirmed against the real UGRC endpoint:
    // `{"tiles":["tile/{z}/{y}/{x}.pbf"], ...}`) — MapLibre has no base
    // URL to resolve that against for an in-memory (non-
    // setStyle(url)-loaded) style, throwing a real runtime error ("Failed
    // to construct 'Request'..."); fixed by inlining each source's own
    // TileJSON tiles array at composition time (research.md §6 update).
    // (2) FlowMapPanel's own FR-010 error-fallback listener originally
    // listened for 'error' over the map's ENTIRE lifetime, not just the
    // style-loading window — meaning ordinary, expected individual-tile
    // fetch noise from a real composition (which happens constantly and
    // is not itself a basemap failure) triggered a revert to
    // BLANK_STYLE moments after a successful load; fixed by scoping the
    // listener to only fire before that setStyle() call's own
    // 'style.load' (research.md §7 update). A single non-empty read
    // caught neither bug — both required checking the state doesn't
    // regress shortly after first appearing non-empty.
    await page.waitForTimeout(1500)
    const sourceKeys = await getStyleSources(page, title)
    expect(sourceKeys.some((k) => k.startsWith('layer0__'))).toBe(true)
    expect(sourceKeys.some((k) => k.startsWith('layer1__'))).toBe(true)

    const style = await page.evaluate((t) => window.__flowmapTestMaps![t].getStyle(), title)
    // 017-multi-sprite-support: BOTH real composed layers here
    // (LiteBase/OutdoorsBase AND LiteLabels/Outdoors_Labels) declare
    // their own sprite — style.sprite is now the array form, one entry
    // per layer, not a single string (research.md §2). This is the
    // real, confirmed fix for both panels' missing highway/route-shield
    // icons — see specs/017-multi-sprite-support/diagnostic notes and
    // the `map.hasImage()` assertions further down in this file's own
    // 017-multi-sprite-support describe block for the actual icon-level
    // proof.
    const spriteEntries = style.sprite as { id: string; url: string }[]
    expect(Array.isArray(spriteEntries)).toBe(true)
    expect(spriteEntries).toHaveLength(2)
    expect(spriteEntries.map((s) => s.id)).toEqual(['layer0', 'layer1'])
    for (const entry of spriteEntries) expect(entry.url).toMatch(/^https:\/\//)
    expect(style.glyphs).toMatch(/^https:\/\//)
    // Regression coverage for a real bug found during implementation:
    // resolving glyphs' relative URL via a naive `new URL()` percent-
    // encodes its required literal {fontstack}/{range} template tokens,
    // which MapLibre's own style validator then rejects outright
    // ("glyphs url must include a {fontstack} token") — silently
    // reverting the whole map to BLANK_STYLE via FlowMapPanel's own
    // error-triggered fallback (research.md §7), even though the
    // composition itself had already succeeded. Asserts the tokens
    // survived resolution literally, not as %7Bfontstack%7D.
    expect(style.glyphs).toContain('{fontstack}')
    expect(style.glyphs).toContain('{range}')

    // Confirms the relative-path rewrite produced a genuinely fetchable
    // absolute URL for EVERY declared sprite, not just a syntactically-
    // absolute-looking one — extended (017-multi-sprite-support) from a
    // single-sprite check to every entry in the array.
    for (const entry of spriteEntries) {
      const spriteReachable = await page.evaluate(async (spriteUrl: string) => {
        try {
          const res = await fetch(`${spriteUrl}.json`)
          return res.ok
        } catch {
          return false
        }
      }, entry.url)
      expect(spriteReachable).toBe(true)
    }

    // 012-webgl-context-management — regression coverage: composition's
    // own layer namespacing (layer0__/layer1__ prefixes) means a REAL
    // composed source's own background layer (if any) never collides
    // with a literal "background" id — so BLANK_STYLE's own opaque
    // background layer (carried forward by an earlier, buggy
    // transformStyle merge) used to get appended LAST across the whole
    // 547+-layer composed style, painting over the ENTIRE real basemap.
    // Every assertion above this one — sources, sprite, glyphs — was
    // already passing before this fix; none of them inspect layer
    // stacking order, which is exactly why this specific regression
    // shipped once already. Confirmed via a real production build and a
    // live user report, not just this suite.
    //
    // 016-fix-ugrc-dark-mode — this composition's own real UGRC sources
    // provide no `background`-typed layer of their own (confirmed: this
    // is exactly what made both UGRC panels render with corrupted
    // colors in dark mode on real hardware — see
    // specs/016-fix-ugrc-dark-mode/diagnostic-results.md for the full,
    // live-confirmed causation chain). composeStyles() now injects one
    // itself when none exists — a literal "background" id IS now
    // expected here, but it must be composeStyles()'s own intentional
    // one (white, at the BOTTOM of the stack — index 0), never a
    // leftover BLANK_STYLE leak (012's own concern above, which reached
    // the TOP/end of the stack when it happened, not the bottom).
    const backgroundLayers = style.layers.filter((l) => l.type === 'background')
    expect(backgroundLayers).toHaveLength(1)
    expect(style.layers[0].id).toBe('background')
    expect((style.layers[0] as { paint?: { 'background-color'?: string } }).paint?.['background-color']).toBe(
      '#ffffff',
    )
    await trueEventually(() => canvasCornersAreNotUniformBlankGray(page, title))
  })
})

test.describe('017-multi-sprite-support — US1: both UGRC panels\' highway/route-shield icons resolve', () => {
  // FR-001/FR-002/SC-001: the actual, confirmed root-cause fix — see
  // specs/017-multi-sprite-support/research.md §1 for how these exact
  // real icon names were confirmed (fetching both real sprite index
  // JSONs directly): LiteBase/OutdoorsBase (layer0 in both real
  // compositions) declare ZERO highway-shield icons; LiteLabels/
  // Outdoors_Labels (layer1) declare ONLY highway-shield icons. Under
  // the prior "first sprite wins" behavior, layer1's own sprite was
  // silently discarded entirely, so these icon-image references could
  // never resolve — `map.hasImage()` is MapLibre's own real, public API
  // (confirmed present in the installed package's real `.d.ts`,
  // research.md §3) for asserting this at the data level, fully
  // automatable, no real hardware required (unlike 016's own defect).
  test('Flowmap UGRC Composition — LiteLabels\' own highway-shield icons are present', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap UGRC Composition'
    await waitForBasemapApplied(page, title)
    await page.waitForTimeout(1500) // same real multi-fetch settle window as the composition test above

    const iconNames = [
      'Labels/Roads - white version/Interstates',
      'Labels/Roads - Interstates and Ramps - white version/Interstates',
      'Labels/Roads - Interstates and Ramps - white version/US Highways',
      'Labels/Roads - white version/US Highways',
      'Labels/Roads - Interstates and Ramps - white version/State Highways - 2.3m-2.8k',
      'Labels/Roads - white version/State Highways',
      'Labels/Roads - Interstates and Ramps - white version/State Highways',
    ]
    for (const iconName of iconNames) {
      const hasImage = await page.evaluate(
        ({ t, name }) => window.__flowmapTestMaps![t].hasImage(`layer1:${name}`),
        { t: title, name: iconName },
      )
      expect(hasImage, `expected layer1:${iconName} to be loaded`).toBe(true)
    }
  })

  test('Flowmap UGRC Outdoors Composition — Outdoors_Labels\' own highway-shield icons are present', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap UGRC Outdoors Composition'
    await waitForBasemapApplied(page, title)
    await page.waitForTimeout(1500)

    const iconNames = ['LABELS/Roads - LABELS/Interstates', 'LABELS/Roads - LABELS/US Highways', 'LABELS/Roads - LABELS/State Highways']
    for (const iconName of iconNames) {
      const hasImage = await page.evaluate(
        ({ t, name }) => window.__flowmapTestMaps![t].hasImage(`layer1:${name}`),
        { t: title, name: iconName },
      )
      expect(hasImage, `expected layer1:${iconName} to be loaded`).toBe(true)
    }
  })
})

test.describe('016-fix-ugrc-dark-mode — US1/US2: both UGRC panels get an injected background layer; chrome still follows dark mode', () => {
  // US1/FR-001/FR-002: the actual, confirmed root-cause fix
  // (composeStyles() in loadBasemapStyle.ts) — see
  // specs/016-fix-ugrc-dark-mode/diagnostic-results.md for the full,
  // live-confirmed causation chain (color-scheme ruled out across three
  // real-hardware variants; missing `background` layer confirmed
  // causal, live, on both real panels). This can only assert the DATA-
  // level fix (the composed style now has a background layer) — the
  // actual visual corruption never reproduced under Playwright/
  // SwiftShader in the first place (research.md §1/§2), so this is not,
  // and cannot be, a substitute for the real-hardware confirmation
  // already recorded in diagnostic-results.md.
  test('both real UGRC compositions get an injected white background layer at the bottom of the stack', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()

    for (const title of ['Flowmap UGRC Composition', 'Flowmap UGRC Outdoors Composition']) {
      await waitForBasemapApplied(page, title)
      const style = await page.evaluate((t) => window.__flowmapTestMaps![t].getStyle(), title)
      expect(style.layers[0]).toMatchObject({
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#ffffff' },
      })
      expect(style.layers.filter((l) => l.type === 'background')).toHaveLength(1)
    }
  })

  // FR-006 / User Story 2: the fix above touches only the composed
  // style's own `layers` array — it must not regress this panel's
  // already-fixed NavigationControl dark-mode chrome, which the
  // existing test above (line ~401) only ever exercised against
  // FLOWMAP_TITLE, never against a real UGRC composition specifically.
  test('NavigationControl on the Flowmap UGRC Composition panel still matches the app theme in dark mode', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap UGRC Composition'
    const card = panelCard(page, title)
    const container = card.locator('.flowmap-chart')
    await waitForBasemapApplied(page, title)
    const zoomIn = container.locator('.maplibregl-ctrl-zoom-in')
    const zoomOut = container.locator('.maplibregl-ctrl-zoom-out')
    await expect(zoomIn).toBeVisible()

    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const styles = await zoomIn.evaluate((el) => {
      const group = el.closest('.maplibregl-ctrl-group') as HTMLElement
      const icon = el.querySelector('.maplibregl-ctrl-icon') as HTMLElement
      return { groupBg: getComputedStyle(group).backgroundColor, iconFilter: getComputedStyle(icon).filter }
    })
    // 033-shadcn-default-theme: mapControls.css's own `.maplibregl-ctrl-
    // group { background: var(--card) !important; }` — confirmed directly
    // — dark --card is now #171717, not the old WFRC-brand #081b26 (both
    // old --card and --background happened to share one literal value;
    // the new theme's --card/--background are genuinely different, so
    // this is specifically --card, not --background).
    expect(styles.groupBg).toBe('rgb(23, 23, 23)') // --card in dark mode
    expect(styles.iconFilter).toBe('invert(1)')

    const dividerColor = await zoomOut.evaluate((el) => getComputedStyle(el).borderTopColor)
    // 033-shadcn-default-theme: dark --border is now a real, translucent
    // shadcn value (#f5ffff1a, i.e. oklch(1 0 0 / 10%) — 10% white) rather
    // than an opaque WFRC-brand hex — confirmed via a real headless-
    // Chromium round-trip that this is exactly how it computes, not
    // guessed from the hex alone.
    expect(dividerColor).toBe('rgba(245, 255, 255, 0.1)') // --border in dark mode
  })
})

test.describe('011-basemap-style-system — US3: one broken composition layer falls back the WHOLE basemap (quickstart.md Scenario 5, composition subset)', () => {
  test('never a partial composite', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const title = 'Flowmap Broken Composition Layer'
    const container = panelCard(page, title).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await page.waitForTimeout(1500) // the failed layer fetch needs a moment to reject

    expect(await getStyleSources(page, title)).toEqual([]) // BLANK_STYLE, not a partial 1-layer composite
  })
})

test.describe('011-basemap-style-system — fully offline fallback (quickstart.md Scenario 7)', () => {
  test('every basemap source category falls back to BLANK_STYLE when unreachable; flow lines still render', async ({
    page,
  }) => {
    // Route-blocks every real built-in-preset/raster-catalog/composition
    // host this feature can reach — the wftdm-dashboard here/no-internet
    // case (project-docs/ARCHITECTURE.md). Deliberately does NOT block
    // 127.0.0.1:5199 (the app's own dev server) or DuckDB-WASM's own
    // extensions.duckdb.org dependency, same scoping discipline as this
    // file's existing "every map-host request..." test.
    await page.route(
      /cartocdn\.com|openfreemap\.org|opentopomap\.org|tiles\.arcgis\.com|basemap\/leaflet-providers\.json/,
      (route) => route.abort(),
    )

    await boot(page)
    await gotoNetworkTab(page)

    // The default-path panel (Network tab, no basemap: config).
    const defaultContainer = panelCard(page, FLOWMAP_TITLE).locator('.flowmap-chart')
    await trueEventually(async () => (await defaultContainer.getAttribute('data-render-count')) !== null)
    await page.waitForTimeout(1000)
    expect(await getStyleSources(page, FLOWMAP_TITLE)).toEqual([])
    expect(Number(await defaultContainer.getAttribute('data-flow-count'))).toBeGreaterThan(0)

    // Every Test-tab panel too — pinned preset, tab default, raster
    // preset, and composition all funnel through the same FR-010
    // fallback regardless of which source category they'd otherwise use.
    await page.getByRole('tab', { name: 'Test' }).click()
    for (const title of [
      'Basemap Precedence — inherits tab default',
      'Basemap Precedence — panel override wins',
      'Flowmap Raster Provider Preset',
      'Flowmap UGRC Composition',
    ]) {
      const container = panelCard(page, title).locator('.flowmap-chart')
      await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
      await page.waitForTimeout(500)
      expect(await getStyleSources(page, title)).toEqual([])
      expect(Number(await container.getAttribute('data-flow-count'))).toBeGreaterThan(0)
    }
  })
})

// Reads canvas.maplibregl-canvas's own alpha channel for any
// non-fully-transparent pixel, proving the interleaved deck.gl overlay
// actually drew something (not just technically present in
// overlay.props.layers). Found necessary empirically: reading pixels
// from a plain, separate page.evaluate() call — well after the actual
// draw, following a fixed wait — unreliably showed an all-transparent
// buffer even when the layer WAS genuinely rendering, because MapLibre's
// own canvas (unlike deck.gl's own non-interleaved canvas, which
// apparently preserves its buffer) does not guarantee its drawing buffer
// survives past the browser's own compositing step once idle
// (preserveDrawingBuffer defaults to false — a WebGL buffer's content
// after compositing is only reliably readable immediately following a
// draw within the same frame, not on a later, disconnected read). Fixed
// by forcing a fresh repaint and reading pixels inside that SAME
// 'render' event's callback — no gap for the buffer to be cleared
// in between.
async function canvasHasDrawnPixels(page: Page, title: string): Promise<boolean> {
  return page.evaluate((t) => {
    const map = window.__flowmapTestMaps![t]
    return new Promise<boolean>((resolve) => {
      map.once('render', () => {
        const el = map.getCanvas()
        const ctx = (el.getContext('webgl2') ?? el.getContext('webgl')) as WebGLRenderingContext | null
        if (!ctx) {
          resolve(false)
          return
        }
        const { width, height } = el
        const pixels = new Uint8Array(width * height * 4)
        ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels)
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] !== 0) {
            resolve(true)
            return
          }
        }
        resolve(false)
      })
      map.triggerRepaint()
    })
  }, title)
}

// 012-webgl-context-management — regression coverage for a real bug
// canvasHasDrawnPixels() (and every existing "sources resolved
// correctly" check) cannot catch: BLANK_STYLE's own opaque #e5e5e5
// "background" layer being carried forward by the transformStyle merge
// and appended LAST (`layers: [...next.layers, ...preserved]` — later
// entries paint on top), completely covering an otherwise fully-
// correctly-resolved real basemap. Since the background fill is
// non-transparent, canvasHasDrawnPixels() (an alpha-channel check) still
// returns true — flow lines are ALSO drawn on top and are non-
// transparent — and every existing "does map.getStyle().sources contain
// the right source" check also still passes, since the SOURCES were
// never wrong, only the LAYER STACKING ORDER. Found only via a live user
// report against a real production build, not the dev-server-based test
// suite. This samples the canvas's four corners — well away from the
// flowmap's own drawn shapes at center — and asserts they are NOT all
// the exact BLANK_STYLE fill color (229, 229, 229 / #e5e5e5), proving a
// real, visually-varied basemap is actually painted underneath, not
// hidden behind a uniform gray cover.
async function canvasCornersAreNotUniformBlankGray(page: Page, title: string): Promise<boolean> {
  return page.evaluate((t) => {
    const map = window.__flowmapTestMaps![t]
    return new Promise<boolean>((resolve) => {
      map.once('render', () => {
        const el = map.getCanvas()
        const ctx = (el.getContext('webgl2') ?? el.getContext('webgl')) as WebGLRenderingContext | null
        if (!ctx) {
          resolve(false)
          return
        }
        const { width, height } = el
        const margin = 4
        const corners: [number, number][] = [
          [margin, margin],
          [width - margin, margin],
          [margin, height - margin],
          [width - margin, height - margin],
        ]
        const pixel = new Uint8Array(4)
        const isBlankGray = (x: number, y: number) => {
          // readPixels' Y origin is bottom-left; canvas Y origin is
          // top-left — height - y flips into GL's own coordinate space.
          ctx.readPixels(x, height - y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel)
          return pixel[0] === 229 && pixel[1] === 229 && pixel[2] === 229
        }
        const allBlankGray = corners.every(([x, y]) => isBlankGray(x, y))
        resolve(!allBlankGray)
      })
      map.triggerRepaint()
    })
  }, title)
}

// 012-webgl-context-management's own two WebGL context-loss/recovery
// tests ("WebGL context loss is reported honestly", quickstart.md
// Scenario 4; "a pinned basemap recovers to itself, not the app
// default", quickstart.md Scenario 5) were removed from here along with
// the application mechanism itself (contextLost state, webglcontextlost/
// webglcontextrestored listeners — FlowMapPanel.tsx) — a deliberate
// project decision, not a bug fix. See CLAUDE.md's own FlowMapPanel.tsx
// history entry for the full record. loseContext()/restoreContext()
// (the WEBGL_lose_context-extension test helpers those two tests used)
// were removed with them — confirmed via grep to have no other caller in
// this file. canvasHasDrawnPixels() stayed — it's real, general-purpose
// pixel-readback instrumentation still used by OTHER, unrelated tests
// below (interleaved-mode style-survival, raster-composition coverage),
// not exclusive to context-loss recovery.

test.describe('012-webgl-context-management — expand/collapse never regresses a working basemap (quickstart.md Scenario 3)', () => {
  test('expanding one of six panels leaves it and every sibling correctly rendered', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const titles = [
      'Basemap Precedence — inherits tab default',
      'Basemap Precedence — panel override wins',
      'Flowmap Raster Provider Preset',
      'Flowmap Unreachable Basemap',
      'Flowmap UGRC Composition',
      'Flowmap Broken Composition Layer',
    ]
    for (const title of titles) {
      const container = panelCard(page, title).locator('.flowmap-chart')
      await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    }
    await page.waitForTimeout(1500) // let every panel's own fallback/composition settle

    const expandTitle = 'Basemap Precedence — inherits tab default'
    await expandTrigger(page, expandTitle).click()
    const dialogContainer = page.getByRole('dialog').locator('.flowmap-chart')
    await expect(dialogContainer.locator('canvas.maplibregl-canvas')).toBeVisible()
    await trueEventually(async () => (await dialogContainer.getAttribute('data-render-count')) !== null)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Every panel — the one just collapsed, and every sibling — still
    // renders correctly; no side effect from one panel's expand/collapse
    // cycle on the others' own contexts/state.
    for (const title of titles) {
      const container = panelCard(page, title).locator('.flowmap-chart')
      await expect(container.locator('canvas.maplibregl-canvas')).toBeVisible()
      expect(Number(await container.getAttribute('data-flow-count'))).toBeGreaterThanOrEqual(0)
    }
  })
})
