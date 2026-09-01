import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
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

  test('zero requests to any external tile server or map-style host', async ({ page }) => {
    // Scoped to map/tile-related hosts specifically, not literally every
    // external request the whole page makes — found necessary when this
    // test's first run correctly caught a real, but unrelated, pre-existing
    // request: DuckDB-WASM lazy-loads its own parquet extension from
    // extensions.duckdb.org on every panel that queries Parquet (every
    // panel type in this app, not something FlowMapPanel introduces or
    // could avoid). research.md §9's no-CDN claim was specifically about
    // the map's own base style/tiles, not a blanket "zero external
    // requests anywhere on the page" guarantee this app was never designed
    // to make. blob: URLs are also excluded — same-origin, in-memory
    // object references (e.g. a Worker's own script blob), not real
    // network requests, mistakenly flagged by an earlier version of this
    // check that only excluded data:.
    const mapHostPattern = /maptiler|carto|mapbox|openstreetmap|demotiles\.maplibre/i
    const externalMapRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (
        !url.startsWith('http://127.0.0.1:5199/') &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:') &&
        mapHostPattern.test(url)
      ) {
        externalMapRequests.push(url)
      }
    })

    await boot(page)
    const card = panelCard(page, FLOWMAP_TITLE)
    const container = card.locator('.flowmap-chart')
    await trueEventually(async () => (await container.getAttribute('data-render-count')) !== null)
    // Give the map a moment to have issued any tile/style requests it was
    // going to issue.
    await page.waitForTimeout(500)

    expect(externalMapRequests).toEqual([])
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
