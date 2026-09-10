# Contract: `src/main.js` boot sequence (stub only — no rendering)

Satisfies: FR-021, FR-022.

## Fixed order

```js
await initDuckDB()                          // services/duckdb.js
await discoverScenarios()                   // services/scenarioDiscovery.js
                                             // (includes URL-param application)
const dashboards = await loadDashboards()    // services/yamlLoader.js — see below
// no renderShell(), no renderDashboard() — out of scope for this slice
```

**`loadDashboards()`'s discovery mechanism (resolving FR-021's "configuration
loading" step with no layout/panel code yet to consume it):** discovers the
dashboard set at runtime via `public/dashboard-config/index.json`, the same
pattern `scenarioDiscovery.js` already uses for
`public/scenarios/index.json` — fetch the index, then fetch whatever
filenames it lists, each resolved under `public/dashboard-config/` (a third
fixed publish location parallel to `public/observed/` and
`public/scenarios/`; see `project-docs/SPEC.md` and README.md's publish workflow).
**This module has no hardcoded filename list or count** — "seven tabs" is
just what WFRC's default templates ship (`project-docs/ARCHITECTURE.md`), not
something `loadDashboards()` or `main.js` assumes. See
`contracts/yaml-loader.md` for the full contract.

Since **nothing under `public/dashboard-config/` exists anywhere in this repo
yet** (greenfield), `index.json` itself is expected to 404 in this slice's
tests, and `loadDashboards()` must treat that as a normal, non-fatal outcome
(see `contracts/yaml-loader.md`) — an empty result array is a valid
boot-sequence outcome, not a failure.

- **Given** a fresh page load, **when** `main.js` runs to completion, **then**
  DuckDB init happened before scenario discovery, scenario discovery
  (including URL-param application) happened before dashboard config loading,
  every time (FR-021's "fixed, repeatable order").
- **Given** `public/dashboard-config/index.json` is unreachable (true for
  this entire repo today), **when** `loadDashboards()` runs, **then** it
  resolves to an empty array rather than rejecting, and the boot sequence
  still reaches "ready" (FR-021 requires configuration loading to occur in
  order, not that it find anything).
- **Given** the boot sequence has completed, **when** inspected, **then** no
  panel, layout/shell, or rendering module was ever imported or invoked
  (FR-022) — verifiable by asserting `src/panels/`, `src/layout/`, and
  `src/scenario/scenarioManager.js` do not exist yet in this slice's file set,
  and that `main.js` imports nothing from those paths.
- **Given** the boot sequence has completed, **when** a query is issued from
  the console/test against `observed__summary_kpis` (or an equivalent
  fixture view), **then** it returns rows (SC-001, SC-006) — proving the
  system reached "fully ready" without any visual component existing.

## Non-goals for this slice

- No `renderShell`, `navBar`, `dashboardRenderer`, or any DOM output.
- No `scenarioManager.js` folder-picker wiring — `main.js` calls only the four
  functions above.
- No consumption of `loadDashboards()`'s result — `main.js` captures the
  returned array (satisfying FR-013/FR-021) but does nothing with its
  contents; that's the layout/panel slice's job.
