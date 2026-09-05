# Quickstart: Basemap Catalog Redesign and Settings Modal Visual Polish

All scenarios below are fully automatable (Vitest for `registry.ts`/
`resolveEffectiveBasemap.ts`, Playwright for `settingsModal.tsx`/
`basemapTab.tsx`) — no real-hardware or manual step required.

**Revision note**: this file's own earlier draft had scenarios for a
per-entry `Popover`-preview design (immediate-apply on click, "at most
one preview open" as its own concern). That design is superseded in full
by the single shared preview + stage-then-apply flow below; Scenario 2/
4b's old assertions are replaced, not kept as alternates.

## Prerequisites

```powershell
npm run dev:fixtures   # copies tests/fixtures/* into public/{observed,scenarios,dashboard-config}
npm run dev            # dev server, or npx vitest / npx playwright test directly
```

## Scenario 1 — Four sections, three UGRC entries (US1 / FR-001, FR-002)

```ts
await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Basemap' }).click()
const sections = ['UGRC Vector Tiles', 'CARTO Vector Tiles', 'OpenFreeMap', 'Raster Tiles']
for (const heading of sections) {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
}
const ugrc = page.getByRole('heading', { name: 'UGRC Vector Tiles' }).locator('..')
await expect(ugrc.getByText('Vector Lite')).toBeVisible()
await expect(ugrc.getByText('Vector Hybrid')).toBeVisible()
await expect(ugrc.getByText('Vector Outdoors')).toBeVisible()
```

**Done when**: all four section headings render in order, and the UGRC
section shows exactly three named entries.

## Scenario 2 — Clicking a UGRC entry stages it and updates the shared preview, without applying it (US1 / FR-008, FR-009, FR-010)

```ts
// tests/unit — registry.test.ts
const preset = resolveBuiltInPreset('ugrc-vector-lite')
expect(preset).toEqual({
  kind: 'composition',
  layers: [
    expect.stringContaining('LiteBase/VectorTileServer'),
    expect.stringContaining('LiteLabels/VectorTileServer'),
  ],
})
```

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped assertions) —
// sectionRadioGroup() scopes by the section's own accessible radiogroup
// name, disambiguating "Positron" (present in both CARTO Vector Tiles and
// OpenFreeMap).
await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Basemap' }).click()
const entry = sectionRadioGroup(page, 'UGRC Vector Tiles').getByRole('radio', { name: 'Vector Lite' })
await entry.click()

await expect(entry).toHaveAttribute('aria-checked', 'true')
await expect(entry).toHaveAttribute('data-staged', 'true')
// The shared preview re-styles live — real network requests for both
// real layer URLs:
await trueEventually(async () =>
  requestUrls.some((u) => u.includes('LiteBase/VectorTileServer')) &&
  requestUrls.some((u) => u.includes('LiteLabels/VectorTileServer')),
)
```

**Done when**: clicking "Vector Lite" resolves through `loadBasemapStyle()`/
`composeStyles()` exactly as the existing `dashboard-3-basemaps.yaml`
fixture panel's manually-written equivalent composition does, visibly
updates the shared preview, marks the entry as staged — and the live
global basemap (`state/basemapState.ts`) does NOT change.

## Scenario 3 — Apply commits the staged selection; nothing else does (US1 / FR-010, FR-012)

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped assertions)
await page.getByRole('tab', { name: 'Basemap' }).click()
await sectionRadioGroup(page, 'UGRC Vector Tiles').getByRole('radio', { name: 'Vector Hybrid' }).click()
await page.getByRole('button', { name: 'Apply' }).click()
await page.getByRole('button', { name: /^Close$/ }).click()

// A real dashboard panel with no author-configured basemap re-renders
// with the newly-applied UGRC Vector Hybrid composition:
await trueEventually(async () => requestUrls.some((u) => u.includes('Vector_Overlay/VectorTileServer')))
```

**Done when**: the live global basemap changes if and only if Apply is
clicked — no catalog-entry click, by itself, ever changes it.

## Scenario 4 — Closing without Apply discards the staged selection (US1 / FR-014)

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped assertions)
await page.getByRole('tab', { name: 'Basemap' }).click()
await sectionRadioGroup(page, 'UGRC Vector Tiles').getByRole('radio', { name: 'Vector Outdoors' }).click()
await page.keyboard.press('Escape') // close the whole Settings modal, WITHOUT clicking Apply

const requestUrls: string[] = []
page.on('request', (req) => requestUrls.push(req.url()))
await page.waitForTimeout(500) // give a (bugged) apply a moment to have landed
expect(requestUrls.some((u) => u.includes('OutdoorsBase/VectorTileServer'))).toBe(false)

// Re-opening starts fresh — "Vector Outdoors" is no longer staged.
await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Basemap' }).click()
await expect(
  sectionRadioGroup(page, 'UGRC Vector Tiles').getByRole('radio', { name: 'Vector Outdoors' }),
).not.toHaveAttribute('data-staged', 'true')
```

**Done when**: staging a selection and closing the modal (or switching to
a different Settings tab) without clicking Apply leaves the live global
basemap byte-for-byte unchanged, and reopening the Basemap tab starts
fresh from that unchanged value.

## Scenario 5 — Preview shows the currently-applied basemap on first open, never blank (US1 / FR-011)

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped assertions) —
// applies a global pick first via the real Apply flow, closes, then
// re-opens to confirm the preview/staged-marking reflect it immediately.
await sectionRadioGroup(page, 'OpenFreeMap').getByRole('radio', { name: 'Liberty' }).click()
await page.getByRole('button', { name: 'Apply' }).click()
await page.getByRole('button', { name: /^Close$/ }).click()

await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Basemap' }).click()
await expect(
  sectionRadioGroup(page, 'OpenFreeMap').getByRole('radio', { name: 'Liberty' }),
).toHaveAttribute('data-staged', 'true')
// The preview map is already re-styled to 'openfreemap-liberty' before any click:
await trueEventually(async () => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/liberty')))
```

**Done when**: opening the Basemap tab with a global basemap already set
shows that basemap in the preview and marks its matching catalog entry as
staged, with no click required; with no global basemap set, it shows the
resolved `APP_DEFAULT` instead — never a blank preview area.

## Scenario 6 — Raster Tiles stages the same way, with no live preview (US1 / FR-008, FR-013)

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped assertions)
await page.getByRole('tab', { name: 'Basemap' }).click()
const dropdown = page.getByRole('combobox', { name: 'Raster tile provider' })
const requestUrls: string[] = []
page.on('request', (req) => requestUrls.push(req.url()))
await dropdown.selectOption('OpenTopoMap')
await page.waitForTimeout(300)
expect(requestUrls.some((u) => u.includes('opentopomap.org'))).toBe(false) // no live preview
await expect(page.getByText(/no live preview for raster providers/i)).toBeVisible()

await page.getByRole('button', { name: 'Apply' }).click()
await page.getByRole('button', { name: /^Close$/ }).click()
await trueEventually(async () => requestUrls.some((u) => u.includes('opentopomap.org'))) // Apply still works
```

**Done when**: selecting a raster provider stages it (Apply still applies
it) but never triggers a live preview render or network request — proving
Raster Tiles shares the stage-then-apply flow while keeping its existing
no-preview treatment.

## Scenario 7 — No API-key-requiring entry is ever selectable (US1 / FR-006, SC-002)

```ts
// tests/unit — registry.test.ts
const providers = await listCuratedRasterProviders()
for (const p of providers) {
  expect(p.name).not.toBe('CartoDB')
}
expect(providers.map((p) => p.name)).not.toEqual(
  expect.arrayContaining(['MapTiler', 'Thunderforest', 'MapBox', 'HERE', 'AzureMaps']),
)
```

**Done when**: none of the known key-requiring providers (or `CartoDB`)
appear anywhere in the curated list.

## Scenario 8 — Raster Tiles never renders blank while loading or on a fetch failure (US1 / research.md §5)

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped — two separate tests)
await page.route('**/basemap/leaflet-providers.json', async (route) => {
  await new Promise((r) => setTimeout(r, 500))
  await route.continue()
})
await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Basemap' }).click()
await expect(page.getByTestId('raster-loading-skeleton')).toBeVisible()
await expect(page.getByRole('combobox', { name: 'Raster tile provider' })).toBeVisible({ timeout: 3000 })
```

```ts
await page.route('**/basemap/leaflet-providers.json', (route) => route.abort())
await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Basemap' }).click()
await expect(page.getByRole('alert')).toBeVisible() // PanelErrorState's role="alert"
await expect(page.getByRole('combobox', { name: 'Raster tile provider' })).toHaveCount(0)
```

**Done when**: the Raster Tiles section always shows one of
loading-skeleton / error-alert / dropdown — never an unexplained blank
gap, at any point before or after the catalog fetch settles.

## Scenario 9 — The preview map's real lifecycle (US1, contracts/basemap-catalog.md test instrumentation)

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped assertions)
await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Basemap' }).click()
await trueEventually(async () => page.evaluate(() => window.__basemapPreviewTestMap !== undefined))

await page.getByRole('tab', { name: 'Scenarios' }).click() // switch away
await trueEventually(async () => page.evaluate(() => window.__basemapPreviewTestMap === undefined))

await page.getByRole('tab', { name: 'Basemap' }).click() // switch back
await trueEventually(async () => page.evaluate(() => window.__basemapPreviewTestMap !== undefined))
```

**Done when**: the ONE preview map's real `maplibregl.Map` instance
exists exactly while the Basemap tab is the active Settings tab — created
fresh each time the tab becomes active, torn down every time it doesn't
— proving there is exactly one map instance governed by ordinary mount/
unmount, not a multi-preview mechanism needing its own exclusivity
guard.

## Scenario 10 — Static app-default, no theme pairing (US2 / FR-015–FR-018)

```ts
// tests/unit — resolveEffectiveBasemap.test.ts
expect(resolveEffectiveBasemap(undefined, undefined)).toEqual({
  selection: APP_DEFAULT,
  source: 'app-default',
})
expect(APP_DEFAULT).toBe('carto-voyager')
```

```ts
// tests/integration/flowmapPanel.spec.ts (actual, shipped technique) —
// instruments map.setStyle() call COUNT directly, the same technique the
// existing "explicit pin is not re-paired" test already uses, rather
// than counting raw network requests: found, empirically, that a
// dark-mode class toggle can shift page layout enough to trigger
// MapLibre's own legitimate resize-driven re-tiling of an
// ALREADY-APPLIED style (several real sprite/glyph/tile requests),
// completely unrelated to whether this panel's own basemap-application
// effect re-ran — a raw request-count assertion is a real, confirmed
// flake source; a setStyle() call count is not.
await page.evaluate((t) => {
  const map = window.__flowmapTestMaps![t]
  window.__setStyleCallCount = 0
  const original = map.setStyle.bind(map)
  map.setStyle = ((...args) => { window.__setStyleCallCount!++; return original(...args) }) as typeof map.setStyle
}, title)
await page.evaluate(() => document.documentElement.classList.add('dark'))
await page.waitForTimeout(1000)
expect(await page.evaluate(() => window.__setStyleCallCount)).toBe(0) // no new setStyle() call fired
```

**Done when**: `resolveEffectiveBasemap()` takes no `theme` argument at
all, `APP_DEFAULT` resolves to `'carto-voyager'` unless a deployer
changes it, and flipping the Appearance theme never triggers a new
basemap load for an unconfigured panel.

## Scenario 11 — Global override still beats the static default (US2 / FR-017)

```ts
expect(resolveEffectiveBasemap(undefined, undefined, 'openfreemap-liberty')).toEqual({
  selection: 'openfreemap-liberty',
  source: 'global',
})
```

**Done when**: the precedence chain (panel → tab → global → app-default)
is otherwise unchanged from 020-settings-modal — only the bottom tier's
value source changed.

## Scenario 12 — Modal never resizes across tabs; tabs run vertically (US3 / FR-019–FR-021)

```ts
await page.getByRole('button', { name: 'Settings' }).click()
const dialog = page.getByRole('dialog')
const tabs = ['Appearance', 'Scenarios', 'Basemap', 'Documentation']
const sizes: { width: number; height: number }[] = []
for (const name of tabs) {
  await page.getByRole('tab', { name }).click()
  const box = await dialog.boundingBox()
  sizes.push({ width: box!.width, height: box!.height })
}
expect(new Set(sizes.map((s) => `${s.width}x${s.height}`)).size).toBe(1)

const applianceTabBox = await page.getByRole('tab', { name: 'Appearance' }).boundingBox()
const scenariosTabBox = await page.getByRole('tab', { name: 'Scenarios' }).boundingBox()
expect(scenariosTabBox!.y).toBeGreaterThan(applianceTabBox!.y) // stacked vertically
```

**Done when**: all four measured sizes are identical — including the
Basemap tab, whose content now includes the preview area — and the tab
triggers' bounding boxes stack vertically rather than running left to
right.

## Scenario 13 — Appearance tab unchanged (US3 / FR-022)

```ts
// Reuses 020-settings-modal's own existing assertions verbatim —
// no new test needed if they still pass unmodified.
await page.getByRole('tab', { name: 'Appearance' }).click()
await page.getByRole('button', { name: 'Dark' }).click()
await expect(page.locator('html')).toHaveClass(/dark/)
```

**Done when**: 020-settings-modal's existing Appearance-tab coverage
passes unmodified against this feature's changes — zero behavior change.
