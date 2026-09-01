<!--
Sync Impact Report
- Version change: 2.2.0 → 2.3.0
- Modified principles: none
- Modified sections:
  - Technology Stack Reference: Pinned peer dependency versions gained
    `@deck.gl/layers` `^9.0.0` — a real, confirmed gap, not previously
    covered even implicitly. Found while verifying Principle VIII's
    `WFRCAnalytics/APP-Commute-Explorer` reference against the real repo
    (not assumed): both `APP-Commute-Explorer` (`github.com/WFRCAnalytics/
    APP-Commute-Explorer`, confirmed public/active/non-archived via the
    GitHub API, `pushed_at` 2026-06-30) and a related repo,
    `APP-WFRC-Commute-Patterns` (also confirmed real/active, `pushed_at`
    2026-08-29), independently pin `@deck.gl/layers` `^9.0.0` in their real
    `package.json` files, fetched directly (`raw.githubusercontent.com`),
    not summarized secondhand. `APP-Commute-Explorer`'s own pins otherwise
    match this constitution's existing ones exactly (`maplibre-gl`
    `^4.7.1`, `@deck.gl/core`/`@deck.gl/mapbox` `^9.0.0`, `@flowmap.gl/
    layers` `^9.3.0`) — the reference itself was already accurate; only
    the missing `@deck.gl/layers` entry needed adding. Principle VIII's
    reference table itself is unchanged — `APP-Commute-Explorer` is a
    real, current, non-stale repo, not a rename/404 case, so no reference
    swap was warranted despite that being the trigger condition this
    verification was checking for.
  - MINOR, not PATCH: unlike the 1.1.0→1.2.0 `services/duckdb.worker.js`
    correction (fixing a reference to match reality, no new binding
    constraint added), this adds a genuinely new pinned dependency version
    to the "must stay mutually compatible" list — existing guidance
    materially expanded, per this file's own versioning policy, not a
    non-semantic wording fix.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.2.0, superseded above)
- Version change: 2.1.1 → 2.2.0
- Modified principles: none
- Modified sections:
  - Development Workflow: panel pattern rewritten for React. It was written
    before React was adopted (`create(config, conn, filterState)` returning
    `{ element, destroy }` — a vanilla-JS factory-function contract);
    `002-design-tokens` has since adopted React, and panels are next to be
    built, so the pattern needed to match reality before any panel code is
    written against it. New shape: a React function component receiving a
    single `config` prop, reading filter values through a `useFilterState`
    hook (`src/hooks/useFilterState.ts`, wrapping `state/filterState.ts`'s
    existing pub/sub store with `useSyncExternalStore`) and querying
    `services/duckdb.ts` by direct import rather than an injected
    connection; registered in `panels/registry.tsx` as a panel-type-to-
    component map rather than a type-to-factory-function map.
  - MINOR, not MAJOR: no Core Principle (I-IX) is redefined — Principle I
    already permits React "when a UI feature genuinely needs it," and this
    is that permission being exercised for the panel layer, the same way
    `002-design-tokens` exercised it for the UI-primitives layer.
    Development Workflow sits outside the nine enumerated principles.
    Directly analogous to the 1.1.0→1.2.0 amendment (the
    `services/duckdb.worker.js` correction), which made a comparable
    technical-shape correction — to an actual Core Principle's text, a more
    structurally significant location than this change touches — and was
    itself categorized MINOR: the underlying policy intent is unchanged;
    only a concrete mechanism, written speculatively before the real
    technology was settled, is corrected to match it.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.1.1, superseded above)
- Version change: 2.1.0 → 2.1.1
- Modified principles:
  - I. TypeScript Throughout, React Permitted When Needed — PATCH wording
    fix, not a policy change: the rationale/body previously said React
    "MAY be introduced when a UI feature genuinely needs it — starting
    with the layout/panel layer." `002-design-tokens` (a design-token and
    shadcn/ui component foundation feature, planned before any layout/panel
    work) turned out to be the feature that actually needed React first,
    since shadcn/ui has no non-React form. Corrected to name no specific
    feature — "whichever UI feature first needs it" — so the wording
    doesn't go stale again the next time the actual trigger feature differs
    from whatever was guessed when this was written. The underlying policy
    (React adopted only when genuinely needed, no phase gate, no dedicated
    branch) is unchanged.
  - VI. Fixed Technology Choices — same wording fix, found while checking for
    the same mistake elsewhere in this file: its rationale also said the
    UI-layer stack was decided "ahead of the layout/panel layer's actual
    build." Generalized to "ahead of whichever feature first adopts React
    (Principle I)."
- Modified sections:
  - Technology Stack Reference: Build row's "arrives with the layout/panel
    layer" corrected to "arrives with whichever feature first needs it,"
    same reason.
  - Governance / Compliance review: "no React usage outside the layout/panel
    layer it's scoped to once adopted" — same stale assumption — replaced
    with "no React usage introduced speculatively ahead of an actual UI need
    (Principle I)," preserving the actual governance intent (React usage
    should be need-driven, not spread ad hoc) without naming a layer.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.1.0, superseded above)
- Version change: 2.0.0 → 2.1.0
- Modified principles:
  - VI. Fixed Technology Choices — additive (MINOR), not a redefinition:
    adds Tailwind CSS, shadcn/ui (Radix UI primitives), and `lucide-react`
    as the fixed UI-layer stack, joining the existing MapLibre/Vite/
    no-Web-Storage choices. Decided ahead of the layout/panel layer's
    actual build (Principle I — React itself isn't adopted yet), so that
    work starts on a settled foundation rather than a separate
    framework-choice debate once React lands.
- Modified sections:
  - Technology Stack Reference: Build row updated to name the UI-layer
    stack alongside the existing Vite/TypeScript/React-not-yet-adopted note.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.0.0, superseded above)
- Version change: 1.2.0 → 2.0.0
- Modified principles:
  - I. Phased Migration Discipline → I. TypeScript Throughout, React
    Permitted When Needed — MAJOR change: drops the sequential phase-gating
    requirement entirely. No more "Phase 1 (vanilla JS) fully verified
    before Phase 2 (TypeScript) begins," no more separate `feat/typescript`
    / `feat/react` branches merged only once confirmed working. TypeScript
    and React are now permitted directly on `main`; existing vanilla JS in
    001-data-state-layer was converted to TypeScript as part of this same
    amendment (see the accompanying `refactor:` commit). This is the
    MAJOR-version example the Governance section's own versioning policy
    already names ("dropping phase gating").
- Modified sections:
  - Technology Stack Reference: Build row updated from "Vite, plain
    JavaScript (ES2022) in Phase 1" to reflect TypeScript; React noted as
    not yet adopted (arrives with the panel/layout layer, not before).
  - Governance / Compliance review: "no TypeScript or React outside their
    designated phase/branch" removed — that constraint no longer exists —
    replaced with a standard reflecting the new policy.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (1.2.0, superseded above)
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

### I. TypeScript Throughout, React Permitted When Needed
The JS app is TypeScript (`.ts`), not plain JavaScript — new work MUST NOT
add plain `.js` files to `src/` where a `.ts` file is expected. There is no
phase gate to clear first and no separate branch to merge from: TypeScript
work lands directly on `main`. React MAY be introduced when a UI feature
genuinely needs it — whichever feature that turns out to be, not a
predetermined one — but is not required before then, and (like TypeScript)
has no separate branch of its own once adopted; it lands directly on `main`
too.
**Rationale**: the original three-phase, branch-per-phase plan (vanilla JS →
TypeScript → React, each fully verified before the next began) isolated
migration risk at the cost of real process overhead; with working test
coverage already in place before any conversion, adopting types and a UI
framework incrementally and directly on `main` carries the same safety
without the branch-and-gate ceremony.

### II. DuckDB-WASM Query Execution Off the Main Thread, One Shared Instance
DuckDB-WASM query execution MUST NEVER run on the main thread, and exactly one
shared `AsyncDuckDB` instance MUST serve the whole app. That instance —
together with the `Worker` DuckDB-WASM itself provides via `bundle.mainWorker`
— MUST be owned entirely by `services/duckdb.ts`; no other module may
construct its own `AsyncDuckDB` or `Worker` instance, or its own connection.
There is no separate app-authored `services/duckdb.worker.ts` file: DuckDB-WASM
ships its own worker script, loaded by URL from the library's own package
bundle (never a CDN — see `services/duckdb.ts`'s contract and `research.md`
for why), and `services/duckdb.ts` alone is responsible for selecting a
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
`$scenario` expansion in `services/sqlExpander.ts`) MUST be built through plain
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
for any state. The UI layer — once React is adopted per Principle I, not
before — MUST use Tailwind CSS for styling, shadcn/ui (built on Radix UI
primitives) for component primitives, and `lucide-react` for icons; no other
CSS framework, component library, or icon set MUST be introduced instead.
**Rationale**: MapLibre stays compatible with `@deck.gl/mapbox`'s
`MapboxOverlay` without Mapbox's licensing/token requirements; Vite is required
for the Web Worker (`format: 'es'`) and DuckDB-WASM wiring already validated in
this project; avoiding Web Storage keeps state explicit and inspectable in
`state/appState.ts` and `state/filterState.ts`; Tailwind + shadcn/ui + Radix +
`lucide-react` is decided now, ahead of whichever feature first adopts React
(Principle I), so that work starts on a settled foundation instead of a
separate framework-choice debate once React lands — `lucide-react` also already has
precedent in a sibling WFRCAnalytics-org repo (`APP-Project-Scoresheet`).

### VII. Minimal, Fixed Config File Set
Exactly three config file types exist: `summarize.yaml` (post-processor sources,
mappings, bins, `sql_fragments`, metrics → Parquet), `dashboard-*.yaml` (tab
layout and panels, with the first file serving as the landing page), and
`manifest.yaml` (per-scenario metadata). `topsheet.yaml`, `dashboard-config.yaml`,
`summarize-preprocessor.yaml`, and `services/observedRegistry.ts` MUST NOT be
created — the landing page is simply the first `dashboard-*.yaml`, app settings
live in code and CLI args, join logic lives in `summarize.yaml`'s
`sql_fragments`, and observed-data plus scenario registration lives in
`services/scenarioDiscovery.ts`.
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
| Build | Vite, TypeScript (ES2022 target); React not yet adopted — arrives with whichever feature first needs it, styled with Tailwind CSS + shadcn/ui (Radix UI primitives), icons via `lucide-react` |
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
`@deck.gl/core`, `@deck.gl/layers`, and `@deck.gl/mapbox` `^9.0.0`,
`@flowmap.gl/layers` `^9.3.0`, `maplibre-gl` `^4.7.1`.

## Development Workflow

`docs/ARCHITECTURE.md` and `docs/SPEC.md` MUST be read before writing any code
against this repository. The navigation model is fixed: the Summary tab
(`dashboard-1-summary.yaml`) renders on scenario load, reading first from
`summary_kpis.parquet`, with other tabs and charts loading progressively as
their Parquet files register. New panels MUST follow the established panel
pattern — a React function component receiving a single `config` prop,
reading filter values via the `useFilterState` hook (`src/hooks/
useFilterState.ts`, wrapping `state/filterState.ts`'s pub/sub store with
`useSyncExternalStore`), and querying `services/duckdb.ts` by direct import
rather than an injected connection — and MUST be registered in
`panels/registry.tsx` (a panel-type-to-component map) rather than wired ad
hoc into layout code. *(Amended 2.2.0: the pattern was originally a
vanilla-JS factory function — `create(config, conn, filterState)` returning
`{ element, destroy }` — written before React was adopted; corrected now
that panels are next to be built, per `002-design-tokens`'s adoption of
React.)*

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
violation of these principles — no new plain `.js` files in `src/` (TypeScript
is the standard), no React usage introduced speculatively ahead of an actual
UI need (Principle I), no `eval()`, no main-thread DuckDB-WASM use, no
forbidden config files, no Mapbox/Webpack/Web Storage usage. Any exception
requires a
prior amendment to this document, not a one-off waiver in review.

**Version**: 2.3.0 | **Ratified**: 2026-08-19 | **Last Amended**: 2026-08-31
