# Quickstart: Unified Settings Modal

All scenarios below are fully automatable (Vitest for `appState.ts`/
`basemapState.ts`/`resolveEffectiveBasemap.ts`, Playwright for
`settingsModal.tsx` and its four tabs) — no real-hardware or manual step
required.

## Prerequisites

```powershell
npm run dev:fixtures   # copies tests/fixtures/* into public/{observed,scenarios,dashboard-config}
npm run dev            # dev server, or npx vitest / npx playwright test directly
```

## Scenario 1 — Header shows exactly one settings control (US1 / FR-001, FR-002)

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped assertions —
// checked BEFORE the modal is ever opened, since Radix Dialog/Tabs don't
// mount any tab's content until opened; `scenario-load-trigger-disabled-
// wrapper` is reused by the NEW ScenariosTab too, so it's not itself
// evidence of anything "old" being gone pre-open — the meaningful check
// is the old standalone controls' own always-visible triggers/testids)
await page.goto('/')
await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
await expect(page.getByRole('button', { name: /^Theme:/i })).toHaveCount(0)     // old ThemeToggle trigger, gone
await expect(page.getByRole('button', { name: 'Load Local Scenario' })).toHaveCount(0) // old always-visible ScenarioLoader trigger, gone
await expect(page.getByTestId('scenario-load-list')).toHaveCount(0)            // old always-visible scenario list, gone
```

**Done when**: no element from the removed `ThemeToggle`/`ScenarioLoader`
components exists anywhere in the DOM — only the new `SettingsModal`
trigger.

## Scenario 2 — Appearance tab behaves identically to the old ThemeToggle (US1 / FR-004)

```ts
await page.getByRole('button', { name: /settings/i }).click()
await page.getByRole('tab', { name: 'Appearance' }).click()
// Three directly visible options (research.md §9), not a dropdown —
// exact role/name per final markup (e.g. a ToggleGroup or Tabs-styled
// button group), but no menu needs opening first.
await page.getByRole('button', { name: 'Dark' }).click()
await expect(page.locator('html')).toHaveClass(/dark/)
```

**Done when**: selecting Dark/Light/System produces the exact same
`document.documentElement` class change `themeToggle.spec.ts` already
asserts against the old component, and all three options are visible
without opening a menu first.

## Scenario 3 — Reordering doesn't move the automatic baseline (US3 / FR-007, FR-008)

```ts
// tests/unit/appState.test.ts
appState.register('a', { source: 'url', path: 'a/' })
appState.register('b', { source: 'url', path: 'b/' })
appState.setStatus('a', 'ready')
appState.setStatus('b', 'ready')
expect(appState.getBaseline()).toBe('a')   // earliest-registered, ready, unpinned

appState.moveScenario('b', 'up')            // b now displays before a
expect(appState.listByDisplayOrder().map((s) => s.name)).toEqual(['b', 'a'])
expect(appState.getBaseline()).toBe('a')   // UNCHANGED — still registration order
```

**Done when**: `moveScenario()` changes `listByDisplayOrder()`'s output
but never changes `getBaseline()`'s output, for any sequence of moves,
whenever no scenario is explicitly marked baseline.

## Scenario 4 — New scenario appends to the end of a reordered list (US3 / FR-018)

```ts
appState.register('a', { source: 'url', path: 'a/' })
appState.register('b', { source: 'url', path: 'b/' })
appState.moveScenario('b', 'up')   // display order: b, a
appState.register('c', { source: 'url', path: 'c/' })
expect(appState.listByDisplayOrder().map((s) => s.name)).toEqual(['b', 'a', 'c'])
```

**Done when**: `c` always lands last in `listByDisplayOrder()`, regardless
of the reorder that happened before it registered.

## Scenario 5 — Custom label is display-only (US4 / FR-009, FR-010)

```ts
appState.register('abm_2026_final_v3', { source: 'url', path: 'abm_2026_final_v3/' })
appState.setLabel('abm_2026_final_v3', 'Base Year')
expect(appState.get('abm_2026_final_v3')?.label).toBe('Base Year')

// Resolution still uses the real name — sqlExpander/panelQuery are
// unmodified by this feature and were never given the label at all.
const sql = sqlExpander.expand('$scenario.summary_kpis', ..., ['abm_2026_final_v3'])
expect(sql).toContain('abm_2026_final_v3__summary_kpis')
expect(sql).not.toContain('Base Year')
```

**Done when**: the label appears only where the Scenarios tab renders it,
never inside any generated SQL.

## Scenario 6 — Global basemap fills the app-default tier only (US2 / FR-011, FR-012, FR-013)

```ts
// tests/unit/resolveEffectiveBasemap.test.ts — new 5th truth-table row
expect(resolveEffectiveBasemap(undefined, undefined, 'light', 'openfreemap-liberty'))
  .toEqual({ selection: 'openfreemap-liberty', source: 'global' })

// An explicit panel-level basemap still wins over a global pick:
expect(resolveEffectiveBasemap('carto-voyager', undefined, 'light', 'openfreemap-liberty'))
  .toEqual({ selection: 'carto-voyager', source: 'panel' })
```

```ts
// tests/integration/settingsModal.spec.ts (actual, shipped assertions) —
// live panel re-render, no reload. The Basemap tab's real picker uses
// role="radio" with the RAW preset name as its accessible name (e.g.
// "openfreemap-liberty" — registry.ts's own key, not a prettified
// display label), and this feature's own test confirms the reactive
// re-render via a real network request for the newly-picked preset's URL
// (the same technique 011-basemap-style-system's own flowmapPanel.spec.ts
// already established), not a waitForBasemapApplied() helper import.
await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Basemap' }).click()
await page.getByRole('radio', { name: 'openfreemap-liberty' }).click()
await page.getByRole('button', { name: /^Close$/ }).click()
// Reused real fixture panels, not new ones: dashboard-1-summary.yaml's
// own already-unconfigured flowmap ("Flow Map Trip Distribution Desire
// Lines") re-renders with the new preset —
await trueEventually(() => requestUrls.some((u) => u.includes('tiles.openfreemap.org/styles/liberty')))
// — while dashboard-3-basemaps.yaml's own already-panel-configured
// flowmap ("Flowmap Panel Basemap Override", basemap: carto-voyager)
// keeps its exact prior getStyle() output, completely untouched.
```

**Done when**: every flowmap/zonemap panel with no author-configured
basemap re-renders with the viewer's pick, with no page reload; every
panel/tab that DOES have an author-configured basemap is unaffected —
0% override rate, matching SC-003/SC-004.

## Scenario 7 — LOCAL deployment mode disables one control, not the tab (US1 / FR-019)

```ts
// playwright.config.js's real webServer runs on port 5199, under the
// /APP-wftdm-dashboard/ base path (vite.config.ts) — this scenario
// specifically navigates against literal 'localhost' (not the
// 127.0.0.1 baseURL every other test uses) to exercise
// isLocalDeployment()'s real hostname === 'localhost' check.
await page.goto('http://localhost:5199/APP-wftdm-dashboard/')
await page.getByRole('button', { name: 'Settings' }).click()
await page.getByRole('tab', { name: 'Scenarios' }).click()
await expect(page.getByTestId('scenario-load-list')).toBeVisible()   // list still renders
const trigger = page.getByTestId('scenario-load-trigger-disabled-wrapper')
await expect(trigger).toBeVisible()
await expect(trigger.getByRole('button')).toBeDisabled()
await trigger.hover()
await expect(page.getByText('This deployment already loads scenarios directly')).toBeVisible()
```

**Done when**: the Scenarios tab and its scenario list/baseline/remove
controls all render normally in LOCAL mode; only "Load Local Scenario"
is disabled with a tooltip — the tab itself was never hidden or empty.

## Scenario 8 — No persistence, anywhere (all stories / FR-015)

```ts
await page.reload()
await expect(page.locator('html')).not.toHaveClass(/dark/) // if System resolves light
// Re-open Settings -> Scenarios tab: no custom label, default order, default basemap.
```

**Done when**: every setting introduced by this feature — theme override,
scenario display order, scenario custom labels, global basemap pick — is
back to its default immediately after a reload, matching `ThemeToggle`'s
own already-shipped no-persistence precedent.
