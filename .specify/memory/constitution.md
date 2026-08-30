<!--
Sync Impact Report
- Version change: 1.1.0 → 1.2.0
- Modified principles:
  - II. DuckDB-WASM Runs in a Web Worker, One Shared Instance → II. DuckDB-WASM
    Query Execution Off the Main Thread, One Shared Instance — dropped the
    literal `services/duckdb.worker.js` filename requirement. Verified against
    the installed `@duckdb/duckdb-wasm` package's own README/type
    definitions: its real API instantiates `AsyncDuckDB` on the main thread,
    handed a `Worker` built from the library's own bundled worker script
    (loaded by URL) — there is no app-authored worker file to write; writing
    one would not match how the library operates. The substantive guarantee
    — query execution never blocks the main thread, exactly one shared
    instance, owned solely by `services/duckdb.js` — is unchanged. Discovered
    while implementing 001-data-state-layer's User Story 1 against the real
    library, not a policy change.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (1.1.0, superseded above)
- Version change: 1.0.0 → 1.1.0
- Modified principles: none
- Added principles:
  - IX. Fixed Python/JS Source Split — package lives at python/wftdm_dashboard/;
    src/ is reserved exclusively for the JS app; src/wftdm_dashboard/ MUST NOT
    be recreated. Added following the path-consolidation cleanup that moved the
    Python package out of src/ (README.md, CLAUDE.md, pyproject.toml,
    .gitignore, .vscode/settings.json all reconciled to python/wftdm_dashboard/).
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (1.0.0, superseded above)
- Version change: (none, initial scaffold) → 1.0.0
- Modified principles: n/a (initial ratification)
- Added sections:
  - Core Principles: I. Phased Migration Discipline, II. DuckDB-WASM Runs in a Web
    Worker (One Shared Instance), III. No eval() — SQL Fragments via String
    Replacement Only, IV. YAML Parsed at Runtime, V. Parquet-Only Browser Data I/O,
    VI. Fixed Technology Choices, VII. Minimal, Fixed Config File Set,
    VIII. Reuse Proven Reference Implementations
  - Technology Stack Reference (Section 2)
  - Development Workflow (Section 3)
  - Governance
- Removed sections: none (all template placeholders replaced)
- Deferred TODOs: none — RATIFICATION_DATE set to the date of this initial
  adoption since no prior constitution or documented ratification date exists.
-->

# WFRC TDM Calibration Dashboard Constitution

## Core Principles

### I. Phased Migration Discipline
Phase 1 (`main`) MUST be built and fully verified working entirely in plain
JavaScript (ES2022), with no framework and no TypeScript. TypeScript MUST NOT be
introduced anywhere in Phase 1. Phase 2 (`feat/typescript`) adds types
incrementally on top of the working Phase 1 codebase and MUST NOT introduce React;
it is merged into `main` only once confirmed working. Phase 3 (`feat/react`)
branches from post-Phase-2 `main` and MUST NOT begin until Phase 2 is confirmed
working. Phases MUST NOT be skipped, reordered, or partially blended (e.g., no
`.tsx` files or React imports while Phase 1 is still active on `main`).
**Rationale**: each phase is a complete, independently verifiable milestone;
blending phases makes it impossible to isolate whether a bug comes from the
migration or from application logic.

### II. DuckDB-WASM Query Execution Off the Main Thread, One Shared Instance
DuckDB-WASM query execution MUST NEVER run on the main thread, and exactly one
shared `AsyncDuckDB` instance MUST serve the whole app. That instance —
together with the `Worker` DuckDB-WASM itself provides via `bundle.mainWorker`
— MUST be owned entirely by `services/duckdb.js`; no other module may
construct its own `AsyncDuckDB` or `Worker` instance, or its own connection.
There is no separate app-authored `services/duckdb.worker.js` file: DuckDB-WASM
ships its own worker script, loaded by URL from the library's own package
bundle (never a CDN — see `services/duckdb.js`'s contract and `research.md`
for why), and `services/duckdb.js` alone is responsible for selecting a
bundle, instantiating that worker, and exposing `initDuckDB()` / `query()` /
`registerScenario()` / `registerFileURL()` / etc. to the rest of the app.
**Rationale**: keeps the UI and map rendering responsive while Parquet/Arrow-scale
queries run off the main thread, and a single shared instance avoids duplicated
memory and inconsistent registered views across panels. *(Amended 1.2.0: the
original wording named an app-authored `services/duckdb.worker.js` file: the
installed `@duckdb/duckdb-wasm` package's real API instantiates `AsyncDuckDB`
on the main thread and hands it a `Worker` built from the library's own
bundled script — there was never anything for the app to author into that
file. The behavioral guarantee itself — main thread never blocks on query
execution, exactly one shared instance — is unchanged.)*

### III. No eval() — SQL Fragments via String Replacement Only
Application code MUST NOT call `eval()` or any equivalent dynamic code execution.
SQL assembled from dashboard YAML (`$mappings`, `$bins`, `$sql`, `$filters`,
`$scenario` expansion in `services/sqlExpander.js`) MUST be built through plain
string replacement/templating only.
**Rationale**: `eval()` over YAML- and filter-influenced content is an injection
risk and defeats static review of how SQL is constructed.

### IV. YAML Parsed at Runtime
`dashboard-*.yaml`, `summarize.yaml`, and `manifest.yaml` MUST be fetched and
parsed at runtime with `js-yaml`. Dashboard structure and panel content MUST NOT
be pre-processed, inlined, or baked in at build time.
**Rationale**: lets model teams add or edit dashboards and scenarios without a
dashboard rebuild or redeploy.

### V. Parquet-Only Browser Data I/O
The browser MUST read only Parquet or GeoParquet files. CSV, OMX, GeoJSON, and
shapefile formats MUST NOT be read in the browser. Any conversion from those
formats happens offline in the Python post-processor before results are published
to `public/scenarios/` or `public/observed/`.
**Rationale**: bounds browser-side query performance and memory, and keeps the
Python pipeline the single authoritative place responsible for format
correctness.

### VI. Fixed Technology Choices
Maps MUST use MapLibre GL; Mapbox GL MUST NOT be used. The build tool is Vite;
Webpack MUST NOT be used. The app MUST NOT use `localStorage` or `sessionStorage`
for any state.
**Rationale**: MapLibre stays compatible with `@deck.gl/mapbox`'s
`MapboxOverlay` without Mapbox's licensing/token requirements; Vite is required
for the Web Worker (`format: 'es'`) and DuckDB-WASM wiring already validated in
this project; avoiding Web Storage keeps state explicit and inspectable in
`state/appState.js` and `state/filterState.js`.

### VII. Minimal, Fixed Config File Set
Exactly three config file types exist: `summarize.yaml` (post-processor sources,
mappings, bins, `sql_fragments`, metrics → Parquet), `dashboard-*.yaml` (tab
layout and panels, with the first file serving as the landing page), and
`manifest.yaml` (per-scenario metadata). `topsheet.yaml`, `dashboard-config.yaml`,
`summarize-preprocessor.yaml`, and `services/observedRegistry.js` MUST NOT be
created — the landing page is simply the first `dashboard-*.yaml`, app settings
live in code and CLI args, join logic lives in `summarize.yaml`'s
`sql_fragments`, and observed-data plus scenario registration lives in
`services/scenarioDiscovery.js`.
**Rationale**: prevents config sprawl and duplicated responsibility across files
that would otherwise do the same job.

### VIII. Reuse Proven Reference Implementations
When implementing DuckDB-WASM/Arrow wiring, MapLibre + flowmap.gl/deck.gl
overlays, spatial-SQL/GeoParquet handling, or Vite + coi-serviceworker setup,
implementers MUST first look to copy the proven pattern from the designated
reference repositories rather than re-deriving the approach from scratch:
`ar-puuk/omx-viewer` (DuckDB-WASM init, Arrow handoff, Vite config,
coi-serviceworker, GH Actions), `WFRCAnalytics/APP-Commute-Explorer`
(MapboxOverlay + FlowmapLayer + MapLibre wiring, hover/pick pattern),
`ar-puuk/spatial-sql-explorer` (DuckDB spatial extension lazy-load, MapLibre
choropleth, basemap switching), and `ar-puuk/parquet-viewer` (GeoParquet metadata
detection, `registerFileBuffer`, spatial extension fallback, buffer-pool
collision fix).
**Rationale**: these patterns are already validated in production-like use;
re-deriving them risks reintroducing bugs (e.g., buffer-pool collisions) those
repos already fixed.

### IX. Fixed Python/JS Source Split
The Python package MUST live at `python/wftdm_dashboard/`. `src/` is reserved
exclusively for the JS dashboard app. `src/wftdm_dashboard/` (or any other Python
package code under `src/`) MUST NOT be recreated.
**Rationale**: the package previously lived at `src/wftdm_dashboard/` while
`CLAUDE.md` and other docs described `python/wftdm_dashboard/`, and the two
source layouts had already drifted (a stale `uv_build` default `module-root` of
`src/`, and gitignore/editor-exclude entries pointing at the wrong static-build
path). Fixing this once and pinning it here prevents the two trees from silently
re-diverging as new Python or JS files are added.

## Technology Stack Reference

The following choices are binding, not suggestions — deviating from any of them
requires amending this constitution first:

| Layer | Technology |
|---|---|
| Build | Vite, plain JavaScript (ES2022) in Phase 1 |
| Query — browser | DuckDB-WASM in a Web Worker |
| Query — offline | Python DuckDB (`uv run`) |
| Charts — default | Plotly.js |
| Charts — reactive inputs | Observable Plot (`@observablehq/plot`) |
| Explore tab | Graphic Walker (`embedGraphicWalker`) |
| Maps | MapLibre GL (never Mapbox) |
| O-D flows | `@flowmap.gl/layers` + `@deck.gl/mapbox` (`MapboxOverlay`) |
| Config parsing | js-yaml, at runtime |
| File format | Parquet / GeoParquet only in the browser |
| Geometry | DuckDB spatial extension (`ST_Read`, `ST_AsGeoJSON`) |

Pinned peer dependency versions (must stay mutually compatible):
`@deck.gl/core` and `@deck.gl/mapbox` `^9.0.0`, `@flowmap.gl/layers` `^9.3.0`,
`maplibre-gl` `^4.7.1`.

## Development Workflow

`docs/ARCHITECTURE.md` and `docs/SPEC.md` MUST be read before writing any code
against this repository. The navigation model is fixed: the Summary tab
(`dashboard-1-summary.yaml`) renders on scenario load, reading first from
`summary_kpis.parquet`, with other tabs and charts loading progressively as
their Parquet files register. New panels MUST follow the established panel
pattern (`create(config, conn, filterState)` returning `{ element, destroy }`,
subscribing through `filterState.subscribe`) and MUST be registered in
`panels/registry.js` rather than wired ad hoc into layout code.

## Governance

This constitution supersedes ad hoc practice for the areas it covers. `CLAUDE.md`
and `docs/ARCHITECTURE.md`/`docs/SPEC.md` carry the day-to-day implementation
detail and reference patterns; where any of them conflicts with a principle
here, this constitution's non-negotiables govern and the conflicting document
MUST be corrected.

**Amendment procedure**: propose the change, update the affected principles or
sections in this file, bump the version per the rule below, and record the
change in a Sync Impact Report comment at the top of this file before merging.

**Versioning policy** (semantic versioning): MAJOR — a principle is removed or
redefined in a backward-incompatible way (e.g., dropping phase gating, allowing
Mapbox); MINOR — a new principle or section is added, or existing guidance is
materially expanded; PATCH — wording clarifications, typo fixes, or other
non-semantic refinements.

**Compliance review**: pull requests and code reviews MUST verify there is no
violation of these principles — no TypeScript or React outside their designated
phase/branch, no `eval()`, no main-thread DuckDB-WASM use, no forbidden config
files, no Mapbox/Webpack/Web Storage usage. Any exception requires a prior
amendment to this document, not a one-off waiver in review.

**Version**: 1.2.0 | **Ratified**: 2026-08-19 | **Last Amended**: 2026-08-30
