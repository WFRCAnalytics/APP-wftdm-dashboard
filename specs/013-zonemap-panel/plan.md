# Implementation Plan: ZoneMapPanel

**Branch**: `013-zonemap-panel` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-zonemap-panel/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add the eighth and final originally-listed panel type — `zonemap` — to `panels/registry.tsx`: a MapLibre choropleth joining a `boundaries` GeoParquet zone-geometry file to a queried metric result by zone id, filling each zone via a token-derived sequential/diverging color scale. Confirmed during research (not merely assumed from `docs/SPEC.md`'s own pre-existing documentation): **no deck.gl is needed** — a plain MapLibre GeoJSON source + data-driven `fill-color` paint expression covers both the fill and the hover/click interaction need, matching `ar-puuk/spatial-sql-explorer`'s own real, fetched reference implementation (a pure-MapLibre "Graduated" choropleth, no deck.gl in its stack at all). This makes `zonemap` the first map-rendering panel type with only **one** WebGL context, entirely sidestepping `012-webgl-context-management`'s interleaved-mode/context-loss machinery by design, not by omission.

Two real, confirmed upstream findings shape the geometry-loading design: (1) DuckDB-WASM's `spatial` extension is **not** bundled/autoloaded (unlike `parquet`/`json`/`icu`/`autocomplete`) — it requires an explicit `INSTALL spatial; LOAD spatial;` and its own `extensions.duckdb.org` fetch on first use, extending `docs/ARCHITECTURE.md`'s existing parquet-extension caveat to a second, now-confirmed network dependency (research.md §2); (2) `ST_Read()` (the GDAL-based multi-format reader) is confirmed broken against `registerFileBuffer()`-registered files (`duckdb/duckdb-wasm#1791`, "IO Error: Unknown file type") — this feature therefore never uses `ST_Read()` at all, loading `boundaries` via `registerFileURL()` + plain `read_parquet()` + `ST_GeomFromWKB()`/`ST_AsGeoJSON()` instead (research.md §3), which is both the confirmed-working path and consistent with zone geometry being a scenario-independent, published static asset rather than something a local scenario folder ever supplies.

The zone geometry cache's eviction policy — flagged explicitly in spec.md as a required, not-implicit planning decision (FR-003a) — is resolved as a deliberate accepted tradeoff: no eviction, module-level cache keyed by `boundaries` filename, persisting for the page session's lifetime (research.md §4). `comparison: diff` computes its two-scenario `expr` entirely SQL-side, as a literal string-substituted SQL fragment (constitution Principle III — no `eval()`), not a client-side expression evaluator (research.md §7).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React (function components) — same as every panel-type feature since `003`.

**Primary Dependencies**: `maplibre-gl` (`^4.7.1`, already a dependency via `010-flowmap-panel`) — no new `package.json` dependency. `d3-scale-chromatic` (already a dependency via `008-sankey-panel`) supplies the named `color_ramp` interpolators (`interpolateYlOrRd`/`interpolateRdBu`). No deck.gl package is added for this feature (research.md §1). DuckDB-WASM's `spatial` extension is loaded at runtime via `INSTALL spatial; LOAD spatial;` (fetched from `extensions.duckdb.org`, same mechanism as `parquet`) — not a `package.json` dependency, a runtime extension fetch (research.md §2).

**Storage**: N/A for panel data — reads existing Parquet-backed DuckDB views via the existing query pipeline, same as every other panel type. The `boundaries` GeoParquet file is a new kind of static asset this feature introduces (not a new *config file type*, constitution Principle VII — same category as `public/observed/`/`public/scenarios/`'s own published data), resolved to a URL and read via `registerFileURL()` + `read_parquet()` (research.md §3), never `registerFileBuffer()`/`ST_Read()`.

**Testing**: Vitest (`panels/zonemapColor.ts`'s color-scale resolution and the `comparison: diff` SQL-fragment builder — both DOM-free, pure) + Playwright (real choropleth rendering against a synthetic GeoParquet fixture, filter reactivity via `setData()`, basemap inheritance, resize/expand-dialog relocation, hover/click value display, `comparison: diff` end-to-end, and a live network capture confirming/documenting the `spatial` extension's `extensions.duckdb.org` fetch — same method `010` used for its own zero-external-request base-style check).

**Target Platform**: Browser (Vite-built static app) — same as every other panel type.

**Project Type**: Single-project web app (existing `src/`/`tests/` structure — no new top-level directory).

**Performance Goals**: No new goal beyond this app's existing baseline. The zone geometry cache (research.md §4) exists specifically to avoid redundant re-parsing when multiple panels/tabs share one `boundaries` file.

**Constraints**: One WebGL context per panel (research.md §1 — no deck.gl, so none of `012`'s interleaved-mode/context-loss-detection requirements apply to this panel type). No `eval()` for `comparison: diff`'s `expr` (constitution Principle III — research.md §7). The `spatial` extension's confirmed network fetch must be documented, not silently shipped (FR-014, research.md §2).

**Scale/Scope**: One new panel type, one new pure module (`panels/zonemapColor.ts` — color-scale resolution), one new `ZoneMapPanelConfig` type (extending the already-generic `MapRenderingPanelConfig`, per `layout/types.ts`'s own standing comment anticipating this), one new registry entry, one small addition to `panels/panelQuery.ts`/`services/sqlExpander.ts` for `comparison: diff`'s two-scenario join, one new zone-geometry-loading module (`panels/zoneGeometry.ts`), a new synthetic GeoParquet test fixture (this project's first geometry fixture), and a `docs/ARCHITECTURE.md` caveat extension. No `vite.config.ts` change needed (`maplibre-gl` already has its own chunk from `010`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v2.4.0:

- **I. TypeScript Throughout, React Permitted When Needed** — PASS. `ZoneMapPanel.tsx` is a React function component (`.tsx`); `zonemapColor.ts` and `zoneGeometry.ts` are pure/DOM-light logic with no JSX (`.ts`), same split every prior panel type's non-trivial logic already uses.
- **II. DuckDB-WASM Query Execution Off the Main Thread, One Shared Instance** — PASS. Both the metric query and the `boundaries` geometry query go through `services/duckdb.ts`'s existing `query()`/`registerFileURL()` exports, same shared `AsyncDuckDB` instance and worker every other panel type already uses; no new connection, no new worker. `INSTALL spatial; LOAD spatial;` runs through the same existing connection.
- **III. No eval()** — PASS. `comparison: diff`'s `expr` is substituted as a literal SQL fragment into a generated query (research.md §7) — DuckDB's own SQL engine evaluates the arithmetic, not JavaScript. No new dynamic-code-execution surface.
- **IV. YAML Parsed at Runtime** — PASS. `ZoneMapPanelConfig` parses from the same runtime `dashboard-*.yaml` fetch/parse path every panel type config already goes through.
- **V. Parquet-Only Browser Data I/O** — PASS. `boundaries` is a GeoParquet file, read via `read_parquet()` — Parquet family, not a new format (no shapefile/GeoJSON file ever reaches the browser; `docs/GRAMMAR.md`'s own `boundaries` key has always named a `.geoparquet` file).
- **VI. Fixed Technology Choices** — PASS. MapLibre only (research.md §1 confirms no Mapbox/deck.gl need), no Webpack, no Web Storage. No new pinned dependency — `maplibre-gl`/`d3-scale-chromatic` are both already in the Technology Stack Reference / `package.json` from prior features.
- **VII. Minimal, Fixed Config File Set** — PASS. No new config file type; `zonemap` is a `type:` value inside the existing `dashboard-*.yaml` grammar (already documented, not invented by this feature). The `boundaries` GeoParquet's published location is a new static-asset directory, not a fourth config file type (same category distinction the constitution already draws for `public/dashboard-config/index.json`).
- **VIII. Reuse Proven Reference Implementations** — PASS, genuinely exercised (not N/A): `ar-puuk/spatial-sql-explorer` (DuckDB spatial extension lazy-load, MapLibre choropleth, basemap switching) is this principle's own designated reference for exactly this feature — fetched and read directly this session (its "Graduated" choropleth mode, its confirmed no-deck.gl pure-MapLibre stack, its confirmed spatial-extension network-dependency disclosure), not re-derived from scratch. `ar-puuk/parquet-viewer` (GeoParquet metadata detection, `registerFileBuffer`, spatial extension fallback, buffer-pool collision fix) informed the `read_parquet()`-over-`ST_Read()` geometry-reading decision (research.md §3) — also fetched and read directly.
- **IX. Fixed Python/JS Source Split** — PASS. No Python package changes; the synthetic GeoParquet fixture is generated by `tests/fixtures/generate.py` (existing file, same as every other fixture), not a new Python package location.

No violations. Complexity Tracking table below is empty.

**Post-Phase-1 re-check**: re-verified against the actual `data-model.md`/`contracts/zonemap-panel.md`/`quickstart.md` produced below. One thing worth naming explicitly, mirroring `010-flowmap-panel`'s own precedent of calling out a caught-during-planning issue rather than shipping it: this feature's own contract draft initially assumed `boundaries:` could resolve relative to the *dashboard config's own* fetch path (`public/dashboard-config/`) — checked against `docs/GRAMMAR.md`'s worked example and found wrong, since zone geometry is scenario-and-tab-independent and would need re-fetching per tab under that scheme; corrected to a single, dedicated static-asset directory (`public/geometry/`, data-model.md) resolved once regardless of which tab/panel references it, consistent with the zone-geometry-cache design (research.md §4). No other principle-relevant design decision emerged beyond what Technical Context already anticipated. Still PASS, no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/013-zonemap-panel/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── zonemap-panel.md # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── layout/
│   └── types.ts                # MODIFIED: + ZoneMapPanelConfig (extends
│                                #   DataBoundPanelConfigBase AND
│                                #   MapRenderingPanelConfig, per that
│                                #   file's own standing comment
│                                #   anticipating this), + 'zonemap' in
│                                #   the PanelConfig union, +
│                                #   isMapRenderingPanel()'s existing
│                                #   `// extend with ... zonemap` comment
│                                #   made real
├── panels/
│   ├── registry.tsx             # MODIFIED: + 'zonemap': ZoneMapPanel entry
│   ├── ZoneMapPanel.tsx          # NEW — the component (contracts/
│   │                             #   zonemap-panel.md)
│   ├── zoneGeometry.ts           # NEW — module-level GeoJSON geometry
│   │                             #   cache + registerFileURL/read_parquet/
│   │                             #   ST_GeomFromWKB loading (research.md
│   │                             #   §2/§3/§4), DOM-free
│   ├── zonemapColor.ts           # NEW — pure color-scale resolution:
│   │                             #   sequential/diverging + domain +
│   │                             #   named color_ramp + steps
│   │                             #   quantization (research.md §6/§8/§10,
│   │                             #   extends both tableLogic.ts's
│   │                             #   cellColor() convention and
│   │                             #   sankeyColor.ts's named-scheme shape)
│   ├── panelQuery.ts             # MODIFIED: + buildComparisonDiffQuery()
│   │                             #   for comparison: diff's two-scenario
│   │                             #   join (research.md §7)
│   └── PanelEmptyState.tsx,
│       PanelErrorState.tsx       # UNCHANGED — reused directly
└── (services/, state/, hooks/, components/ui/, panels/basemap/ all
    reused unmodified — panels/basemap/ consumed exactly as 011's own
    design intended, spec.md Grammar findings #6)

tests/
├── unit/
│   ├── zonemapColor.test.ts      # NEW
│   └── panelQuery.test.ts        # MODIFIED: + buildComparisonDiffQuery() cases
├── integration/
│   └── zonemapPanel.spec.ts      # NEW
└── fixtures/
    ├── generate.py                # MODIFIED: + a synthetic zone-boundary
    │                               #   GeoParquet fixture (this project's
    │                               #   first geometry fixture, research.md §5)
    │                               #   + a vmt_by_home_taz-shaped metric
    │                               #   table, keyed to match
    └── dashboard-config/
        └── dashboard-6-network.yaml  # MODIFIED: + a type: zonemap panel entry
                                       #   (docs/GRAMMAR.md's own worked
                                       #   example already lives on this tab)

docs/
└── ARCHITECTURE.md               # MODIFIED: extend the existing
                                   # parquet-extension "no internet
                                   # required" caveat to cover the
                                   # spatial extension too (FR-014,
                                   # research.md §2)

public/
└── geometry/                     # NEW — published static GeoParquet
                                   # zone-boundary assets, discovered by
                                   # filename only (no index.json needed —
                                   # a panel's own `boundaries:` key
                                   # already names the exact file, unlike
                                   # scenarios/dashboard-config's
                                   # multi-file discovery need)
    └── taz.geoparquet             # example — matches docs/GRAMMAR.md's
                                    # own worked example filename
```

**Structure Decision**: Single-project web app, unchanged from every prior panel-type feature — no new top-level directory. New files land in the existing `src/panels/` (component + two pure modules) and `src/layout/types.ts` (config type), mirroring every prior panel-type feature's own file placement. `public/geometry/` is the one new top-level publishing location this feature adds — a static-asset directory, not a fourth config file type (Constitution Check, Principle VII), analogous to `public/observed/`/`public/scenarios/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally empty.
