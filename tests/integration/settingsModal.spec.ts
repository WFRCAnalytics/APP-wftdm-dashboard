import { test, expect, type Page } from '@playwright/test'
import type maplibregl from 'maplibre-gl'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    // 010-flowmap-panel's own test registry (flowmapPanel.spec.ts) — reused
    // here, not redefined, to inspect a specific panel's live MapLibre
    // style after a global basemap pick (US2).
    __flowmapTestMaps?: Record<string, maplibregl.Map>
    // 021-basemap-catalog-redesign — basemapTab.tsx's own test registry
    // for the ONE shared preview map (contracts/basemap-catalog.md).
    __basemapPreviewTestMap?: maplibregl.Map
  }
}

// 020-settings-modal: real-browser coverage for the SettingsModal shell
// itself (US1) — cross-cutting behavior that doesn't belong to any one
// relocated control. scenarioManager.spec.ts (009-scenario-manager,
// extended by this feature) keeps the full add/remove/collision/baseline
// UI-flow coverage — its own boot() now opens this modal's Scenarios tab
// as a first step, so none of that coverage is duplicated here.

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
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

async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check).toBe(true)
}

// scenario-name is an <input> (US4's own editable label field) — value
// holds the custom label (empty when unset), placeholder holds the real
// name, so "what name is currently displayed" reads whichever is set.
function scenarioNamesInOrder(page: Page) {
  return page
    .getByTestId('scenario-load-list')
    .getByTestId('scenario-name')
    .evaluateAll((inputs) => inputs.map((el) => (el as HTMLInputElement).value || el.getAttribute('placeholder')))
}

test.describe('User Story 1 - One place to manage dashboard-wide settings', () => {
  test('the header shows exactly one Settings control — no standalone theme or scenario controls (FR-001, FR-002)', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
    // The previous standalone controls' own accessible names/testids are
    // gone entirely — not just relabeled.
    await expect(page.getByRole('button', { name: /^Theme:/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Load Local Scenario' })).toHaveCount(0)
    await expect(page.getByTestId('scenario-load-list')).toHaveCount(0)
  })

  test('opens a modal with all four tabs (FR-003)', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    for (const name of ['Appearance', 'Scenarios', 'Basemap', 'Documentation']) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }
  })

  test('Appearance tab: three directly visible options, no menu to open first (FR-004, research.md §9)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()

    // All three are visible simultaneously — no dropdown/menu interaction
    // needed to reveal Light/Dark, unlike the deleted ThemeToggle.
    for (const name of ['System', 'Light', 'Dark']) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('Scenarios tab shows each loaded scenario\'s real file path and status (FR-005)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    const list = page.getByTestId('scenario-load-list')
    // Name — scoped to the name input's own placeholder (US4's editable
    // label control; textContent-based assertions don't see it — see
    // scenarioManager.spec.ts's own comment on this for the full reason).
    await expect(page.getByRole('textbox', { name: 'Custom label for good_scenario' })).toHaveAttribute(
      'placeholder',
      'good_scenario',
    )
    await expect(page.getByRole('textbox', { name: 'Custom label for observed' })).toHaveAttribute(
      'placeholder',
      'observed',
    )
    // Path and status are plain text, unaffected.
    await expect(list).toContainText('scenarios/good_scenario/summary')
    await expect(list).toContainText('(ready)')
    await expect(list).toContainText('observed/summary')
  })

  test('the modal is dismissible via close button, overlay click, and Escape (FR-016)', async ({
    page,
  }) => {
    await boot(page)

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // Radix Dialog's overlay sits behind DialogContent, covering the rest
    // of the viewport — clicking it (outside the content box) closes.
    await page.mouse.click(5, 5)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('settings changes made while the modal was open remain in effect after closing it', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByRole('button', { name: 'Dark' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('rest of the dashboard renders normally alongside the new control', async ({ page }) => {
    await boot(page)
    await expect(panelCard(page, 'Total Households')).toBeVisible()
  })
})

test.describe('User Story 3 - A settings modal that does not resize or rearrange itself', () => {
  test('the modal renders at one fixed height and width across all four tabs (FR-019)', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog')

    const sizes: string[] = []
    for (const name of ['Appearance', 'Scenarios', 'Basemap', 'Documentation']) {
      await page.getByRole('tab', { name }).click()
      const box = await dialog.boundingBox()
      sizes.push(`${box!.width}x${box!.height}`)
    }
    expect(new Set(sizes).size).toBe(1)
  })

  test('the four tab triggers stack vertically, to the left of the active content (FR-020)', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()

    const appearanceBox = await page.getByRole('tab', { name: 'Appearance' }).boundingBox()
    const scenariosBox = await page.getByRole('tab', { name: 'Scenarios' }).boundingBox()
    const basemapBox = await page.getByRole('tab', { name: 'Basemap' }).boundingBox()
    const documentationBox = await page.getByRole('tab', { name: 'Documentation' }).boundingBox()
    // Stacked vertically — each one's top strictly below the previous.
    expect(scenariosBox!.y).toBeGreaterThan(appearanceBox!.y)
    expect(basemapBox!.y).toBeGreaterThan(scenariosBox!.y)
    expect(documentationBox!.y).toBeGreaterThan(basemapBox!.y)
    // All four share a comparable left edge (a vertical column).
    expect(Math.abs(appearanceBox!.x - documentationBox!.x)).toBeLessThan(2)

    // The active tab's own content sits to the RIGHT of the tab list.
    await page.getByRole('tab', { name: 'Scenarios' }).click()
    const contentBox = await page.getByTestId('scenario-load-list').boundingBox()
    expect(contentBox!.x).toBeGreaterThan(scenariosBox!.x + scenariosBox!.width)
  })

  test('a short tab (Documentation) leaves empty space; a tall tab (Basemap) scrolls internally, without resizing the modal (FR-021)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog')

    await page.getByRole('tab', { name: 'Documentation' }).click()
    const shortBox = await dialog.boundingBox()

    await page.getByRole('tab', { name: 'Basemap' }).click()
    const tallBox = await dialog.boundingBox()

    expect(tallBox!.height).toBe(shortBox!.height)
    // The Basemap tab's own content area is the one that scrolls — not
    // the dialog itself.
    const basemapContentOverflowsY = await page.evaluate(() => {
      const panel = document.querySelector('[role="tabpanel"][data-state="active"]')
      return panel ? panel.scrollHeight > panel.clientHeight : false
    })
    expect(basemapContentOverflowsY).toBe(true)
  })

  test("020-settings-modal's existing Appearance tab coverage is unaffected by this feature (FR-022)", async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    for (const name of ['System', 'Light', 'Dark']) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})

// 021-basemap-catalog-redesign: replaces 020-settings-modal's own flat,
// immediate-apply picker coverage entirely — the Basemap tab now renders
// four labeled sections, one persistent shared preview, and a stage-then-
// Apply flow (quickstart.md Scenarios 1-9). Helper for locating a
// section's own radiogroup, disambiguating "Positron" (present in both
// CARTO Vector Tiles and OpenFreeMap).
function sectionRadioGroup(page: Page, heading: string) {
  return page.getByRole('radiogroup', { name: heading })
}

test.describe('User Story 1 - Sectioned basemap catalog with stage-then-Apply', () => {
  const UNCONFIGURED_FLOWMAP = 'Flow Map Trip Distribution Desire Lines' // Summary tab — no panel/tab basemap:
  const CONFIGURED_FLOWMAP = 'Flowmap Panel Basemap Override' // Basemaps tab — basemap: carto-voyager

  test('renders four labeled sections in order, with three named UGRC entries (FR-001, FR-002)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    const headings = page.getByRole('heading', { level: 3 })
    await expect(headings).toHaveText(['UGRC Vector Tiles', 'CARTO Vector Tiles', 'OpenFreeMap', 'Raster Tiles'])

    const ugrc = sectionRadioGroup(page, 'UGRC Vector Tiles')
    await expect(ugrc.getByRole('radio', { name: 'Vector Lite' })).toBeVisible()
    await expect(ugrc.getByRole('radio', { name: 'Vector Hybrid' })).toBeVisible()
    await expect(ugrc.getByRole('radio', { name: 'Vector Outdoors' })).toBeVisible()
  })

  test('clicking a UGRC entry stages it and updates the shared preview, without applying it (FR-008, FR-009, FR-010)', async ({
    page,
  }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    const entry = sectionRadioGroup(page, 'UGRC Vector Tiles').getByRole('radio', { name: 'Vector Lite' })
    await entry.click()

    // Staged, visually marked — but nothing applied yet.
    await expect(entry).toHaveAttribute('aria-checked', 'true')
    await expect(entry).toHaveAttribute('data-staged', 'true')

    // The shared preview re-styles live — real network requests for both
    // real LiteBase/LiteLabels layer URLs (the exact composition
    // already proven in dashboard-3-basemaps.yaml's fixture panel).
    await trueEventually(async () =>
      requestUrls.some((u) => u.includes('LiteBase/VectorTileServer')) &&
      requestUrls.some((u) => u.includes('LiteLabels/VectorTileServer')),
    )
  })

  test('Apply — and only Apply — commits the staged selection to the live global basemap (FR-010, FR-012)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    await sectionRadioGroup(page, 'UGRC Vector Tiles').getByRole('radio', { name: 'Vector Hybrid' }).click()
    const globalBeforeApply = await page.evaluate(() => window.__wftdm!.appState.get('good_scenario')) // sanity: page still alive
    expect(globalBeforeApply).toBeTruthy()

    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // A real dashboard panel with no author-configured basemap re-renders
    // with the newly-applied UGRC Vector Hybrid composition.
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))
    await trueEventually(async () => requestUrls.some((u) => u.includes('Vector_Overlay/VectorTileServer')))
  })

  test('closing the modal with a staged, unapplied selection discards it (FR-014)', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, UNCONFIGURED_FLOWMAP)
    await trueEventually(async () => (await card.locator('.flowmap-chart').getAttribute('data-render-count')) !== null)

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await sectionRadioGroup(page, 'UGRC Vector Tiles').getByRole('radio', { name: 'Vector Outdoors' }).click()
    await page.keyboard.press('Escape') // close WITHOUT clicking Apply

    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))
    await page.waitForTimeout(500) // give a (bugged) apply a moment to have landed
    expect(requestUrls.some((u) => u.includes('OutdoorsBase/VectorTileServer'))).toBe(false)

    // Reopening starts fresh — "Vector Outdoors" is no longer staged.
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await expect(
      sectionRadioGroup(page, 'UGRC Vector Tiles').getByRole('radio', { name: 'Vector Outdoors' }),
    ).not.toHaveAttribute('data-staged', 'true')
  })

  test('the shared preview shows the currently-applied basemap the instant the tab opens, never blank (FR-011)', async ({
    page,
  }) => {
    // Registered BEFORE the re-open below — the preview's own mount
    // effect fires its style request as soon as the tab (re-)mounts, so a
    // listener attached any later than this would miss it entirely
    // (Playwright's request events are not buffered/replayed).
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await sectionRadioGroup(page, 'OpenFreeMap').getByRole('radio', { name: 'Liberty' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // Re-open — the preview (and the matching entry's staged marking)
    // reflect the now-applied value immediately, with no click needed.
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await expect(
      sectionRadioGroup(page, 'OpenFreeMap').getByRole('radio', { name: 'Liberty' }),
    ).toHaveAttribute('data-staged', 'true')
    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/liberty')))
  })

  test('selecting a raster provider stages it without a live preview, but Apply still works (FR-008, FR-013)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    const dropdown = page.getByRole('combobox', { name: 'Raster tile provider' })
    await expect(dropdown).toBeVisible()

    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))
    await dropdown.selectOption('OpenTopoMap')
    await page.waitForTimeout(300)
    expect(requestUrls.some((u) => u.includes('opentopomap.org'))).toBe(false) // no live preview
    await expect(page.getByText(/no live preview for raster providers/i)).toBeVisible()

    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await trueEventually(async () => requestUrls.some((u) => u.includes('opentopomap.org')))
  })

  test('the Raster Tiles dropdown never offers a known API-key-requiring provider', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    const dropdown = page.getByRole('combobox', { name: 'Raster tile provider' })
    await expect(dropdown).toBeVisible()
    const optionLabels = await dropdown.locator('option, optgroup').evaluateAll((els) =>
      els.map((el) => el.getAttribute('label') ?? el.textContent ?? ''),
    )
    for (const forbidden of ['MapTiler', 'Thunderforest', 'MapBox', 'HERE', 'AzureMaps', 'CartoDB']) {
      expect(optionLabels.join(' ')).not.toContain(forbidden)
    }
  })

  test('the Raster Tiles section never renders blank while loading', async ({ page }) => {
    await page.route('**/basemap/leaflet-providers.json', async (route) => {
      await new Promise((r) => setTimeout(r, 500))
      await route.continue()
    })
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await expect(page.getByTestId('raster-loading-skeleton')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Raster tile provider' })).toBeVisible({ timeout: 3000 })
  })

  test('the Raster Tiles section never renders blank on a fetch failure — shows the shared error state instead', async ({
    page,
  }) => {
    await page.route('**/basemap/leaflet-providers.json', (route) => route.abort())
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await expect(page.getByRole('alert')).toBeVisible() // PanelErrorState's role="alert"
    await expect(page.getByRole('combobox', { name: 'Raster tile provider' })).toHaveCount(0)
  })

  test('the shared preview map is created and destroyed with the Basemap tab\'s own active lifetime', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await trueEventually(async () => page.evaluate(() => window.__basemapPreviewTestMap !== undefined))

    await page.getByRole('tab', { name: 'Scenarios' }).click() // switch away
    await trueEventually(async () => page.evaluate(() => window.__basemapPreviewTestMap === undefined))

    await page.getByRole('tab', { name: 'Basemap' }).click() // switch back
    await trueEventually(async () => page.evaluate(() => window.__basemapPreviewTestMap !== undefined))
  })

  test('picking a global preset re-renders an unconfigured panel, with no page reload (SC-003)', async ({
    page,
  }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    const card = panelCard(page, UNCONFIGURED_FLOWMAP)
    await trueEventually(async () => (await card.locator('.flowmap-chart').getAttribute('data-render-count')) !== null)
    // The app-default tier resolves first, before any viewer pick exists.
    await trueEventually(async () => requestUrls.some((u) => u.includes('voyager-gl-style')))

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await sectionRadioGroup(page, 'OpenFreeMap').getByRole('radio', { name: 'Liberty' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // Reactive — no page.reload() anywhere in this test.
    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/liberty')))
  })

  test('a global pick never overrides a panel with its own configured basemap (SC-004, FR-017)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Basemaps' }).click() // dashboard-3-basemaps.yaml's own nav tab
    await trueEventually(async () => page.evaluate(() => window.__flowmapTestMaps !== undefined))
    await trueEventually(async () =>
      page.evaluate(
        (t) => Object.keys(window.__flowmapTestMaps?.[t]?.getStyle()?.sources ?? {}).length > 0,
        CONFIGURED_FLOWMAP,
      ),
    )
    const stylesBefore = await page.evaluate(
      (t) => window.__flowmapTestMaps![t].getStyle(),
      CONFIGURED_FLOWMAP,
    )

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await sectionRadioGroup(page, 'OpenFreeMap').getByRole('radio', { name: 'Liberty' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // Give a (bugged) reactive change a moment to have landed before
    // asserting its absence, same convention as scenarioManager.spec.ts's
    // own cancellation test.
    await page.waitForTimeout(500)
    const stylesAfter = await page.evaluate(
      (t) => window.__flowmapTestMaps![t].getStyle(),
      CONFIGURED_FLOWMAP,
    )
    expect(stylesAfter).toEqual(stylesBefore) // carto-voyager, completely untouched
  })
})

test.describe('User Story 3 - Reorder loaded scenarios', () => {
  // Registration order at boot: 'observed' always first
  // (scenarioDiscovery.ts's registerObserved() always runs before
  // registerPublishedScenarios()), then whatever
  // public/scenarios/index.json lists — this fixture set's own
  // index.json (tests/fixtures/scenarios) lists good_scenario then
  // broken_scenario.
  const DEFAULT_ORDER = ['observed', 'good_scenario', 'broken_scenario']

  test('moving a scenario up changes display order, boundary buttons stay correctly disabled (FR-007)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    await expect.poll(() => scenarioNamesInOrder(page)).toEqual(DEFAULT_ORDER)
    await expect(page.getByRole('button', { name: 'Move observed up' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move broken_scenario down' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move observed down' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Move good_scenario up' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Move good_scenario down' })).toBeEnabled()

    // Move the middle entry up — swaps with 'observed'.
    await page.getByRole('button', { name: 'Move good_scenario up' }).click()

    await expect
      .poll(() => scenarioNamesInOrder(page))
      .toEqual(['good_scenario', 'observed', 'broken_scenario'])
    // Boundary state follows the NEW order, not the old one.
    await expect(page.getByRole('button', { name: 'Move good_scenario up' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move observed down' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Move broken_scenario down' })).toBeDisabled()
  })

  test('reordering never changes the automatic-default baseline (FR-008)', async ({ page }) => {
    await boot(page)
    await expect
      .poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline()))
      .toBe('good_scenario')

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()
    await page.getByRole('button', { name: 'Move good_scenario up' }).click()
    await expect
      .poll(() => scenarioNamesInOrder(page))
      .toEqual(['good_scenario', 'observed', 'broken_scenario'])

    // UNCHANGED — getBaseline() never reads display order (research.md §3).
    await expect(page.evaluate(() => window.__wftdm!.appState.getBaseline())).resolves.toBe(
      'good_scenario',
    )
  })
})

test.describe('User Story 4 - Custom scenario label', () => {
  test('typing a label in the Scenarios tab displays it in place of the real name (FR-009)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    const labelInput = page.getByRole('textbox', { name: 'Custom label for good_scenario' })
    await expect(labelInput).toHaveValue('')
    await expect(labelInput).toHaveAttribute('placeholder', 'good_scenario')

    await labelInput.fill('Base Year')
    await expect(labelInput).toHaveValue('Base Year')
    const entry = await page.evaluate(() => window.__wftdm!.appState.get('good_scenario'))
    expect(entry?.label).toBe('Base Year')
    expect(entry?.name).toBe('good_scenario') // the real name is untouched

    // Clearing it back to empty reverts to showing the real name (FR-009's
    // own "optional" — an empty label is the same as no label).
    await labelInput.fill('')
    await expect(labelInput).toHaveValue('')
    await expect(labelInput).toHaveAttribute('placeholder', 'good_scenario')
    expect((await page.evaluate(() => window.__wftdm!.appState.get('good_scenario')))?.label).toBeUndefined()
  })

  test('a label is display-only — resolution still uses the real name; label is gone after reload (FR-010, FR-015)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    await page.evaluate(() => window.__wftdm!.appState.setLabel('good_scenario', 'Base Year'))
    // Scoped to the name inputs specifically — the row's own `path` text
    // legitimately still contains the literal substring "good_scenario"
    // (e.g. ".../scenarios/good_scenario/summary"), so a page-wide
    // "not toContainText('good_scenario')" would be wrong, not a real bug.
    await expect.poll(() => scenarioNamesInOrder(page)).toEqual(['observed', 'Base Year', 'broken_scenario'])

    // The real name still drives resolution — appState.get() keys on it
    // directly, and the underlying view is still queryable under its real
    // name (the label is a Scenario.label field nothing else reads; the
    // exhaustive "never substituted into SQL" guarantee is unit-tested
    // directly in tests/unit/appState.test.ts's own FR-010 case).
    const entry = await page.evaluate(() => window.__wftdm!.appState.get('good_scenario'))
    expect(entry?.label).toBe('Base Year')
    expect(entry?.name).toBe('good_scenario')
    const rows = await page.evaluate(() => window.__wftdm!.query('SELECT * FROM good_scenario__summary_kpis'))
    expect(rows.length).toBeGreaterThan(0)

    await page.reload()
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()
    // FR-015 — no persistence: back to the real name after reload.
    await expect.poll(() => scenarioNamesInOrder(page)).toEqual(['observed', 'good_scenario', 'broken_scenario'])
  })
})

test.describe('User Story 5 - Documentation placeholder', () => {
  test('Documentation tab shows a clearly labeled placeholder, no broken link (FR-014)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Documentation' }).click()
    await expect(page.getByText(/not yet published/i)).toBeVisible()
    await expect(page.getByRole('link')).toHaveCount(0)
  })
})
