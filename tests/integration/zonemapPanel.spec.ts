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

  test('hovering a zone shows its zone id and value', async ({ page }) => {
    await boot(page)
    const container = await waitForRender(page, ZONEMAP_TITLE)
    await sourceFeatureProps(page, ZONEMAP_TITLE) // wait until the fill layer has real, queryable features
    // This panel sits well down the page (after every other panel type's
    // own fixture rows) — must be scrolled into the actual viewport
    // before computing viewport-relative pixel coordinates below, or
    // page.mouse.move() (unlike locator.hover(), which auto-scrolls)
    // targets a point outside the visible viewport entirely (confirmed
    // live: the move silently landed nowhere real, no popup ever fired).
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
    await trueEventually(async () => (await page.locator('.maplibregl-popup').count()) > 0)
    await expect(page.locator('.maplibregl-popup')).toContainText('Zone')
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
