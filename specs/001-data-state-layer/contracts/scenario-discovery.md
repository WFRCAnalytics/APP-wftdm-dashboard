# Contract: `services/scenarioDiscovery.js`

Satisfies: FR-009, FR-010, FR-011, FR-012. Depends on `duckdb-service.md`'s
`registerFileURL` and `appState.js`'s scenario registry.

## `discoverScenarios(): Promise<void>`

Run once during boot, after `initDuckDB()` resolves and before the app is
considered ready to query (see `boot-sequence.md`). Performs, in order:

1. Fetches `public/observed/summary/index.json` — an array of Parquet
   filenames present in that folder (see "File-enumeration mechanism" below)
   — and registers each as an `observed__*` view via `registerFileURL`, then
   calls `appState.register('observed', { pinned: true, ... })` followed by
   `appState.setActive('observed', true)` — two separate calls (per
   `contracts/app-state.md`, `register()` never auto-activates from
   `pinned`) — regardless of what happens next (FR-009).
2. Fetches `public/scenarios/index.json` (an array of scenario names), and for
   **each** entry, in its own isolated failure boundary:
   - fetches `public/scenarios/{name}/summary/index.json` and registers each
     listed Parquet filename as a `{name}__*` view via `registerFileURL`
   - adds it to `appState`'s registry with `status: 'ready'`
   - on any failure (missing `summary/index.json`, missing Parquet file,
     malformed manifest, network error), marks that one entry
     `status: 'failed'` and continues to the next entry — never aborts the
     loop (FR-012, edge case: "one scenario's data cannot be read").

**File-enumeration mechanism** (resolved during implementation — not
previously specified): plain HTTP hosting (GitHub Pages, `wftdm-dashboard
serve`) has no directory-listing endpoint, so `registerFileURL`'s one-file-at-
a-time signature can't discover filenames on its own. Each folder that holds
Parquet — `public/observed/summary/` and every `public/scenarios/{name}/summary/`
— carries its own `index.json` (an array of filenames, e.g.
`["summary_kpis.parquet", "trip_mode_share.parquet"]`), fetched immediately
before registering that folder's files. This is the same discovery pattern
already used one level up for `public/scenarios/index.json` and
`public/dashboard-config/index.json` — applied one level deeper, per folder,
rather than invented fresh. A scenario whose `summary/index.json` itself is
missing/unreachable fails exactly like a scenario with missing Parquet (step
2's fail-soft handling covers it — no separate code path).
3. Reads `location.search` for repeated `s` params (`?s=observed&s=abm_2026`).
   For each value that matches a scenario name present in `appState`'s
   registry (observed or published), marks it `active: true`. Any value that
   matches nothing is ignored — it MUST NOT throw or block completion
   (FR-011, edge case: "URL references a scenario name that isn't
   published or observed").
4. If no `s` params were present at all, leaves the default from step 1:
   observed active, nothing else auto-activated (User Story 3, scenario 3).

- **Given** `public/scenarios/index.json` lists `["a", "b"]` and `"b"`'s
  Parquet is missing, **when** `discoverScenarios()` runs, **then** `"a"` and
  `observed` end up `status: 'ready'` and queryable, `"b"` ends up
  `status: 'failed'`, and the returned promise still resolves (does not
  reject) — startup is not blocked by `"b"`'s failure.
- **Given** `?s=abm_2026&s=abm_2026` (duplicate), **when** parsed, **then**
  `abm_2026` is marked active once (duplicates collapse to a single
  selection, per spec Assumptions).
- **Given** `?s=nonexistent_scenario`, **when** parsed, **then** startup still
  completes and no scenario is spuriously activated for that reference.

## Non-goals for this slice

- No `showDirectoryPicker()`-based manual scenario loading (that's
  `scenarioManager.js`, explicitly deferred).
- No re-discovery / polling after initial boot — this is a one-shot startup
  routine in this slice.
