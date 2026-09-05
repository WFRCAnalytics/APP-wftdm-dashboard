# Data Model: Basemap Catalog Redesign and Settings Modal Visual Polish

## `panels/basemap/registry.ts` — `BUILT_IN_PRESETS` generalized

```ts
interface UrlPreset {
  kind: 'url'
  url: string
}

interface CompositionPreset {
  kind: 'composition'
  layers: string[]   // identical shape to BasemapComposition.layers (types.ts)
}

type BuiltInPreset = UrlPreset | CompositionPreset

const BUILT_IN_PRESETS: Record<BasemapPresetName, BuiltInPreset> = {
  // Unchanged, existing entries (re-tagged `kind: 'url'`, values unchanged):
  'carto-positron':      { kind: 'url', url: '...' },
  'carto-dark-matter':   { kind: 'url', url: '...' },
  'carto-voyager':       { kind: 'url', url: '...' },
  'openfreemap-liberty': { kind: 'url', url: '...' },
  'openfreemap-bright':  { kind: 'url', url: '...' },
  'openfreemap-positron':{ kind: 'url', url: '...' },
  'openfreemap-dark':    { kind: 'url', url: '...' },
  'openfreemap-fiord':   { kind: 'url', url: '...' },

  // NEW — three UGRC composition aliases (research.md §1):
  'ugrc-vector-lite': {
    kind: 'composition',
    layers: [
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteBase/VectorTileServer/resources/styles/root.json',
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteLabels/VectorTileServer/resources/styles/root.json',
    ],
  },
  'ugrc-vector-hybrid': {
    kind: 'composition',
    layers: [
      'Esri.WorldImagery',
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/Vector_Overlay/VectorTileServer/resources/styles/root.json',
    ],
  },
  'ugrc-vector-outdoors': {
    kind: 'composition',
    layers: [
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/OutdoorsBase/VectorTileServer/resources/styles/root.json',
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/Outdoors_Labels/VectorTileServer/resources/styles/root.json',
    ],
  },
}
```

`resolveUrlPreset()` is replaced by a generalized
`resolveBuiltInPreset(name): BuiltInPreset | undefined` returning the
tagged-union value directly — `loadBasemapStyle.ts`'s `resolvePresetName()`
branches on `.kind` (research.md §1). `listBuiltInPresetNames()`
(020-settings-modal) is unchanged — `Object.keys(BUILT_IN_PRESETS)` still
returns every preset name regardless of its `kind`, including the three
new UGRC ones; any caller that needs to know a name's kind for the
sectioned catalog UI resolves it via `resolveBuiltInPreset(name).kind`.

## `panels/basemap/registry.ts` — single static app-default

```ts
export const APP_DEFAULT: BasemapPresetName = 'carto-voyager'
```

Replaces `APP_DEFAULT_LIGHT`/`APP_DEFAULT_DARK` (both deleted — confirmed
via project-wide search that only `registry.ts`, `resolveEffectiveBasemap.ts`,
and `resolveEffectiveBasemap.test.ts` ever referenced either name).

## `panels/basemap/registry.ts` — curated raster catalog (NEW)

```ts
export interface CuratedRasterProvider {
  name: string        // dotted PARENT provider name, e.g. "OpenStreetMap"
  variants: string[]  // e.g. ["Mapnik", "DE", "CH", "France", "HOT", "BZH"];
                       // empty array if the provider has no variants —
                       // selectable by its bare `name` in that case
}

export async function listCuratedRasterProviders(
  signal?: AbortSignal,
): Promise<CuratedRasterProvider[]>
```

Computed against the same cached `leaflet-providers.json` fetch
`resolveRasterProvider()` already performs (research.md §2) — no separate
network request. A provider is included only if every one of its
effective URLs (its own `url`, plus each variant's own `url` override)
requires no API key/token, uses `https://` only, and uses no URL-template
token outside `{s}`/`{r}`/`{variant}`/`{z}`/`{x}`/`{y}` — plus one
explicit editorial exclusion, `CartoDB` (spec.md Assumptions). Selecting
one dotted `"Provider.Variant"` (or bare `"Provider"`, for a
no-variant entry) stages it exactly the same way any other catalog entry
does (FR-010/FR-013) — it does not call `setGlobalBasemap()` directly;
only the shared Apply action does that (FR-012).

## `panels/basemap/resolveEffectiveBasemap.ts` — signature change

```ts
export function resolveEffectiveBasemap(
  panelBasemap: BasemapSelection | undefined,
  tabDefaultBasemap: BasemapSelection | undefined,
  globalBasemap?: BasemapPresetName,   // was the 4th arg; now the 3rd
): EffectiveBasemap
```

`theme: ColorScheme` parameter removed entirely — no call site anywhere in
this project passes it after this change (research.md §6). Updated
precedence table:

| panelBasemap | tabDefaultBasemap | globalBasemap | `.selection`  | `.source`       |
|---------------|--------------------|-----------------|----------------|------------------|
| set (A)       | —                  | —               | A              | `'panel'`        |
| unset         | set (B)            | —               | B              | `'tab'`          |
| unset         | unset              | set (C)         | C              | `'global'`       |
| unset         | unset              | unset           | `APP_DEFAULT`  | `'app-default'`  |

The `ColorScheme` type itself (currently exported from this file) is
deleted — its only consumers were this function's own now-removed
parameter and `resolveEffectiveBasemap.test.ts`'s call sites.

## `panels/FlowMapPanel.tsx` / `panels/ZoneMapPanel.tsx` — one net removal each

Both files delete their `const colorScheme = useColorScheme()` line and
the `useColorScheme` import (confirmed dead once the 3rd-argument
`colorScheme` is removed from their `resolveEffectiveBasemap()` call —
research.md §6), and drop that same now-unused argument from the call
itself:

```ts
// before
const effectiveBasemap = resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, colorScheme, globalBasemap)
// after
const effectiveBasemap = resolveEffectiveBasemap(config.basemap, config._tabDefaultBasemap, globalBasemap)
```

No other line in either file changes — `useGlobalBasemap()`,
`basemapKey(...)`, the basemap-application effect's own body, and every
other panel concern are untouched.

## `layout/settingsModal.tsx` — layout change, no new state

`DialogContent`'s className changes (research.md §7); `Tabs` gains
`orientation="vertical"` plus a `flex-row` container (`TabsList` becomes a
vertical rail via `flex-col`, `TabsContent` moves to its right via
`flex-1`). No new props, no new component state — purely a markup/CSS
change on top of 020-settings-modal's existing structure.

## `components/ui/tabs.tsx` — orientation-aware styling only

`TabsList`/`TabsTrigger` gain `data-[orientation=vertical]:` Tailwind
variants alongside their existing classes (Radix sets `data-orientation`
automatically — no new prop threading needed). `navBar.tsx`'s existing
horizontal usage is unaffected — it never sets `orientation`, so Radix's
own default (`"horizontal"`) applies exactly as before.

## `layout/settings/basemapTab.tsx` — one persistent preview map (NEW; replaces the removed per-entry Popover design)

**`components/ui/popover.tsx` and `@radix-ui/react-popover` are NOT part
of this feature** — an earlier draft of this document added them; that
design is superseded in full (research.md's own revision note). There is
exactly one `maplibregl.Map` anywhere in this feature, owned by
`basemapTab.tsx` itself via the standard two-effect create-once/
cleanup-on-unmount Panel-pattern shape:

```ts
const previewMapRef = useRef<HTMLDivElement>(null)
const mapRef = useRef<maplibregl.Map | null>(null)

// Mount-once effect (research.md §3) — creates the ONE preview map.
// Cleanup runs whenever basemapTab.tsx unmounts: switching to a
// different Settings tab, or closing the Settings modal (neither
// TabsContent nor DialogContent force-mounts in this codebase).
useEffect(() => {
  const map = new maplibregl.Map({ container: previewMapRef.current!, style: freshBlankStyle(), interactive: false })
  mapRef.current = map
  return () => map.remove()
}, [])

// The tab's own staged candidate — initialized to whatever is
// CURRENTLY applied, so the preview never starts blank (FR-011).
const [stagedSelection, setStagedSelection] = useState<BasemapPresetName>(
  () => useGlobalBasemap() ?? APP_DEFAULT,
)

// Re-styles the ONE persistent map on every staged-selection change —
// same setStyle()-based shape FlowMapPanel.tsx/ZoneMapPanel.tsx's own
// basemap-application effects already use (research.md §3). Skipped
// for a raster provider selection (FR-008/FR-013) — the preview area's
// own render branch swaps to a placeholder message instead in that case.
useEffect(() => {
  if (!mapReady || isRasterProviderSelection(stagedSelection)) return
  let cancelled = false
  loadBasemapStyle(stagedSelection).then((resolved) => {
    if (cancelled || !mapRef.current) return
    resolved.kind === 'url' ? mapRef.current.setStyle(resolved.url) : mapRef.current.setStyle(resolved.style)
  })
  return () => { cancelled = true }
}, [mapReady, stagedSelection])
```

Every UGRC/CARTO/OpenFreeMap entry's `onClick` is simply
`() => setStagedSelection(presetName)`; each entry's own "is this the
staged one" visual state compares itself against `stagedSelection`
directly (no separate boolean per entry). Selecting a Raster Tiles
dropdown option does the exact same `setStagedSelection(dottedName)` call
(FR-013) — participating in the identical flow, differing only in the
preview effect's own raster skip-branch above (research.md §5).

The Apply action is a single `Button`:

```ts
<Button onClick={() => setGlobalBasemap(stagedSelection)}>Apply</Button>
```

— the ONLY call to `setGlobalBasemap()` anywhere in this component
(FR-012). No confirmation dialog, no disabling logic beyond what's
naturally implied (clicking Apply when `stagedSelection` already equals
the applied value is a harmless no-op, same convention as
`appState.ts`'s `moveScenario()` boundary no-op from 020-settings-modal).

The async Raster Tiles section's own load status is separate,
unaffected-by-staging state (research.md §5):

```ts
type RasterSectionStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; providers: CuratedRasterProvider[] }
const [rasterStatus, setRasterStatus] = useState<RasterSectionStatus>({ kind: 'loading' })
```

set once in a mount effect that calls `listCuratedRasterProviders()` with
an `AbortController` for cleanup (matching `resolveRasterProvider()`'s
own existing `signal` threading convention). Rendering branches on
`rasterStatus.kind`: `'loading'` → an inline skeleton; `'error'` → the
existing `PanelErrorState`; `'ready'` with an empty `providers` array →
the existing `PanelEmptyState`; `'ready'` with ≥1 → the dropdown.

## `layout/settings/basemapTab.tsx` — new pure section data (co-located)

The four sections' entries (which preset names belong to UGRC Vector
Tiles / CARTO Vector Tiles / OpenFreeMap, in what order, and which small
per-section `lucide-react` icon represents each — research.md §4) are a
small, static, ordered list module-level constant inside `basemapTab.tsx`
itself (not a new file — there is no other consumer of "which section is
a given preset in," so this doesn't need `registry.ts`'s own
cross-cutting, multi-consumer treatment the way `BUILT_IN_PRESETS`/
`listCuratedRasterProviders()` do). Each vector-style entry pairs a
preset name with its display label (e.g. `'ugrc-vector-lite'` →
`"Vector Lite"`) — no per-entry preview trigger, no per-entry image; the
Raster Tiles section renders `listCuratedRasterProviders()`'s async
result as a grouped dropdown, plus the static "Explore options" link to
`https://leaflet-extras.github.io/leaflet-providers/preview/`.

## Key relationships

- `loadBasemapStyle.ts`'s `resolvePresetName()` is the ONE place a UGRC
  preset name and an author's own hand-written `BasemapComposition`
  object both eventually reach `composeStyles()` — confirming FR-009
  structurally (research.md §1), not by cross-referenced convention.
- `listCuratedRasterProviders()` and `resolveRasterProvider()` share the
  same underlying `leaflet-providers.json` fetch/cache — the curated list
  is a VIEW over that catalog, not a second, independently-maintained
  data source that could drift from it (research.md §2).
- The ONE persistent preview map's re-style effect calls
  `loadBasemapStyle()` directly — the same function every real flowmap/
  zonemap panel already calls — so the preview can never show something a
  real panel would resolve differently (research.md §3).
- There is exactly one `maplibregl.Map` instance for this whole feature —
  not "at most one, enforced by a gating value" (an earlier, superseded
  design's own fix for a self-inflicted multiplicity problem), but
  literally one, because there is only ever one preview surface to begin
  with (research.md §3). `stagedSelection` is the ONE piece of state every
  catalog entry (across all four sections) reads and writes; `Apply` is
  the ONE call site for `setGlobalBasemap()` (research.md §5).
- `stagedSelection` lives only in `basemapTab.tsx`'s own component state
  — never lifted into `state/basemapState.ts` until `Apply` is clicked,
  and never persisted anywhere. This is what makes "closing the modal
  with an unconfirmed staged selection leaves the applied basemap
  unaffected" (FR-014) true by construction: the state ceases to exist
  the moment the component unmounts, with no explicit "discard" code
  required (research.md §5).
