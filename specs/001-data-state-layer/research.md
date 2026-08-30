# Research: Data and State Layer Scaffold

**Feature**: `001-data-state-layer` | **Date**: 2026-08-29

Purpose: resolve every `NEEDS CLARIFICATION` left in `plan.md`'s Technical Context
before Phase 1 design. This is a greenfield slice — no `package.json`, `src/`, or
`public/` exist yet in the repo — so several decisions here are "first slice"
tooling choices, not changes to existing code.

---

## 1. Test framework for a Web-Worker-based, no-framework Vite app

**Decision**: Two-tier test setup —
- **Vitest** for pure-logic unit tests: `sqlExpander.js` (placeholder expansion),
  `filterState.js` (pub/sub), `yamlLoader.js` (parsing), `scenarioDiscovery.js`'s
  URL-param logic. These run in Node, no browser needed, fast feedback loop.
- **Playwright** for the boot-sequence integration tests that exercise User
  Stories 1–3 end-to-end: real DuckDB-WASM instantiation inside a real Web
  Worker, real Parquet fetch/registration, real `?s=` URL parsing in an actual
  browser context.

**Rationale**: The spec's own acceptance scenarios ("the initializing work does
not run on the main thread", "a query can be issued... and returns a result")
are statements about real browser/Worker/WASM behavior. `jsdom` (Vitest's
default DOM shim) does not reliably instantiate Web Workers or WebAssembly the
way a real browser does, so asserting FR-001/FR-002/FR-009–FR-012 against jsdom
would be testing a simulation, not the actual non-negotiable (constitution
Principle II: DuckDB-WASM must run in a Worker). Playwright drives a real
Chromium/Firefox/WebKit instance, matching the reference implementations this
project is told to copy from (`ar-puuk/omx-viewer`, `ar-puuk/parquet-viewer`),
which validate DuckDB-WASM the same way.

**Alternatives considered**:
- *Vitest + jsdom only* — rejected: cannot faithfully exercise a real Worker
  running real WASM; would give false confidence on the exact property (main
  thread stays unblocked) the spec cares about most.
- *Playwright for everything, including pure logic* — rejected: unnecessary
  browser-launch overhead for testing string templating and a pub/sub map;
  slows the inner dev loop for no added confidence.
- *Manual/console-only verification* — rejected: spec explicitly calls for
  "an automated test" as an acceptance path (User Story 1's Independent Test),
  and success criteria (SC-001–SC-007) need to be re-checked on every change.

---

## 2. Test fixture data (no real ActivitySim output in this repo)

**Decision**: Commit a small set of synthetic fixtures under
`tests/fixtures/`: a handful of tiny Parquet files standing in for
`summary/summary_kpis.parquet` (observed + one fixture scenario), a
`manifest.yaml`, a `public/scenarios/index.json` entry, and one synthetic
`dashboard-*.yaml`-shaped config containing every placeholder type
(`$mappings`, `$bins`, `$sql`, `$filters`, `$scenario`) so Story 4's expansion
requirement is testable without a real `summarize.yaml`. Generate the Parquet
fixtures once via a small `uv run python` + DuckDB `COPY ... TO ... (FORMAT
PARQUET)` script kept in `tests/fixtures/generate.py`, not hand-built binary
files, so they're reproducible and diff-reviewable via the generator script.
`generate.py`'s scope is strictly literal: it hard-codes a handful of rows
matching each target metric's *column shape* (e.g. `summary_kpis.parquet`'s
columns with made-up small numbers) and writes them straight to Parquet via
`CREATE TABLE ... AS VALUES (...)` + `COPY`. It contains zero aggregation,
join, or transform logic, and MUST NOT import, call, or duplicate any code
from the eventual `summarize.py` post-processor (which doesn't exist in this
repo yet, and is out of scope for this feature regardless) — it is a fixture
generator, not a scaled-down post-processor.

**Rationale**: Per spec Assumptions, "observed reference dataset and published
scenarios are already present" is out of scope for this feature — but tests
still need *something* queryable to prove FR-003/FR-004/FR-009/FR-010 actually
work, and no real scenario data exists in this repo yet (`public/` doesn't
exist). Synthetic fixtures keep the test suite self-contained and fast, and
match the "fail-soft on one bad scenario" edge case (Story 2, scenario 3) by
including one intentionally-corrupt fixture entry.

**Alternatives considered**:
- *Wait for real scenario data before writing tests* — rejected: blocks this
  entire slice on an unrelated publishing workflow; contradicts "Independent
  Test" framing in the spec.
- *Mock DuckDB entirely* — rejected: same objection as jsdom above — the thing
  under test (worker-hosted DuckDB-WASM query engine) would never actually run.

---

## 3. DuckDB-WASM initialization pattern

**Decision**: Follow `ar-puuk/omx-viewer`'s pattern per constitution
Principle VIII, using the **self-hosted/bundled** variant of DuckDB-WASM's own
documented Vite pattern — not `duckdb.getJsDelivrBundles()` (CDN-hosted).
`services/duckdb.js` imports the `.wasm` and worker `.js` files directly from
`@duckdb/duckdb-wasm/dist/` via Vite's `?url` suffix (so Vite copies them as
static assets and resolves local URLs at build time), builds a
`MANUAL_BUNDLES` object from those local URLs, and passes it to
`duckdb.selectBundle()`. `AsyncDuckDB` — the object exposing `query()`,
`registerFileURL()`, etc. — is constructed **on the main thread** in
`services/duckdb.js` and handed a `Worker` built from `bundle.mainWorker`
(DuckDB-WASM's own pre-built worker script, not an app-authored file — see
constitution Principle II, amended 1.2.0). `coi-serviceworker.js` is loaded
first in `index.html` to enable cross-origin isolation (SharedArrayBuffer /
threaded WASM) where headers allow it, falling back to single-threaded WASM
otherwise (per `docs/ARCHITECTURE.md`'s GitHub Pages note).

**Rationale**: Explicitly mandated reuse target (constitution Principle VIII);
no reason to re-derive the wiring itself. The self-hosted-vs-CDN choice is not
cosmetic: `duckdb.getJsDelivrBundles()` fetches the `.wasm`/worker binaries
from `cdn.jsdelivr.net` at runtime, which requires internet access. That
directly breaks two commitments already made in `docs/ARCHITECTURE.md` —
`wftdm-dashboard here`'s "no internet required; works behind a firewall,"
and the "data never leaves the machine" framing of local-folder usage — a
runtime CDN fetch for the query engine's own binaries would violate both,
quietly, in the one deployment mode explicitly designed not to need a
network. Bundling the assets via Vite's `?url` imports means they ship in
`dist/` and are served from wherever the app itself is served (or from disk
for `here` mode), with zero runtime dependency on a third-party host.

**Alternatives considered**:
- *Re-deriving DuckDB-WASM/Worker wiring from scratch* — rejected, exactly
  what constitution Principle VIII says not to do.
- *`duckdb.getJsDelivrBundles()` (CDN-hosted bundles)* — rejected: introduces
  a runtime internet dependency that breaks `wftdm-dashboard here`'s explicit
  no-internet-required design and the local-data-never-leaves-the-machine
  commitment, for zero benefit over bundling the same files via Vite.

---

## 4. Registering scenario data by URL vs. by folder handle

**Decision**: `registerScenario(name, source)` accepts either a
`FileSystemDirectoryHandle` (local-folder mode, via `showDirectoryPicker()`) or
is paired with a separate `registerFileURL(viewName, url)` for the served/
self-hosted mode, per the existing `services/duckdb.js` API shape documented in
`docs/SPEC.md`. `scenarioDiscovery.js` picks the URL path for
`public/observed/` and `public/scenarios/*` (always HTTP-fetchable, whether on
GitHub Pages or `wftdm-dashboard serve`), and reserves the folder-handle path
for the (out-of-scope-for-this-slice) manual picker.

**Rationale**: FR-006 requires both; `docs/SPEC.md`'s deployment-detection
snippet already fixes this contract — this slice implements the URL path only
(folder-handle plumbing exists as an accepted parameter shape but the actual
picker UI is explicitly deferred to `scenarioManager.js`, a later slice).

**Alternatives considered**: A single unified "register from any source" async
function that internally branches — rejected in favor of matching the already-
documented two-function API (`registerScenario` / `registerFileURL`) so later
slices (scenarioManager.js) don't need to change the service's public shape.

---

## 5. Failure isolation for scenario registration (FR-012)

**Decision**: `scenarioDiscovery.js` registers each published scenario inside
its own `try/catch`; a caught failure is logged and the scenario is skipped,
never rethrown to the caller of the overall discovery routine. Observed-data
registration failure does *not* get the same silent-skip treatment implicitly
— it still uses the same isolation wrapper for consistency, but is called out
as a distinct, more severe condition worth a visible console warning either
way, since the constitution and spec both treat observed data as always-
available.

**Rationale**: Directly satisfies FR-012 and the edge case "one scenario's
data cannot be read... other scenarios and observed data still become
queryable."

**Alternatives considered**: `Promise.allSettled` across all
scenario-registration promises — considered and effectively equivalent; either
implementation satisfies the requirement. Left as an implementation detail for
`tasks.md`/coding time rather than a research-level decision, since it doesn't
affect the module's public contract.

---

## Summary of resolved unknowns

| Technical Context field | Resolution |
|---|---|
| Language/Version | TypeScript (ES2022 target), Vite — constitution v2.0.0, no phase gate. *(Originally vanilla JS under v1.x's phase gating; converted when v2.0.0 dropped it.)* |
| Primary Dependencies | `@duckdb/duckdb-wasm`, `apache-arrow`, `js-yaml`, `vite`, `typescript`, `coi-serviceworker` |
| Storage | N/A — no server DB; static Parquet/GeoParquet under `public/`, queried in-browser |
| Testing | Vitest (unit: sqlExpander/filterState/yamlLoader) + Playwright (integration: boot sequence) |
| Target Platform | Browser (Chromium/Firefox/WebKit via Playwright coverage; Chrome/Edge for folder-picker mode, deferred slice) |
| Project Type | Single-project web frontend (no backend touched by this slice) |
| Performance Goals | SC-002: all published scenarios queryable within 5s of startup on typical broadband |
| Constraints | Query engine init must not block main thread (FR-001); no `eval()` (FR-015); Parquet/GeoParquet-only I/O; no Web Storage |
| Scale/Scope | Small scenario counts (observed + a handful of published runs); each scenario's summary Parquet files individually well under 100MB per `docs/ARCHITECTURE.md` |
