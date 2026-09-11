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

  test('opens a modal with all three tabs (FR-003)', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // Documentation is no longer one of this modal's tabs (post-completion
    // correction) — it's its own standalone SidebarFooter entry now, see
    // "User Story 5 - Documentation placeholder" below.
    for (const name of ['Appearance', 'Scenarios', 'Basemap']) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }
  })

  test('Appearance tab: three directly visible options, no menu to open first (FR-004, research.md §9)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()

    // 024-settings-modal-visual-redesign (US4): migrated from
    // role="button"/aria-pressed to role="tab"/aria-selected — the
    // Appearance tab's System/Light/Dark control is now a real Tabs
    // instance, not a plain button row (research.md §3). Scoped to the
    // "Theme" tablist specifically — the dialog now also contains the
    // Settings modal's own outer "Settings sections" tablist, and both
    // expose role="tab" children.
    const themeTabs = page.getByRole('tablist', { name: 'Theme' })
    // All three are visible simultaneously — no dropdown/menu interaction
    // needed to reveal Light/Dark, unlike the deleted ThemeToggle.
    for (const name of ['System', 'Light', 'Dark']) {
      await expect(themeTabs.getByRole('tab', { name })).toBeVisible()
    }

    await themeTabs.getByRole('tab', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(themeTabs.getByRole('tab', { name: 'Dark' })).toHaveAttribute('aria-selected', 'true')

    await themeTabs.getByRole('tab', { name: 'Light' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(themeTabs.getByRole('tab', { name: 'Light' })).toHaveAttribute('aria-selected', 'true')
    await expect(themeTabs.getByRole('tab', { name: 'Dark' })).toHaveAttribute('aria-selected', 'false')
  })

  // UI polish pass (post-merge correction): a REAL regression, confirmed
  // directly before this fix — Radix Tabs' Presence child genuinely tears
  // down an inactive tab's content (not merely CSS-hides it), so the
  // Appearance tab's own `mode` used to be lost on every round trip
  // through another Settings tab, silently reverting Light/Dark back to
  // System. Fixed by lifting `mode` out of local useState into
  // state/themeState.ts (module-level, survives the remount) — see that
  // module's own comment for the full finding.
  test('a Light/Dark selection survives switching to another Settings tab and back', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    // 024-settings-modal-visual-redesign (US4): role="tab"/aria-selected,
    // migrated from role="button"/aria-pressed — see research.md §3.
    const themeTabs = page.getByRole('tablist', { name: 'Theme' })
    await themeTabs.getByRole('tab', { name: 'Light' }).click()
    await expect(themeTabs.getByRole('tab', { name: 'Light' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('tab', { name: 'Scenarios' }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()

    await expect(themeTabs.getByRole('tab', { name: 'Light' })).toHaveAttribute('aria-selected', 'true')
    await expect(themeTabs.getByRole('tab', { name: 'System' })).toHaveAttribute('aria-selected', 'false')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  // 024-settings-modal-visual-redesign (US4, FR-013/SC-005): proves the
  // disambiguation mechanism directly, rather than assuming distinct
  // aria-labels are sufficient — with the Appearance tab open, the modal
  // now genuinely contains TWO nested role="tablist" regions (the outer
  // Settings navigation, and this tab's own System/Light/Dark control).
  // Each must resolve to exactly ONE element by its own accessible name —
  // a Playwright strict-mode violation here would mean the two are not
  // actually distinguishable.
  test('the outer Settings navigation and the inner Theme control are two distinguishable tablist regions (FR-013)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('tablist', { name: 'Settings sections' })).toHaveCount(1)
    await expect(dialog.getByRole('tablist', { name: 'Theme' })).toHaveCount(1)

    // The outer tablist's own tabs are still reachable by name with no
    // collision against the inner "System"/"Light"/"Dark" names.
    for (const name of ['Appearance', 'Scenarios', 'Basemap']) {
      await expect(dialog.getByRole('tablist', { name: 'Settings sections' }).getByRole('tab', { name })).toHaveCount(
        1,
      )
    }
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
    // Path is plain text, unaffected. Status is no longer literal
    // "(ready)"/"(failed)" text, and since 037 item 5 there is no status
    // DOT either — the row's own left-border colour + background wash
    // (036 Part C, FR-017/FR-018) is the sole ready/failed channel.
    await expect(list).toContainText('scenarios/good_scenario/summary')
    await expect(list).toContainText('observed/summary')
    const readyBorder = await page
      .getByTestId('scenario-row-good_scenario')
      .evaluate((el) => getComputedStyle(el).borderLeftColor)
    const failedBorder = await page
      .getByTestId('scenario-row-broken_scenario')
      .evaluate((el) => getComputedStyle(el).borderLeftColor)
    expect(readyBorder).not.toBe(failedBorder)
  })

  // 024-settings-modal-visual-redesign (US1, FR-001), refined by 036 Part
  // C and again by 037 item 5: the ready/failed status DOT is now gone
  // entirely — the row's own left-border colour + background wash is the
  // sole channel for those two states (037 removed the dot as redundant).
  // 'registering' keeps its own separate "Loading…" text indicator, which
  // the fixture never exercises live (its scenarios settle before boot()
  // resolves), so its mapping stays covered by
  // tests/unit/scenarioStatusColor.test.ts.
  test('a "ready" and a "failed" scenario render a visually distinct row treatment (FR-001)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    const readyRow = page.getByTestId('scenario-row-good_scenario')
    const failedRow = page.getByTestId('scenario-row-broken_scenario')
    // No status dot anywhere in the list any more (037 item 5).
    await expect(page.getByTestId('scenario-status-dot-good_scenario')).toHaveCount(0)

    const [readyBorder, failedBorder, readyBg, failedBg] = await Promise.all([
      readyRow.evaluate((el) => getComputedStyle(el).borderLeftColor),
      failedRow.evaluate((el) => getComputedStyle(el).borderLeftColor),
      readyRow.evaluate((el) => getComputedStyle(el).backgroundColor),
      failedRow.evaluate((el) => getComputedStyle(el).backgroundColor),
    ])
    expect(readyBorder).not.toBe(failedBorder)
    expect(readyBg).not.toBe(failedBg)
    // The border colour is a real, non-transparent treatment.
    expect(readyBorder).not.toBe('rgba(0, 0, 0, 0)')
    expect(failedBorder).not.toBe('rgba(0, 0, 0, 0)')
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
    // 024-settings-modal-visual-redesign (US4): role="tab", migrated from
    // role="button" — see research.md §3.
    await page.getByRole('tablist', { name: 'Theme' }).getByRole('tab', { name: 'Dark' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('rest of the dashboard renders normally alongside the new control', async ({ page }) => {
    await boot(page)
    await expect(panelCard(page, 'Total Households')).toBeVisible()
  })
})

test.describe('User Story 3 - A settings modal that does not resize or rearrange itself', () => {
  test('the modal renders at one fixed height and width across all three tabs (FR-019)', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog')

    const sizes: string[] = []
    for (const name of ['Appearance', 'Scenarios', 'Basemap']) {
      await page.getByRole('tab', { name }).click()
      const box = await dialog.boundingBox()
      sizes.push(`${box!.width}x${box!.height}`)
    }
    expect(new Set(sizes).size).toBe(1)
  })

  // UI polish pass (post-merge correction): a REAL regression, confirmed
  // directly before this fix — Radix already sets the native `hidden`
  // attribute on an inactive tabpanel, but basemapTab.tsx's own TabsContent
  // additionally carried a `flex` display utility, which (as an
  // author-origin style) silently overrode the browser's own
  // `[hidden] { display: none }` user-agent default. The Basemap tabpanel
  // therefore stayed a real flex item in the shared Tabs Root's row even
  // while inactive, splitting that row's width with whichever tab WAS
  // active — Appearance/Scenarios/Documentation each rendered at roughly
  // HALF their real available width, visibly clipping their own content.
  // Fixed at the shared primitive (components/ui/tabs.tsx's own
  // `data-[state=inactive]:!hidden`), not just in basemapTab.tsx, since any
  // future TabsContent usage with a non-block display utility would hit
  // the identical bug.
  test('every tab\'s own content area renders at the full available width, not split with a hidden sibling tab', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    // Scoped to the dialog — an unscoped [role="tabpanel"] query is a real
    // strict-mode violation once a graphic-walker panel is on the page at
    // all (its own internal Data/Visualization switcher uses role="tabpanel"
    // too, the same nested-tablist hazard already documented for
    // dashboardShell.spec.ts's page-level getByRole('tab') query).
    const dialog = page.getByRole('dialog')

    const widths: number[] = []
    for (const name of ['Appearance', 'Scenarios', 'Basemap']) {
      await page.getByRole('tab', { name }).click()
      const panel = dialog.locator('[role="tabpanel"]:not([hidden])')
      const box = await panel.boundingBox()
      widths.push(box!.width)
    }
    // All three active tabpanels must occupy the SAME width — any hidden
    // sibling still participating in flex layout would shrink whichever
    // tab is currently active below this shared value.
    for (const w of widths) expect(Math.abs(w - widths[0])).toBeLessThan(2)

    // Every inactive tabpanel (within this modal) must be genuinely
    // display:none, not merely visually offscreen — confirms the fix,
    // not just its side effect.
    const inactiveDisplays = await dialog.evaluate((dialogEl) =>
      Array.from(dialogEl.querySelectorAll('[role="tabpanel"][hidden]')).map(
        (el) => getComputedStyle(el).display,
      ),
    )
    expect(inactiveDisplays.length).toBeGreaterThan(0)
    for (const d of inactiveDisplays) expect(d).toBe('none')
  })

  test('the three tab triggers stack vertically, to the left of the active content (FR-020)', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()

    const appearanceBox = await page.getByRole('tab', { name: 'Appearance' }).boundingBox()
    const scenariosBox = await page.getByRole('tab', { name: 'Scenarios' }).boundingBox()
    const basemapBox = await page.getByRole('tab', { name: 'Basemap' }).boundingBox()
    // Stacked vertically — each one's top strictly below the previous.
    expect(scenariosBox!.y).toBeGreaterThan(appearanceBox!.y)
    expect(basemapBox!.y).toBeGreaterThan(scenariosBox!.y)
    // All three share a comparable left edge (a vertical column).
    expect(Math.abs(appearanceBox!.x - basemapBox!.x)).toBeLessThan(2)

    // The active tab's own content sits to the RIGHT of the tab list.
    await page.getByRole('tab', { name: 'Scenarios' }).click()
    const contentBox = await page.getByTestId('scenario-load-list').boundingBox()
    expect(contentBox!.x).toBeGreaterThan(scenariosBox!.x + scenariosBox!.width)
  })

  test('a short tab (Appearance) leaves empty space; a tall tab (Basemap) scrolls internally, without resizing the modal (FR-021)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog')

    // Documentation (this test's original "short tab" example) is no
    // longer one of this modal's tabs — moved to its own standalone
    // SidebarFooter entry (post-completion correction). Appearance is now
    // the shortest remaining tab (a single label + one horizontal
    // System/Light/Dark control, confirmed via direct read of
    // appearanceTab.tsx — no scrollable content of its own), a like-for-like
    // substitute for exercising the same FR-021 behavior this test targets.
    await page.getByRole('tab', { name: 'Appearance' }).click()
    const shortBox = await dialog.boundingBox()

    await page.getByRole('tab', { name: 'Basemap' }).click()
    const tallBox = await dialog.boundingBox()

    expect(tallBox!.height).toBe(shortBox!.height)
    // The Basemap tab's own internal sections region is the one that
    // scrolls — not the outer tabpanel/dialog, and not the fixed preview/
    // description/Apply header block above it (UI polish pass:
    // basemapTab.tsx now owns its own fixed-header/scrollable-sections
    // split instead of relying on the shared TabsContent-level scroll
    // every other tab still uses unchanged).
    const sectionsOverflowY = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="basemap-sections-scroll"]')
      return el ? el.scrollHeight > el.clientHeight : false
    })
    expect(sectionsOverflowY).toBe(true)
  })

  test("020-settings-modal's existing Appearance tab coverage is unaffected by this feature (FR-022)", async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    // 024-settings-modal-visual-redesign (US4): role="tab", migrated from
    // role="button" — see research.md §3.
    const themeTabs = page.getByRole('tablist', { name: 'Theme' })
    for (const name of ['System', 'Light', 'Dark']) {
      await expect(themeTabs.getByRole('tab', { name })).toBeVisible()
    }
    await themeTabs.getByRole('tab', { name: 'Dark' }).click()
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
    // Section order: OpenFreeMap first (most universal, and the source of
    // the app-default 'openfreemap-positron'), then CARTO, then the
    // Utah-specific UGRC compositions, then Raster Tiles last.
    // 041-protomaps-pmtiles-basemap: "Protomaps" is the 5th vector-style
    // section, directly above Raster Tiles (spec.md FR-001).
    await expect(headings).toHaveText([
      'OpenFreeMap',
      'CARTO Vector Tiles',
      'UGRC Vector Tiles',
      'Protomaps',
      'Raster Tiles',
    ])

    const ugrc = sectionRadioGroup(page, 'UGRC Vector Tiles')
    await expect(ugrc.getByRole('radio', { name: 'Vector Lite' })).toBeVisible()
    await expect(ugrc.getByRole('radio', { name: 'Vector Hybrid' })).toBeVisible()
    await expect(ugrc.getByRole('radio', { name: 'Vector Outdoors' })).toBeVisible()
  })

  // 024-settings-modal-visual-redesign (US3, FR-010): the staged entry
  // must be distinguishable beyond aria-checked/data-staged alone —
  // proven directly via a real computed-style comparison, not just
  // presence of the attribute.
  test('the staged catalog entry has a distinct computed style from an unstaged one (FR-010)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    const carto = sectionRadioGroup(page, 'CARTO Vector Tiles')
    const positron = carto.getByRole('radio', { name: 'Positron' })
    const voyager = carto.getByRole('radio', { name: 'Voyager' })

    // Baseline: neither CARTO entry is the app default
    // ('openfreemap-positron'), so clicking Voyager is a REAL staged-state
    // transition here. Capture the unstaged border first, then poll for
    // the staged one to actually differ — a one-shot getComputedStyle()
    // read immediately after click() can land before React's re-render +
    // style recalc has flushed (the same reason the sibling hover test
    // below uses toHaveCSS polling rather than a bare evaluate()).
    const unstagedBorder = await positron.evaluate((el) => getComputedStyle(el).borderLeftColor)
    await voyager.click()
    await expect(voyager).toHaveAttribute('data-staged', 'true')
    await expect(voyager).not.toHaveCSS('border-left-color', unstagedBorder)
  })

  // 024-settings-modal-visual-redesign (US3, FR-010): a real hover state,
  // distinct from the resting appearance.
  test('an unstaged catalog entry has a distinct hover state (FR-010)', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    const positron = sectionRadioGroup(page, 'CARTO Vector Tiles').getByRole('radio', { name: 'Positron' })
    const before = await positron.evaluate((el) => getComputedStyle(el).backgroundColor)
    await positron.hover()
    // toHaveCSS polls (unlike a one-shot evaluate()) — the :hover-driven
    // style recalculation is not always reflected in the very next
    // synchronous getComputedStyle() call right after hover() resolves.
    await expect(positron).not.toHaveCSS('background-color', before)
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

  // 024-settings-modal-visual-redesign (US2): REVERSES 021's own FR-008
  // ("no live preview for raster providers") — research.md §1 confirmed
  // loadBasemapStyle() already resolves a raster provider name to a real
  // style, so the preview effect's own bypass was removed rather than any
  // new resolution logic added. This test now asserts the OPPOSITE of its
  // pre-existing name: a raster selection previews live, same as any
  // vector entry, and Apply still works unchanged.
  test('selecting a raster provider now previews live, and Apply still works (FR-004, FR-008 superseded)', async ({
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
    await trueEventually(async () => requestUrls.some((u) => u.includes('opentopomap.org')))
    await expect(page.getByText(/no live preview for raster providers/i)).toHaveCount(0)
    await expect(page.getByTestId('basemap-preview-error')).toHaveCount(0)

    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await trueEventually(async () => requestUrls.some((u) => u.includes('opentopomap.org')))
  })

  // 024-settings-modal-visual-redesign (US2, spec.md Acceptance Scenario 2):
  // a raster preview must not leave anything stale behind when the viewer
  // switches to a vector entry instead — proven by a real subsequent
  // request for that entry's own style, not merely the absence of an
  // error.
  test('switching from a raster preview back to a vector entry cleanly re-renders the vector style (FR-006)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    const dropdown = page.getByRole('combobox', { name: 'Raster tile provider' })
    await dropdown.selectOption('OpenTopoMap')
    await trueEventually(async () => requestUrls.some((u) => u.includes('opentopomap.org')))

    await sectionRadioGroup(page, 'CARTO Vector Tiles').getByRole('radio', { name: 'Voyager' }).click()
    await trueEventually(async () => requestUrls.some((u) => u.includes('voyager-gl-style')))
    await expect(page.getByTestId('basemap-preview-error')).toHaveCount(0)
    await expect(page.getByText(/no live preview for raster providers/i)).toHaveCount(0)
  })

  // 024-settings-modal-visual-redesign (US2, FR-007): a raster provider
  // whose tiles genuinely fail to load must show a distinct failure
  // message, not a blank map or silence — loadBasemapStyle()'s own
  // fail-soft "-> blank" contract (research.md §1) is correct for a real
  // panel but not expressive enough for a preview surface. Routes every
  // OpenTopoMap tile request to abort, simulating a real network/provider
  // failure.
  test('a raster provider whose tiles fail to load shows a distinct preview failure state (FR-007)', async ({
    page,
  }) => {
    // Two real, confirmed findings from writing this test, neither a bug
    // in this app's own logic:
    // (1) page.route()'s own abort only intercepts a request that
    //     actually reaches the network layer — a PRECEDING test in this
    //     describe block already loads real OpenTopoMap tiles
    //     successfully, and Chromium's HTTP disk cache can still serve
    //     those same tiles to a later test's fresh page/context with no
    //     new network request for page.route() to see at all. Disabling
    //     the cache via CDP first makes the abort() reliably observed
    //     regardless of test order.
    // (2) Even with every tile request genuinely failing at the network
    //     layer (confirmed via requestfailed events), MapLibre's own
    //     'error' Map event does not reliably fire for a raster tile
    //     failure — its SourceCache can self-abort an in-flight tile
    //     request for unrelated internal reasons, and a self-aborted tile
    //     never reaches the code path that fires 'error' at all (see
    //     basemapTab.tsx's own comment on its bounded-timeout fallback,
    //     added specifically because of this). The timeout below (well
    //     past that fallback's own 4s) is what this test actually relies
    //     on being reliable, not the 'error' event.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

    await page.route('**opentopomap.org**', (route) => route.abort())
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    const dropdown = page.getByRole('combobox', { name: 'Raster tile provider' })
    await dropdown.selectOption('OpenTopoMap')
    await expect(page.getByTestId('basemap-preview-error')).toBeVisible({ timeout: 8_000 })

    // Switching to a vector entry clears the failure state — it doesn't
    // linger for a selection it no longer applies to.
    await sectionRadioGroup(page, 'CARTO Vector Tiles').getByRole('radio', { name: 'Voyager' }).click()
    await expect(page.getByTestId('basemap-preview-error')).toHaveCount(0)
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

  test('the preview map carries the same NavigationControl/attribution/default view state as FlowMapPanel/ZoneMapPanel', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await trueEventually(async () => page.evaluate(() => window.__basemapPreviewTestMap !== undefined))

    const state = await page.evaluate(() => {
      const map = window.__basemapPreviewTestMap!
      const center = map.getCenter()
      return {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        hasNavigationControl: document.querySelector('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-compass') !== null,
        hasCompactAttribution: document.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact') !== null,
      }
    })
    // Same DEFAULT_CENTER/DEFAULT_ZOOM FlowMapPanel.tsx exports and uses
    // itself — imported directly by basemapTab.tsx, not redefined.
    expect(state.center[0]).toBeCloseTo(-111.89, 1)
    expect(state.center[1]).toBeCloseTo(40.76, 1)
    expect(state.zoom).toBeCloseTo(9, 0)
    expect(state.hasNavigationControl).toBe(true)
    expect(state.hasCompactAttribution).toBe(true)
  })

  test('the preview map\'s fixed header (map, description, Apply) never scrolls with the sections list', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()

    const applyButton = page.getByRole('button', { name: 'Apply' })
    const beforeScroll = await applyButton.boundingBox()
    await page.getByTestId('basemap-sections-scroll').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    const afterScroll = await applyButton.boundingBox()
    expect(afterScroll).toEqual(beforeScroll) // Apply (and the preview above it) never moved
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
    // APP_DEFAULT is 'openfreemap-positron' (registry.ts) — moved from
    // 'carto-voyager', project-docs/BASEMAP-PICKER-PROPOSAL.md §2/§3.
    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/positron')))

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

// 036-scenario-color-picker (US2) — REPLACES 035's own plain native
// <input type="color"> swatch tests below with real coverage of the
// redesigned Popover-hosted picker (a deliberate revision, not left
// stale — the swatch is now a Popover trigger <button>, its own
// "effective color" background style resolved from the SAME
// useScenarioDisplay() hook every chart panel reads, which as of
// 036 Part A no longer consults manifest color at all — see
// scenarioColorOverride.spec.ts's own "User Story 1 (036)" block for
// that resolution chain's own dedicated coverage).
test.describe('User Story 2 (036-scenario-color-picker) - Redesigned color picker', () => {
  function colorSwatch(page: Page, name: string) {
    return page.getByTestId(`scenario-color-swatch-${name}`)
  }

  async function resolveCssColor(page: Page, cssColor: string): Promise<string> {
    return page.evaluate((color) => {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;visibility:hidden;'
      probe.style.color = color
      document.body.appendChild(probe)
      const resolved = getComputedStyle(probe).color
      probe.remove()
      return resolved
    }, cssColor)
  }

  async function scenarioIndex(page: Page, name: string): Promise<number> {
    return page.evaluate((n) => window.__wftdm!.appState.list().findIndex((s) => s.name === n), name)
  }

  test('the swatch previews the current effective (shipped-default) color, before any override', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    const goodIndex = await scenarioIndex(page, 'good_scenario')
    const observedIndex = await scenarioIndex(page, 'observed')
    const goodExpected = await resolveCssColor(page, `var(--chart-${(goodIndex % 5) + 1})`)
    const observedExpected = await resolveCssColor(page, `var(--chart-${(observedIndex % 5) + 1})`)

    await expect(colorSwatch(page, 'good_scenario')).toHaveCSS('background-color', goodExpected)
    await expect(colorSwatch(page, 'observed')).toHaveCSS('background-color', observedExpected)
    // No "Reset to default" control yet — nothing is overridden, and the
    // popover itself hasn't even been opened.
    await expect(page.getByRole('button', { name: 'Reset to default' })).toHaveCount(0)
  })

  test('typing a hex code in the picker calls through to appState.setColorOverride, and Reset to default appears', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    await colorSwatch(page, 'good_scenario').click()
    const hexField = page.getByRole('textbox', { name: 'Hex color' })
    await expect(hexField).toBeVisible()

    await hexField.fill('#ff0000')
    await expect.poll(() => page.evaluate(() => window.__wftdm!.appState.get('good_scenario')?.colorOverride)).toBe(
      '#FF0000',
    )
    // The manifest color itself is untouched, and confirmed still
    // unconsulted by the actual resolution chain (036 Part A).
    expect((await page.evaluate(() => window.__wftdm!.appState.get('good_scenario')))?.color).toBe('#4e79a7')

    const resetButton = page.getByRole('button', { name: 'Reset to default' })
    await expect(resetButton).toBeVisible()
    await resetButton.click()
    expect(
      (await page.evaluate(() => window.__wftdm!.appState.get('good_scenario')))?.colorOverride,
    ).toBeUndefined()
  })

  test('changing an RGB field updates the same underlying color, identically to the hex path', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    await colorSwatch(page, 'good_scenario').click()
    await page.getByRole('combobox').click() // ColorPickerOutput's mode Select
    await page.getByRole('option', { name: 'RGB' }).click()

    const redField = page.getByRole('textbox', { name: 'Red' })
    await redField.fill('255')
    const greenField = page.getByRole('textbox', { name: 'Green' })
    await greenField.fill('0')
    const blueField = page.getByRole('textbox', { name: 'Blue' })
    await blueField.fill('0')

    await expect.poll(() => page.evaluate(() => window.__wftdm!.appState.get('good_scenario')?.colorOverride)).toBe(
      '#FF0000',
    )
  })

  test('a color override is gone after reload', async ({ page }) => {
    await boot(page)
    await page.evaluate(() => window.__wftdm!.appState.setColorOverride('good_scenario', '#ff0000'))

    await page.reload()
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.waitForFunction(
      () => window.__wftdm!.appState.get('good_scenario')?.status !== 'registering',
      null,
      { timeout: 30_000 },
    )
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    const goodIndex = await scenarioIndex(page, 'good_scenario')
    const expected = await resolveCssColor(page, `var(--chart-${(goodIndex % 5) + 1})`)
    await expect(colorSwatch(page, 'good_scenario')).toHaveCSS('background-color', expected)
  })
})

// 036-scenario-color-picker, Part C — a real UI/UX refinement of the
// Scenarios tab row itself, folded into this same feature after Parts
// A/B had already shipped: a genuinely prominent per-row status
// treatment, an active/inactive Switch wired directly to appState's
// existing active/setActive() (009-scenario-manager), and — after a
// direct-research refinement grounded in GitHub's own default-branch
// indicator and Stripe's own default-payment-method convention (both
// fetched directly) — a filled Star paired with its own "Baseline" text
// label as ONE unit, replacing an earlier separate Badge. Does not touch
// Parts A/B's own shipped mechanisms (palette resolution, the color
// picker) at all.
test.describe('User Story 3 (036-scenario-color-picker Part C) - Row status treatment, active toggle, baseline indicator', () => {
  function scenarioRow(page: Page, name: string) {
    // 037 gives every row a stable data-testid; the old status-dot anchor
    // is gone (037 item 5 removed the dot).
    return page.getByTestId(`scenario-row-${name}`)
  }

  test('a "ready" and a "failed" row show distinct, non-transparent border/background treatment, in both themes (FR-017/FR-018)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()

    const readyRow = scenarioRow(page, 'good_scenario')
    const failedRow = scenarioRow(page, 'broken_scenario')

    for (const dark of [false, true]) {
      await page.evaluate((useDark) => {
        document.documentElement.classList.toggle('dark', useDark)
      }, dark)

      const [readyBorder, failedBorder, readyBg, failedBg] = await Promise.all([
        readyRow.evaluate((el) => getComputedStyle(el).borderLeftWidth),
        failedRow.evaluate((el) => getComputedStyle(el).borderLeftWidth),
        readyRow.evaluate((el) => getComputedStyle(el).backgroundColor),
        failedRow.evaluate((el) => getComputedStyle(el).backgroundColor),
      ])
      // A real border-left, not the default 0px — and the two statuses'
      // own border colors and background washes are visually distinct
      // from one another (never identical, and never fully transparent).
      expect(readyBorder).not.toBe('0px')
      expect(failedBorder).not.toBe('0px')
      expect(readyBg).not.toBe('rgba(0, 0, 0, 0)')
      expect(failedBg).not.toBe('rgba(0, 0, 0, 0)')
      expect(readyBg).not.toBe(failedBg)
    }
  })

  test('toggling a scenario\'s Switch off immediately excludes it from a $scenario.-driven panel, and back on restores it (FR-019/FR-020)', async ({
    page,
  }) => {
    // `?s=good_scenario` activates good_scenario alongside the always-
    // active observed. row_scenario_display's table panel unions every
    // currently active scenario with no scenario:/scenarios: pin —
    // summary_kpis publishes 2 rows per scenario, so both active is 4.
    await page.goto('/?s=good_scenario')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.waitForFunction(
      () => window.__wftdm!.appState.get('good_scenario')?.status !== 'registering',
      null,
      { timeout: 30_000 },
    )
    const table = panelCard(page, 'Scenario Split (Table)').locator('tbody tr')
    await expect(table).toHaveCount(4)

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()
    // Located by row identity, not by the aria-label text itself — that
    // label flips with the toggle's own state.
    const observedSwitch = scenarioRow(page, 'observed').getByRole('switch')
    await expect(observedSwitch).toBeChecked()

    await observedSwitch.click()
    await expect(observedSwitch).not.toBeChecked()
    expect(await page.evaluate(() => window.__wftdm!.appState.get('observed')?.active)).toBe(false)
    await page.getByRole('button', { name: /^Close$/ }).click()
    await expect(table).toHaveCount(2)

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()
    await scenarioRow(page, 'observed').getByRole('switch').click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await expect(table).toHaveCount(4)
  })

  // NOTE: the 036 Part C Star / Star+"Baseline"-text baseline control was
  // replaced entirely by 037's single BaselineChip (Part D). The two
  // Star-specific tests that lived here are superseded by the
  // "User Story (037-scenarios-tab-redesign)" block's US2 coverage
  // (T017/T018/T019) below.
})

// 037-scenarios-tab-redesign: drag-and-drop reorder + leading-edge reorder
// controls (US1), consolidated baseline chip (US2), Switch tooltip (US3),
// and the Part A verification that the active/inactive Switch is NOT wired
// backwards (FR-001). Rows carry a stable `data-testid="scenario-row-{name}"`.
test.describe('User Story (037-scenarios-tab-redesign)', () => {
  function row(page: Page, name: string) {
    return page.getByTestId(`scenario-row-${name}`)
  }

  async function openScenariosTab(page: Page) {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()
  }

  // ---- Part A (FR-001): the active/inactive Switch is wired correctly ----
  // Not a bug — `checked={s.active}` with no negation. This test locks the
  // wiring in permanently so a future accidental inversion is caught.
  //
  // 038-all-loaded-scenarios: the "inactive scenario" side now uses
  // `broken_scenario` (status `failed` → never auto-activated). Under 038
  // `good_scenario` (status `ready`) DOES auto-activate on a plain boot,
  // so it is the second ACTIVE example here, not the inactive one.
  for (const dark of [false, true]) {
    test(`FR-001: the active/inactive Switch's checked state equals the real \`active\` value for both an active and an inactive scenario (${dark ? 'dark' : 'light'})`, async ({
      page,
    }) => {
      await boot(page)
      await openScenariosTab(page)
      await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)

      // Real values straight from the store.
      const [observedActive, goodActive, brokenActive] = await page.evaluate(() => [
        window.__wftdm!.appState.get('observed')?.active,
        window.__wftdm!.appState.get('good_scenario')?.active,
        window.__wftdm!.appState.get('broken_scenario')?.active,
      ])
      expect(observedActive).toBe(true) // ready → auto-active
      expect(goodActive).toBe(true) // ready → auto-active (038)
      expect(brokenActive).toBeFalsy() // failed → never auto-active

      const observedSwitch = row(page, 'observed').getByRole('switch')
      const goodSwitch = row(page, 'good_scenario').getByRole('switch')
      const brokenSwitch = row(page, 'broken_scenario').getByRole('switch')

      // Rendered state matches the store, in BOTH directions, together.
      // `aria-checked` is the semantic contract for role="switch" (Radix's
      // own `data-state` on the element is not asserted — the Part E
      // Tooltip trigger is applied to a wrapping span precisely so it
      // doesn't overwrite the Switch's own `data-state`).
      await expect(observedSwitch).toBeChecked()
      await expect(observedSwitch).toHaveAttribute('aria-checked', 'true')
      await expect(observedSwitch).toHaveAttribute('data-state', 'checked')
      await expect(goodSwitch).toBeChecked()
      await expect(goodSwitch).toHaveAttribute('aria-checked', 'true')
      await expect(goodSwitch).toHaveAttribute('data-state', 'checked')
      await expect(brokenSwitch).not.toBeChecked()
      await expect(brokenSwitch).toHaveAttribute('aria-checked', 'false')
      await expect(brokenSwitch).toHaveAttribute('data-state', 'unchecked')
    })
  }

  // ---- US1: reorder by drag or keyboard, from a leading-edge control ----

  function orderNames(page: Page) {
    return page.evaluate(() =>
      window.__wftdm!.appState.listByDisplayOrder().map((s: { name: string }) => s.name),
    )
  }
  function dragHandle(page: Page, name: string) {
    return row(page, name).getByRole('button', { name: `Reorder ${name}` })
  }

  async function pointerDrag(page: Page, handle: ReturnType<typeof dragHandle>, targetY: number) {
    const box = await handle.boundingBox()
    if (!box) throw new Error('drag handle has no bounding box')
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    // Past PointerSensor's 4px activation constraint, then stepped toward
    // the target so @dnd-kit's collision detection sees intermediate moves.
    for (const t of [0.15, 0.4, 0.7, 1]) {
      await page.mouse.move(startX, startY + (targetY - startY) * t, { steps: 3 })
    }
    await page.mouse.up()
  }

  test('T007: a pointer drag of a row handle past another row reorders the list, no reload', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)
    expect(await orderNames(page)).toEqual(['observed', 'good_scenario', 'broken_scenario'])

    const observedBox = await row(page, 'observed').boundingBox()
    // Drag good_scenario's handle up above observed.
    await pointerDrag(page, dragHandle(page, 'good_scenario'), observedBox!.y - 5)

    await expect.poll(() => orderNames(page)).toEqual([
      'good_scenario',
      'observed',
      'broken_scenario',
    ])
    // Rendered order matches the store.
    const renderedOrder = await page
      .getByTestId('scenario-load-list')
      .locator('[data-testid^="scenario-row-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('scenario-row-', '')))
    expect(renderedOrder).toEqual(['good_scenario', 'observed', 'broken_scenario'])
  })

  test('T008: a keyboard drag (Space to lift, arrows to move, Space to drop) reorders the list, with position-based live announcements (FR-006)', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)
    expect(await orderNames(page)).toEqual(['observed', 'good_scenario', 'broken_scenario'])

    // @dnd-kit's own off-screen live region (NOT react-beautiful-dnd's
    // leftover #rbd-announcement-* from graphic-walker, also on the page).
    // Its text is transient — overwritten on each drag event — so collect
    // every value it takes via a MutationObserver, then assert the *shape*
    // of what landed there rather than a specific frozen message.
    const announcements: string[] = []
    await page.exposeFunction('__recordAnnouncement', (t: string) => announcements.push(t))
    await page.evaluate(() => {
      const el = document.querySelector('[id^="DndLiveRegion"]')
      if (!el) return
      new MutationObserver(() => {
        const t = el.textContent?.trim()
        if (t) (window as unknown as { __recordAnnouncement: (s: string) => void }).__recordAnnouncement(t)
      }).observe(el, { childList: true, characterData: true, subtree: true })
    })

    await dragHandle(page, 'broken_scenario').focus()
    await page.keyboard.press('Space') // lift
    // Arrow-key movement. @dnd-kit's built-in sortableKeyboardCoordinates
    // absorbs the first arrow press per drag inside a CSS-transformed
    // ancestor (the Settings Dialog centres with -translate-*-1/2);
    // subsequent presses advance one row each and clamp at the boundary.
    // The functional guarantee — a keyboard-only user can lift, move, and
    // drop to a new position — holds; press well past the first.
    for (let k = 0; k < 4; k++) {
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(60)
    }
    await page.keyboard.press('Space') // drop
    await expect.poll(() => announcements.length).toBeGreaterThanOrEqual(2)

    // Every announcement uses position-based ("position N of M") phrasing,
    // per @dnd-kit's own accessibility guidance — never a raw array index.
    const joined = announcements.join(' | ')
    expect(joined).toMatch(/position \d+ of 3/i)
    expect(announcements.every((a) => /position \d+ of 3/i.test(a) || /cancelled/i.test(a))).toBe(true)

    // broken_scenario was dragged all the way to the top by keyboard.
    await expect.poll(() => orderNames(page)).toEqual([
      'broken_scenario',
      'observed',
      'good_scenario',
    ])
  })

  test('T008b: a keyboard drag cancelled with Escape leaves the order unchanged (FR-007)', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)
    const before = await orderNames(page)

    await dragHandle(page, 'broken_scenario').focus()
    await page.keyboard.press('Space') // lift
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Escape') // cancel
    expect(await orderNames(page)).toEqual(before)
  })

  test('T009: the relocated leading-edge arrows still reorder one step; boundary arrows are disabled', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)

    await row(page, 'broken_scenario').getByRole('button', { name: 'Move broken_scenario up' }).click()
    await expect.poll(() => orderNames(page)).toEqual([
      'observed',
      'broken_scenario',
      'good_scenario',
    ])

    // observed is at the top → its "up" arrow is disabled, still present.
    const observedUp = row(page, 'observed').getByRole('button', { name: 'Move observed up' })
    await expect(observedUp).toBeVisible()
    await expect(observedUp).toBeDisabled()
    // good_scenario is now at the bottom → its "down" arrow is disabled.
    const goodDown = row(page, 'good_scenario').getByRole('button', { name: 'Move good_scenario down' })
    await expect(goodDown).toBeVisible()
    await expect(goodDown).toBeDisabled()
  })

  test('T010: reordering the list never changes the resolved baseline (FR / Edge Case)', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)
    const baselineBefore = await page.evaluate(() => window.__wftdm!.appState.getBaseline())
    expect(baselineBefore).toBeTruthy()

    // Move broken_scenario to the top via its (leading-edge) up arrow.
    await row(page, 'broken_scenario').getByRole('button', { name: 'Move broken_scenario up' }).click()
    await row(page, 'broken_scenario').getByRole('button', { name: 'Move broken_scenario up' }).click()

    expect(await orderNames(page)).toEqual(['broken_scenario', 'observed', 'good_scenario'])
    expect(await page.evaluate(() => window.__wftdm!.appState.getBaseline())).toBe(baselineBefore)
  })

  test('T011: every non-reorder control is pixel-aligned across all rows, both themes (FR-015)', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)
    const names = ['observed', 'good_scenario', 'broken_scenario']

    for (const dark of [false, true]) {
      await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)

      // 037 item 5: no status dot; the colour swatch moved into the
      // identity block (before the name).
      const xs: Record<string, number[]> = { swatch: [], name: [], sw: [], chip: [] }
      for (const n of names) {
        const r = row(page, n)
        xs.swatch.push((await r.getByTestId(`scenario-color-swatch-${n}`).boundingBox())!.x)
        xs.name.push((await r.getByTestId('scenario-name').boundingBox())!.x)
        xs.sw.push((await r.getByRole('switch').boundingBox())!.x)
        // BaselineChip's outer container — fixed reserved width, so its x
        // is identical whether the row is the baseline row or not.
        xs.chip.push((await r.getByTestId(`baseline-chip-${n}`).boundingBox())!.x)
      }
      for (const key of Object.keys(xs)) {
        const [a, b, c] = xs[key]
        expect(Math.abs(b - a), `${key} x mismatch (${dark ? 'dark' : 'light'})`).toBeLessThan(1)
        expect(Math.abs(c - a), `${key} x mismatch (${dark ? 'dark' : 'light'})`).toBeLessThan(1)
      }
    }
  })

  test('T011b: the colour swatch is vertically centred against the WHOLE name+path identity block, both themes', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)
    const names = ['observed', 'good_scenario', 'broken_scenario']

    for (const dark of [false, true]) {
      await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)
      for (const n of names) {
        const r = row(page, n)
        const swatch = (await r.getByTestId(`scenario-color-swatch-${n}`).boundingBox())!
        const name = (await r.getByTestId('scenario-name').boundingBox())!
        const path = (await r.locator('.font-mono').first().boundingBox())!

        const swatchCentreY = swatch.y + swatch.height / 2
        // Midpoint between the name line's centre and the path line's centre.
        const nameCentreY = name.y + name.height / 2
        const pathCentreY = path.y + path.height / 2
        const blockMidY = (nameCentreY + pathCentreY) / 2

        // Swatch centre lands on the two-line block's midpoint — not on
        // the name line alone (which would be ~one half-line higher).
        expect(
          Math.abs(swatchCentreY - blockMidY),
          `${n} swatch not centred on the 2-line block (${dark ? 'dark' : 'light'})`,
        ).toBeLessThan(2)
        // And it is genuinely BELOW the name line's own centre (proving
        // it is no longer beside the name alone).
        expect(swatchCentreY).toBeGreaterThan(nameCentreY)
      }
    }
  })

  // ---- US2: one self-explanatory baseline chip (Part D) ----

  function baselineChip(page: Page, name: string) {
    return page.getByTestId(`baseline-chip-${name}`)
  }

  test('T017: the baseline row shows a filled, non-interactive "Baseline" chip beside the name; no tooltip', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)
    const baselineName = (await page.evaluate(() => window.__wftdm!.appState.getBaseline()))!

    const chip = baselineChip(page, baselineName).getByText('Baseline', { exact: true })
    await expect(chip).toBeVisible()
    // Not wrapped in a button — a status display, not an action.
    await expect(baselineChip(page, baselineName).getByRole('button')).toHaveCount(0)
    // No tooltip: hovering it surfaces nothing.
    await chip.hover()
    await page.waitForTimeout(400)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test('T018: a non-baseline row shows an outline clickable "Set as baseline" chip; clicking it moves the baseline', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)
    const baselineName = (await page.evaluate(() => window.__wftdm!.appState.getBaseline()))!
    const other = baselineName === 'good_scenario' ? 'observed' : 'good_scenario'

    const otherChipButton = baselineChip(page, other).getByRole('button', {
      name: `Mark ${other} as baseline scenario`,
    })
    await expect(otherChipButton).toBeVisible()
    await expect(otherChipButton.getByText('Set as baseline', { exact: true })).toBeVisible()

    await otherChipButton.click()
    await expect
      .poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline()))
      .toBe(other)
    // The filled "Baseline" chip moved to `other`; the old baseline row's
    // chip is now the outline "Set as baseline" button.
    await expect(baselineChip(page, other).getByText('Baseline', { exact: true })).toBeVisible()
    await expect(
      baselineChip(page, baselineName).getByRole('button', {
        name: `Mark ${baselineName} as baseline scenario`,
      }),
    ).toBeVisible()
  })

  test('T019: no Star icon / no separate Badge remains; the chip is the only baseline control, fixed width, both themes', async ({
    page,
  }) => {
    await boot(page)
    await openScenariosTab(page)

    // No leftover Star-era control anywhere in the list.
    const list = page.getByTestId('scenario-load-list')
    await expect(
      list.getByRole('button', { name: /is the baseline scenario/ }),
    ).toHaveCount(0)
    await expect(list.locator('[aria-pressed]')).toHaveCount(0)

    const baselineName = (await page.evaluate(() => window.__wftdm!.appState.getBaseline()))!
    const other = baselineName === 'good_scenario' ? 'observed' : 'good_scenario'

    for (const dark of [false, true]) {
      await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)
      // The chip's reserved width is identical between the baseline row
      // ("Baseline") and a non-baseline row ("Set as baseline"), so the
      // identity block never shifts (FR-015).
      const wBaseline = (await baselineChip(page, baselineName).boundingBox())!.width
      const wOther = (await baselineChip(page, other).boundingBox())!.width
      expect(Math.abs(wBaseline - wOther), `chip width mismatch (${dark ? 'dark' : 'light'})`).toBeLessThan(1)
      // And the name input's x is identical across rows either way.
      const nameXs = await Promise.all(
        [baselineName, other, 'broken_scenario'].map(async (n) =>
          (await row(page, n).getByTestId('scenario-name').boundingBox())!.x,
        ),
      )
      expect(Math.abs(nameXs[1] - nameXs[0])).toBeLessThan(1)
      expect(Math.abs(nameXs[2] - nameXs[0])).toBeLessThan(1)
    }
  })

  // ---- US3: discoverable Switch tooltip (Part E) ----

  for (const dark of [false, true]) {
    test(`T024: hovering the active/inactive Switch shows an explanatory tooltip; the baseline chip has none (${dark ? 'dark' : 'light'})`, async ({
      page,
    }) => {
      await boot(page)
      await openScenariosTab(page)
      await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)

      const sw = row(page, 'good_scenario').getByRole('switch')
      const ariaLabelBefore = await sw.getAttribute('aria-label')
      const checkedBefore = await sw.getAttribute('aria-checked')

      await sw.hover()
      const tip = page.getByRole('tooltip')
      await expect(tip).toBeVisible()
      // 037 item 2: the copy is scoped to the Switch's REAL effect — it
      // only matters for panels that don't pin a specific scenario.
      await expect(tip).toContainText(/pinned to a specific scenario/i)

      // FR-013: the tooltip changes nothing about the Switch's wiring —
      // aria-label and checked state are exactly what they were before
      // the hover (038: good_scenario is auto-active, so `checkedBefore`
      // is 'true' here — the point is the hover doesn't alter it).
      expect(await sw.getAttribute('aria-label')).toBe(ariaLabelBefore)
      expect(await sw.getAttribute('aria-checked')).toBe(checkedBefore)

      // Move the pointer well away and let the Switch tooltip close.
      await page.mouse.move(1, 1)
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('tooltip').count()).toBe(0)

      // The baseline chip has no tooltip of its own (FR-011).
      const baselineName = (await page.evaluate(() => window.__wftdm!.appState.getBaseline()))!
      await page.getByTestId(`baseline-chip-${baselineName}`).hover()
      await page.waitForTimeout(500)
      await expect(page.getByRole('tooltip')).toHaveCount(0)
    })
  }
})

// Post-completion correction (explicit user request): Documentation is no
// longer a tab inside the Settings modal — it's its own standalone
// SidebarFooter entry (layout/documentationModal.tsx), positioned below
// Settings, opening its own small Dialog. FR-014's own "clearly labeled
// placeholder, no broken link" requirement is unchanged; only its
// container/entry-point moved.
test.describe('User Story 5 - Documentation placeholder', () => {
  test('Documentation is its own standalone control, separate from and below Settings, opening a clearly labeled placeholder with no broken link (FR-014)', async ({
    page,
  }) => {
    await boot(page)

    // Two distinct controls, not one nested inside the other's dialog.
    const settingsButton = page.getByRole('button', { name: 'Settings' })
    const documentationButton = page.getByRole('button', { name: 'Documentation' })
    await expect(settingsButton).toBeVisible()
    await expect(documentationButton).toBeVisible()
    const settingsBox = await settingsButton.boundingBox()
    const documentationBox = await documentationButton.boundingBox()
    expect(documentationBox!.y).toBeGreaterThan(settingsBox!.y)

    await documentationButton.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Documentation' })).toBeVisible()
    // Not the Settings modal — no Settings-only tabs leaked in alongside it.
    await expect(dialog.getByRole('tab', { name: 'Appearance' })).toHaveCount(0)

    await expect(page.getByText(/not yet published/i)).toBeVisible()
    await expect(page.getByRole('link')).toHaveCount(0)
  })
})
