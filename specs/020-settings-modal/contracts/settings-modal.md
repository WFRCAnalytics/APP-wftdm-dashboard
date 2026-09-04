# Contract: Settings Modal UI

## Trigger and shell

- `shell.tsx`'s header renders exactly one `<SettingsModal />`
  (`layout/settingsModal.tsx`) in place of the previous
  `<ScenarioLoader />` + `<ThemeToggle />` pair.
- The trigger is a single `Button` (icon + label, e.g. a `Settings`
  `lucide-react` icon) that opens `components/ui/dialog.tsx`'s `Dialog`.
- Inside the `Dialog`'s `DialogContent`, a `components/ui/tabs.tsx` `Tabs`
  renders four `TabsTrigger`/`TabsContent` pairs, in this order:
  Appearance, Scenarios, Basemap, Documentation.
- Dismissal (`DialogClose`, overlay click, Escape) behaves exactly as
  `Dialog` already provides — no new dismissal code (FR-016).

## Appearance tab (`layout/settings/appearanceTab.tsx`)

- Reuses `themeToggle.tsx`'s exact local `mode` state and its
  mount/mode effect (applying `.dark` to `document.documentElement`,
  managing the `matchMedia` listener's lifecycle) unchanged — no
  behavior change (FR-004).
- Visually presents System/Light/Dark as three directly visible options
  (a horizontal `Tabs`-or-`ToggleGroup`-style control — implementation
  detail, not a contract requirement), reverting `015-theme-toggle`'s
  original design rather than reusing that feature's later compact
  icon-only `DropdownMenu` redesign. See research.md §9 for why the
  constraint that motivated the dropdown redesign doesn't apply here.

## Scenarios tab (`layout/settings/scenariosTab.tsx`) — LOCAL-mode treatment

- Unlike the previous standalone `ScenarioLoader` (which returned `null`
  entirely when `isLocalDeployment()`), the Scenarios tab MUST always
  render its full scenario list and every control on it. Only the "Load
  Local Scenario" trigger is deployment-mode-sensitive: disabled, wrapped
  in the same `TooltipProvider`/`Tooltip` pattern already used for the
  no-File-System-API-support case (`scenarioLoader.tsx`'s existing
  `data-testid="scenario-load-trigger-disabled-wrapper"` span-wraps-a-
  disabled-button pattern), with tooltip text explaining that this
  deployment mode already serves scenarios directly (FR-019).

## Scenarios tab (`layout/settings/scenariosTab.tsx`)

- Renders `appState.listByDisplayOrder()` (not `appState.list()`).
- Each row shows: `label ?? name`, `path`, `status`, the existing
  baseline star (`appState.setBaseline(name)`, unchanged behavior), the
  existing remove control gated on `source === 'handle'` (unchanged), and
  two NEW controls:
  - **Move up / move down** buttons calling
    `appState.moveScenario(name, 'up' | 'down')`. Disabled (not hidden)
    at the relevant boundary (first row has no "up", last row has no
    "down") — no error, no wraparound.
  - **Custom label** — an inline editable field calling
    `appState.setLabel(name, value)` on commit, `appState.clearLabel(name)`
    when cleared back to empty.
- The existing "Load Local Scenario" trigger + disabled/tooltip fallback
  (`supportsLocalFolderLoading()`-gated) and error message are unchanged,
  relocated verbatim (FR-006).

## Basemap tab (`layout/settings/basemapTab.tsx`)

- Renders a single-select list/dropdown of every preset name in
  `panels/basemap/registry.ts`'s `BUILT_IN_PRESETS` (the "same catalog
  available to dashboard authors," FR-011).
- Selecting a preset calls `basemapState.setGlobalBasemap(name)`.
- No "clear" control is required by any FR — `clearGlobalBasemap()`
  exists in `state/basemapState.ts` for completeness/testability, but
  this tab is not required to expose it as its own button (an
  implementation-time UI decision, not a contract requirement).

## Documentation tab (`layout/settings/documentationTab.tsx`)

- A static, non-interactive (or inert-link) placeholder, clearly labeled
  (e.g. "Documentation is not yet published — check back soon"). No
  fetch, no navigation, no broken link (FR-014).

## `state/appState.ts` — new exports (see data-model.md for full shapes)

```ts
moveScenario(name: string, direction: 'up' | 'down'): void
listByDisplayOrder(): Scenario[]
setLabel(name: string, label: string): void
clearLabel(name: string): void
```

`register()`'s `metadata` parameter gains a required `path: string`
field — both existing callers (`scenarioDiscovery.ts`,
`scenarioManager.ts`) already have the right value in scope at their
`appState.register()` call site.

## `state/basemapState.ts` — new module

```ts
subscribe(fn: () => void): () => void
getGlobalBasemap(): BasemapPresetName | undefined
setGlobalBasemap(name: BasemapPresetName): void
clearGlobalBasemap(): void
```

## `hooks/useGlobalBasemap.ts` — new hook

```ts
export function useGlobalBasemap(): BasemapPresetName | undefined
```

`useSyncExternalStore(basemapState.subscribe, basemapState.getGlobalBasemap)`
— same shape as `hooks/useBaseline.ts`, no memoized cache (primitive
return value).

## `panels/basemap/resolveEffectiveBasemap.ts` — signature change

```ts
resolveEffectiveBasemap(
  panelBasemap: BasemapSelection | undefined,
  tabDefaultBasemap: BasemapSelection | undefined,
  theme: ColorScheme,
  globalBasemap?: BasemapPresetName,
): EffectiveBasemap
```

Backward compatible — existing callers passing only 3 arguments keep
their exact current behavior (`globalBasemap` defaults to `undefined`,
which `isSet()` already treats as "not set," falling through to the
unchanged `app-default` branch). `panels/basemap/types.ts`'s
`BasemapSource` gains the literal `'global'`.

## Panel call sites — one-line additions

`FlowMapPanel.tsx` and `ZoneMapPanel.tsx` (the resolver's only two
callers) each add:

```ts
const globalBasemap = useGlobalBasemap()
const effectiveBasemap = resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, colorScheme, globalBasemap)
```

No other change to either panel — the existing `basemapKey(...)`-gated
effect, `loadBasemapStyle()` call, and failure-fallback path are all
unmodified (FR-013, FR-017 — see research.md §6).
