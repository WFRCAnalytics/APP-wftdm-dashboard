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

test.describe('User Story 2 - Viewer-wide basemap choice', () => {
  const UNCONFIGURED_FLOWMAP = 'Flow Map Trip Distribution Desire Lines' // Summary tab — no panel/tab basemap:
  const CONFIGURED_FLOWMAP = 'Flowmap Panel Basemap Override' // Basemaps tab — basemap: carto-voyager

  test('picking a global preset re-renders an unconfigured panel, with no page reload (SC-003)', async ({
    page,
  }) => {
    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    await boot(page)
    const card = panelCard(page, UNCONFIGURED_FLOWMAP)
    await trueEventually(async () => (await card.locator('.flowmap-chart').getAttribute('data-render-count')) !== null)
    // The app-default tier resolves first, before any viewer pick exists.
    await trueEventually(async () => requestUrls.some((u) => u.includes('positron-gl-style')))

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    await page.getByRole('radio', { name: 'openfreemap-liberty' }).click()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // Reactive — no page.reload() anywhere in this test.
    await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/liberty')))
  })

  test('a global pick never overrides a panel with its own configured basemap (SC-004, FR-012)', async ({
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
    await page.getByRole('radio', { name: 'openfreemap-liberty' }).click()
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

  test('the Basemap tab picker reflects the viewer\'s current pick as selected', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Basemap' }).click()
    const option = page.getByRole('radio', { name: 'carto-dark-matter' })
    await expect(option).toHaveAttribute('aria-checked', 'false')
    await option.click()
    await expect(option).toHaveAttribute('aria-checked', 'true')
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
