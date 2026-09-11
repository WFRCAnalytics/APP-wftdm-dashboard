# Implementation Plan: Protomaps PMTiles Basemap Support

**Branch**: `041-protomaps-basemap` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/041-protomaps-pmtiles-basemap/spec.md`

## Summary

Add all 5 official Protomaps basemap flavors (light, dark, white, grayscale, black) as a new "Protomaps" section in the Basemap tab's catalog, positioned directly above the existing Raster Tiles section. Styling is generated programmatically at resolve-time via the real `@protomaps/basemaps` package's `layers(sourceName, namedFlavor(name), { lang: 'en' })` — never hand-authored per-flavor style documents. All 5 flavors share exactly one PMTiles vector source, resolved with two-tier precedence: a viewer's session-only override (never persisted) takes priority over a deployer-level default configured on the same discovery-file shape `title`/`logoUrl`/`scenarioPalette` already use (`dashboard-config/index.json`). No Protomaps-hosted demo/build/API URL is ever hardcoded as a default. The `pmtiles` client library is registered as a MapLibre custom protocol exactly once, as a module-load side effect of a new file imported by the existing shared basemap-resolution module — no boot-sequence change. An unconfigured or unreachable source fails the same way every other basemap failure mode already does in this app (blank-style fallback, panel data content unaffected), distinguished in the UI from "not yet configured at all."

## Technical Context

**Language/Version**: TypeScript (ES2022 target), matching the existing project (no change).

**Primary Dependencies**: `@protomaps/basemaps` `^5.7.2` (real current npm version, zero runtime dependencies, confirmed via `npm view` this session) and `pmtiles` `^4.5.0` (real current npm version, one dependency — `fflate` `^0.8.2` — confirmed via `npm view`). Both integrate with the already-pinned `maplibre-gl` `^4.7.1` via MapLibre's own public `addProtocol`/style-spec APIs — no peer-dependency coupling to reconcile (research.md R-1/R-2).

**Storage**: N/A — the actual PMTiles tile data lives outside this app entirely (a deployer's own `public/`-bundled file or external URL, per FR-004); this app never writes or caches it beyond whatever the `pmtiles` client's own in-memory range-request cache does. The two new pieces of *configuration* state are: one new optional string field on the existing `dashboard-config/index.json` discovery file (deployer default, persists via that file, not a database) and one new in-memory-only state module (viewer session override, explicitly never persisted — Constitution Principle VI forbids Web Storage).

**Testing**: Vitest for the new pure module (`protomapsStyle.ts`'s `buildProtomapsStyle()`/`isProtomapsFlavorName()`), matching every other pure basemap/encoding module in this codebase. Playwright for the Basemap tab's new section and real-rendering coverage, matching `zonemapPanel.spec.ts`/`flowmapPanel.spec.ts`'s established pattern — against a small, real, git-tracked test PMTiles fixture (research.md R-7), never a hotlinked Protomaps-hosted URL.

**Target Platform**: Browser (this app's existing Vite-built SPA) — no Web Worker, no server-side component; purely a MapLibre client-side style-resolution addition.

**Project Type**: Single web application (existing structure) — no new top-level project, no frontend/backend split.

**Performance Goals**: Switching between the 5 Protomaps flavors on an already-loaded Protomaps basemap must not re-fetch the underlying PMTiles archive (FR-012/SC-005) — only regenerated `layers()` styling, applied via the same `map.setStyle()` path every other basemap switch already uses.

**Constraints**: No hardcoded region-specific PMTiles URL, and no hardcoded Protomaps-hosted demo/daily-build/API URL, anywhere in `src/` (FR-005). No new Web Storage usage (Constitution Principle VI, unchanged). Both accepted source forms (bundled relative path, external URL) must behave identically (FR-004) — a plain string value into one URL-construction path satisfies this with no branching.

**Scale/Scope**: One new Basemap-tab catalog section (5 entries + a not-configured/override UI), one new optional deployer config field, one new small in-memory state module, one new pure style-generation module, one new protocol-registration module, one new `resolvePresetName()` branch. No change to any existing basemap section, any existing panel type, or the app boot sequence.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. TypeScript Throughout, React Permitted When Needed | PASS — all new modules are `.ts`/`.tsx` per existing convention (pure logic in `.ts`, the Basemap-tab UI addition in the already-`.tsx` `basemapTab.tsx`). No new framework introduced. |
| II. DuckDB-WASM off main thread, one shared instance | N/A — this feature makes no DuckDB query of any kind. |
| III. No `eval()` | PASS — no dynamic code execution anywhere in this design; `@protomaps/basemaps`' `layers()` returns a plain data object, not code. |
| IV. YAML parsed at runtime | PASS/N/A — the one new deployer config field lives in the existing `dashboard-config/index.json` (JSON, fetched+parsed at runtime exactly like `title`/`logoUrl`/`scenarioPalette` already are); no new YAML grammar is introduced (a `basemap:`/`default_basemap:` YAML value can already reference any `BasemapPresetName` string, including the 5 new ones, with zero grammar change — `BasemapPresetName` is already a plain `string`). |
| V. Parquet-only browser data I/O | N/A — PMTiles is not Parquet/GeoParquet and is not read via this app's DuckDB pipeline; it is consumed exclusively by MapLibre via the `pmtiles://` protocol, the same way every other basemap tile source (raster XYZ, vector style.json) already bypasses the Parquet pipeline entirely. This principle governs the app's own *analytical* data I/O, not basemap tile fetching (raster/vector basemap sources have never gone through DuckDB in this app). |
| VI. Fixed Technology Choices | PASS — MapLibre remains the only map engine used (Mapbox never involved); no new Web Storage usage (the viewer override is a plain in-memory module, research.md R-4); no new CSS framework/component library/icon set introduced. Adding `@protomaps/basemaps`/`pmtiles` is a new *data-source* dependency, not a change to any of the fixed choices this principle actually enumerates (map engine, build tool, Web Storage ban, UI-layer stack) — the same category of addition as `d3-sankey`, `@observablehq/plot`, or `@kanaries/graphic-walker` before it, none of which required a constitution amendment. |
| VII. Minimal, Fixed Config File Set | PASS — no new config file type. `protomapsPmtilesUrl` is one more optional field on the already-existing `dashboard-config/index.json` discovery file, the identical mechanism `028-dashboard-branding`/`036-scenario-color-picker` already used for `title`/`logoUrl`/`scenarioPalette` (documented in that file's own header comment as "a richer shape for a discovery file that already existed... not a new config file type"). |
| VIII. Reuse Proven Reference Implementations | N/A — none of the five mandate-tier reference repos cover PMTiles/Protomaps integration; this is genuinely new ground for this app, resolved instead by consulting Protomaps' own official documentation directly (as the carried-forward research already did) rather than a reference repo. |
| IX. Fixed Python/JS Source Split | PASS — no Python package touched; this is entirely a `src/` (JS/TS) change. |

**Result**: PASS, no violations, no Complexity Tracking entries needed.

**Post-Phase-1 re-check**: re-evaluated after `research.md`/`data-model.md`/`contracts/` were written. No new dependency, config file, storage mechanism, or framework surfaced beyond what's assessed in the table above (`@protomaps/basemaps`/`pmtiles` under Principle VI, `protomapsPmtilesUrl` under Principle VII, the in-memory-only override module under Principle VI's Web Storage ban). Result unchanged: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/041-protomaps-pmtiles-basemap/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   ├── deployer-config.md
│   ├── basemap-resolution.md
│   └── basemap-tab-ui.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Single existing project — no new top-level directory. This feature is additive within the already-real `src/panels/basemap/` subsystem plus one config-loader field and one UI section:

```text
package.json                              # + @protomaps/basemaps ^5.7.2, pmtiles ^4.5.0
vite.config.ts                            # + pmtiles/@protomaps/basemaps -> existing "maps" manualChunks bucket (research.md R-8)

src/
├── panels/
│   └── basemap/
│       ├── types.ts                      # unchanged — BasemapPresetName is already `string`
│       ├── registry.ts                   # unchanged — the 5 flavor names are NOT added to BUILT_IN_PRESETS (research.md R-6)
│       ├── loadBasemapStyle.ts            # + one new branch in resolvePresetName() (contracts/basemap-resolution.md)
│       ├── protomapsStyle.ts             # NEW — pure: PROTOMAPS_FLAVOR_NAMES, PROTOMAPS_ATTRIBUTION,
│       │                                  #   isProtomapsFlavorName(), buildProtomapsStyle()
│       └── pmtilesProtocol.ts            # NEW — side-effecting: registers the `pmtiles://` MapLibre protocol once
├── services/
│   └── yamlLoader.ts                     # + protomapsPmtilesUrl? field on DashboardIndexJson/DashboardBranding + loadDashboardBranding() parse line
├── state/
│   └── protomapsSourceState.ts           # NEW — viewer session-only override, mirrors basemapState.ts's shape (research.md R-4)
└── layout/
    └── settings/
        └── basemapTab.tsx                # + "Protomaps" section (5 tiles, not-configured state, override entry field) — contracts/basemap-tab-ui.md

tests/
├── unit/
│   └── protomapsStyle.test.ts            # NEW
├── fixtures/
│   └── protomaps/
│       └── tiny-test-area.pmtiles        # NEW — small, real, git-tracked test fixture (research.md R-7)
└── integration/
    └── protomapsBasemap.spec.ts          # NEW
```

**Structure Decision**: Extends the existing single-project `src/` tree exactly along its already-established `panels/basemap/` module boundary (the same boundary `011-basemap-style-system`/`021-basemap-catalog-redesign` already built and every later basemap feature has extended, never restructured). No new directory outside that boundary except the one new fixture path under `tests/fixtures/`.

## Complexity Tracking

*No entries — Constitution Check found no violations requiring justification.*
