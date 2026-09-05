# Data Model: Settings Modal Visual Redesign

This feature is presentation-layer only (spec.md FR-014) — it introduces no
new persisted entity, no new state store, and no change to any existing
state shape. What follows are the derived-rendering mappings this feature
adds, each computed from state that already exists.

## Scenario status → visual treatment

Source: `Scenario.status` (`src/state/appState.ts`, unchanged type:
`'registering' | 'ready' | 'failed'`).

| `status` | Color treatment | Token used | Motion |
|---|---|---|---|
| `ready` | Success (green) | `--success` / `--success-foreground` (NEW — see below) | none |
| `failed` | Error (red) | `--destructive` / `--destructive-foreground` (existing) | none |
| `registering` | Neutral/pending | `--muted-foreground` (existing) | subtle pulse (matches this app's existing `animate-pulse` loading-skeleton convention, e.g. `basemapTab.tsx`'s `raster-loading-skeleton`) |

No new field is added to `Scenario` — this mapping is a pure function of the
existing `status` value, computed at render time in `scenariosTab.tsx`.

## New design tokens

Added to `src/styles/tokens.css`, following the exact existing pattern of
`--destructive`/`--destructive-foreground` (a light value in `:root`, a
dark-mode-adjusted value in `.dark`):

| Token | Purpose |
|---|---|
| `--success` | Background/foreground color for a "ready" scenario status indicator |
| `--success-foreground` | Text/icon color rendered on top of `--success` |

No existing token is renamed, removed, or redefined.

## Raster provider preview (transient, not persisted)

Source: the Basemap tab's existing `stagedSelection` (`BasemapPresetName`,
`useState` local to `basemapTab.tsx`) and `resolveRasterProvider()`
(`src/panels/basemap/registry.ts`, unchanged).

This feature does not add a new entity — it removes a conditional bypass so
`loadBasemapStyle()`'s already-existing raster-provider resolution branch
(see research.md §1) is reached from the preview effect for a
`stagedSelection` that is a raster provider name, exactly as it already is
for every other `stagedSelection` value. The resolved `ResolvedStyle` this
produces is applied to the shared preview `maplibregl.Map` via `setStyle()`
and is never stored — Apply still calls `setGlobalBasemap(stagedSelection)`
with the provider NAME, not the resolved style, exactly as today.

## Appearance tab control state

Source: `state/themeState.ts`'s existing module-level `ThemeMode` store
(`'system' | 'light' | 'dark'`), unchanged by this feature. Only the
component rendering the selector (`appearanceTab.tsx`) changes — from a
`<Button>` row to a `Tabs`/`TabsTrigger` instance whose `value` prop is the
`ThemeMode` string and whose `onValueChange` calls the same
`setMode()` this component already calls today. No new state, no new
transition.
