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
// DuckDB-WASM, fixture Parquet, fixture dashboard-config). See
// quickstart.md and contracts/flowmap-panel.md.
//
// Fixture shape (tests/fixtures/dashboard-config/dashboard-1-summary.yaml's
// row_flowmap):
// - "Flow Map Trip Distribution Desire Lines": reactive to
//   $filters.purpose — US1/US2's primary vehicle.
// - "Flow Map Broken Panel (intentional)": metric no scenario publishes —
//   error state.
//
// Fixture data (tests/fixtures/generate.py's OD_FLOWS_ROWS), purpose:
// 'all' (default, no WHERE clause): 5 distinct locations (100/200/300/
// 400/500 — TAZ 600's row is excluded for a missing coordinate before it
// ever becomes a location), 6 flows — (100,200) and (100,300) are each a
// summed duplicate pair — 1 row excluded for a non-positive value, 1 for
// a missing coordinate. purpose: 'HBW' narrows to 5 flows / 5 locations
// (drops the one NHB-only pair, (300,400)); purpose: 'NHB' narrows to 2
// flows / 4 locations — a clearly different diagram, used for
// filter-reactivity coverage (US2).

const EXPECTED_FLOWS_ALL: { origin: string; dest: string; value: number }[] = [
  { origin: '100', dest: '200', value: 590 }, // 500 (HBW) + 90 (NHB)
  { origin: '100', dest: '300', value: 200 }, // 120 + 80 (duplicate pair)
  { origin: '200', dest: '400', value: 60 },
  { origin: '300', dest: '500', value: 40 },
  { origin: '500', dest: '200', value: 30 },
  { origin: '300', dest: '400', value: 50 }, // NHB only
]

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

async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check).toBe(true)
}

const FLOWMAP_TITLE = 'Flow Map Trip Distribution Desire Lines'

test.describe('User Story 1 - Author renders an O-D metric as a flow map', () => {
  test('rendered locations/flows match a direct GROUP BY/SUM aggregation of the fixture data', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await expect(container).toBeVisible()

    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    const flowCount = await container.getAttribute('data-flow-count')
    const locationCount = await container.getAttribute('data-location-count')
    expect(Number(flowCount)).toBe(EXPECTED_FLOWS_ALL.length)
    expect(Number(locationCount)).toBe(5)

    // Cross-check against a direct query, not just a hardcoded expected
    // value — proves the fixture assumption itself, not only the panel's
    // arithmetic.
    const rows = await page.evaluate(() =>
      window.__wftdm!.query(
        // CAST(...AS BIGINT) — DuckDB's SUM(INTEGER) defaults to HUGEINT,
        // whose Arrow-to-JS serialization doesn't come back as a plain
        // number (row.toJSON() on the raw HUGEINT read back as undefined,
        // not NaN's usual "wrong value" — found empirically, not assumed).
        // Same class of DuckDB-WASM Arrow-conversion quirk
        // tests/fixtures/generate.py's own _sql_literal already documents
        // for DECIMAL/DOUBLE.
        `SELECT orig_taz, dest_taz, CAST(SUM(trips) AS BIGINT) AS total
         FROM good_scenario__od_flows WHERE trips > 0
         GROUP BY orig_taz, dest_taz ORDER BY orig_taz, dest_taz`,
      ),
    )
    // Row 600's (missing-coordinate) trips=25 row is > 0 so this direct
    // query includes it as its own group unless filtered out — the panel
    // itself excludes it for a different reason (no coordinate), so
    // compare only the pairs the panel is expected to render.
    const directPairs = rows.filter((r) => Number(r.orig_taz) !== 600)
    expect(directPairs).toHaveLength(EXPECTED_FLOWS_ALL.length)
    for (const expected of EXPECTED_FLOWS_ALL) {
      const match = directPairs.find(
        (r) => String(r.orig_taz) === expected.origin && String(r.dest_taz) === expected.dest,
      )
      expect(match, `expected a direct-query row for ${expected.origin} -> ${expected.dest}`).toBeDefined()
      expect(Number(match!.total)).toBe(expected.value)
    }
  })

  test('the map has a real, non-zero-size canvas once rendered', async ({ page }) => {
    await boot(page)
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
  // omits center/zoom in its fixture config, so once its real flow data
  // (generate.py's OD_FLOWS_ROWS) resolves, the map's initial view must be
  // auto-fitted to that data's own real extent — no longer left at
  // DEFAULT_CENTER/DEFAULT_ZOOM (that assertion was this test's OWN
  // previous behavior before this feature; superseded here, not merely
  // extended, since the correct expectation genuinely changed).
  test('auto-fits its initial view to the real loaded flow data (no author-configured center/zoom)', async ({
    page,
  }) => {
    await boot(page)
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

    // The real, known extent of every displayable flow's origin/
    // destination point (generate.py's OD_FLOWS_ROWS, excluding TAZ 600's
    // missing-coordinate row) — west=-112.00 (TAZ 500), east=-111.75 (TAZ
    // 400), south=40.60 (TAZ 400), north=40.85 (TAZ 300). fitBounds()'s own
    // padding only ever EXPANDS the visible viewport beyond the raw data
    // extent, never contracts it, so the real viewport must be a superset.
    expect(bounds.west).toBeLessThanOrEqual(-112.0)
    expect(bounds.east).toBeGreaterThanOrEqual(-111.75)
    expect(bounds.south).toBeLessThanOrEqual(40.6)
    expect(bounds.north).toBeGreaterThanOrEqual(40.85)

    // Not the static default — a real, computed fit genuinely happened,
    // not a coincidental no-op.
    const zoom = await page.evaluate((t) => window.__flowmapTestMaps![t].getZoom(), FLOWMAP_TITLE)
    const center = await page.evaluate((t) => window.__flowmapTestMaps![t].getCenter(), FLOWMAP_TITLE)
    expect([zoom, center.lng, center.lat]).not.toEqual([9, -111.89, 40.76])
  })

  // FR-004 — a panel that never reaches a genuine displayable-data state
  // must never attempt a fit at all. "Flow Map Broken Panel (intentional)"
  // (a metric no scenario publishes) reaches `status: 'error'` — which,
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
    const card = panelCard(page, 'Flow Map Broken Panel (intentional)')
    await expect(card.getByText("Couldn't load this map")).toBeVisible()
    await expect(card.locator('.flowmap-chart')).toHaveCount(0)
    await expect(card.locator('canvas')).toHaveCount(0)
  })

  test('clustering/clustering_auto config values reach the constructed FlowmapLayer', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    // The fixture panel sets clustering: true / clustering_auto: true —
    // confirmed indirectly via a successful, non-erroring render (a
    // FlowmapLayer constructed with invalid/mismatched clustering props
    // would throw or render nothing) combined with the flow/location
    // counts already asserted above — flowmap.gl exposes no public,
    // Playwright-inspectable prop-readback API, so this is the same
    // black-box-correctness style every prior panel type's own
    // library-internal option coverage uses.
    await expect(container).toBeVisible()
  })

  test('duplicate (origin, destination) rows sum into one flow line, not duplicate overlapping lines', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    const flowCount = Number(await container.getAttribute('data-flow-count'))
    // 6 distinct pairs, not 8 raw valid rows — proves (100,200) and
    // (100,300)'s duplicate rows summed rather than rendering twice.
    expect(flowCount).toBe(6)
  })

  test('excludes the non-positive-value and missing-coordinate rows, logs exactly one scoped console.warn', async ({
    page,
  }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().includes('FlowMapPanel')) {
        warnings.push(msg.text())
      }
    })

    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    await trueEventually(async () => warnings.length > 0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('excluded 2 row(s)')
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
// such a panel. "Flowmap Explicit View Override" (dashboard-3-basemaps.yaml,
// the "Basemaps" tab) is deliberately configured with a center/zoom far
// from its own real flow data (which spans roughly lon -112.00..-111.75 /
// lat 40.60..40.85) specifically so this test can tell "stayed at the
// authored view" apart from "coincidentally close to a real fit". Named
// with this feature's own number, not a bare "User Story 3" — this file
// already has a pre-existing, differently-scoped "User Story 3" describe
// block (010-flowmap-panel's own numbering) further below.
test.describe('027-map-auto-fit-and-reset — User Story 3: an author explicit view configuration is always respected', () => {
  test('an explicit center/zoom wins outright over auto-fit, even when it is nowhere near the real data', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click()
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
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
// manual pan must survive 004 expand/collapse, a genuine data reload
// (filter/scenario change), and a basemap switch — none of which reload
// the flow data itself, and FR-006 requires auto-fit to run at most once
// per mount regardless of what re-triggers the data-update effect.
test.describe('027-map-auto-fit-and-reset — Polish: no re-trigger after a manual pan', () => {
  test('a manual pan survives 004 expand/collapse, a filter change, and a basemap switch', async ({ page }) => {
    await boot(page)
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

    // (b) a genuine data reload — a global filter change.
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await trueEventually(async () => {
      const flowCount = await container.getAttribute('data-flow-count')
      return flowCount !== null && Number(flowCount) === 5 // HBW narrows to 5 flows
    })
    view = await getView()
    expect(view.center.lng).toBeCloseTo(pannedView.center.lng, 3)
    expect(view.center.lat).toBeCloseTo(pannedView.center.lat, 3)
    expect(view.zoom).toBeCloseTo(pannedView.zoom, 3)
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))

    // (c) a basemap switch (Settings modal's real, shipped Apply action —
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
  test('hovering the largest flow line shows a real tooltip with origin, destination, and value', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await container.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300) // let deck.gl actually paint a frame before picking

    // Geographic midpoint between TAZ 100 (40.76, -111.89) and TAZ 200
    // (40.70, -111.85) — the (100, 200) flow is this fixture's largest
    // (590 = 500 HBW + 90 NHB, EXPECTED_FLOWS_ALL above), and therefore
    // the widest, easiest-to-hit rendered line.
    const point = await page.evaluate((t) => {
      const map = window.__flowmapTestMaps![t]
      const p = map.project([-111.87, 40.73])
      const rect = map.getCanvas().getBoundingClientRect()
      return { x: rect.left + p.x, y: rect.top + p.y }
    }, FLOWMAP_TITLE)

    const tooltip = container.locator('.map-tooltip')
    // A small vertical sweep, not one exact point — flowmap.gl renders
    // flow lines with a slight curve (flowLineCurviness), so the
    // straight-line geographic midpoint doesn't always land EXACTLY on
    // the rendered curve's own pixel. FlowMapPanel.tsx's own
    // pickingRadius: 8 already affords some tolerance; this sweep affords
    // a bit more — standard practice for hover-testing thin line
    // geometry, not a sign anything is flaky.
    let found = false
    for (const dy of [0, -6, 6, -12, 12, -18, 18]) {
      await page.mouse.move(point.x, point.y + dy, { steps: 3 })
      if (await tooltip.isVisible().catch(() => false)) {
        found = true
        break
      }
      await page.waitForTimeout(100)
    }
    expect(found).toBe(true)
    await expect(tooltip).toContainText('100')
    await expect(tooltip).toContainText('200')
    await expect(tooltip).toContainText('590')
  })
})

test.describe('User Story 2 - Flowmap panel responds to global filters and resizes correctly', () => {
  test('changing a bound global filter updates the flow lines without recreating the map instance', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    const canvas = container.locator('canvas').first()
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    expect(Number(await container.getAttribute('data-flow-count'))).toBe(6) // 'all'

    const canvasHandleBefore = await canvas.elementHandle()
    const renderCountBefore = await container.getAttribute('data-render-count')

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await trueEventually(
      async () => (await container.getAttribute('data-render-count')) !== renderCountBefore,
    )

    // Same DOM node — not a remount — and the data genuinely narrowed.
    const canvasHandleAfter = await canvas.elementHandle()
    const sameNode = await page.evaluate(
      ([a, b]) => a === b,
      [canvasHandleBefore, canvasHandleAfter],
    )
    expect(sameNode).toBe(true)
    expect(Number(await container.getAttribute('data-flow-count'))).toBe(5) // 'HBW' only
    expect(Number(await container.getAttribute('data-location-count'))).toBe(5)
  })

  test('a filter value matching zero rows shows the shared PanelEmptyState', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    await expect(card.locator('.flowmap-chart')).toBeVisible()

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NONEXISTENT'))
    await expect(card.getByText('No data for this selection')).toBeVisible()
    await expect(card.locator('.flowmap-chart')).toHaveCount(0)

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
    await expect(card.locator('.flowmap-chart')).toBeVisible()
  })

  test('004 expand/collapse resizes the map correctly, issues zero additional query, preserves the map instance, and collapse returns correct card-sized rendering', async ({
    page,
  }) => {
    await boot(page)
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
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')

    // The query almost certainly resolves well within 1000ms (real
    // DuckDB-WASM query, ~tens of ms) — expect.poll, not a raw sleep,
    // proves the data-update effect actually re-runs once mapReady flips
    // true, rather than being stuck permanently empty from an early
    // return with no re-trigger.
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    expect(Number(await container.getAttribute('data-flow-count'))).toBe(6)
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
    const card = panelCard(page, 'Flow Map Broken Panel (intentional)')
    await expect(card.getByText("Couldn't load this map")).toBeVisible()
    await expect(card.locator('.flowmap-chart')).toHaveCount(0)
    await expect(card.locator('canvas')).toHaveCount(0)
  })

  test('a tab mixing all eight now-built panel types renders without error in a single load', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.getByText('Total Households')).toBeVisible() // valuebox
    await expect(page.getByText('Mode Share by Purpose', { exact: true })).toBeVisible() // plotly
    await expect(panelCard(page, 'Screenline Validation').locator('table')).toBeVisible() // table
    await expect(
      panelCard(page, 'Methodology Notes').getByRole('heading', { name: 'Highway Assignment Validation' }),
    ).toBeVisible() // markdown
    await expect(
      panelCard(page, 'Observable Plot Mode Share (Bar)').locator('.observable-plot-chart svg[viewBox]'),
    ).toBeVisible() // observable-plot
    await expect(
      panelCard(page, 'Sankey Tour-to-Trip Mode Consistency').locator('.sankey-chart svg[viewBox] rect[data-node-id]'),
    ).not.toHaveCount(0) // sankey

    const flowmapCard = panelCard(page, FLOWMAP_TITLE)
    // .first() — kept from 010's original assertion shape; 012-webgl-
    // context-management's interleaved MapboxOverlay mode now leaves
    // exactly one real <canvas> inside .flowmap-chart (deck.gl draws
    // into MapLibre's own canvas, no separate #deckgl-overlay element),
    // so .first() is a no-op here rather than disambiguating two.
    await expect(flowmapCard.locator('.flowmap-chart canvas').first()).toBeVisible() // flowmap
    await expect(expandTrigger(page, FLOWMAP_TITLE)).toBeVisible()

    // 013-zonemap-panel — the eighth and final originally-listed panel
    // type, completing this mixed-tab guarantee (spec.md SC-005).
    const zonemapCard = panelCard(page, 'Zone Map VMT per Capita')
    await expect(zonemapCard.locator('.zonemap-chart canvas').first()).toBeVisible() // zonemap
    await expect(expandTrigger(page, 'Zone Map VMT per Capita')).toBeVisible()
  })
})

// 011-basemap-style-system — real-browser basemap coverage. Reuses
// FLOWMAP_TITLE ("Flow Map Trip Distribution Desire Lines", no basemap:
// config) for the app-default/theme-pairing path and the empirical
// survival test; the "Basemaps" fixture tab (dashboard-3-basemaps.yaml)
// hosts every other scenario (precedence, raster, composition, fallback).
// See quickstart.md for the full scenario list this section implements.

async function getStyleSources(page: Page, title: string): Promise<string[]> {
  const style = await page.evaluate((t) => window.__flowmapTestMaps![t].getStyle(), title)
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    const title = 'Flowmap Unreachable Basemap (intentional)'
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()

    const tabDefaultTitle = 'Flowmap Tab Default Basemap'
    const overrideTitle = 'Flowmap Panel Basemap Override'
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

    // Tab default (openfreemap-bright) resolves for the panel with no
    // basemap: of its own.
    expect(requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/bright'))).toBe(true)
    // Panel-level override (carto-voyager) wins over the tab default for
    // the other panel.
    expect(requestUrls.some((u) => u.includes('voyager-gl-style'))).toBe(true)
  })
})

test.describe('011-basemap-style-system — US2: explicit pin does not re-pair on theme change (quickstart.md Scenario 4)', () => {
  test('an explicit panel-level basemap pin is not re-paired, and setStyle() is not called a second time', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    const title = 'Flowmap Panel Basemap Override' // basemap: carto-voyager
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    const title = 'Flowmap UGRC Composition'
    const container = panelCard(page, title).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()

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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    const title = 'Flowmap Broken Composition Layer (intentional)'
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

    // The default-path panel (Summary tab, no basemap: config).
    const defaultContainer = panelCard(page, FLOWMAP_TITLE).locator('.flowmap-chart')
    await trueEventually(async () => (await defaultContainer.getAttribute('data-render-count')) !== null)
    await page.waitForTimeout(1000)
    expect(await getStyleSources(page, FLOWMAP_TITLE)).toEqual([])
    expect(Number(await defaultContainer.getAttribute('data-flow-count'))).toBeGreaterThan(0)

    // Every basemap-tab panel too — pinned preset, tab default, raster
    // preset, and composition all funnel through the same FR-010
    // fallback regardless of which source category they'd otherwise use.
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    for (const title of [
      'Flowmap Tab Default Basemap',
      'Flowmap Panel Basemap Override',
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
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    const titles = [
      'Flowmap Tab Default Basemap',
      'Flowmap Panel Basemap Override',
      'Flowmap Raster Provider Preset',
      'Flowmap Unreachable Basemap (intentional)',
      'Flowmap UGRC Composition',
      'Flowmap Broken Composition Layer (intentional)',
    ]
    for (const title of titles) {
      const container = panelCard(page, title).locator('.flowmap-chart')
      await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    }
    await page.waitForTimeout(1500) // let every panel's own fallback/composition settle

    const expandTitle = 'Flowmap Tab Default Basemap'
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
