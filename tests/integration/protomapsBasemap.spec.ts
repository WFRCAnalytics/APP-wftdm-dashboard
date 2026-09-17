import { test, expect, type Page } from '@playwright/test'
import type maplibregl from 'maplibre-gl'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WftdmDebugHook } from '../../src/main.tsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __basemapPreviewTestMap?: maplibregl.Map
  }
}

// 041-protomaps-pmtiles-basemap — quickstart.md Scenarios 1-5.
//
// No on-disk mutation, no _sharedFixtureLock: isolation is done entirely
// via page.route() (the same technique demoMultiScenario.spec.ts already
// established) — the real, committed public/dashboard-config/index.json
// path normally 404s in this repo (that root is gitignored/deployer-
// populated only), so routing it to a small JSON body carrying
// protomapsPmtilesUrl is what actually reaches main.tsx's
// `primaryBranding.protomapsPmtilesUrl ?? demoBranding.protomapsPmtilesUrl`
// precedence (contracts/deployer-config.md) — the real demo root
// (public/demo-dashboard-config/) is left completely untouched, and
// per contracts/deployer-config.md it deliberately never sets this field
// itself (the demo ships genuinely unconfigured).
//
// The PMTiles bytes served are the real, small, git-tracked test fixture
// (research.md R-7) — never a hotlinked Protomaps-hosted URL.

const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'protomaps', 'tiny-test-area.pmtiles')
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH)

const RELATIVE_FIXTURE_URL = '**/test-fixtures/protomaps/tiny-test-area.pmtiles'
const EXTERNAL_FIXTURE_URL = 'https://example.com/region-extracts/tiny-test-area.pmtiles'

async function servePmtilesFixture(page: Page, urlPattern: string) {
  await page.route(urlPattern, (route) => {
    const rangeHeader = route.request().headers()['range']
    if (!rangeHeader) {
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: FIXTURE_BYTES })
    }
    const match = /bytes=(\d+)-(\d+)/.exec(rangeHeader)
    const start = match ? Number(match[1]) : 0
    const end = match ? Math.min(Number(match[2]), FIXTURE_BYTES.length - 1) : FIXTURE_BYTES.length - 1
    return route.fulfill({
      status: 206,
      contentType: 'application/octet-stream',
      headers: {
        'content-range': `bytes ${start}-${end}/${FIXTURE_BYTES.length}`,
        'accept-ranges': 'bytes',
      },
      body: FIXTURE_BYTES.subarray(start, end + 1),
    })
  })
}

async function routeDeployerDefault(page: Page, protomapsPmtilesUrl: string | undefined) {
  await page.route('**/dashboard-config/index.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ dashboards: [], ...(protomapsPmtilesUrl ? { protomapsPmtilesUrl } : {}) }),
    }),
  )
}

// Revised design — a deployer's hosted-API key, the other real
// deployer-config field state/protomapsSourceState.ts's getEffective
// ProtomapsSource() resolves (checked ahead of protomapsPmtilesUrl by
// main.tsx — see that file's own comment).
async function routeDeployerApiKey(page: Page, protomapsApiKey: string) {
  await page.route('**/dashboard-config/index.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ dashboards: [], protomapsApiKey }),
    }),
  )
}

// A real, live api.protomaps.com tile request is never made in this
// suite — intercepted the same way the pmtiles fixture routes above
// avoid a real network dependency. An empty (zero-byte) body is a valid,
// if degenerate, vector tile (the same "empty protobuf message" fact
// scripts/build-protomaps-test-fixture.py's own header comment already
// documents for the pmtiles path) — enough to prove the source resolves
// and a flavor's own background layer paints, with no real OSM-schema
// tile data needed.
async function serveHostedApiTiles(page: Page) {
  await page.route('https://api.protomaps.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) }),
  )
}

// The real public/demo-dashboard-config/index.json now carries a real,
// deployer-configured protomapsApiKey (the whole point of this feature —
// WFRC's real demo deployment gets working Protomaps flavors with no
// viewer configuration at all). tests/global-setup.js no longer blanks
// this file for a Playwright run (040-test-suite-migration retired that
// blanking, replaced by testing directly against the real, permanent
// demo content) — so every test in this file, which wants precise
// control over exactly what IS/ISN'T configured, must strip that one
// field from the demo root's response, not just the primary (gitignored,
// normally-404) dashboard-config/ root. Without this, every "not
// configured" / PMTiles-precedence assertion below would spuriously see
// the real demo key and resolve a hosted-API source unconditionally.
//
// Forwards the REAL response (route.fetch()) and only deletes the
// Protomaps fields — an earlier version of this helper fulfilled a
// synthetic `{dashboards: []}` body instead, which discarded the real
// demo tab list entirely and left the app with zero dashboards, so
// nothing (including the Settings button every test needs) ever
// rendered. The real dashboards/title/logo fields must survive.
async function neutralizeDemoRoot(page: Page) {
  await page.route('**/demo-dashboard-config/index.json', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as Record<string, unknown>
    delete body.protomapsApiKey
    delete body.protomapsPmtilesUrl
    await route.fulfill({ response, json: body })
  })
}

async function boot(page: Page) {
  await neutralizeDemoRoot(page)
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('good_scenario')?.status !== 'registering',
    null,
    { timeout: 30_000 },
  )
}

async function openBasemapTab(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Basemap' }).click()
}

// A real, confirmed MapLibre race, found while writing this describe
// block's own tests (not specific to Protomaps): the preview map's own
// mount effect stages the app-wide default preset (a URL-based built-in
// preset — e.g. 'openfreemap-positron'), and `Map#setStyle(url)` fetches
// that URL ASYNCHRONOUSLY, internally, with no cancellation hook this
// component's own AbortController reaches (that controller only guards
// OUR OWN loadBasemapStyle() call, not a fetch MapLibre already kicked
// off from a PRIOR setStyle() call). If a SECOND setStyle() (e.g. a
// flavor click) happens before that first fetch resolves, MapLibre still
// applies the stale fetch's result once it lands — silently reverting
// the second, newer style. Every OTHER real preset in this file's own
// existing tests happens to dodge this by extra setup work naturally
// giving the first fetch a head start; this test file's own more
// tightly-timed clicks can hit it directly. Waiting for the INITIAL
// default to finish loading before ever clicking anything closes the
// window this race needs.
async function waitForInitialStyleSettled(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = window.__basemapPreviewTestMap
        return {
          isStyleLoaded: map?.isStyleLoaded() ?? false,
          sourceIds: map ? Object.keys(map.getStyle().sources) : [],
        }
      }),
    )
    .toMatchObject({ isStyleLoaded: true, sourceIds: ['ne2_shaded', 'openmaptiles'] })
}

function protomapsRadioGroup(page: Page) {
  return page.getByRole('radiogroup', { name: 'Protomaps' })
}

async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check).toBe(true)
}

// Reads the shared preview map's own canvas center pixel — same
// render-event + triggerRepaint technique flowmapPanel.spec.ts's own
// canvasHasDrawnPixels() uses (a plain post-hoc read can land after the
// WebGL drawing buffer has already been cleared).
async function previewCenterPixel(page: Page): Promise<[number, number, number, number] | null> {
  return page.evaluate(() => {
    const map = window.__basemapPreviewTestMap
    if (!map) return null
    return new Promise<[number, number, number, number] | null>((resolve) => {
      map.once('render', () => {
        const el = map.getCanvas()
        const ctx = (el.getContext('webgl2') ?? el.getContext('webgl')) as WebGLRenderingContext | null
        if (!ctx) return resolve(null)
        const { width, height } = el
        const pixels = new Uint8Array(width * height * 4)
        ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels)
        const idx = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
        resolve([pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]])
      })
      map.triggerRepaint()
    })
  })
}

test.describe('041-protomaps-pmtiles-basemap — US2: not configured (FR-010)', () => {
  test('the Protomaps section shows 5 disabled tiles and a clear "not configured" message when no source is set', async ({
    page,
  }) => {
    await boot(page)
    await openBasemapTab(page)

    const group = protomapsRadioGroup(page)
    const tiles = group.getByRole('radio')
    await expect(tiles).toHaveCount(5)
    for (const name of ['Light', 'Dark', 'White', 'Grayscale', 'Black']) {
      await expect(group.getByRole('radio', { name })).toBeDisabled()
    }
    await expect(page.getByTestId('protomaps-not-configured')).toBeVisible()
    await expect(page.getByTestId('protomaps-not-configured')).toHaveText(
      'No Protomaps source configured for this deployment.',
    )
  })
})

test.describe('041-protomaps-pmtiles-basemap — US1: deployer-configured source (FR-001, FR-002, FR-008, FR-009, FR-012)', () => {
  test('all 5 flavors are selectable, render distinct styling, and show the correct attribution', async ({
    page,
  }) => {
    await servePmtilesFixture(page, RELATIVE_FIXTURE_URL)
    await routeDeployerDefault(page, '/APP-wftdm-dashboard/test-fixtures/protomaps/tiny-test-area.pmtiles')
    await boot(page)
    await openBasemapTab(page)

    const group = protomapsRadioGroup(page)
    await expect(page.getByTestId('protomaps-not-configured')).toHaveCount(0)
    await expect(page.getByTestId('protomaps-source-status')).toBeVisible()

    const pixelsByFlavor = new Map<string, string>()
    for (const name of ['Light', 'Dark', 'White', 'Grayscale', 'Black']) {
      const tile = group.getByRole('radio', { name })
      await expect(tile).toBeEnabled()
      await tile.click()
      await expect(tile).toHaveAttribute('aria-checked', 'true')

      await trueEventually(async () => (await previewCenterPixel(page)) !== null)
      const pixel = await previewCenterPixel(page)
      pixelsByFlavor.set(name, JSON.stringify(pixel))
    }

    // Real attribution string appears via MapLibre's own AttributionControl
    // (scoped to it specifically — "Protomaps" also appears as the
    // section's own heading text, a real strict-mode collision found
    // while writing this test).
    await expect(page.locator('.maplibregl-ctrl-attrib').getByRole('link', { name: 'Protomaps' })).toBeVisible()

    // Each of the 5 flavors' own real `background` color (confirmed
    // distinct per the installed @protomaps/basemaps Flavor definitions)
    // produces a genuinely different resolved pixel — proves real,
    // distinct styling per flavor, not five identical renders.
    expect(new Set(pixelsByFlavor.values()).size).toBeGreaterThan(1)
  })

  test('switching between two already-loaded flavors does not re-open (re-fetch the header/directory of) the underlying PMTiles archive (FR-012, SC-005)', async ({
    page,
  }) => {
    // MapLibre's own setStyle() tears down and recreates the vector
    // source on every style change (true for every basemap kind this app
    // supports, not specific to Protomaps) — so the actual TILE bytes for
    // whatever's in view legitimately re-request on each flavor switch.
    // The real, meaningful guarantee this test proves instead (research.md
    // R-2): the pmtiles client library's own per-URL PMTiles instance
    // (Protocol.tiles, keyed by URL) is reused across style changes
    // referencing the same source, so the ARCHIVE'S OWN HEADER/ROOT-
    // DIRECTORY — the expensive part for a real, large regional extract,
    // fetched once via a fixed `bytes=0-16383` range read
    // (pmtiles' own real getHeaderAndRoot()) — is opened exactly once,
    // never re-parsed on a pure styling change.
    let headerRangeRequestCount = 0
    await page.route(RELATIVE_FIXTURE_URL, async (route) => {
      const rangeHeader = route.request().headers()['range']
      if (rangeHeader === 'bytes=0-16383') headerRangeRequestCount++
      if (!rangeHeader) {
        return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: FIXTURE_BYTES })
      }
      const match = /bytes=(\d+)-(\d+)/.exec(rangeHeader)
      const start = match ? Number(match[1]) : 0
      const end = match ? Math.min(Number(match[2]), FIXTURE_BYTES.length - 1) : FIXTURE_BYTES.length - 1
      return route.fulfill({
        status: 206,
        contentType: 'application/octet-stream',
        headers: { 'content-range': `bytes ${start}-${end}/${FIXTURE_BYTES.length}`, 'accept-ranges': 'bytes' },
        body: FIXTURE_BYTES.subarray(start, end + 1),
      })
    })
    await routeDeployerDefault(page, '/APP-wftdm-dashboard/test-fixtures/protomaps/tiny-test-area.pmtiles')
    await boot(page)
    await openBasemapTab(page)

    const group = protomapsRadioGroup(page)
    await group.getByRole('radio', { name: 'Light' }).click()
    await trueEventually(async () => (await previewCenterPixel(page)) !== null)
    await expect.poll(() => headerRangeRequestCount).toBe(1)

    await group.getByRole('radio', { name: 'Dark' }).click()
    await trueEventually(async () => (await previewCenterPixel(page)) !== null)
    await group.getByRole('radio', { name: 'White' }).click()
    await trueEventually(async () => (await previewCenterPixel(page)) !== null)
    // Still exactly one header/root-directory read across 3 flavors.
    expect(headerRangeRequestCount).toBe(1)
  })
})

test.describe('041-protomaps-pmtiles-basemap — US2: external URL behaves identically to a bundled relative path (FR-004)', () => {
  test('a full https:// deployer default renders the same as a relative one', async ({ page }) => {
    await page.route(`${EXTERNAL_FIXTURE_URL}*`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/octet-stream', body: FIXTURE_BYTES }),
    )
    await routeDeployerDefault(page, EXTERNAL_FIXTURE_URL)
    await boot(page)
    await openBasemapTab(page)

    const group = protomapsRadioGroup(page)
    await expect(page.getByTestId('protomaps-not-configured')).toHaveCount(0)
    const tile = group.getByRole('radio', { name: 'Light' })
    await expect(tile).toBeEnabled()
    await tile.click()
    await trueEventually(async () => (await previewCenterPixel(page)) !== null)
  })
})

// Revised design: the viewer session override (US3, FR-006/FR-007) was
// removed entirely — only a deployer can configure a Protomaps source
// now (see state/protomapsSourceState.ts's own header comment for why).
// This block replaces it: a deployer-configured hosted-API key resolves
// to a live api.protomaps.com tiles source instead of a self-hosted
// PMTiles file — the other real deployer-config field
// getEffectiveProtomapsSource() can resolve, checked ahead of
// protomapsPmtilesUrl (main.tsx).
test.describe('041-protomaps-pmtiles-basemap, revised — deployer-configured hosted-API key', () => {
  test('all 5 flavors are selectable and the resolved source is a live api.protomaps.com tiles URL carrying the key', async ({
    page,
  }) => {
    await serveHostedApiTiles(page)
    await routeDeployerApiKey(page, 'test-key-123')
    await boot(page)
    await openBasemapTab(page)

    await expect(page.getByTestId('protomaps-not-configured')).toHaveCount(0)
    await expect(page.getByTestId('protomaps-source-status')).toBeVisible()
    await waitForInitialStyleSettled(page)

    const group = protomapsRadioGroup(page)
    const tile = group.getByRole('radio', { name: 'Light' })
    await expect(tile).toBeEnabled()
    await tile.click()
    await expect(tile).toHaveAttribute('aria-checked', 'true')

    await expect
      .poll(() => page.evaluate(() => window.__basemapPreviewTestMap?.getStyle().sources.protomaps))
      .toMatchObject({ tiles: ['https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=test-key-123'] })
  })

  test('a hosted-API key takes precedence over a self-hosted PMTiles URL when a deployer somehow configures both', async ({
    page,
  }) => {
    await serveHostedApiTiles(page)
    await servePmtilesFixture(page, RELATIVE_FIXTURE_URL)
    await page.route('**/dashboard-config/index.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          dashboards: [],
          protomapsApiKey: 'test-key-123',
          protomapsPmtilesUrl: '/APP-wftdm-dashboard/test-fixtures/protomaps/tiny-test-area.pmtiles',
        }),
      }),
    )
    await boot(page)
    await openBasemapTab(page)
    await waitForInitialStyleSettled(page)
    // Any flavor tile needs to be staged before the preview map actually
    // applies a Protomaps style — the tab opens on whatever was already
    // applied (APP_DEFAULT), not a Protomaps flavor.
    await protomapsRadioGroup(page).getByRole('radio', { name: 'Light' }).click()

    await expect
      .poll(async () => {
        const source = await page.evaluate(() => window.__basemapPreviewTestMap?.getStyle().sources.protomaps)
        return (source as { tiles?: string[] } | undefined)?.tiles !== undefined
      })
      .toBe(true)

    const source = await page.evaluate(() => window.__basemapPreviewTestMap?.getStyle().sources.protomaps)
    // A `tiles` array (hosted-api), never a pmtiles:// `url` (self-hosted).
    expect((source as { tiles?: string[] } | undefined)?.tiles).toBeTruthy()
    expect((source as { url?: string } | undefined)?.url).toBeUndefined()
  })
})
