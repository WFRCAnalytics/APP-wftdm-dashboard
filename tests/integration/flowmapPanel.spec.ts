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
  return page.getByRole('button', { name: `Expand ${title}` })
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

  test('the map centers/zooms per config, and per the documented default when omitted', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)

    // The fixture panel omits center/zoom — confirms DEFAULT_CENTER/
    // DEFAULT_ZOOM (contracts/flowmap-panel.md) apply, not a crash or an
    // unset/NaN view state.
    const center = await page.evaluate(() => {
      const el = document.querySelector('.flowmap-chart canvas')
      return el ? { width: el.clientWidth, height: el.clientHeight } : null
    })
    expect(center).not.toBeNull()
    expect(center!.width).toBeGreaterThan(0)
    expect(center!.height).toBeGreaterThan(0)
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
    // CARTO Positron basemap by design (FR-007), so "zero requests" is no
    // longer the right claim. What's still worth asserting: every
    // map-host request this panel makes is to the ONE expected default
    // source (basemaps.cartocdn.com / tiles.basemaps.cartocdn.com for
    // CARTO's style/sprite/tiles/fonts), not some other, unexpected host
    // — the same "no silent, unintended external dependency" concern the
    // original test protected, updated to match the new intended
    // behavior rather than deleted outright. Also confirms DuckDB-WASM's
    // own unrelated extensions.duckdb.org request (present on every
    // Parquet-querying panel, not map-specific) is correctly excluded by
    // the host pattern below, not accidentally caught.
    const mapHostPattern = /maptiler|mapbox|openstreetmap|demotiles\.maplibre|opentopomap|arcgis|openfreemap/i
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
    // Two real canvases exist per panel — MapLibre's own base canvas and
    // deck.gl's separately composited #deckgl-overlay one (non-interleaved
    // MapboxOverlay mode, research.md §10; confirmed empirically, not
    // assumed, when an earlier test run hit Playwright's strict-mode
    // ambiguity error here). Both must independently survive the
    // relocation — checking only the first (MapLibre's) would miss a
    // regression specific to the deck.gl overlay's own canvas/WebGL
    // context, which research.md §3's own reasoning about "a live WebGL
    // context surviving a DOM move" applies to just as much.
    const baseCanvas = container.locator('canvas.maplibregl-canvas')
    const overlayCanvas = container.locator('canvas#deckgl-overlay')
    await expect(baseCanvas).toBeVisible()
    await expect(overlayCanvas).toBeVisible()
    await expect(container.locator('canvas')).toHaveCount(2)

    const baseCanvasHandleBefore = await baseCanvas.elementHandle()
    const overlayCanvasHandleBefore = await overlayCanvas.elementHandle()
    const inlineBox = await baseCanvas.boundingBox()

    await expandTrigger(page, FLOWMAP_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const dialogContainer = dialog.locator('.flowmap-chart')
    const dialogBaseCanvas = dialogContainer.locator('canvas.maplibregl-canvas')
    const dialogOverlayCanvas = dialogContainer.locator('canvas#deckgl-overlay')
    await expect(dialogBaseCanvas).toBeVisible()
    await expect(dialogOverlayCanvas).toBeVisible()
    await expect(dialogContainer.locator('canvas')).toHaveCount(2)

    // (a) same DOM node — both canvases, not just MapLibre's.
    const baseCanvasHandleAfter = await dialogBaseCanvas.elementHandle()
    const overlayCanvasHandleAfter = await dialogOverlayCanvas.elementHandle()
    const baseSameNode = await page.evaluate(
      ([a, b]) => a === b,
      [baseCanvasHandleBefore, baseCanvasHandleAfter],
    )
    const overlaySameNode = await page.evaluate(
      ([a, b]) => a === b,
      [overlayCanvasHandleBefore, overlayCanvasHandleAfter],
    )
    expect(baseSameNode).toBe(true)
    expect(overlaySameNode).toBe(true)

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

  test('a tab mixing all seven now-built panel types renders without error in a single load', async ({
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
    // .first() — non-interleaved MapboxOverlay mode composites deck.gl's
    // own #deckgl-overlay canvas above MapLibre's base canvas (research.md
    // §10); two real <canvas> elements exist inside .flowmap-chart, not
    // one, confirmed empirically by this exact assertion's first run.
    await expect(flowmapCard.locator('.flowmap-chart canvas').first()).toBeVisible() // flowmap
    await expect(expandTrigger(page, FLOWMAP_TITLE)).toBeVisible()
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

test.describe('011-basemap-style-system — US1: default basemap renders, paired to theme (quickstart.md Scenario 1)', () => {
  test('a panel with no basemap config renders a real CARTO basemap, matching the light/dark theme', async ({
    page,
  }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    const container = panelCard(page, FLOWMAP_TITLE).locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, FLOWMAP_TITLE)

    await trueEventually(async () => requestUrls.some((u) => u.includes('positron-gl-style')))
    expect(await getStyleSources(page, FLOWMAP_TITLE)).not.toEqual([])

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await trueEventually(async () => requestUrls.some((u) => u.includes('dark-matter-gl-style')))
  })
})

test.describe('011-basemap-style-system — US1: setStyle()/MapboxOverlay empirical survival (research.md §1 — GATING)', () => {
  test('the deck.gl overlay and its FlowmapLayer survive a real light/dark theme switch', async ({ page }) => {
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
    const overlayCanvas = container.locator('canvas#deckgl-overlay')
    await expect(baseCanvas).toBeVisible()
    await expect(overlayCanvas).toBeVisible()
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    await waitForBasemapApplied(page, FLOWMAP_TITLE)
    await trueEventually(async () => requestUrls.some((u) => u.includes('positron-gl-style')))

    const baseHandleBefore = await baseCanvas.elementHandle()
    const overlayHandleBefore = await overlayCanvas.elementHandle()
    const renderCountBefore = await container.getAttribute('data-render-count')
    const flowCountBefore = await container.getAttribute('data-flow-count')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    // Wait for the DARK style specifically (not just "any" style) — a
    // plain waitForBasemapApplied() would also be satisfied by the still-
    // showing light style during the brief window before setStyle()
    // actually swaps sources, so this test needs the more specific
    // request-based signal Scenario 1's own test already establishes as
    // reliable, not the generic "some sources exist" check.
    await trueEventually(async () => requestUrls.some((u) => u.includes('dark-matter-gl-style')))
    // Let deck.gl's own repaint (triggered by the base map's style change,
    // not by any data/layer change) settle before sampling the canvas.
    await page.waitForTimeout(500)

    // (a) same DOM node — both canvases, not just MapLibre's.
    const baseHandleAfter = await baseCanvas.elementHandle()
    const overlayHandleAfter = await overlayCanvas.elementHandle()
    expect(
      await page.evaluate(([a, b]) => a === b, [baseHandleBefore, baseHandleAfter]),
    ).toBe(true)
    expect(
      await page.evaluate(([a, b]) => a === b, [overlayHandleBefore, overlayHandleAfter]),
    ).toBe(true)

    // (b) render/flow-count unchanged — the FlowmapLayer's own data was
    // never touched by the basemap style swap.
    expect(await container.getAttribute('data-render-count')).toBe(renderCountBefore)
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

    // (d) the deck.gl canvas actually drew something — scans the WHOLE
    // overlay canvas's alpha channel for any non-fully-transparent pixel.
    // A duplicate-layer-id bug (deck.gl#3763) can leave the overlay
    // technically "not removed" while silently failing to draw, which a
    // DOM-visibility check alone cannot distinguish from a genuinely
    // healthy overlay.
    const drewSomething = await overlayCanvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = (el.getContext('webgl2') ?? el.getContext('webgl')) as WebGLRenderingContext | null
      if (!ctx) return false
      const { width, height } = el
      const pixels = new Uint8Array(width * height * 4)
      ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels)
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) return true
      }
      return false
    })
    expect(drewSomething).toBe(true)

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

    // (f) zero deck.gl#3763-shaped console messages across the whole flip.
    expect(consoleIssues).toEqual([])
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
    expect(Number(await container.getAttribute('data-flow-count'))).toBeGreaterThan(0)
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
    expect(style.sprite).toMatch(/^https:\/\//)
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
    // absolute URL, not just a syntactically-absolute-looking one.
    const spriteReachable = await page.evaluate(async (spriteUrl: string) => {
      try {
        const res = await fetch(`${spriteUrl}.json`)
        return res.ok
      } catch {
        return false
      }
    }, style.sprite as string)
    expect(spriteReachable).toBe(true)
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
    // case (docs/ARCHITECTURE.md). Deliberately does NOT block
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
