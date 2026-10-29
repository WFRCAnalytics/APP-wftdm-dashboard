import { test, expect, type Page } from '@playwright/test'

// 071-network-block: the `network` block of dashboard-config.yaml. The site file is rewritten on its way to the browser, the way a deployer
// would edit it, and the page's own requests are recorded (basemap hosts are answered with an abort so nothing leaves the machine).
const BASEMAP_HOSTS = /openfreemap\.org|cartocdn\.com|arcgis\.com|openstreetmap\.org/

async function open(page: Page, network?: string) {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.route(BASEMAP_HOSTS, (route) => route.abort())
  if (network) {
    await page.route('**/demo-dashboard-config/dashboard-config.yaml', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, body: `${await res.text()}\n${network}\n` })
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  return requests
}

async function openBasemapTab(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Basemap' }).click()
  await expect(dialog.getByText('Choose the map underneath every zone map and flow map')).toBeVisible()
  return dialog
}

async function openNetworkPage(page: Page) {
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Network' }).first().click()
  await expect(page.locator('.flowmap-chart').first()).toBeVisible({ timeout: 60_000 })
}

test('with no network keys every basemap is offered and the default is the app default', async ({ page }) => {
  const requests = await open(page)
  const dialog = await openBasemapTab(page)
  expect(await dialog.getByRole('radio').count()).toBeGreaterThan(8)
  await expect(dialog.getByRole('combobox', { name: 'Raster tile provider' })).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')
  await openNetworkPage(page)
  await expect.poll(() => requests.some((u) => u.includes('tiles.openfreemap.org')), { timeout: 20_000 }).toBe(true)
  await expect(page.getByTestId('config-notice')).toHaveCount(0)
})

test('an allow-list limits the Basemap tab, replaces a default that is not allowed, and no other basemap host is called', async ({ page }) => {
  const requests = await open(page, 'network:\n  basemaps:\n    allow: ["ugrc-vector-lite", "protomaps-light"]')
  // the maps: the app default (openfreemap-positron) is not allowed, so the first allowed entry is used and nothing else is asked
  await openNetworkPage(page)
  await expect.poll(() => requests.some((u) => u.includes('tiles.arcgis.com')), { timeout: 20_000 }).toBe(true)
  expect(requests.filter((u) => /openfreemap\.org|cartocdn\.com/.test(u))).toEqual([])
  // the note says the default was replaced (on a page that shows it)
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab').first().click()
  await expect(page.getByTestId('config-notice')).toContainText('is not allowed', { timeout: 20_000 })
  // the tab offers only the two allowed entries and no raster dropdown
  const dialog = await openBasemapTab(page)
  await expect(dialog.getByRole('radio')).toHaveCount(2)
  await expect(dialog.getByRole('combobox', { name: 'Raster tile provider' })).toHaveCount(0)
  await expect(dialog.getByText('Raster tiles')).toHaveCount(0)
  // the allowed style that is the first on the list starts staged
  await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(1)
})

test('a raster provider can be allowed by a pattern and the other providers are hidden', async ({ page }) => {
  await open(page, 'network:\n  basemaps:\n    allow: ["OpenStreetMap.*"]')
  const dialog = await openBasemapTab(page)
  const raster = dialog.getByRole('combobox', { name: 'Raster tile provider' })
  await expect(raster).toBeVisible({ timeout: 20_000 })
  await expect(dialog.getByRole('radio')).toHaveCount(0)
  await raster.click()
  const options = page.getByRole('option')
  expect(await options.count()).toBeGreaterThan(0)
  for (const name of await options.allInnerTexts()) expect(name.length).toBeGreaterThan(0)
  // nothing outside OpenStreetMap is listed: Esri is one of the curated providers and must be absent
  await expect(page.getByRole('option', { name: 'WorldImagery' })).toHaveCount(0)
})

test('a list that matches nothing gives the plain background and calls no basemap host', async ({ page }) => {
  const requests = await open(page, 'network:\n  basemaps:\n    allow: ["nope-*"]')
  await openNetworkPage(page)
  await page.waitForTimeout(1500)
  expect(requests.filter((u) => BASEMAP_HOSTS.test(u))).toEqual([])
  const dialog = await openBasemapTab(page)
  await expect(dialog.getByRole('radio')).toHaveCount(0)
})

async function openAppearanceTab(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Appearance' }).click()
  await expect(dialog.getByRole('radiogroup', { name: 'Font' })).toBeVisible()
  return dialog
}

test('with fonts bundled the Appearance tab offers two fonts and calls no font host', async ({ page }) => {
  const requests = await open(page, 'network:\n  fonts: bundled')
  const dialog = await openAppearanceTab(page)
  await expect(dialog.getByRole('radiogroup', { name: 'Font' }).getByRole('radio')).toHaveCount(2)
  await expect(dialog.getByRole('radio', { name: /Schibsted Grotesk/ })).toBeVisible()
  await expect(dialog.getByRole('radio', { name: /System UI/ })).toBeVisible()
  await expect(dialog.getByText('Custom fonts')).toHaveCount(0)
  await expect(dialog.getByLabel('Body')).toHaveCount(0)
  await page.waitForTimeout(1000)
  expect(requests.filter((u) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u))).toEqual([])
})

test('without the key the Appearance tab has four fonts, the custom inputs, and asks Google for the previews', async ({ page }) => {
  const requests = await open(page)
  const dialog = await openAppearanceTab(page)
  await expect(dialog.getByRole('radiogroup', { name: 'Font' }).getByRole('radio')).toHaveCount(4)
  await expect(dialog.getByText('Custom fonts')).toBeVisible()
  await expect.poll(() => requests.some((u) => u.includes('fonts.googleapis.com')), { timeout: 20_000 }).toBe(true)
})

// The parquet reader autoloads from the same repository as the spatial extension, so with a mirror that answers 404 the data panels cannot load:
// these two specs read the requests only and never wait for a chart.
async function goToNetworkTab(page: Page) {
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Network' }).first().click()
}

test('an extension address sends the extension download to that address and not to DuckDB', async ({ page }) => {
  const mirror: string[] = []
  const duckdbHost: string[] = []
  // a made-up mirror that answers 404 (the request itself is the assertion), and DuckDB's own host, which must stay unused
  await page.route('http://mirror.example.test/**', (route) => {
    mirror.push(route.request().url())
    return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not here' })
  })
  await page.route('**://extensions.duckdb.org/**', (route) => {
    duckdbHost.push(route.request().url())
    return route.continue()
  })
  await open(page, 'network:\n  duckdb_extensions: "http://mirror.example.test/duckdb"')
  await goToNetworkTab(page)
  await expect.poll(() => mirror.length, { timeout: 60_000 }).toBeGreaterThan(0)
  console.log('MIRROR_REQUESTS', JSON.stringify(mirror))
  expect(duckdbHost).toEqual([])
})

test('without an extension address the download goes to DuckDB as before', async ({ page }) => {
  const duckdbHost: string[] = []
  await page.route('**://extensions.duckdb.org/**', (route) => {
    duckdbHost.push(route.request().url())
    return route.continue()
  })
  await open(page)
  await goToNetworkTab(page)
  await expect.poll(() => duckdbHost.length, { timeout: 60_000 }).toBeGreaterThan(0)
})

test('mistakes are listed with their paths, the app loads and each setting stays at its default', async ({ page }) => {
  const requests = await open(page, 'network:\n  fonts: sideways\n  duckdb_extensions: "ftp://mirror.example.org/duckdb"\n  basemaps:\n    allow: ["nope-*"]')
  // the first page shows the configuration note
  await expect(page.getByTestId('config-notice')).toBeVisible({ timeout: 30_000 })
  const paths = await page.getByTestId('config-notice').locator('[data-problem-path]').evaluateAll((els) => els.map((e) => e.getAttribute('data-problem-path')))
  expect(paths).toContain('network.fonts')
  expect(paths).toContain('network.duckdb_extensions')
  expect(paths.filter((p) => p === 'network.basemaps.allow').length).toBeGreaterThanOrEqual(2)
  // the unknown font mode and the bad address keep their defaults: four fonts, and the extension request is not aimed at the ftp address
  const dialog = await openAppearanceTab(page)
  await expect(dialog.getByRole('radiogroup', { name: 'Font' }).getByRole('radio')).toHaveCount(4)
  await page.keyboard.press('Escape')
  // the list that matches nothing gives the plain background: no basemap host is called on a map page
  await openNetworkPage(page)
  await page.waitForTimeout(1500)
  expect(requests.filter((u) => BASEMAP_HOSTS.test(u))).toEqual([])
  expect(requests.filter((u) => u.includes('mirror.example.org'))).toEqual([])
})
