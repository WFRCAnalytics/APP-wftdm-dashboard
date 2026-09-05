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
// flowmapPanel.spec.ts's own pattern (real DuckDB-WASM, fixture
// Parquet+GeoParquet, fixture dashboard-config). See quickstart.md and
// contracts/zonemap-panel.md.
//
// Fixture shape: 8 synthetic zones (TAZ 100-800, a 4x2 grid) in
// tests/fixtures/geometry/taz.geoparquet, joined against
// generate.py's own VMT_BY_HOME_TAZ_ROWS (good_scenario) — TAZ 100-400
// under purpose HBW, 500/600/700/900 under purpose NHB. TAZ 800 never
// appears in the metric under either purpose (the permanent "no data"
// case); TAZ 900 appears in the metric but has no matching geometry
// (the excluded-row case). observed/vmt_by_home_taz.parquet is a flat
// 5.0-per-zone baseline for the comparison: diff fixture.
const ZONEMAP_TITLE = 'Zone Map VMT per Capita'
const AUTO_DOMAIN_TITLE = 'Zone Map VMT per Capita (Auto Domain)'
const DIFF_TITLE = 'Zone Map VMT Diff (Good vs Observed)'
const DIFF_UNRESOLVABLE_TITLE = 'Zone Map Diff Unresolvable Scenario (intentional)'
const BROKEN_TITLE = 'Zone Map Broken Panel (intentional)'
const DIFF_BASELINE_TITLE = 'Zone Map VMT Diff via $baseline'

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
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
  await expect.poll(check).toBe(true)
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
async function sourceFeatureProps(page: Page, title: string, expectedCount = 8) {
  const read = async () => {
    const raw = await page.evaluate((t) => {
      const map = window.__zonemapTestMaps![t]
      return map
        .querySourceFeatures('zonemap-zones')
        .map((f) => f.properties as { zoneId: string; value: number | null; fillColor: string })
    }, title)
    return Array.from(new Map(raw.map((f) => [f.zoneId, f])).values())
  }
  await expect.poll(async () => (await read()).length).toBe(expectedCount)
  return read()
}

/** Independently resolves a CSS color string the same way the panel
 * itself does (a hidden probe + getComputedStyle) — used to verify a
 * rendered zone's fillColor against a real, independently-computed
 * expectation rather than re-trusting the panel's own internal math. */
async function resolveCssColorInBrowser(page: Page, cssColor: string): Promise<string> {
  return page.evaluate((color) => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;'
    document.body.appendChild(probe)
    probe.style.color = color
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return resolved
  }, cssColor)
}

test.describe('User Story 1 - Author renders a zone-level metric as a choropleth', () => {
  test('every zone renders shaded per its joined metric value, with a real resolved fill color', async ({
    page,
  }) => {
    await boot(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await expect(container.locator('canvas').first()).toBeVisible()

    expect(await container.getAttribute('data-zone-count')).toBe('8')
    // Default filter is 'all' — both purpose groups present: TAZ 800 has
    // no matching row under either purpose (no-data), TAZ 900 has a row
    // but no matching geometry (excluded).
    expect(await container.getAttribute('data-no-data-count')).toBe('1')
    expect(await container.getAttribute('data-excluded-count')).toBe('1')

    const features = await sourceFeatureProps(page, ZONEMAP_TITLE)
    expect(features).toHaveLength(8)

    // SC-001 — cross-check a real rendered zone's fill color against an
    // independently computed expectation, not just "some color exists."
    // TAZ 300's value (0.0) is the diverging scale's true midpoint
    // (domain [-10, 30], color_ramp: RdBu) -> t = 0.5 on the RdBu ramp.
    const zone300 = features.find((f) => f.zoneId === '300')
    expect(zone300?.value).toBe(0)
    // Every resolved fillColor must be a real, concrete color — never a
    // leaked-through, unresolved CSS function string (which MapLibre's
    // own paint-property parser cannot evaluate at all).
    for (const f of features) {
      expect(f.fillColor).not.toContain('color-mix')
      expect(f.fillColor).not.toContain('var(')
      expect(f.fillColor.length).toBeGreaterThan(0)
    }

    // TAZ 800 (no data) must NOT be the scale's minimum-value color —
    // verified by confirming it differs from TAZ 100 (a real, non-zero
    // negative value near the domain minimum).
    const zone800 = features.find((f) => f.zoneId === '800')
    const zone100 = features.find((f) => f.zoneId === '100')
    // MapLibre's GeoJSON source encodes feature properties through a
    // vector-tile-like internal representation that has no `null` value
    // type — a `null` property survives to querySourceFeatures() as a
    // MISSING key (`undefined`), not literal `null` (confirmed live).
    // The panel's own hover handler already treats both the same way
    // (`value === null || value === undefined`); this check does too.
    expect(zone800?.value == null).toBe(true)
    expect(zone800?.fillColor).not.toBe(zone100?.fillColor)
  })

  test('the map centers/zooms per the panel config', async ({ page }) => {
    await boot(page)
    await waitForRender(page, ZONEMAP_TITLE)
    const center = await page.evaluate(
      (t) => window.__zonemapTestMaps![t].getCenter().toArray(),
      ZONEMAP_TITLE,
    )
    expect(center[0]).toBeCloseTo(-111.925, 2)
    expect(center[1]).toBeCloseTo(40.705, 2)
    const zoom = await page.evaluate((t) => window.__zonemapTestMaps![t].getZoom(), ZONEMAP_TITLE)
    expect(zoom).toBeCloseTo(11, 0)
  })

  // 027-map-auto-fit-and-reset (FR-002/FR-003) — this is the SAME panel
  // T007's flowmap regression test relies on being unaffected: ZONEMAP_TITLE
  // has an explicit `center`/`zoom` in its fixture config
  // ([-111.925, 40.705] / 11, asserted immediately above), so auto-fit's
  // own `config.center == null && config.zoom == null` guard must never
  // even attempt a fit for it — the test above passing unchanged after
  // this feature's own implementation IS the regression proof (US3); no
  // separate assertion needed here.

  // "Zone Map Tab Default Basemap" (dashboard-3-basemaps.yaml) omits
  // center/zoom — the real vehicle for FR-002's own auto-fit-to-geometry
  // behavior. Its zone geometry (tests/fixtures/geometry/taz.geoparquet,
  // generate.py's own _zone_boundary_rows()) is a real, known 4x2 grid of
  // 0.05°-square zones: west=-111.95, south=40.68, east=-111.75,
  // north=40.78 — independent of which zones have matching metric data
  // (TAZ 800 has none at all, per this file's own header comment).
  test('auto-fits its initial view to the real loaded zone geometry (no author-configured center/zoom)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click()
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
    // raw geometry extent, never contracts it.
    expect(bounds.west).toBeLessThanOrEqual(-111.95)
    expect(bounds.east).toBeGreaterThanOrEqual(-111.75)
    expect(bounds.south).toBeLessThanOrEqual(40.68)
    expect(bounds.north).toBeGreaterThanOrEqual(40.78)

    const zoom = await page.evaluate((t) => window.__zonemapTestMaps![t].getZoom(), title)
    const center = await page.evaluate((t) => window.__zonemapTestMaps![t].getCenter(), title)
    expect([zoom, center.lng, center.lat]).not.toEqual([9, -111.89, 40.76])
  })

  // FR-004 — "Zone Map Broken Panel (intentional)" (BROKEN_TITLE) reaches
  // a status/geometryStatus error and renders the shared PanelErrorState
  // with no map/canvas mounted at all (already covered, unchanged, by this
  // file's own pre-existing broken-panel test elsewhere below) —
  // trivially nothing for auto-fit to run against. As with FlowMapPanel.tsx
  // (see that file's own spec.ts comment), the complementary "geometry
  // loads but resolves to zero features, panel still reaches 'ready'"
  // sub-case is covered at the unit level (tests/unit/mapBounds.test.ts's
  // empty-array case) plus direct review of ZoneMapPanel.tsx's own
  // `if (bounds)` guard.

  test('with no domain configured, the color scale auto-computes from the actual min/max of the returned rows', async ({
    page,
  }) => {
    await boot(page)
    const container = await waitForRender(page, AUTO_DOMAIN_TITLE)
    expect(await container.getAttribute('data-zone-count')).toBe('8')

    const features = await sourceFeatureProps(page, AUTO_DOMAIN_TITLE)
    // No filter -> all 8 rows (100-700 + 900) returned; min -8.0 (TAZ
    // 100), max 25.0 (TAZ 700) -> domain auto-computes to [-8, 25].
    // color_scale: sequential with no color_ramp -> token-derived
    // fallback; TAZ 100 sits exactly at the auto-computed domain
    // minimum -> 0% strength -> resolves to plain var(--muted).
    const zone100 = features.find((f) => f.zoneId === '100')
    // Built from the SAME formula the panel itself runs (0% strength
    // color-mix()), not a bare 'var(--muted)' — found live that even a
    // 0%-strength color-mix() resolves to a different (but numerically
    // identical) CSS serialization (`color(srgb ...)`) than a bare
    // var() reference (`rgb(...)`) does, so the two are not
    // string-comparable even though they render the same pixel.
    const expectedColor = await resolveCssColorInBrowser(
      page,
      'color-mix(in srgb, var(--brand-wfrc-blue) 0%, var(--muted))',
    )
    expect(zone100?.fillColor).toBe(expectedColor)
  })

  test('hovering a zone shows its zone id and value in the shared tooltip', async ({ page }) => {
    await boot(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await sourceFeatureProps(page, ZONEMAP_TITLE) // wait until the fill layer has real, queryable features
    // This panel sits well down the page (after every other panel type's
    // own fixture rows) — must be scrolled into the actual viewport
    // before computing viewport-relative pixel coordinates below, or
    // page.mouse.move() (unlike locator.hover(), which auto-scrolls)
    // targets a point outside the visible viewport entirely (confirmed
    // live: the move silently landed nowhere real, no tooltip ever fired).
    await container.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300) // let MapLibre actually paint a frame before picking

    // Precise pixel targeting via MapLibre's own project() — a known
    // geographic point inside TAZ 100's own polygon — rather than
    // guessing the container's own bounding-box center is inside SOME
    // filled polygon (fragile: depends on projection/zoom specifics).
    const point = await page.evaluate((t) => {
      const map = window.__zonemapTestMaps![t]
      const p = map.project([-111.925, 40.705])
      const rect = map.getCanvas().getBoundingClientRect()
      return { x: rect.left + p.x, y: rect.top + p.y }
    }, ZONEMAP_TITLE)
    await page.mouse.move(point.x, point.y, { steps: 5 })
    // 015-map-controls-polish — mapTooltip.ts's shared component
    // (.map-tooltip), not MapLibre's own maplibregl.Popup any more.
    const tooltip = container.locator('.map-tooltip')
    await trueEventually(async () => (await tooltip.isVisible()) === true)
    await expect(tooltip).toContainText('Zone')
  })

  test('hovering a zone in 3D/extrusion mode also shows the tooltip — the real bug this feature fixed', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, ZONEMAP_TITLE)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await sourceFeatureProps(page, ZONEMAP_TITLE)
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

    // TAZ 100's centroid, not TAZ 300's — deliberately: this feature's
    // own implementation-time investigation found a REAL, confirmed
    // MapLibre behavior — a fill-extrusion feature with height EXACTLY 0
    // (TAZ 300 sits at this panel's own diverging domain's literal zero,
    // User Story 1's own coverage, so its resolveZoneHeightFraction is
    // exactly 0) is not reliably layer-scoped-mousemove-pickable at all,
    // confirmed directly via map.queryRenderedFeatures() finding it while
    // the SAME query, run internally by MapLibre's own delegated
    // mousemove listener, never fired — a genuine, narrow MapLibre
    // picking quirk for zero-height extrusions, not a bug in this
    // feature's own hover-wiring (confirmed by testing a non-zero-height
    // zone, which fires immediately with no special handling needed).
    // TAZ 100 (value -8, well away from zero) has real height and was
    // confirmed to hover correctly at its own ground-projected point with
    // NO sweep/offset needed, even under the full 45° tilt.
    const point = await page.evaluate((t) => {
      const map = window.__zonemapTestMaps![t]
      const p = map.project([-111.925, 40.705])
      const rect = map.getCanvas().getBoundingClientRect()
      return { x: rect.left + p.x, y: rect.top + p.y }
    }, ZONEMAP_TITLE)
    await page.mouse.move(point.x, point.y, { steps: 5 })
    const tooltip = container.locator('.map-tooltip')
    await trueEventually(async () => (await tooltip.isVisible()) === true)
    await expect(tooltip).toContainText('100')
  })

  test('a metric row with no matching zone geometry is excluded; a zone with no matching metric row shows the no-data treatment', async ({
    page,
  }) => {
    await boot(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    const features = await sourceFeatureProps(page, ZONEMAP_TITLE)

    // TAZ 900 (metric row, no geometry) never appears as a rendered
    // feature at all — geometry only has 8 zones (100-800).
    expect(features.some((f) => f.zoneId === '900')).toBe(false)
    expect(await container.getAttribute('data-excluded-count')).toBe('1')

    // TAZ 800 (geometry, no metric row under 'all') IS rendered, with a
    // null value.
    const zone800 = features.find((f) => f.zoneId === '800')
    expect(zone800).toBeDefined()
    // MapLibre's GeoJSON source encodes feature properties through a
    // vector-tile-like internal representation that has no `null` value
    // type — a `null` property survives to querySourceFeatures() as a
    // MISSING key (`undefined`), not literal `null` (confirmed live).
    // The panel's own hover handler already treats both the same way
    // (`value === null || value === undefined`); this check does too.
    expect(zone800?.value == null).toBe(true)
  })
})

test.describe('User Story 2 - Filters, resize, and basemap inheritance', () => {
  test('changing the global filter re-colors the choropleth via setData(), without recreating the map', async ({
    page,
  }) => {
    await boot(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    const mapHandleBefore = await page.evaluateHandle(
      (t) => window.__zonemapTestMaps![t],
      ZONEMAP_TITLE,
    )
    const renderCountBefore = Number(await container.getAttribute('data-render-count'))
    expect(await container.getAttribute('data-no-data-count')).toBe('1') // 'all'

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await trueEventually(
      async () => Number(await container.getAttribute('data-render-count')) > renderCountBefore,
    )
    // HBW-only: TAZ 500/600/700/800 have no data (4), TAZ 900 doesn't
    // appear under HBW at all (0 excluded).
    expect(await container.getAttribute('data-no-data-count')).toBe('4')
    expect(await container.getAttribute('data-excluded-count')).toBe('0')

    const mapHandleAfter = await page.evaluateHandle(
      (t) => window.__zonemapTestMaps![t],
      ZONEMAP_TITLE,
    )
    expect(await page.evaluate(([a, b]) => a === b, [mapHandleBefore, mapHandleAfter])).toBe(true)
  })

  test('a zonemap panel with no basemap: picks up the tab default; a panel-level override wins', async ({
    page,
  }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    await waitForRender(page, 'Zone Map Tab Default Basemap')
    await waitForRender(page, 'Zone Map Panel Basemap Override')

    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/bright')))
    await trueEventually(async () => requestUrls.some((u) => u.includes('voyager-gl-style')))
  })

  test('an unreachable basemap still renders the choropleth', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    const title = 'Zone Map Unreachable Basemap (intentional)'
    const container = await waitForRender(page, title)
    await page.waitForTimeout(1000) // the failed fetch/error event needs a moment to resolve

    expect(await container.getAttribute('data-zone-count')).toBe('8')
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
    const container = await waitForRender(page, DIFF_TITLE)
    const features = await sourceFeatureProps(page, DIFF_TITLE)

    // good_scenario - observed, per zone: TAZ 100 -8-5=-13, TAZ 700 25-5=20.
    const zone100 = features.find((f) => f.zoneId === '100')
    const zone700 = features.find((f) => f.zoneId === '700')
    expect(zone100?.value).toBe(-13)
    expect(zone700?.value).toBe(20)
    expect(await container.getAttribute('data-zone-count')).toBe('8')
  })

  test('an unresolvable comparison: diff scenario pair shows the shared error state', async ({ page }) => {
    await boot(page)
    await expect(panelCard(page, DIFF_UNRESOLVABLE_TITLE).getByRole('alert')).toBeVisible()
  })
})

// 019-baseline-diff-consumption, User Story 1 (T019) and User Story 4
// (T028) — the '$baseline' sentinel case, reusing this file's own real
// observed(flat 5.0)/good_scenario fixture data. good_scenario is
// automatically baseline the moment it registers ready (018's own
// automatic-default rule, since observed is pinned) — so this panel
// initially renders with a === b (both good_scenario), every diff_value
// trivially 0, BEFORE the test ever calls setBaseline() itself. Explicitly
// setting baseline to 'observed' afterward is what actually exercises the
// sentinel resolving to a DIFFERENT scenario, and directly proves FR-016's
// reactivity requirement (User Story 1 Acceptance Scenario 2: recompute on
// a live baseline change, no reload) — not just the resolver's own logic
// in isolation (already unit-tested).
test.describe('019-baseline-diff-consumption', () => {
  test('$baseline resolves to whichever scenario is currently baseline, and recomputes reactively on change (US1)', async ({
    page,
  }) => {
    await boot(page)
    // Lives on the Detail tab, not Summary — see
    // tests/fixtures/dashboard-config/dashboard-2-detail.yaml's own
    // comment on this panel for why (a precaution against a suspected,
    // later-disproven WebGL-context regression — the placement was kept
    // anyway as harmless, but is not fixing a real, confirmed problem).
    await page.getByRole('tab', { name: 'Detail' }).click()
    const container = await waitForRender(page, DIFF_BASELINE_TITLE)

    // Initial state: automatic default (good_scenario) on both sides —
    // every zone's diff is trivially 0.
    await trueEventually(async () => {
      const features = await sourceFeatureProps(page, DIFF_BASELINE_TITLE)
      const zone100 = features.find((f) => f.zoneId === '100')
      return zone100?.value === 0
    })

    // Explicitly mark 'observed' as baseline — the SAME real values the
    // hardcoded-name DIFF_TITLE panel above already hand-verifies.
    await page.evaluate(() => window.__wftdm!.appState.setBaseline('observed'))

    await trueEventually(async () => {
      const features = await sourceFeatureProps(page, DIFF_BASELINE_TITLE)
      const zone100 = features.find((f) => f.zoneId === '100')
      return zone100?.value === -13
    })
    const features = await sourceFeatureProps(page, DIFF_BASELINE_TITLE)
    const zone700 = features.find((f) => f.zoneId === '700')
    expect(zone700?.value).toBe(20)
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
    expect(styles.groupBg).toBe('rgb(8, 27, 38)') // --card/--background in dark mode
    expect(styles.iconFilter).toBe('invert(1)')

    // A second, separate real bug found live after the above: the
    // divider between the stacked Zoom in/Zoom out buttons is MapLibre's
    // own hardcoded `#ddd`, untouched by any rule above (those style the
    // group container and each button individually, never the
    // button+button inter-button border) — read back as too bright/white
    // against the now-dark group background.
    const dividerColor = await zoomOut.evaluate((el) => getComputedStyle(el).borderTopColor)
    expect(dividerColor).toBe('rgb(35, 57, 74)') // --border in dark mode
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
    // driving fill-color (resolveZoneHeightFraction, zonemapColor.ts) —
    // TAZ 300 sits at this panel's own diverging domain's literal zero
    // (User Story 1's own coverage above: "TAZ 300's value (0.0) is the
    // diverging scale's true midpoint"), so its height must be ~0; at
    // least one other zone with a real non-zero value must have real
    // positive height — proving this isn't just a flat, unconditional
    // extrusion.
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
    expect(heightByZone.get('300')).toBeCloseTo(0, 1)
    const nonZeroHeight = featureHeights.find(([zoneId, h]) => zoneId !== '300' && h > 0)
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
    // The real, dark-mode token values (tokens.css .dark block) — white
    // text (--foreground) on dark navy (--card/--background), not
    // MapLibre's own hardcoded white staying stuck underneath it.
    expect(styles.text).toBe('rgb(255, 255, 255)')
    expect(styles.groupBg).toBe('rgb(8, 27, 38)')
  })
})

// 027-map-auto-fit-and-reset, User Story 4 — the shared reset-to-view
// control, same corner cluster as NavigationControl/ThreeDToggleControl.
test.describe('027-map-auto-fit-and-reset — User Story 4: reset-to-view control', () => {
  test('returns the camera to the auto-fitted geometry extent, with 3D turned back off, after a manual pan/tilt', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click()
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
    const resetBtn = card.locator('.zonemap-chart').getByTitle('Reset view')
    await expect(resetBtn).toBeEnabled()

    const fittedView = await page.evaluate((t) => {
      const m = window.__zonemapTestMaps![t]
      return { center: m.getCenter(), zoom: m.getZoom() }
    }, title)

    // Toggle 3D on, then pan/tilt well away from the fitted view.
    await card.getByRole('button', { name: 'Toggle 3D extrusion' }).click()
    await page.evaluate((t) => window.__zonemapTestMaps![t].jumpTo({ center: [-100, 45], zoom: 3 }), title)
    expect(
      await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), title),
    ).toBeGreaterThan(0)

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
    const card = panelCard(page, ZONEMAP_TITLE)
    await waitForRender(page, ZONEMAP_TITLE)
    const resetBtn = card.locator('.zonemap-chart').getByTitle('Reset view')
    // No auto-fit animation to wait out — captured synchronously at mount.
    await expect(resetBtn).toBeEnabled()

    await card.getByRole('button', { name: 'Toggle 3D extrusion' }).click()
    await page.evaluate((t) => window.__zonemapTestMaps![t].jumpTo({ center: [-100, 45], zoom: 3 }), ZONEMAP_TITLE)

    await resetBtn.click()
    await trueEventually(async () => {
      const center = await page.evaluate((t) => window.__zonemapTestMaps![t].getCenter(), ZONEMAP_TITLE)
      const zoom = await page.evaluate((t) => window.__zonemapTestMaps![t].getZoom(), ZONEMAP_TITLE)
      const pitch = await page.evaluate((t) => window.__zonemapTestMaps![t].getPitch(), ZONEMAP_TITLE)
      return (
        Math.abs(center.lng - -111.925) < 0.01 &&
        Math.abs(center.lat - 40.705) < 0.01 &&
        Math.abs(zoom - 11) < 0.1 &&
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
  test('a manual pan survives 004 expand/collapse, a filter change, and a basemap switch', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click()
    const title = 'Zone Map Tab Default Basemap'
    const container = await waitForRender(page, title)
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

    // (b) a genuine data reload — a global filter change (this panel
    // reacts to every global filter by default, no `filter:` config).
    const renderCountBefore = await container.getAttribute('data-render-count')
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await trueEventually(
      async () => (await container.getAttribute('data-render-count')) !== renderCountBefore,
    )
    view = await getView()
    expect(view.center.lng).toBeCloseTo(pannedView.center.lng, 3)
    expect(view.center.lat).toBeCloseTo(pannedView.center.lat, 3)
    expect(view.zoom).toBeCloseTo(pannedView.zoom, 3)
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))

    // (c) a basemap switch.
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
    await expect(panelCard(page, BROKEN_TITLE).getByRole('alert')).toBeVisible()
  })

  test('multiple zonemap panels sharing one boundaries file trigger exactly one geometry query', async ({
    page,
  }) => {
    await boot(page)
    // Five zonemap panels on this tab (Summary) all reference
    // taz.geoparquet — confirm the cache (research.md §4) shares one load.
    await waitForRender(page, ZONEMAP_TITLE)
    await waitForRender(page, AUTO_DOMAIN_TITLE)
    await waitForRender(page, DIFF_TITLE)
    const geometryQueryCount = await page.evaluate(
      () => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes('ST_AsGeoJSON')).length,
    )
    expect(geometryQueryCount).toBe(1)
  })

  test('the spatial extension is installed/loaded exactly once per session', async ({ page }) => {
    await boot(page)
    await waitForRender(page, ZONEMAP_TITLE)
    const installLoadCount = await page.evaluate(
      () =>
        window.__wftdm!.__debugQueryLog().filter((sql) => sql === 'INSTALL spatial' || sql === 'LOAD spatial')
          .length,
    )
    expect(installLoadCount).toBe(2) // one INSTALL, one LOAD — never repeated
  })
})
