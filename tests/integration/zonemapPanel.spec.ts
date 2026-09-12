import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'
import type maplibregl from 'maplibre-gl'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __zonemapTestMaps?: Record<string, maplibregl.Map>
  }
}

// Real-browser tests for 013-zonemap-panel, extending
// flowmapPanel.spec.ts's own pattern (real DuckDB-WASM, real
// Parquet+GeoParquet, real demo dashboard-config). See quickstart.md and
// contracts/zonemap-panel.md.
//
// 040-test-suite-migration (T025): migrated off the retired synthetic
// 8-zone fixture (tests/fixtures/geometry/taz.geoparquet, a 4x2 TAZ
// 100-800 grid — deleted entirely by T011's Phase 2 cutover). Real
// geometry: public/demo-geometry/taz25.geoparquet (25 real MTC
// prototype_mtc zones, TAZ 1-25, real bounds confirmed live: lon
// -122.42096..-122.38439 / lat 37.76923..37.80563).
//
// TWO real anchor metrics were needed, not one — a real, confirmed
// finding from this migration's own investigation, reported back and
// confirmed with the user before continuing (the real scope is
// genuinely larger than "re-derive the numbers against 25 zones"):
//
// - `vmt_by_home_taz` (home_zone_id, already real, already published as
//   the Network tab's own "VMT by Home Zone (straight-line proxy)"
//   panel) has real data for ALL 25 zones, in EVERY real scenario
//   (baseline/density-variant/transit-variant — confirmed live). It has
//   no `purpose` column at all (a plain `GROUP BY home_zone_id`,
//   confirmed directly in summarize.yaml). This metric can never produce
//   a real "no-data" zone and is not filterable — it anchors every test
//   that needs neither (rendering, center/zoom, hover, 3D toggle,
//   basemap precedence/switch/reset, attribution/nav controls, resize,
//   registry consistency).
// - `trips_by_destination_zone` (destination_zone_id × primary_purpose,
//   already real, already published elsewhere) DOES have a real gap:
//   filtering to `school` leaves real TAZ 14 with zero destination trips
//   (24 of 25 zones covered) — confirmed live. This is the real no-data
//   trigger, replacing the retired fixture's synthetic "TAZ 800 always
//   no-data" case. Deliberately bound via a HARDCODED `filter: {
//   primary_purpose: school }`, matching this project's own two other
//   already-real zonemap/panel `filter:` usages
//   (dashboard-3-tour-models.yaml, dashboard-5-trip-models.yaml) — NOT
//   `$filters.purpose`. A live attempt at the global-filter form
//   confirmed a real, broader finding: zero real sidebar filter controls
//   exist anywhere in this demo (grep-confirmed), and
//   `state/filterState.ts`'s `get()` returns `undefined` until some real
//   UI control calls `set()` first — a `$filters.purpose`-bound panel
//   would throw "unresolved placeholder" on every real page load, not
//   just in an unmigrated test. The filter-REACTIVITY test itself is
//   retired for the same reason dashboardShell.spec.ts/
//   panelExpand.spec.ts/flowmapPanel.spec.ts already retired theirs:
//   zero real content anywhere uses global filter reactivity.
//
// The retired fixture's "excluded" mechanic (a metric row with NO
// matching zone geometry) has NO real trigger anywhere in this data
// model — confirmed structurally, not just "untriggered today": every
// real zone-keyed metric (`vmt_by_home_taz.home_zone_id`,
// `trips_by_destination_zone.destination_zone_id`,
// `land_use_summary.zone_id`) is built from the exact same closed
// 25-zone universe (confirmed live: every one queries out to exactly
// {1..25}, never anything else). The dedicated "excluded" test and the
// excluded-count assertions inside the main rendering test are retired
// outright, not worked around.
//
// `comparison: diff` real values: a real, confirmed correction made
// during this migration's own implementation — `trips_by_destination_zone`
// has MULTIPLE rows per zone (one per purpose), and comparison: diff's
// own JOIN is on `compare_on` columns alone, so joining that metric
// without ALSO including `primary_purpose` in `compare_on` produces a
// real cross-product per zone, not one clean diff (confirmed live: the
// resulting values didn't match a direct GROUP BY/SUM cross-check at
// all). `vmt_by_home_taz` has exactly ONE row per zone per scenario and
// is genuinely diff-compatible — real, confirmed per-zone diffs
// (activitysim-density-variant minus activitysim-baseline): TAZ 22 =
// 396.38-402.97 = -6.58 (real min), TAZ 8 = 1301.66-1281.89 = +19.76
// (real max) — genuine sign variation for the diverging scale,
// replacing the retired fixture's synthetic "TAZ 300 exactly at
// midpoint" case (no real zone lands exactly at zero here — TAZ 19
// comes closest at +0.01 — so this asserts real sign/magnitude at the
// two real extremes instead of a contrived exact-zero zone).
const ZONEMAP_TITLE = 'VMT by Home Zone (straight-line proxy)'
const EXPLICIT_DOMAIN_TITLE = 'Zone Map Explicit Domain'
const NO_DATA_TITLE = 'Zone Map Destination Trips by Purpose'
const DIFF_TITLE = 'Zone Map VMT Diff (Density vs Baseline)'
const DIFF_UNRESOLVABLE_TITLE = 'Zone Map Diff Unresolvable Scenario'
const BROKEN_TITLE = 'Broken Zone Map Panel (missing metric)'
const DIFF_BASELINE_TITLE = 'Zone Map VMT Diff via $baseline'

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

// ZONEMAP_TITLE ("VMT by Home Zone (straight-line proxy)") lives on the
// real Network tab (dashboard-6-network.yaml), unlike the retired
// fixture's own landing-page placement.
async function gotoNetworkTab(page: Page) {
  await page.getByRole('tab', { name: 'Network' }).click()
}

async function gotoTestTab(page: Page) {
  await page.getByRole('tab', { name: 'Test' }).click()
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

function expandTrigger(page: Page, title: string) {
  // exact: true — this fixture has titles that are prefixes of other
  // titles ("Zone Map VMT per Capita" / "... (Auto Domain)"), which
  // Playwright's default substring name matching would otherwise treat
  // as ambiguous (a real "strict mode violation" hit live).
  return page.getByRole('button', { name: `Expand ${title}`, exact: true })
}

async function trueEventually(check: () => Promise<boolean>) {
  // Matches flowmapPanel.spec.ts's own established timeout for this real,
  // git-tracked demo content (25-zone geometry + spatial-extension
  // network fetch on first use, not the retired synthetic 8-zone fixture
  // the default 5000ms timeout was previously tuned against).
  await expect.poll(check, { timeout: 10000 }).toBe(true)
}

async function waitForRender(page: Page, title: string) {
  const container = panelCard(page, title).locator('.zonemap-chart')
  await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
  return container
}

/** Reads back the current source features (zoneId/value/fillColor) via
 * MapLibre's own public querySourceFeatures() — not a private/internal
 * read, so this stays valid across implementation refactors. Polls
 * rather than a single read: a GeoJSON source's setData() is processed
 * asynchronously by MapLibre's own worker, so querySourceFeatures() can
 * legitimately return empty/stale results for a moment right after the
 * data-update effect's own synchronous setData() call returns.
 *
 * Deduplicated by zoneId — MapLibre's own documented behavior for
 * querySourceFeatures() against a GeoJSON source: "features are not
 * merged across tiles... it's the responsibility of the caller to
 * determine if a feature is duplicated" (confirmed live: a polygon
 * straddling a tile boundary at this test's zoom level came back twice,
 * with identical properties both times). This is purely a test-
 * introspection-API quirk — the panel's own actual rendering is
 * unaffected, since MapLibre paints each tile's copy with the same
 * fillColor regardless. */
async function sourceFeatureProps(page: Page, title: string, expectedCount = 25) {
  const read = async () => {
    const raw = await page.evaluate((t) => {
      const map = window.__zonemapTestMaps![t]
      return map
        .querySourceFeatures('zonemap-zones')
        .map(
          (f) =>
            f.properties as { zoneId: string; value: number | null; fillColor: string; fillHeight: number },
        )
    }, title)
    return Array.from(new Map(raw.map((f) => [f.zoneId, f])).values())
  }
  await expect.poll(async () => (await read()).length).toBe(expectedCount)
  return read()
}

test.describe('User Story 1 - Author renders a zone-level metric as a choropleth', () => {
  test('every zone renders shaded per its joined metric value, with a real resolved fill color', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await expect(container.locator('canvas').first()).toBeVisible()

    expect(await container.getAttribute('data-zone-count')).toBe('25')
    // Real, confirmed: vmt_by_home_taz has data for all 25 real zones in
    // every real scenario, and "excluded" (a metric row with no matching
    // geometry) is structurally impossible in this data model — every
    // real zone-keyed metric is built from the same closed 25-zone
    // universe. Zero of either, not the retired fixture's synthetic 1/1.
    expect(await container.getAttribute('data-no-data-count')).toBe('0')
    expect(await container.getAttribute('data-excluded-count')).toBe('0')

    const features = await sourceFeatureProps(page, ZONEMAP_TITLE, 25)
    expect(features).toHaveLength(25)

    // Cross-check real rendered values against a live query, not a
    // hardcoded expectation — proves the panel's own join/aggregation
    // against real data.
    const rows = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT home_zone_id, CAST(ROUND(total_vmt, 2) AS DOUBLE) AS total_vmt
         FROM "activitysim-baseline__vmt_by_home_taz" ORDER BY home_zone_id`,
      ),
    )
    for (const row of rows) {
      const f = features.find((feat) => feat.zoneId === String(row.home_zone_id))
      expect(f, `expected a rendered feature for TAZ ${row.home_zone_id}`).toBeDefined()
      expect(f!.value).toBeCloseTo(Number(row.total_vmt), 1)
    }

    // Every resolved fillColor must be a real, concrete color — never a
    // leaked-through, unresolved CSS function string (which MapLibre's
    // own paint-property parser cannot evaluate at all). color_ramp:
    // YlOrRd is set on the real panel, so every value resolves through
    // d3-scale-chromatic's own interpolator (an rgb(...) string), not
    // this app's own token-derived color-mix() fallback.
    for (const f of features) {
      expect(f.fillColor).not.toContain('color-mix')
      expect(f.fillColor).not.toContain('var(')
      expect(f.fillColor.length).toBeGreaterThan(0)
    }
  })

  test('the map centers/zooms per the panel config', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    await waitForRender(page, ZONEMAP_TITLE)
    const center = await page.evaluate(
      (t) => window.__zonemapTestMaps![t].getCenter().toArray(),
      ZONEMAP_TITLE,
    )
    expect(center[0]).toBeCloseTo(-122.402, 2)
    expect(center[1]).toBeCloseTo(37.787, 2)
    const zoom = await page.evaluate((t) => window.__zonemapTestMaps![t].getZoom(), ZONEMAP_TITLE)
    expect(zoom).toBeCloseTo(13, 0)
  })

  // 027-map-auto-fit-and-reset (FR-002/FR-003) — this is the SAME panel
  // T007's flowmap regression test relies on being unaffected: ZONEMAP_TITLE
  // has an explicit `center`/`zoom` in its real config ([-122.402, 37.787]
  // / 13, asserted immediately above), so auto-fit's own `config.center ==
  // null && config.zoom == null` guard must never even attempt a fit for
  // it — the test above passing unchanged after this feature's own
  // implementation IS the regression proof (US3); no separate assertion
  // needed here.

  // "Zone Map Tab Default Basemap" (dashboard-8-test.yaml, the "Test" tab)
  // omits center/zoom — the real vehicle for FR-002's own
  // auto-fit-to-geometry behavior. Its real zone geometry
  // (public/demo-geometry/taz25.geoparquet) has a real, confirmed extent
  // (queried live via ST_Extent_Agg): west=-122.42096, south=37.76923,
  // east=-122.38439, north=37.80563 — independent of which zones have
  // matching metric data (vmt_by_home_taz covers all 25 real zones, per
  // this file's own header comment).
  test('auto-fits its initial view to the real loaded zone geometry (no author-configured center/zoom)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const title = 'Zone Map Tab Default Basemap'
    await waitForRender(page, title)

    await page.evaluate(
      (t) =>
        new Promise<void>((resolve) => {
          const map = window.__zonemapTestMaps![t]
          if (!map.isMoving()) return resolve()
          map.once('moveend', () => resolve())
        }),
      title,
    )

    const bounds = await page.evaluate((t) => {
      const b = window.__zonemapTestMaps![t].getBounds()
      return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
    }, title)

    // fitBounds()'s own padding only ever EXPANDS the viewport beyond the
    // raw geometry extent, never contracts it, so the real viewport must
    // be a superset of the real, confirmed geometry bounds.
    expect(bounds.west).toBeLessThanOrEqual(-122.42096)
    expect(bounds.east).toBeGreaterThanOrEqual(-122.38439)
    expect(bounds.south).toBeLessThanOrEqual(37.76923)
    expect(bounds.north).toBeGreaterThanOrEqual(37.80563)

    // Not the static Wasatch Front default (this app's own DEFAULT_CENTER/
    // DEFAULT_ZOOM fallback, unrelated to where the real demo data
    // actually is — MTC prototype_mtc's San Francisco Bay Area zones) —
    // a real, computed fit genuinely happened, not a coincidental no-op.
    const zoom = await page.evaluate((t) => window.__zonemapTestMaps![t].getZoom(), title)
    const center = await page.evaluate((t) => window.__zonemapTestMaps![t].getCenter(), title)
    expect([zoom, center.lng, center.lat]).not.toEqual([9, -111.89, 40.76])
  })

  // FR-004 — "Broken Zone Map Panel (missing metric)" (BROKEN_TITLE)
  // reaches a status/geometryStatus error and renders the shared
  // PanelErrorState with no map/canvas mounted at all (already covered,
  // unchanged, by this file's own pre-existing broken-panel test
  // elsewhere below) — trivially nothing for auto-fit to run against. As
  // with FlowMapPanel.tsx (see that file's own spec.ts comment), the
  // complementary "geometry loads but resolves to zero features, panel
  // still reaches 'ready'" sub-case is covered at the unit level
  // (tests/unit/mapBounds.test.ts's empty-array case) plus direct review
  // of ZoneMapPanel.tsx's own `if (bounds)` guard.

  // 040-test-suite-migration: a real, confirmed design correction. The
  // retired fixture's own "AUTO_DOMAIN_TITLE" panel role (no domain
  // configured, auto-compute) is now served by ZONEMAP_TITLE itself — the
  // real, already-published Network-tab panel has no `domain:` key at
  // all. This test asserts ITS OWN real auto-computed domain (min TAZ 1
  // = 14.14, max TAZ 9 = 1911.40, confirmed live) instead of duplicating
  // a second panel for the identical mechanism. A NEW real panel, "Zone
  // Map Explicit Domain" (same metric/scenario, `domain: [0, 2000]`),
  // covers the OPPOSITE, complementary case — an author-configured
  // domain is honored verbatim, not silently replaced by auto-compute —
  // which the retired fixture's own two-panel split never actually
  // exercised (its own "primary" ZONEMAP_TITLE always had an explicit
  // domain; nothing there proved that domain WINS over auto-compute).
  test('with no domain configured, the color scale auto-computes from the actual min/max of the returned rows', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    expect(await container.getAttribute('data-zone-count')).toBe('25')

    const features = await sourceFeatureProps(page, ZONEMAP_TITLE, 25)
    // TAZ 1 (14.14) is the real, confirmed minimum — at the auto-computed
    // domain's own minimum, its height fraction (the same [0,1] position
    // resolveZoneFillColor's own color math uses internally) must be
    // exactly 0.
    const zone1 = features.find((f) => f.zoneId === '1')
    expect(zone1?.fillHeight).toBeCloseTo(0, 1)
    // TAZ 9 (1911.40) is the real, confirmed maximum — at the domain's
    // own maximum, height fraction 1 (scaled to the panel's own 3000-unit
    // extrusion ceiling).
    const zone9 = features.find((f) => f.zoneId === '9')
    expect(zone9?.fillHeight).toBeCloseTo(3000, 0)
  })

  // 040-test-suite-migration: the complementary "explicit domain wins"
  // case — real, confirmed live: TAZ 1's height fraction is exactly 0
  // under auto-compute (domain min = TAZ 1's own real value, 14.14) but
  // measurably NON-zero (≈21.2, confirmed live) under this panel's own
  // explicit `domain: [0, 2000]` (domain min = 0, genuinely away from
  // TAZ 1's real value) — proving the configured domain was actually
  // used, not silently replaced by auto-compute. fillColor was tried
  // first and found NOT to distinguish these two cases for TAZ 1/TAZ 9
  // specifically (steps: 7 quantizes both panels' own slightly-different
  // raw [0,1] positions into the identical band) — fillHeight is
  // unquantized and is what this test relies on instead.
  test('an explicit domain is honored verbatim, not replaced by auto-compute', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    await waitForRender(page, EXPLICIT_DOMAIN_TITLE)
    const features = await sourceFeatureProps(page, EXPLICIT_DOMAIN_TITLE, 25)
    const zone1 = features.find((f) => f.zoneId === '1')
    expect(zone1?.fillHeight).toBeGreaterThan(15)
    expect(zone1?.fillHeight).toBeLessThan(30)
  })

  test('hovering a zone shows its zone id and value in the shared tooltip', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await sourceFeatureProps(page, ZONEMAP_TITLE, 25) // wait until the fill layer has real, queryable features
    // This panel sits well down the page — must be scrolled into the
    // actual viewport before computing viewport-relative pixel
    // coordinates below, or page.mouse.move() (unlike locator.hover(),
    // which auto-scrolls) targets a point outside the visible viewport
    // entirely (confirmed live: the move silently landed nowhere real,
    // no tooltip ever fired).
    await container.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300) // let MapLibre actually paint a frame before picking

    // Precise pixel targeting via MapLibre's own project() — TAZ 1's
    // real centroid (summarize.yaml's own zone_centroids table,
    // confirmed to sit inside its own real polygon by construction —
    // both are derived from the same real MTC TAZ1454 source) — rather
    // than guessing the container's own bounding-box center is inside
    // SOME filled polygon.
    const point = await page.evaluate((t) => {
      const map = window.__zonemapTestMaps![t]
      const p = map.project([-122.398299, 37.793138])
      const rect = map.getCanvas().getBoundingClientRect()
      return { x: rect.left + p.x, y: rect.top + p.y }
    }, ZONEMAP_TITLE)
    await page.mouse.move(point.x, point.y, { steps: 5 })
    // 015-map-controls-polish — mapTooltip.ts's shared component
    // (.map-tooltip), not MapLibre's own maplibregl.Popup any more.
    const tooltip = container.locator('.map-tooltip')
    await trueEventually(async () => (await tooltip.isVisible()) === true)
    // The real template (ZoneMapPanel.tsx) is
    // `<strong>Zone ${zoneId}</strong><br/>${valueText}` — a bare <br/>
    // produces no text node at all, so toContainText's flattened text
    // directly concatenates the zone id with the immediately-following
    // value ("Zone 114.135266823529602" for TAZ 1, whose real value is
    // 14.135266823529602) with no separator. A substring/word-boundary
    // regex on the flattened text can't distinguish "Zone 1" from "Zone
    // 11"/"Zone 12" this way (found live, not assumed) — asserting
    // against the real, dedicated <strong> element instead is exact and
    // immune to whatever digits happen to follow it.
    await expect(tooltip.locator('strong')).toHaveText('Zone 1')
  })

  test('hovering a zone in 3D/extrusion mode also shows the tooltip — the real bug this feature fixed', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, ZONEMAP_TITLE)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await sourceFeatureProps(page, ZONEMAP_TITLE, 25)
    await container.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)

    // Turn 3D on FIRST — the bug this test guards against: the hover
    // listeners used to be registered against zonemap-fill only, which
    // MapLibre never hit-tests once it's hidden (`visibility: 'none'`)
    // in 3D mode, so hover silently never fired at all.
    const toggle = card.getByRole('button', { name: 'Toggle 3D extrusion' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await trueEventually(async () => {
      const vis = await page.evaluate(
        (t) => window.__zonemapTestMaps![t].getLayoutProperty('zonemap-extrusion', 'visibility'),
        ZONEMAP_TITLE,
      )
      return vis === 'visible'
    })
    // The tilt itself is an animated easeTo() — project() below must be
    // computed against the CAMERA'S FINAL settled pitch, not a mid-
    // animation one, or the projected screen point drifts away from the
    // real target by the time the mouse actually arrives there (found
    // live: an unsettled camera projected TAZ 9's centroid onto TAZ 20's
    // screen position instead).
    await trueEventually(async () => {
      const pitch = await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), ZONEMAP_TITLE)
      return pitch > 30
    })

    // A real, live-confirmed finding this session: under a real ~45°
    // tilt, a ground-level centroid's projected screen point no longer
    // reliably lands on THAT zone's own rendered extrusion top — the top
    // surface visually shifts away from its ground footprint, by an
    // amount that grows with both the zone's own height and its distance
    // from the viewport's projection center. Neither TAZ 1 (real height
    // exactly 0 — this project's own established 013-zonemap-panel/016
    // finding that a zero-height extrusion isn't reliably pickable at
    // all), TAZ 9 (real height maximum, but off-center — confirmed to
    // resolve to TAZ 20's top surface instead), nor TAZ 12 (near-center,
    // but still confirmed to resolve to TAZ 21's) survived live
    // verification. Rather than keep guessing which single zone's
    // geometry/height combination happens to survive this real
    // projection displacement, this test queries MapLibre's own
    // queryRenderedFeatures() at the exact candidate pixel FIRST to learn
    // which zone is actually topmost there post-tilt, then hovers that
    // same point and asserts the tooltip agrees — proving the real bug
    // this test guards against (hover never fired at all once
    // zonemap-fill was hidden in 3D mode) without depending on which
    // specific zone the perspective math happens to land on.
    const point = await page.evaluate((t) => {
      const map = window.__zonemapTestMaps![t]
      const p = map.project([-122.401971, 37.786278]) // TAZ 12's centroid, near this panel's own configured center
      const rect = map.getCanvas().getBoundingClientRect()
      return { x: rect.left + p.x, y: rect.top + p.y }
    }, ZONEMAP_TITLE)
    const expectedZoneId = await page.evaluate(
      ({ t, x, y }) => {
        const map = window.__zonemapTestMaps![t]
        const rect = map.getCanvas().getBoundingClientRect()
        const features = map.queryRenderedFeatures([x - rect.left, y - rect.top], {
          layers: ['zonemap-extrusion'],
        })
        return (features[0]?.properties as { zoneId?: string } | undefined)?.zoneId
      },
      { t: ZONEMAP_TITLE, x: point.x, y: point.y },
    )
    expect(expectedZoneId, 'expected a real extrusion feature under the candidate pixel').toBeTruthy()
    await page.mouse.move(point.x, point.y, { steps: 5 })
    const tooltip = container.locator('.map-tooltip')
    await trueEventually(async () => (await tooltip.isVisible()) === true)
    // See the hover test above for why this asserts the dedicated
    // <strong> element rather than a flattened-text regex.
    await expect(tooltip.locator('strong')).toHaveText(`Zone ${expectedZoneId}`)
  })

  // 040-test-suite-migration: a real, confirmed structural finding, not
  // merely "untriggered today" — every real zone-keyed metric in
  // summarize.yaml (vmt_by_home_taz.home_zone_id,
  // trips_by_destination_zone.destination_zone_id,
  // land_use_summary.zone_id) is built from the exact same closed
  // 25-zone universe (confirmed live: every one queries out to exactly
  // {1..25}, never anything else), so a metric row referencing a zone
  // with no matching real geometry can never occur. The retired
  // fixture's own dedicated "excluded" test is retired outright, not
  // worked around — its "no-data" half is covered separately below,
  // against a real metric that DOES have one (`trips_by_destination_zone`
  // filtered to `school`, real TAZ 14).
  test('a zone with no matching metric row under a real filter shows the no-data treatment', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const container = await waitForRender(page, NO_DATA_TITLE)
    expect(await container.getAttribute('data-zone-count')).toBe('25')
    expect(await container.getAttribute('data-no-data-count')).toBe('1')
    expect(await container.getAttribute('data-excluded-count')).toBe('0')

    const features = await sourceFeatureProps(page, NO_DATA_TITLE, 25)
    // TAZ 14 (real, confirmed: zero destination trips under `school`) IS
    // rendered, with a null value — a real no-data zone, not a fabricated
    // one.
    const zone14 = features.find((f) => f.zoneId === '14')
    expect(zone14).toBeDefined()
    // MapLibre's GeoJSON source encodes feature properties through a
    // vector-tile-like internal representation that has no `null` value
    // type — a `null` property survives to querySourceFeatures() as a
    // MISSING key (`undefined`), not literal `null` (confirmed live).
    // The panel's own hover handler already treats both the same way
    // (`value === null || value === undefined`); this check does too.
    expect(zone14?.value == null).toBe(true)
    // Every other real zone genuinely has data under this real filter.
    const withData = features.filter((f) => f.zoneId !== '14')
    expect(withData).toHaveLength(24)
    for (const f of withData) expect(f.value == null).toBe(false)
  })
})

// 040-test-suite-migration: this file's own "User Story 2" originally
// opened with "changing the global filter re-colors the choropleth..." —
// deleted. Zero real zonemap content anywhere binds to a global sidebar
// filter (confirmed live: a `$filters.purpose`-bound panel throws
// "unresolved placeholder" — no real UI control ever calls
// filterState.set('purpose', ...) to give it an initial value), matching
// this migration's own established convention elsewhere in this suite
// (dashboardShell.spec.ts/panelExpand.spec.ts/flowmapPanel.spec.ts) for a
// case with no real content to exercise it.
test.describe('User Story 2 - Resize and basemap inheritance', () => {
  test('a zonemap panel with no basemap: picks up the tab default; a panel-level override wins', async ({
    page,
  }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    await gotoTestTab(page)
    await waitForRender(page, 'Zone Map Tab Default Basemap')
    await waitForRender(page, 'Zone Map Panel Basemap Override')

    // dashboard-8-test.yaml's own trailing `default_basemap: carto-positron`
    // applies to the panel with no basemap: of its own; the other panel's
    // explicit `basemap: openfreemap-positron` wins over it.
    await trueEventually(async () => requestUrls.some((u) => u.includes('positron-gl-style')))
    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/positron')))
  })

  test('an unreachable basemap still renders the choropleth', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const title = 'Zone Map Unreachable Basemap'
    const container = await waitForRender(page, title)
    await page.waitForTimeout(1000) // the failed fetch/error event needs a moment to resolve

    expect(await container.getAttribute('data-zone-count')).toBe('25')
    const style = await page.evaluate((t) => window.__zonemapTestMaps![t].getStyle(), title)
    expect(Object.keys(style?.sources ?? {}).filter((s) => s !== 'zonemap-zones')).toHaveLength(0) // BLANK_STYLE has no other sources
    const hasLayer = await page.evaluate(
      (t) => window.__zonemapTestMaps![t].getLayer('zonemap-fill') !== undefined,
      title,
    )
    expect(hasLayer).toBe(true)
  })

  test('expanding via 004 resizes the map correctly with no re-fetch; collapsing returns it to card size', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    const renderCountBefore = await container.getAttribute('data-render-count')
    const canvasBefore = await container.locator('canvas').first().boundingBox()

    await expandTrigger(page, ZONEMAP_TITLE).click()
    // Read from the dialog's own copy, not panelCard(page, ZONEMAP_TITLE)
    // — 004's portal mechanism physically relocates the panel's content
    // into the dialog, which makes the original panelCard() locator
    // ambiguous/stale for the content itself once expanded (confirmed
    // live: flowmapPanel.spec.ts's own precedent for this exact
    // scenario already reads from page.getByRole('dialog') post-expand,
    // never panelCard() again until after collapse).
    const dialog = page.getByRole('dialog')
    const dialogContainer = dialog.locator('.zonemap-chart')
    const dialogCanvas = dialogContainer.locator('canvas').first()
    await expect(dialogCanvas).toBeVisible()
    const canvasExpanded = await dialogCanvas.boundingBox()
    expect(canvasExpanded!.width).toBeGreaterThan(canvasBefore!.width)
    expect(await dialogContainer.getAttribute('data-render-count')).toBe(renderCountBefore)

    await page.keyboard.press('Escape')
    const container2 = panelCard(page, ZONEMAP_TITLE).locator('.zonemap-chart')
    await expect(container2.locator('canvas').first()).toBeVisible()
    const canvasAfter = await container2.locator('canvas').first().boundingBox()
    expect(canvasAfter!.width).toBeCloseTo(canvasBefore!.width, 0)
  })

  test('a plain browser window resize also resizes the map canvas', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    const canvas = container.locator('canvas').first()
    await expect(canvas).toBeVisible()

    // Mirrors flowmapPanel.spec.ts's own precedent exactly: check the
    // CANVAS ELEMENT's own backing-store width (`el.width`, a real
    // resolution change ResizeObserver->map.resize() drives), not
    // boundingBox() — a CSS layout box can legitimately stay the same
    // width even after a viewport resize, depending on the surrounding
    // grid/flex layout, which boundingBox() alone can't distinguish from
    // "resize handling didn't fire."
    const widthBefore = await canvas.evaluate((el: HTMLCanvasElement) => el.width)
    const currentSize = page.viewportSize()!
    await page.setViewportSize({ width: Math.max(currentSize.width - 400, 640), height: currentSize.height })

    await trueEventually(async () => {
      const widthAfter = await canvas.evaluate((el: HTMLCanvasElement) => el.width)
      return widthAfter !== widthBefore
    })
    await page.setViewportSize(currentSize)
  })

  test('a basemap setStyle() switch leaves the choropleth layer present and correctly colored', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    const zoneCountBefore = await container.getAttribute('data-zone-count')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await trueEventually(async () => {
      const hasLayer = await page.evaluate(
        (t) => window.__zonemapTestMaps![t].getLayer('zonemap-fill') !== undefined,
        ZONEMAP_TITLE,
      )
      return hasLayer
    })
    await page.waitForTimeout(500)

    const hasLayer = await page.evaluate(
      (t) => window.__zonemapTestMaps![t].getLayer('zonemap-fill') !== undefined,
      ZONEMAP_TITLE,
    )
    expect(hasLayer).toBe(true)
    expect(await container.getAttribute('data-zone-count')).toBe(zoneCountBefore)
    const features = await sourceFeatureProps(page, ZONEMAP_TITLE)
    expect(features.every((f) => f.fillColor.length > 0)).toBe(true)
  })
})

test.describe('User Story 3 - Color scale precision and comparison: diff', () => {
  test('comparison: diff computes and renders the correct per-zone diff on a diverging scale', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const container = await waitForRender(page, DIFF_TITLE)
    const features = await sourceFeatureProps(page, DIFF_TITLE)

    // activitysim-density-variant - activitysim-baseline total_vmt, per home zone (live-verified):
    // TAZ 22 = -6.584722843246709, TAZ 8 = +19.763957990319568.
    const zone22 = features.find((f) => f.zoneId === '22')
    const zone8 = features.find((f) => f.zoneId === '8')
    expect(zone22?.value).toBeCloseTo(-6.584722843246709, 6)
    expect(zone8?.value).toBeCloseTo(19.763957990319568, 6)
    expect(await container.getAttribute('data-zone-count')).toBe('25')
  })

  test('an unresolvable comparison: diff scenario pair shows the shared error state', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    await expect(panelCard(page, DIFF_UNRESOLVABLE_TITLE).getByRole('alert')).toBeVisible()
  })
})

// 019-baseline-diff-consumption, User Story 1 (T019) and User Story 4
// (T028) — the '$baseline' sentinel case, reusing this file's own real
// activitysim-baseline/activitysim-density-variant demo scenarios.
// activitysim-baseline is automatically baseline the moment it registers
// ready (018's own automatic-default rule: earliest-registered, non-pinned,
// ready scenario — the demo root has no pinned scenario at all, and
// activitysim-baseline is listed first in
// public/demo-scenarios/index.json) — so this panel's own a:
// activitysim-baseline, b: '$baseline' initially renders with a === b,
// every diff_value trivially 0, BEFORE the test ever calls setBaseline()
// itself. Explicitly setting baseline to activitysim-density-variant
// afterward is what actually exercises the sentinel resolving to a
// DIFFERENT scenario, and directly proves FR-016's reactivity requirement
// (User Story 1 Acceptance Scenario 2: recompute on a live baseline change,
// no reload) — not just the resolver's own logic in isolation (already
// unit-tested).
test.describe('019-baseline-diff-consumption', () => {
  test('$baseline resolves to whichever scenario is currently baseline, and recomputes reactively on change (US1)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const container = await waitForRender(page, DIFF_BASELINE_TITLE)

    // Initial state: automatic default (activitysim-baseline) on both
    // sides — every zone's diff is trivially 0.
    await trueEventually(async () => {
      const features = await sourceFeatureProps(page, DIFF_BASELINE_TITLE)
      const zone1 = features.find((f) => f.zoneId === '1')
      return zone1?.value === 0
    })

    // Explicitly mark activitysim-density-variant as baseline — expr is
    // a.total_vmt - b.total_vmt with a fixed at activitysim-baseline, so
    // this flips the sign of the density-vs-baseline diff already
    // hand-verified for the hardcoded-name DIFF_TITLE panel above:
    // TAZ 1: baseline(14.135266823529602) - density(14.749029237036195)
    //   = -0.6137624135065938
    // TAZ 22: baseline(402.9677787593758) - density(396.3830559161291)
    //   = 6.584722843246709
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-density-variant'))

    await trueEventually(async () => {
      const features = await sourceFeatureProps(page, DIFF_BASELINE_TITLE)
      const zone1 = features.find((f) => f.zoneId === '1')
      return Math.abs((zone1?.value ?? NaN) - -0.6137624135065938) < 1e-6
    })
    const features = await sourceFeatureProps(page, DIFF_BASELINE_TITLE)
    const zone22 = features.find((f) => f.zoneId === '22')
    expect(zone22?.value).toBeCloseTo(6.584722843246709, 6)
    await expect(container).toBeVisible()
  })

  // User Story 4 (unresolved baseline -> error -> automatic recovery) is
  // covered in tests/integration/tablePanel.spec.ts's own
  // 019-baseline-diff-consumption block instead — this test's first draft
  // here mistakenly reused waitForRender() (this file's OWN
  // zonemap-specific .zonemap-chart-container helper) against a `table`
  // panel title, which can never resolve; fixed by not duplicating the
  // check here at all, since tablePanel.spec.ts's own version already
  // exercises the identical FR-011/FR-016 behavior correctly, panelCard()
  // and getByRole('columnheader') scoped to that panel type properly.
})

// Attribution control — same MapLibre built-in attributionControl:
// { compact: true } option ZoneMapPanel.tsx's own mount effect now sets,
// same real, confirmed behavior flowmapPanel.spec.ts's own coverage
// documents in full: the compact badge starts in its SHOWN sub-state (full
// text visible) the first time it has a non-empty attribution, not
// collapsed-to-icon on the very first paint — genuine MapLibre library
// behavior (traced in AttributionControl's own _updateAttributions()/
// _updateCompact()), not specific to either panel type. Still a real,
// materially more compact treatment than the prior default (a spanning
// full-width bar with no icon/toggle at all), and the toggle button
// genuinely collapses/expands it on click — verified below the same way.
test.describe('Attribution control renders MapLibre\'s compact form and the toggle genuinely shows/hides text', () => {
  test('the compact badge renders, and clicking its button actually collapses/expands the real attribution text', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await trueEventually(async () => (await container.locator('.maplibregl-ctrl-attrib').count()) === 1)

    const attrib = container.locator('.maplibregl-ctrl-attrib')
    const button = attrib.locator('.maplibregl-ctrl-attrib-button')
    const inner = attrib.locator('.maplibregl-ctrl-attrib-inner')

    await expect(attrib).toHaveClass(/maplibregl-compact\b/) // compact badge, not the old full-width bar
    await expect(button).toBeVisible()
    await expect(inner).toContainText('OpenStreetMap') // real attribution text, not a placeholder

    const wasVisible = await inner.isVisible()
    await button.click()
    await expect(inner).toBeVisible({ visible: !wasVisible })

    await button.click()
    await expect(inner).toBeVisible({ visible: wasVisible })
    if (wasVisible) await expect(inner).toContainText('OpenStreetMap')
  })

  test('the compact control survives a real basemap setStyle() switch and 004\'s DOM relocation', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await trueEventually(async () => (await container.locator('.maplibregl-ctrl-attrib').count()) === 1)

    // A real setStyle() call (theme flip) — controls are a Map-owned DOM
    // overlay independent of the style document, unaffected by it.
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(1000)
    await expect(container.locator('.maplibregl-ctrl-attrib')).toHaveCount(1)
    await expect(container.locator('.maplibregl-ctrl-attrib-button')).toBeVisible()

    // 004's expand-to-dialog relocation.
    await expandTrigger(page, ZONEMAP_TITLE).click()
    const dialog = page.getByRole('dialog')
    const dialogAttrib = dialog.locator('.zonemap-chart .maplibregl-ctrl-attrib')
    await expect(dialogAttrib).toHaveCount(1)
    const dialogButton = dialogAttrib.locator('.maplibregl-ctrl-attrib-button')
    const dialogInner = dialogAttrib.locator('.maplibregl-ctrl-attrib-inner')
    await expect(dialogButton).toBeVisible()

    const wasVisibleInDialog = await dialogInner.isVisible()
    await dialogButton.click()
    await expect(dialogInner).toBeVisible({ visible: !wasVisibleInDialog })

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(panelCard(page, ZONEMAP_TITLE).locator('.zonemap-chart .maplibregl-ctrl-attrib')).toHaveCount(1)
  })
})

// 014-map-navigation-controls — same MapLibre built-in NavigationControl
// FlowMapPanel.tsx's own mount effect now adds (flowmapPanel.spec.ts's own
// coverage documents the real resetNorthPitch()-on-compass-click behavior
// in full) — this only re-verifies it actually works on THIS panel type
// too, not the mechanism itself again.
test.describe('014-map-navigation-controls — NavigationControl zoom/compass genuinely move the camera', () => {
  test('zoom in/out buttons change map.getZoom(); the compass resets bearing AND pitch together', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)

    const zoomInBtn = container.getByTitle('Zoom in')
    const zoomOutBtn = container.getByTitle('Zoom out')
    const compassBtn = container.getByTitle('Reset bearing to north')
    await expect(zoomInBtn).toBeVisible()
    await expect(zoomOutBtn).toBeVisible()
    await expect(compassBtn).toBeVisible()

    const getZoom = () => page.evaluate((t) => window.__zonemapTestMaps![t].getZoom(), ZONEMAP_TITLE)
    const zoomBefore = await getZoom()
    await zoomInBtn.click()
    await trueEventually(async () => (await getZoom()) > zoomBefore)
    const zoomAfterIn = await getZoom()

    await zoomOutBtn.click()
    await trueEventually(async () => (await getZoom()) < zoomAfterIn)

    await page.evaluate((t) => window.__zonemapTestMaps![t].jumpTo({ bearing: 45, pitch: 30 }), ZONEMAP_TITLE)
    expect(
      await page.evaluate((t) => window.__zonemapTestMaps![t].getBearing(), ZONEMAP_TITLE),
    ).toBeCloseTo(45, 0)
    expect(
      await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), ZONEMAP_TITLE),
    ).toBeCloseTo(30, 0)

    await compassBtn.click()
    await trueEventually(async () => {
      const bearing = await page.evaluate((t) => window.__zonemapTestMaps![t].getBearing(), ZONEMAP_TITLE)
      const pitch = await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), ZONEMAP_TITLE)
      return Math.abs(bearing) < 0.5 && Math.abs(pitch) < 0.5
    })
  })

  // Real bug found live (015-theme-toggle), same root cause and fix as
  // the 3D-toggle regression test below: MapLibre's own NavigationControl
  // rendered with a hardcoded white group background and fixed dark-gray
  // icons regardless of app theme. Asserts real getComputedStyle() output.
  test('NavigationControl matches the app theme in dark mode — dark group background, inverted icon, real divider color', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    const zoomIn = container.locator('.maplibregl-ctrl-zoom-in')
    const zoomOut = container.locator('.maplibregl-ctrl-zoom-out')
    await expect(zoomIn).toBeVisible()

    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const styles = await zoomIn.evaluate((el) => {
      const group = el.closest('.maplibregl-ctrl-group') as HTMLElement
      const icon = el.querySelector('.maplibregl-ctrl-icon') as HTMLElement
      return { groupBg: getComputedStyle(group).backgroundColor, iconFilter: getComputedStyle(icon).filter }
    })
    // 033-shadcn-default-theme: dark --card is now #171717, not the old
    // WFRC-brand value (which happened to also equal old --background).
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

// 014-map-navigation-controls — the 3D fill-extrusion toggle. ZoneMapPanel
// ONLY — FlowMapPanel deliberately has no equivalent (research this
// session: no line/flow-type visualization technique, in SimWrapper's own
// real flow/network rendering paths or anywhere else referenced by this
// project, ever encodes magnitude as height; flow magnitude stays
// strictly 2D, via color/width only). Real MapLibre fill-extrusion layer
// (zonemap-extrusion, ZoneMapPanel.tsx), not a mock/placeholder — toggled
// via `visibility`, never removed/re-added (a layer's `type` is immutable
// once added).
test.describe('014-map-navigation-controls — the 3D fill-extrusion toggle', () => {
  test('toggling on switches to the extrusion layer with height driven by the same value as color, and tilts the camera; toggling off restores flat + pitch 0, together', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, ZONEMAP_TITLE)
    await waitForRender(page, ZONEMAP_TITLE)
    await sourceFeatureProps(page, ZONEMAP_TITLE) // wait until the source has real, queryable features

    const toggle = card.getByRole('button', { name: 'Toggle 3D extrusion' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    const layerVisibility = (layerId: string) =>
      page.evaluate(
        ({ title, id }) => window.__zonemapTestMaps![title].getLayoutProperty(id, 'visibility'),
        { title: ZONEMAP_TITLE, id: layerId },
      )
    const getPitch = () => page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), ZONEMAP_TITLE)

    // Flat, before toggling — the mount effect's own initial state
    // (zonemap-fill has no explicit layout.visibility set at all, which
    // MapLibre treats as visible — only "not 'none'" is the correct
    // check; zonemap-extrusion is explicitly added hidden).
    expect(await layerVisibility('zonemap-fill')).not.toBe('none')
    expect(await layerVisibility('zonemap-extrusion')).toBe('none')
    expect(await getPitch()).toBeCloseTo(0, 0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await trueEventually(async () => (await layerVisibility('zonemap-extrusion')) === 'visible')
    expect(await layerVisibility('zonemap-fill')).toBe('none')
    // The tilt is animated (map.easeTo) — poll for it to actually settle
    // rather than reading immediately after the click.
    await trueEventually(async () => (await getPitch()) > 30)

    // fill-extrusion-height is data-driven from the SAME value already
    // driving fill-color (resolveZoneHeightFraction, zonemapColor.ts).
    // ZONEMAP_TITLE has no explicit domain, so it auto-computes from the
    // real data's own min/max (User Story 1's own coverage above): TAZ 1
    // sits at the real minimum (total_vmt=14.14) and its height fraction
    // is therefore ~0; TAZ 9 sits at the real maximum (total_vmt=1911.40)
    // and has real, substantial positive height (~3000, already
    // established by the auto-domain test above) — proving this isn't
    // just a flat, unconditional extrusion.
    const featureHeights = await page.evaluate((t) => {
      const map = window.__zonemapTestMaps![t]
      const raw = map.querySourceFeatures('zonemap-zones')
      const byZone = new Map<string, number>()
      for (const f of raw) {
        const props = f.properties as { zoneId: string; fillHeight: number }
        byZone.set(props.zoneId, props.fillHeight)
      }
      return Array.from(byZone.entries())
    }, ZONEMAP_TITLE)
    const heightByZone = new Map(featureHeights)
    expect(heightByZone.get('1')).toBeCloseTo(0, 1)
    const nonZeroHeight = featureHeights.find(([zoneId, h]) => zoneId !== '1' && h > 0)
    expect(nonZeroHeight, 'expected at least one zone with real positive extrusion height').toBeDefined()

    // Toggling off restores BOTH the flat fill AND pitch: 0, as one
    // action — a top-down view of the now-flat fill layer, not a
    // dangling tilted camera over a layer with no visible sides left.
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await trueEventually(async () => (await layerVisibility('zonemap-fill')) !== 'none')
    expect(await layerVisibility('zonemap-extrusion')).toBe('none')
    await trueEventually(async () => (await getPitch()) < 5)
  })

  test('the 3D toggle survives a real basemap setStyle() switch and 004\'s DOM relocation', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, ZONEMAP_TITLE)
    await waitForRender(page, ZONEMAP_TITLE)
    await sourceFeatureProps(page, ZONEMAP_TITLE)

    const toggle = card.getByRole('button', { name: 'Toggle 3D extrusion' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await trueEventually(async () => {
      const vis = await page.evaluate(
        (t) => window.__zonemapTestMaps![t].getLayoutProperty('zonemap-extrusion', 'visibility'),
        ZONEMAP_TITLE,
      )
      return vis === 'visible'
    })

    // A real setStyle() call — zonemap-extrusion is carried forward by
    // the SAME transformStyle preservation mechanism zonemap-fill
    // already relies on (research.md §9 — "future app-added custom
    // layer," now genuinely two of them).
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(1000)
    const stillExtruded = await page.evaluate(
      (t) => window.__zonemapTestMaps![t].getLayoutProperty('zonemap-extrusion', 'visibility'),
      ZONEMAP_TITLE,
    )
    expect(stillExtruded).toBe('visible')

    // 004's expand-to-dialog relocation — the toggle button itself is a
    // React-rendered sibling of the map container, relocated by the same
    // portal mechanism as everything else in this panel.
    await expandTrigger(page, ZONEMAP_TITLE).click()
    const dialogToggle = page.getByRole('dialog').getByRole('button', { name: 'Toggle 3D extrusion' })
    await expect(dialogToggle).toBeVisible()
    await expect(dialogToggle).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(card.getByRole('button', { name: 'Toggle 3D extrusion' })).toHaveAttribute('aria-pressed', 'true')
  })

  // Real bug found live (015-theme-toggle, once a real dark-mode trigger
  // existed to actually look at it): the toggle's own text color DID
  // correctly resolve to var(--foreground) in dark mode, but its
  // .wftdm-3d-toggle-group container's background stayed MapLibre's own
  // hardcoded #fff (a tied-specificity cascade loss against
  // .maplibregl-ctrl-group{background:#fff} — mapControls.css) — white
  // text on a white background, illegible. The existing dark-mode test
  // above only ever asserted aria-pressed/layer-visibility (functional
  // survival), never actual computed color, so this slipped through
  // undetected. Asserts real getComputedStyle() output, not just that a
  // CSS custom property was passed somewhere.
  test('the 3D toggle button text stays legible against its own group background in dark mode', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, ZONEMAP_TITLE)
    await waitForRender(page, ZONEMAP_TITLE)
    const toggle = card.getByRole('button', { name: 'Toggle 3D extrusion' })
    await expect(toggle).toBeVisible()

    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const styles = await toggle.evaluate((el) => {
      const group = el.closest('.wftdm-3d-toggle-group') as HTMLElement
      return {
        text: getComputedStyle(el).color,
        groupBg: getComputedStyle(group).backgroundColor,
      }
    })
    // The real, dark-mode token values (tokens.css .dark block) — light
    // text (--foreground) on the dark --card group background, not
    // MapLibre's own hardcoded white staying stuck underneath it.
    // 033-shadcn-default-theme: --foreground dark is now #fafafa and
    // --card dark is now #171717 — no longer the old WFRC-brand values
    // (which happened to share one literal for --card/--background).
    expect(styles.text).toBe('rgb(250, 250, 250)')
    expect(styles.groupBg).toBe('rgb(23, 23, 23)')
  })
})

// 027-map-auto-fit-and-reset, User Story 4 — the shared reset-to-view
// control, same corner cluster as NavigationControl/ThreeDToggleControl.
test.describe('027-map-auto-fit-and-reset — User Story 4: reset-to-view control', () => {
  test('returns the camera to the auto-fitted geometry extent, with 3D turned back off, after a manual pan/tilt', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const title = 'Zone Map Tab Default Basemap'
    const card = panelCard(page, title)
    await waitForRender(page, title)

    await page.evaluate(
      (t) =>
        new Promise<void>((resolve) => {
          const map = window.__zonemapTestMaps![t]
          if (!map.isMoving()) return resolve()
          map.once('moveend', () => resolve())
        }),
      title,
    )
    const resetBtn = card.locator('.zonemap-chart').getByTitle('Zoom to extents')
    await expect(resetBtn).toBeEnabled()

    const fittedView = await page.evaluate((t) => {
      const m = window.__zonemapTestMaps![t]
      return { center: m.getCenter(), zoom: m.getZoom() }
    }, title)

    // Toggle 3D on, THEN wait for the tilt's own easeTo() to actually
    // start moving pitch, THEN pan away — a real, confirmed root cause
    // found live this session (reproduced directly, pre-existing in this
    // test's own unmodified logic before this migration too, not
    // introduced by it): jumpTo() calls MapLibre's internal _stop(),
    // which cancels ANY in-flight camera animation — including the
    // toggle's own pitch easeTo() — before applying its own
    // center/zoom. Calling jumpTo() immediately after the click (this
    // test's original ordering) raced that animation's very first
    // rendered frame: when the easeTo() hadn't ticked even once yet,
    // jumpTo()'s _stop() cancelled it while pitch was still exactly 0,
    // permanently — not a slow-animation timing issue, a genuine
    // animation-cancellation race. Waiting for pitch > 0 BEFORE calling
    // jumpTo() (rather than after, as the original ordering did)
    // eliminates the race: by the time jumpTo() runs, the tilt is
    // already underway and jumpTo() never touches pitch itself, so it
    // survives untouched.
    await card.getByRole('button', { name: 'Toggle 3D extrusion' }).click()
    await trueEventually(async () => {
      const pitch = await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), title)
      return pitch > 0
    })
    await page.evaluate((t) => window.__zonemapTestMaps![t].jumpTo({ center: [-100, 45], zoom: 3 }), title)
    expect(await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), title)).toBeGreaterThan(0)

    await resetBtn.click()
    await trueEventually(async () => {
      const m = await page.evaluate((t) => {
        const map = window.__zonemapTestMaps![t]
        return { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch() }
      }, title)
      return (
        Math.abs(m.center.lng - fittedView.center.lng) < 0.01 &&
        Math.abs(m.center.lat - fittedView.center.lat) < 0.01 &&
        Math.abs(m.zoom - fittedView.zoom) < 0.1 &&
        Math.abs(m.pitch) < 0.5
      )
    })
    await expect(card.getByRole('button', { name: 'Toggle 3D extrusion' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('for an author-configured panel, returns exactly to the configured center/zoom, with 3D back off, after a manual pan/tilt', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const card = panelCard(page, ZONEMAP_TITLE)
    await waitForRender(page, ZONEMAP_TITLE)
    const resetBtn = card.locator('.zonemap-chart').getByTitle('Zoom to extents')
    // No auto-fit animation to wait out — captured synchronously at mount.
    await expect(resetBtn).toBeEnabled()

    // Wait for the tilt's own easeTo() to actually start moving pitch
    // BEFORE calling jumpTo() — see the reset test above (same describe
    // block) for the real, confirmed animation-cancellation race this
    // ordering avoids (jumpTo() internally cancels any in-flight camera
    // animation, including this one, before it ever renders a frame).
    await card.getByRole('button', { name: 'Toggle 3D extrusion' }).click()
    await trueEventually(async () => {
      const pitch = await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), ZONEMAP_TITLE)
      return pitch > 0
    })
    await page.evaluate((t) => window.__zonemapTestMaps![t].jumpTo({ center: [-100, 45], zoom: 3 }), ZONEMAP_TITLE)

    await resetBtn.click()
    await trueEventually(async () => {
      const center = await page.evaluate((t) => window.__zonemapTestMaps![t].getCenter(), ZONEMAP_TITLE)
      const zoom = await page.evaluate((t) => window.__zonemapTestMaps![t].getZoom(), ZONEMAP_TITLE)
      const pitch = await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), ZONEMAP_TITLE)
      // ZONEMAP_TITLE's real, configured center/zoom (Network tab panel).
      return (
        Math.abs(center.lng - -122.402) < 0.01 &&
        Math.abs(center.lat - 37.787) < 0.01 &&
        Math.abs(zoom - 13) < 0.1 &&
        Math.abs(pitch) < 0.5
      )
    })
    await expect(card.getByRole('button', { name: 'Toggle 3D extrusion' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

// 027-map-auto-fit-and-reset (FR-006/SC-004) — same guarantee
// flowmapPanel.spec.ts's own matching test proves for that panel type.
test.describe('027-map-auto-fit-and-reset — Polish: no re-trigger after a manual pan', () => {
  test('a manual pan survives 004 expand/collapse and a basemap switch', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const title = 'Zone Map Tab Default Basemap'
    await waitForRender(page, title)
    await page.evaluate(
      (t) =>
        new Promise<void>((resolve) => {
          const map = window.__zonemapTestMaps![t]
          if (!map.isMoving()) return resolve()
          map.once('moveend', () => resolve())
        }),
      title,
    )

    await page.evaluate((t) => window.__zonemapTestMaps![t].jumpTo({ center: [-105, 42], zoom: 5 }), title)
    const getView = () =>
      page.evaluate((t) => {
        const m = window.__zonemapTestMaps![t]
        return { center: m.getCenter(), zoom: m.getZoom() }
      }, title)
    const pannedView = await getView()

    // (a) 004 expand/collapse.
    await expandTrigger(page, title).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.zonemap-chart canvas').first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    let view = await getView()
    expect(view.center.lng).toBeCloseTo(pannedView.center.lng, 3)
    expect(view.center.lat).toBeCloseTo(pannedView.center.lat, 3)
    expect(view.zoom).toBeCloseTo(pannedView.zoom, 3)

    // (b) a basemap switch (this real Test-tab panel has no `filter:`
    // config and no demo panel anywhere uses the dynamic `$filters.`
    // placeholder — confirmed via grep, matching
    // flowmapPanel.spec.ts's own identical real-content finding and its
    // matching removal of the filter-reload sub-case from this same
    // Polish test).
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await page.getByRole('radiogroup', { name: 'OpenFreeMap' }).getByRole('radio', { name: 'Liberty' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await page.waitForTimeout(500)
    view = await getView()
    expect(view.center.lng).toBeCloseTo(pannedView.center.lng, 3)
    expect(view.center.lat).toBeCloseTo(pannedView.center.lat, 3)
    expect(view.zoom).toBeCloseTo(pannedView.zoom, 3)
  })
})

test.describe('User Story 4 - Registry consistency', () => {
  test('expanding a zonemap panel shows the same data, not re-fetched', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    const zoneCountBefore = await container.getAttribute('data-zone-count')
    await expandTrigger(page, ZONEMAP_TITLE).click()
    await expect(page.getByRole('dialog').locator('.zonemap-chart canvas').first()).toBeVisible()
    expect(
      await page.getByRole('dialog').locator('.zonemap-chart').getAttribute('data-zone-count'),
    ).toBe(zoneCountBefore)
  })

  test('a broken zonemap panel config shows the shared error state, not an unhandled exception', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    await expect(panelCard(page, BROKEN_TITLE).getByRole('alert')).toBeVisible()
  })

  test('multiple zonemap panels sharing one boundaries file trigger exactly one geometry query', async ({
    page,
  }) => {
    await boot(page)
    // ZONEMAP_TITLE (Network tab) plus several Test-tab panels all
    // reference the same real taz25.geoparquet boundaries file — confirm
    // the cache (research.md §4, zoneGeometry.ts's module-level cache) is
    // shared across BOTH tabs, not just within one, since it's keyed
    // purely by boundaries filename, independent of which tab renders it.
    await gotoNetworkTab(page)
    await waitForRender(page, ZONEMAP_TITLE)
    await gotoTestTab(page)
    await waitForRender(page, EXPLICIT_DOMAIN_TITLE)
    await waitForRender(page, DIFF_TITLE)
    const geometryQueryCount = await page.evaluate(
      () => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes('ST_AsGeoJSON')).length,
    )
    expect(geometryQueryCount).toBe(1)
  })

  test('the spatial extension is installed/loaded exactly once per session', async ({ page }) => {
    await boot(page)
    await gotoNetworkTab(page)
    await waitForRender(page, ZONEMAP_TITLE)
    const installLoadCount = await page.evaluate(
      () =>
        window.__wftdm!.__debugQueryLog().filter((sql) => sql === 'INSTALL spatial' || sql === 'LOAD spatial')
          .length,
    )
    expect(installLoadCount).toBe(2) // one INSTALL, one LOAD — never repeated
  })
})
