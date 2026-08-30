# Implementation Plan: Data and State Layer Scaffold

**Branch**: `001-data-state-layer` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-data-state-layer/spec.md`

## Summary

Build the boot-time data/state layer for the dashboard with no visual output:
a shared DuckDB-WASM connection whose query execution never touches the main
thread (`services/duckdb.ts` alone — coordinating DuckDB-WASM's own bundled
worker script; constitution Principle II, amended 1.2.0 — no app-authored
worker file), automatic startup registration of the observed
dataset and every published scenario plus `?s=` URL-param handling
(`services/scenarioDiscovery.ts`), runtime YAML loading
(`services/yamlLoader.ts`), string-substitution-only SQL placeholder expansion
(`services/sqlExpander.ts`), and an in-memory filter pub/sub store
(`state/filterState.ts`) plus a scenario registry (`state/appState.ts`) — all
wired together by a `src/main.ts` boot stub that reaches a fully queryable
"ready" state and renders nothing. Technical approach: greenfield Vite +
TypeScript project scaffold, following the DuckDB-WASM/Worker pattern
from `ar-puuk/omx-viewer` per constitution Principle VIII, validated by a
Vitest (pure logic) + Playwright (real browser/Worker/WASM) test split
resolved in `research.md`. *(Originally implemented in vanilla JS per
constitution v1.x's phase-gating; converted to TypeScript when constitution
v2.0.0 dropped that gate — see the `refactor:` commit. This plan reflects the
current, post-conversion state, not a re-run of the original planning pass.)*

## Technical Context

**Language/Version**: TypeScript (ES2022 target), per constitution v2.0.0
Principle I — TypeScript throughout `src/`, no phase gate

**Primary Dependencies**: `@duckdb/duckdb-wasm`, `apache-arrow`, `js-yaml`,
`vite` (build tool, `worker: { format: 'es' }`), `typescript` (devDependency,
type-checking only — Vite transpiles via esbuild, `tsc` never emits),
`coi-serviceworker.js` (static asset, loaded first in `index.html`)

**Storage**: N/A — no server-side database in this slice; static Parquet /
GeoParquet files under `public/observed/` and `public/scenarios/*`, read
in-browser via DuckDB-WASM (constitution Principle V)

**Testing**: Vitest for pure-logic unit tests (`sqlExpander.ts`,
`filterState.ts`, `yamlLoader.ts`); Playwright for real-browser integration
tests of the boot sequence (Web Worker + DuckDB-WASM + Parquet fetch + URL
params) — see `research.md` §1 for why jsdom-only testing was rejected

**Target Platform**: Browser — Chromium/Firefox/WebKit (Playwright coverage);
served/self-hosted mode (`wftdm-dashboard serve`/`here`) and GitHub
Pages/static hosting are both in scope for `registerFileURL`; the
folder-picker (`showDirectoryPicker()`) UI path is deferred to
`scenarioManager.js` (out of scope for this slice — its target function
signature is fixed here per `contracts/duckdb-service.md` so that later slice
doesn't change this module's public shape)

**Project Type**: Single-project web frontend (this slice touches only
`src/`, `public/`, and root build config — the Python package under `python/`
is untouched, per constitution Principle IX)

**Performance Goals**: SC-002 — every published scenario independently
queryable within 5 seconds of startup on a typical broadband connection

**Constraints**: Query-engine init and scenario registration MUST NOT block
the main thread (FR-001, constitution Principle II); SQL expansion MUST use
string replacement only, never `eval()`/dynamic code execution (FR-015,
constitution Principle III); browser I/O is Parquet/GeoParquet only
(constitution Principle V); no `localStorage`/`sessionStorage` for any state
(constitution Principle VI) — `appState.ts`/`filterState.ts` are in-memory
only; exactly one shared DuckDB instance for the whole app (FR-002,
constitution Principle II)

**Scale/Scope**: Observed dataset + a small number of published scenarios
(single digits to low tens, per current WFRC workflow); each scenario's
`summary/*.parquet` files individually well under 100MB (per
`docs/ARCHITECTURE.md`'s WASM-threading note)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed (amended 2.0.0) | All `src/` code is TypeScript (`.ts`); no plain `.js` reintroduced; React is not adopted (nothing renders anything yet, per FR-022) and none of this slice's files require it | PASS |
| II. DuckDB-WASM query execution off the main thread, one shared instance (amended 1.2.0) | `services/duckdb.ts` alone owns the sole `AsyncDuckDB` instance and the `Worker` built from DuckDB-WASM's own bundled script (self-hosted via Vite `?url` imports, not a CDN — research.md §3); no app-authored `duckdb.worker.ts`, no other module creates a connection | PASS |
| III. No `eval()` | `sqlExpander.ts` contract (`contracts/sql-expander.md`) is string-substitution only; explicitly tested | PASS |
| IV. YAML parsed at runtime | `yamlLoader.ts` fetches+parses at call time, never at build time | PASS |
| V. Parquet-only browser I/O | `scenarioDiscovery.ts` only ever registers `*.parquet`/`*.geoparquet`; no CSV/OMX/GeoJSON touched in-browser | PASS |
| VI. Fixed Technology Choices | Vite (not Webpack); no `localStorage`/`sessionStorage` anywhere in `appState.ts`/`filterState.ts`; MapLibre/Mapbox N/A — no maps in this slice | PASS |
| VII. Minimal, Fixed Config File Set | Only `dashboard-*.yaml`, `summarize.yaml`-shaped configs, and `manifest.yaml` are ever loaded; no new config file type introduced | PASS |
| VIII. Reuse Proven Reference Implementations | DuckDB-WASM/Worker/Arrow wiring follows `ar-puuk/omx-viewer` (research.md §3); no map/spatial work in this slice, so `spatial-sql-explorer`/`parquet-viewer`/Commute Explorer patterns are not yet needed | PASS |
| IX. Fixed Python/JS Source Split | This slice adds files only under `src/`, `public/`, and root config — no Python package code, nothing under `src/wftdm_dashboard/` | PASS |

No violations. Complexity Tracking table is not needed (left empty below).

## Project Structure

### Documentation (this feature)

```text
specs/001-data-state-layer/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/             # Phase 1 output
│   ├── duckdb-service.md
│   ├── scenario-discovery.md
│   ├── sql-expander.md
│   ├── filter-state.md
│   ├── app-state.md
│   ├── yaml-loader.md
│   └── boot-sequence.md
├── checklists/
│   └── requirements.md
└── tasks.md               # Phase 2 output (/speckit-tasks command — not this command)
```

### Source Code (repository root)

Single-project web frontend — no backend/mobile split for this slice. Only
the paths this slice actually creates are listed; everything else in
`CLAUDE.md`'s full file structure (`panels/`, `layout/`, `scenario/`,
`styles/`, `python/`) is explicitly out of scope here.

```text
package.json
tsconfig.json                     # constitution v2.0.0 — TypeScript throughout
vite.config.ts
index.html                        # coi-serviceworker.js loaded first, then src/main.ts

public/
├── coi-serviceworker.js
├── observed/
│   ├── manifest.yaml
│   └── summary/*.parquet
└── scenarios/
    ├── index.json
    └── {name}/
        ├── manifest.yaml
        └── summary/*.parquet

src/
├── main.ts                       # boot sequence stub — no rendering
├── state/
│   ├── appState.ts               # scenario registry
│   └── filterState.ts            # filter pub/sub store
└── services/
    ├── duckdb.ts                 # public API: init/register/query/list —
    │                              # owns the sole AsyncDuckDB instance +
    │                              # DuckDB-WASM's own bundled worker script;
    │                              # no separate duckdb.worker.ts (constitution
    │                              # Principle II, amended 1.2.0)
    ├── yamlLoader.ts
    ├── sqlExpander.ts
    └── scenarioDiscovery.ts

tests/
├── fixtures/
│   ├── generate.py               # uv run python — produces tiny fixture Parquet files
│   └── (generated) observed/, scenarios/
├── unit/                          # Vitest
│   ├── sqlExpander.test.ts
│   ├── filterState.test.ts
│   └── yamlLoader.test.ts
└── integration/                   # Playwright
    └── boot.spec.ts
```

**Structure Decision**: Single-project layout (Option 1 from the template),
scoped to exactly the directories above. This matches `CLAUDE.md`'s full
target file structure but implements only the boot-time data/state slice of
it — `panels/`, `layout/`, `scenario/scenarioManager.js`, `styles/`, and the
Python package are all deferred, per the spec's explicit out-of-scope list
(FR-022). (`scenarioManager.js`'s eventual extension isn't decided by this
slice — left as originally sketched.)

## Complexity Tracking

*No entries — Constitution Check reported no violations.*
