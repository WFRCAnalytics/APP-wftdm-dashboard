# Contract: Basemap Catalog (Registry + Basemap Tab)

**Revision note**: this contract's own earlier draft described a
per-entry `Popover`-preview design (an independent live preview per
catalog entry, applying immediately on click, later "fixed" with a
shared `openPreviewName` gating value once simultaneous previews were
found possible). That design is REPLACED in full by the single shared
preview + stage-then-apply flow below — not amended, not kept as a
fallback. `components/ui/popover.tsx` and `@radix-ui/react-popover` are
no longer part of this feature.

## `panels/basemap/registry.ts`

- `BUILT_IN_PRESETS` values become a tagged union — `{ kind: 'url'; url:
  string }` or `{ kind: 'composition'; layers: string[] }` — see
  data-model.md. Gains exactly three new keys: `'ugrc-vector-lite'`,
  `'ugrc-vector-hybrid'`, `'ugrc-vector-outdoors'`, each `kind:
  'composition'`, using the exact endpoints in data-model.md (org
  `99lidPhWCzftIe9K`).
- `resolveBuiltInPreset(name: BasemapPresetName): BuiltInPreset |
  undefined` replaces `resolveUrlPreset()` — same lookup, generalized
  return type. `loadBasemapStyle.ts` is the only real call site to update.
- `listBuiltInPresetNames(): BasemapPresetName[]` — unchanged signature
  and behavior; now also returns the three UGRC names (it already
  iterates `Object.keys(BUILT_IN_PRESETS)`, which needs no change to pick
  up new keys).
- `APP_DEFAULT_LIGHT` / `APP_DEFAULT_DARK` are DELETED. `APP_DEFAULT:
  BasemapPresetName = 'carto-voyager'` is the sole replacement export.
- NEW: `listCuratedRasterProviders(signal?): Promise<CuratedRasterProvider[]>`
  — see data-model.md for the exact filter (no API key, HTTPS-only, only
  already-substituted URL-template tokens) plus the explicit `CartoDB`
  exclusion. MUST reuse the existing cached `leaflet-providers.json`
  fetch (`loadProvidersCatalog()`) — no second network request.
- `resolveRasterProvider()` — UNCHANGED behavior and signature; still the
  function that actually resolves ONE dotted `Provider.Variant` name to
  tiles at map-render time. `listCuratedRasterProviders()` is a read-only,
  additional VIEW over the same catalog data, not a replacement.

## `panels/basemap/loadBasemapStyle.ts`

- `resolvePresetName()` gains one new branch, checked before the existing
  raster-provider fallback:
  ```ts
  const builtIn = resolveBuiltInPreset(name)
  if (builtIn?.kind === 'url') return { kind: 'url', url: builtIn.url }
  if (builtIn?.kind === 'composition') return { kind: 'style', style: await composeStyles(builtIn.layers, signal) }
  ```
- `composeStyles()` itself — UNCHANGED. A UGRC preset's `layers` array
  reaches it exactly the way an author's own `dashboard-*.yaml`
  `basemap: { layers: [...] }` composition already does (FR-009).
- Every existing composeStyles()-level guarantee (whole-composition
  fallback to `freshBlankStyle()` on any single layer's failure, the
  background-layer injection fix from 016-fix-ugrc-dark-mode, the
  multi-sprite handling from 017-multi-sprite-support) applies to the
  three new UGRC presets automatically, with zero new code — they are
  ordinary compositions to this function.

## `layout/settings/basemapTab.tsx` — one shared preview, stage-then-apply

- Renders exactly ONE `maplibregl.Map`, in a fixed-height preview area at
  the TOP of the tab's content, ABOVE the four labeled sections (FR-001,
  FR-008). This map is created once (a mount effect) and destroyed once
  (that effect's cleanup) — its whole lifetime is bounded by
  `basemapTab.tsx` itself being mounted, which happens exactly when the
  Basemap tab is the active Settings tab and the Settings modal is open.
  **There is no second map, popover, or preview surface anywhere in this
  feature.**
- On mount, the tab's own `stagedSelection` state initializes to
  `useGlobalBasemap() ?? APP_DEFAULT` — the preview map renders that
  value immediately, so it always shows the currently-applied basemap (or
  the resolved app-default) the instant the tab opens, never blank
  (FR-011).
- UGRC Vector Tiles: exactly `'ugrc-vector-lite'` → "Vector Lite",
  `'ugrc-vector-hybrid'` → "Vector Hybrid", `'ugrc-vector-outdoors'` →
  "Vector Outdoors" (FR-002). Rendered as plain labeled buttons with a
  small, static, per-SECTION `lucide-react` icon (not a unique icon or
  photographic thumbnail per entry) (research.md §4).
- CARTO Vector Tiles: `'carto-positron'`, `'carto-dark-matter'`,
  `'carto-voyager'`, re-grouped, unchanged (FR-003).
- OpenFreeMap: `'openfreemap-liberty'`, `'openfreemap-bright'`,
  `'openfreemap-positron'`, `'openfreemap-dark'`, `'openfreemap-fiord'`,
  re-grouped, unchanged (FR-004). No "3D" entry (none exists).
- No "Open Map Tiles"/OpenMapTiles/MapTiler-branded section anywhere
  (FR-005).
- **Clicking any UGRC/CARTO/OpenFreeMap entry**: sets `stagedSelection` to
  that entry's preset name — visually marks that entry as the current
  staged choice (distinct from whichever entry, if any, matches the
  actually-applied basemap) — and re-styles the ONE preview map via
  `loadBasemapStyle(stagedSelection)` + `map.setStyle(...)`, the same
  resolution function every real flowmap/zonemap panel already calls
  (FR-008, FR-010). This does NOT call `setGlobalBasemap()`.
- Raster Tiles: renders `listCuratedRasterProviders()`'s result as a
  dropdown (`<select>` or a Radix-based equivalent — implementation
  detail), grouped by provider name, each variant (or the bare provider
  name, if it has none) individually selectable. Selecting an option sets
  `stagedSelection` the SAME way any other section's entry does (FR-013)
  — it participates in the identical stage-then-apply flow, not a
  separate immediate-apply behavior. The preview map is NOT re-styled for
  a raster selection (FR-008's existing no-live-preview rule for raster,
  carried forward unchanged); instead the preview area's own render
  branch shows a small, fixed-footprint placeholder message in place of
  the map canvas while a raster selection is staged, so the viewer is
  never shown a render that doesn't match what Apply would actually
  produce. Includes an "Explore options" link/button opening
  `https://leaflet-extras.github.io/leaflet-providers/preview/` in a new
  tab (`target="_blank" rel="noopener noreferrer"`, matching this
  project's existing external-link convention from `MarkdownPanel.tsx`'s
  sanitizer hook) (FR-007).
- **The Raster Tiles section MUST NOT render blank while
  `listCuratedRasterProviders()`'s promise is pending** (research.md §5):
  a `'loading'` state renders an inline skeleton (no new shared
  component — matching this project's established per-panel-skeleton
  convention); an `'error'` state (the underlying catalog fetch rejects)
  renders the existing, already-generic `panels/PanelErrorState.tsx`;
  a resolved-but-empty result renders the existing
  `panels/PanelEmptyState.tsx`; only a resolved, non-empty result renders
  the dropdown.
- **An explicit Apply action** (a `Button` rendered near the preview
  area) is the ONLY interaction on this tab that calls
  `setGlobalBasemap(stagedSelection)` (FR-012) — the same
  `state/basemapState.ts` mechanism 020-settings-modal already shipped.
  No entry click, in any section, ever calls `setGlobalBasemap()`
  directly.
- **Closing the Settings modal, or switching to a different Settings
  tab, while a selection is staged but not applied, discards the staged
  selection** (FR-014). No explicit "discard" code exists or is needed —
  `stagedSelection` lives only in this component's own state, which
  simply stops existing when the component unmounts (neither
  `TabsContent` nor `DialogContent` force-mounts in this codebase, so
  both a tab switch and a modal close are real unmounts). The previously-
  applied global basemap is provably unaffected: nothing in this flow
  ever calls `setGlobalBasemap()` except the Apply button itself.

## Test instrumentation (NEW, additive-only — never called from application code)

```ts
declare global {
  interface Window {
    __basemapPreviewTestMap?: maplibregl.Map
  }
}
```

Same category and convention as `FlowMapPanel.tsx`'s existing
`__flowmapTestMaps` registry — the ONE preview map's create-once effect
assigns itself here on mount and deletes the property in that same
effect's cleanup. Lets a Playwright test assert
`window.__basemapPreviewTestMap !== undefined` while the Basemap tab is
open and `=== undefined` immediately after switching away or closing the
modal — directly proving the preview map's real lifecycle, not merely
that some DOM node became invisible. Singular (`TestMap`, not
`TestMaps`), unlike `__flowmapTestMaps`/the superseded per-entry-preview
design's own `__basemapPreviewTestMaps` — there is only ever one, by
construction, not a registry of potentially-many.
