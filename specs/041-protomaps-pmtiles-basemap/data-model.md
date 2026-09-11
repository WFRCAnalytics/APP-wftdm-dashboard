# Data Model: Protomaps PMTiles Basemap Support

No database, no Parquet schema, no DuckDB view — this feature is entirely client-side basemap-styling configuration. "Entities" here are TypeScript shapes and config fields, not persisted records.

## E-1: Protomaps flavor name

A closed set of 5 literal strings, exposed as `BasemapPresetName`-compatible values (that type is already a plain `string` — see research.md R-6, no type change needed):

| Value | Protomaps `namedFlavor()` argument |
|---|---|
| `protomaps-light` | `"light"` |
| `protomaps-dark` | `"dark"` |
| `protomaps-white` | `"white"` |
| `protomaps-grayscale` | `"grayscale"` |
| `protomaps-black` | `"black"` |

A small internal constant, e.g. `PROTOMAPS_FLAVOR_NAMES: readonly BasemapPresetName[]`, is the single source of truth `resolvePresetName()` (research.md R-6) and the Basemap tab's Protomaps section both read from — never two independently-maintained lists of the same 5 names.

**Validation**: none needed beyond membership in this fixed list — these are internal preset-name literals, not viewer/deployer input.

## E-2: PMTiles Source Configuration

The one shared reference every flavor renders from. Two layers, precedence high→low:

| Layer | Type | Lifetime | Set by |
|---|---|---|---|
| Viewer session override | `string \| undefined` | In-memory only; cleared on reload (research.md R-4) | A viewer, via the Basemap tab's Protomaps section |
| Deployer default | `string \| undefined` | Persists across sessions; shared by every viewer of this deployment | A deployer, via `dashboard-config/index.json`'s new `protomapsPmtilesUrl` field (research.md R-3) |

**Effective value** = `viewerOverride ?? deployerDefault ?? undefined`. `undefined` means "not configured" (spec FR-010).

**Shape**: a plain `string`. Two accepted forms, both valid with no behavioral difference (spec FR-004):
- A path relative to this app's own deployed assets (e.g. `basemap/wasatch-front.pmtiles`, resolved against `import.meta.env.BASE_URL` the same way `panels/basemap/registry.ts`'s own `leaflet-providers.json` fetch already resolves its own relative path).
- A full `https://` URL to externally-hosted PMTiles storage.

**Validation rule** (spec FR-007): before being treated as usable, a source MUST be confirmed openable — deferred to the `pmtiles` client library's own real archive-open/metadata-read call (the natural, already-provided validation surface — no separate hand-rolled byte-sniffing needed). Failure produces a distinguishable error state, not silent fallback to "not configured" (spec Edge Cases).

**Not modeled**: no validation of the *geographic coverage* of a configured extract (spec Assumptions — explicitly out of scope).

## E-3: Basemap Catalog Section ("Protomaps")

Extends the existing, already-real Basemap-tab catalog-section concept (`layout/settings/basemapTab.tsx`'s existing OpenFreeMap/CARTO/UGRC/Raster-Tiles sections) with one more entry:

| Field | Value |
|---|---|
| Section label | "Protomaps" |
| Position | Directly above the Raster Tiles section; after OpenFreeMap, CARTO, and UGRC (spec FR-001) |
| Entries | The 5 flavor names from E-1, rendered as separate, individually selectable tiles (matching this tab's existing tile-grid pattern for other vector-style sections) |
| Section-level state | The effective E-2 value; drives whether entries render as normally selectable, or the section renders its own "not configured" state (spec FR-010) plus the viewer override entry field |

**State transitions** (per entry, mirroring the existing staged-then-Apply flow this tab already uses for every other section):

```
idle (not selected)
  → staged (viewer clicks a flavor tile; live preview updates if a source is configured)
    → applied (viewer clicks Apply; becomes the active global/tab/panel basemap per existing precedence)
    → discarded (viewer navigates away / closes the modal without applying)
```

No new state machine — this reuses `basemapTab.tsx`'s existing `stagedSelection`/Apply mechanism (021-basemap-catalog-redesign) unmodified in shape, just fed one more selectable name.

## E-4: Generated Protomaps Style (derived, not stored)

The output of `buildProtomapsStyle(flavorName, pmtilesUrl)` (research.md R-5) — a plain MapLibre `StyleSpecification` object, computed fresh on demand, never persisted or cached beyond whatever `loadBasemapStyle.ts`'s existing style-resolution flow already does for every other basemap kind:

```ts
interface GeneratedProtomapsStyle {
  version: 8
  sources: { protomaps: { type: 'vector'; url: `pmtiles://${string}`; attribution: string } }
  layers: unknown[] // real output of @protomaps/basemaps' layers()
  sprite: string     // https://protomaps.github.io/basemaps-assets/sprites/v4/{flavor}
  glyphs: string      // https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf
}
```

Not a new "entity" a user or deployer ever sees or configures directly — included here only because it's the concrete shape the rest of the resolution pipeline (`loadBasemapStyle.ts` → MapLibre `map.setStyle()`) depends on, and because R-5 names it as a distinct, independently-testable pure function's return type.

## Relationships

```
DashboardBranding (dashboard-config/index.json)
  └─ protomapsPmtilesUrl?: string ──────────────┐
                                                  ├─→ effective PMTiles source (E-2)
Viewer session override (state module) ─────────┘         │
                                                             ▼
Flavor selection (E-1, via existing basemap: / global   buildProtomapsStyle()  (E-4)
  basemap-tab precedence — panel > tab > global >               │
  app-default, UNCHANGED by this feature)                       ▼
                                                        MapLibre map.setStyle()
```
