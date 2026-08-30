# Contract: `services/duckdb.js`

Satisfies: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008.
Constitution: Principle II (query execution off the main thread, single
shared instance — amended 1.2.0, no app-authored worker file), Principle III
(no `eval()` — not applicable here, this module has no dynamic SQL of its own),
Principle V (Parquet/GeoParquet-only).

**No `services/duckdb.worker.js` exists.** DuckDB-WASM ships its own worker
script; this module selects a bundle (`duckdb.selectBundle()` against a
`MANUAL_BUNDLES` object built from `@duckdb/duckdb-wasm/dist/`'s `.wasm` and
worker `.js` files, imported via Vite's `?url` suffix — **self-hosted, not
`duckdb.getJsDelivrBundles()`**, per `research.md` §3: a CDN fetch for the
query engine's own binaries would require internet access, breaking
`wftdm-dashboard here`'s no-internet-required design), instantiates a
`Worker` from `bundle.mainWorker`, and constructs `AsyncDuckDB` — **on the
main thread** — wrapping that worker. Everything this contract describes
(`initDuckDB`, `query`, `registerScenario`, etc.) is implemented in this one
file; there is no second module to split logic into.

## `initDuckDB(): Promise<void>`

Selects a bundle, instantiates DuckDB-WASM's own worker, and constructs the
shared `AsyncDuckDB` — all coordinated from `services/duckdb.js` on the main
thread, with the actual SQL execution happening inside DuckDB-WASM's worker,
never on the main thread. Resolves once the shared connection is ready to
accept queries. Calling it more than once MUST NOT create a second instance
(idempotent — subsequent calls resolve against the same instance/connection).

- **Given** the page has just loaded, **when** `initDuckDB()` is called,
  **then** the returned promise resolves without any synchronous blocking
  work having run on the main thread.

## `registerScenario(name: string, source: FileSystemDirectoryHandle): Promise<void>`

Registers every `summary/*.parquet` file reachable from `source` as a view
named `{name}__{fileStem}`. Local-folder mode (`showDirectoryPicker()`); the
picker UI itself is out of scope for this slice, but the registration
function's contract is defined here so `scenarioManager.js` (a later slice)
can call it without changing this module.

- **Given** a folder handle containing `summary/a.parquet` and
  `summary/b.parquet`, **when** registered under name `"abm"`, **then**
  `listViews()` includes `abm__a` and `abm__b`.
- **Given** `name` was already registered, **when** `registerScenario` is
  called again with the same `name`, **then** the old views for that name are
  replaced — no stale `{name}__*` view from the prior registration remains
  queryable (no leftover-data invariant).

## `registerFileURL(viewName: string, url: string): Promise<void>`

Registers a single Parquet/GeoParquet file reachable by URL as a view. Used by
`scenarioDiscovery.js` for `public/observed/`, `public/scenarios/*`, and for
`wftdm-dashboard serve`/`here` mode (FR-006's "served/self-hosted deployment
mode").

- **Given** a reachable `.parquet` URL, **when** registered as `"observed__kpi"`,
  **then** `query("SELECT * FROM observed__kpi")` returns rows.
- **Given** an unreachable URL (404, network error), **when**
  `registerFileURL` is called, **then** it rejects with an error identifying
  the URL — callers (`scenarioDiscovery.js`) are responsible for catching this
  per-scenario (see `scenario-discovery.md`), not this function itself.

## `unregisterScenario(name: string): Promise<void>`

Drops every `{name}__*` view. After this resolves, querying any of that
scenario's former views MUST fail (view no longer exists) — satisfies FR-005.

## `query(sql: string): Promise<Array<Object>>`

Runs `sql` against the shared connection; returns rows as plain objects.

- **Given** valid SQL against a registered view, **when** `query()` is
  called, **then** it resolves to an array of row objects.
- **Given** SQL referencing a view that was never registered, **when**
  `query()` is called, **then** it rejects (DuckDB's own "table not found"
  error is sufficient — this module does not need to pre-validate view
  existence).

## `queryArrow(sql: string): Promise<ArrowTable>`

Same as `query()` but returns the raw Arrow table (for callers doing
columnar/large-result work). Not exercised by this slice's own tests beyond
"it returns an Arrow table shape," since no panel consumes it yet.

## `distinctValues(view: string, column: string): Promise<Array>`

Convenience wrapper equivalent to
`SELECT DISTINCT column FROM view ORDER BY column`, unwrapped to a flat array.

## `listViews(): Array<string>`

Synchronous; returns every currently registered view name across all
scenarios (including `observed__*`). Used by tests and by later slices
(filters' `source:`/`column:` config) to validate a reference exists.

## Non-goals for this slice

- No panel-facing chart/render code.
- No `showDirectoryPicker()` UI trigger — only the function signature that
  will receive a handle from it later.
