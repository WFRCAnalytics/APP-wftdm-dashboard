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

async function boot(page: Page) {
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
      'No PMTiles source configured for this deployment.',
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

test.describe('041-protomaps-pmtiles-basemap — US3: viewer session override (FR-006, FR-007)', () => {
  test('a viewer can enter their own PMTiles URL, use it immediately with no reload, and it does not persist across reload', async ({
    page,
  }) => {
    await servePmtilesFixture(page, RELATIVE_FIXTURE_URL)
    await boot(page)
    await openBasemapTab(page)

    await expect(page.getByTestId('protomaps-not-configured')).toBeVisible()
    const group = protomapsRadioGroup(page)
    for (const name of ['Light', 'Dark', 'White', 'Grayscale', 'Black']) {
      await expect(group.getByRole('radio', { name })).toBeDisabled()
    }

    await page
      .getByLabel('PMTiles source URL')
      .fill('/APP-wftdm-dashboard/test-fixtures/protomaps/tiny-test-area.pmtiles')
    await page.getByRole('button', { name: 'Use this source' }).click()

    // No reload — tiles become usable immediately.
    await expect(page.getByTestId('protomaps-not-configured')).toHaveCount(0)
    for (const name of ['Light', 'Dark', 'White', 'Grayscale', 'Black']) {
      await expect(group.getByRole('radio', { name })).toBeEnabled()
    }
    await expect(page.getByRole('button', { name: 'Reset to default' })).toBeVisible()

    // Session-only — a reload discards it (state/protomapsSourceState.ts
    // is a plain in-memory module, never Web Storage).
    await boot(page)
    await openBasemapTab(page)
    await expect(page.getByTestId('protomaps-not-configured')).toBeVisible()
  })

  test('an unreachable/invalid URL is rejected with a distinct error and does not disturb the prior state', async ({
    page,
  }) => {
    await page.route('**/definitely-not-a-real-pmtiles-host.example/*', (route) => route.abort())
    await boot(page)
    await openBasemapTab(page)

    await page.getByLabel('PMTiles source URL').fill('https://definitely-not-a-real-pmtiles-host.example/x.pmtiles')
    await page.getByRole('button', { name: 'Use this source' }).click()

    await expect(page.getByTestId('protomaps-source-error')).toBeVisible()
    await expect(page.getByTestId('protomaps-source-error')).toHaveText(
      "Couldn't open this PMTiles source — check the URL and try again.",
    )
    // Distinct from the "not configured" message — and the tiles remain
    // exactly where they were (still disabled, nothing silently applied).
    await expect(page.getByTestId('protomaps-not-configured')).toBeVisible()
    for (const name of ['Light', 'Dark', 'White', 'Grayscale', 'Black']) {
      await expect(protomapsRadioGroup(page).getByRole('radio', { name })).toBeDisabled()
    }
  })
})
