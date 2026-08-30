---

description: "Task list for Data and State Layer Scaffold (001-data-state-layer)"
---

# Tasks: Data and State Layer Scaffold

**Input**: Design documents from `/specs/001-data-state-layer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included. `plan.md`'s Technical Context and `research.md` §1 commit to a
concrete two-tier test strategy (Vitest unit + Playwright integration) as part of
this slice's own design — not a generic "if requested" add-on — and every user
story's Independent Test in `spec.md` is stated as an automated check. Task IDs
below implement that strategy directly.

**Organization**: Tasks are grouped by user story (spec.md priorities: US1/US2 = P1,
US3/US4 = P2, US5 = P3) to enable independent implementation and testing of each.

## Path Conventions

Single-project web frontend (plan.md's Structure Decision). All paths below are
repo-root-relative. This is a **greenfield slice** — none of `package.json`,
`src/`, `public/`, or `tests/` exist yet.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — nothing in this repo exists yet.

- [X] T001 Create `package.json`, `vite.config.js`, `index.html` at repo root per
  `CLAUDE.md`'s reference blocks and `plan.md`'s Project Structure (`base:
  '/APP-wftdm-dashboard/'`, `worker: { format: 'es' }`,
  `optimizeDeps.exclude: ['@duckdb/duckdb-wasm']`; `index.html` loads
  `coi-serviceworker.js` before `src/main.js`)
- [X] T002 [P] Add dependencies to `package.json`
  (`@duckdb/duckdb-wasm`, `apache-arrow`, `js-yaml`, `vite`) and devDependencies
  (`vitest`, `@playwright/test`, `coi-serviceworker`); add a postinstall script
  (`scripts/postinstall.js`) that copies `coi-serviceworker.js` into
  `public/coi-serviceworker.js`. `npm install` run — 88 packages, postinstall
  verified (`public/coi-serviceworker.js` present).
- [X] T003 [P] Configure Vitest: `vitest.config.js` + `package.json`'s
  `"test:unit"` script targeting `tests/unit/**/*.test.js`
- [X] T004 [P] Configure Playwright: `playwright.config.js` + `package.json`'s
  `"test:integration"` script targeting `tests/integration/**/*.spec.js`, with
  `tests/global-setup.js` copying `tests/fixtures/observed/` and
  `tests/fixtures/scenarios/` into `public/` before the run and
  `tests/global-teardown.js` removing them after. **Deviation from plan**:
  `.gitignore`'s blanket `*.parquet` rule ("never commit model output") means
  fixture Parquet is regenerated on demand, not committed — wired via a
  `pretest:integration` npm script that runs `generate.py` before Playwright,
  rather than checking in binary fixture output (see T006). Chromium browser
  installed via `npx playwright install chromium`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Test fixtures and zero-dependency state stores that multiple user
stories build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Write `tests/fixtures/generate.py` — literal
  `CREATE TABLE ... AS VALUES (...)` + `COPY ... TO ... (FORMAT PARQUET)`
  statements (via `uv run python`, DuckDB) producing a handful of hard-coded
  rows for `summary_kpis.parquet` (and 1–2 more small metric files) matching
  real column shapes. Per `research.md` §2: zero aggregation/join/transform
  logic, must not import or duplicate anything from a future `summarize.py`.
  **Also writes each folder's `summary/index.json`** (filename list) —
  discovered during coding to be required by `registerFileURL`'s one-file
  signature; see the "File-enumeration mechanism" addendum in
  `contracts/scenario-discovery.md`.
- [X] T006 Ran `generate.py` — verified output, **not committed**:
  `tests/fixtures/observed/manifest.yaml` + `summary/index.json` +
  `summary/summary_kpis.parquet`; `tests/fixtures/scenarios/index.json`
  listing `good_scenario` + `broken_scenario`;
  `tests/fixtures/scenarios/good_scenario/` with `summary/index.json` +
  2 Parquet files; `broken_scenario/manifest.yaml` only, deliberately with
  no `summary/` folder at all, to exercise the fail-soft path. Per T004's
  logged deviation, this regenerates via `pretest:integration` rather than
  being checked in (`.gitignore`'s blanket `*.parquet` rule).
- [X] T007 [P] Implement `src/state/appState.js` —
  `register(name, metadata)` / `setStatus(name, status)` /
  `setActive(name, active)` / `get(name)` / `list()` / `getActive()` /
  `unregister(name)` per `contracts/app-state.md`. `active` MUST always start
  `false` on `register()` regardless of `metadata.pinned` — only an explicit
  `setActive()` call ever changes it
- [X] T008 [P] Implement `src/state/filterState.js` —
  `get(id)` / `set(id, value)` / `subscribe(ids, fn)` / `getAll()` per
  `contracts/filter-state.md`. `set()` notifies every subscriber on that exact
  `id` and every `'*'` wildcard subscriber exactly once each; `subscribe()`
  returns an unsubscribe function

**Checkpoint**: Foundation ready — state stores and fixture data exist; user
story implementation can now begin.

---

## Phase 3: User Story 1 - App boots to a ready, queryable state with no visible UI (Priority: P1) 🎯 MVP

**Goal**: DuckDB-WASM comes online in a Web Worker and a query can be issued
against it, with the main thread never blocked — before any panel/layout code
exists.

**Independent Test**: Load the app with no panels/layout present; from the
console or an automated test, issue a query and confirm it returns results
without the page ever freezing.

### Implementation for User Story 1

- [X] T009 [US1] **Rewritten during implementation** (was: "implement
  `src/services/duckdb.worker.js`" — no such file exists; see constitution
  Principle II, amended 1.2.0, and `research.md` §3). Set up DuckDB-WASM's
  bundle config in `src/services/duckdb.js`: import the `.wasm` and worker
  `.js` files from `@duckdb/duckdb-wasm/dist/` via Vite's `?url` suffix, build
  a self-hosted `MANUAL_BUNDLES` object (`mvp` + `eh`) — **not**
  `duckdb.getJsDelivrBundles()`, which would require internet access at
  runtime and break `wftdm-dashboard here`'s no-internet-required design
- [X] T010 [US1] Implement the rest of `src/services/duckdb.js` —
  `initDuckDB()` (`duckdb.selectBundle()` against `MANUAL_BUNDLES`,
  `new Worker(bundle.mainWorker)`, `new duckdb.AsyncDuckDB(logger, worker)` on
  the main thread, `db.instantiate()`, `db.connect()`; idempotent; actual SQL
  execution happens inside DuckDB-WASM's own worker, never the main thread),
  `query(sql)`, `queryArrow(sql)`, `registerScenario(name, dirHandle)`,
  `unregisterScenario(name)`, `registerFileURL(viewName, url)`,
  `distinctValues(view, column)`, `listViews()` per
  `contracts/duckdb-service.md` (depends on T009)
- [X] T011 [US1] Create `src/main.js` boot stub: `await initDuckDB()` only, no
  rendering, no other imports (depends on T010). Also exposes
  `window.__wftdm` as a debug hook (implementation convenience, not a spec
  requirement) for the console spot-check in quickstart.md.
- [X] T012 [US1] Write `tests/integration/boot.spec.js` with a "User Story 1"
  describe block: load the app, call `query('SELECT 1')` (or equivalent)
  against the shared connection and assert a result; assert the page stays
  responsive while `initDuckDB()` is in flight (e.g. a concurrent interaction
  probe still fires) — satisfies SC-001/SC-006's "reaches ready with zero
  panel/layout code" (depends on T011, T004). **PASSED** (1 passed, 6.5s) —
  verified real DuckDB-WASM in a real browser, main thread stayed responsive
  (rAF counter kept incrementing during `initDuckDB()`).

**Checkpoint**: User Story 1 is independently functional and testable — the
query engine is ready and the page never blocked, with zero panels or layout
in existence.

---

## Phase 4: User Story 2 - Observed data and published scenarios are ready to query automatically (Priority: P1) 🎯 MVP

**Goal**: The observed dataset and every published scenario become queryable
automatically at startup, with one bad scenario never blocking the rest.

**Independent Test**: Load the app fresh; confirm the observed dataset and
every scenario in the fixture's published index are each independently
queryable, with no manual folder selection.

### Implementation for User Story 2

- [X] T013 [US2] Implement `src/services/scenarioDiscovery.js` (steps 1–2 of
  `contracts/scenario-discovery.md`): register
  `public/observed/summary/*.parquet` as `observed__*` views via
  `registerFileURL`, then `appState.register('observed', { pinned: true,
  ... })` followed by `appState.setActive('observed', true)` (two separate
  calls, per `contracts/app-state.md`); fetch `public/scenarios/index.json`
  and, for **each** entry inside its own `try/catch`, register its Parquet +
  an `appState` entry, marking `status: 'failed'` on any error without
  aborting the loop (FR-012). Log a distinct console warning specifically if
  the *observed* registration itself fails, per `research.md` §5 (depends on
  T007, T010). Also implements the `summary/index.json` file-enumeration
  fetch discovered during coding (see contract addendum).
- [X] T014 [US2] Extend `src/main.js` — add `await discoverScenarios()`
  immediately after `initDuckDB()`, preserving the fixed boot order (depends
  on T013, T011)
- [X] T015 [US2] Extend `tests/integration/boot.spec.js` with a "User Story 2"
  describe block: assert `observed__*` views are queryable and
  `appState.get('observed').active === true`; assert every scenario name in
  `tests/fixtures/scenarios/index.json` is independently queryable; assert the
  deliberately-broken fixture scenario ends up `status: 'failed'` while the
  working scenario and `observed` both reach `status: 'ready'` (SC-007)
  (depends on T014, T006). **PASSED** (2 passed, 4.3s total).

**Checkpoint**: User Stories 1 AND 2 both independently functional — real
fixture data is queryable with zero manual setup, and one bad scenario doesn't
block the rest.

---

## Phase 5: User Story 3 - A shared link pre-selects specific scenarios (Priority: P2)

**Goal**: `?s=` URL parameters mark exactly the referenced scenarios active,
ignoring unmatched references.

**Independent Test**: Load the app with URL scenario-selection parameters and
confirm the active scenario set matches exactly what the URL specified.

### Implementation for User Story 3

- [X] T016 [US3] Extend `src/services/scenarioDiscovery.js` with step 3 of
  `contracts/scenario-discovery.md`: parse repeated `s` params from
  `location.search`, call `appState.setActive(name, true)` for each value
  matching a name already in the registry, ignore any value matching nothing
  (never throw), and collapse duplicate values to a single activation (depends
  on T013)
- [X] T017 [US3] Extend `tests/integration/boot.spec.js` with a "User Story 3"
  describe block: load with `?s=<fixture-scenario-name>` and assert exactly
  that scenario (plus `observed`'s own default, if applicable per the spec) is
  active; load with an unmatched `?s=` value and assert startup still
  completes; load with no `?s=` params and assert only `observed` is active
  (SC-003) (depends on T016, T006). **PASSED** (5 passed, 5.7s total —
  cumulative with US1/US2).

**Checkpoint**: User Stories 1–3 all independently functional — shareable deep
links behave exactly as specified.

---

## Phase 6: User Story 4 - Dashboard config placeholders expand into runnable queries (Priority: P2)

**Goal**: Every `summarize.yaml`-style placeholder (`$mappings`, `$bins`,
`$sql`, `$filters`, `$scenario`) expands into literal, executable SQL via
string substitution only.

**Independent Test**: Feed a sample config containing every placeholder type
through the expander and confirm the produced query executes successfully and
returns the expected result shape.

### Implementation for User Story 4

- [X] T018 [P] [US4] Implement `src/services/yamlLoader.js`'s `loadConfig(url)`
  and `loadManifest(url)` — runtime fetch + `js-yaml` parse, rejecting with a
  source-identifying error on malformed YAML, per `contracts/yaml-loader.md`
- [X] T019 [US4] Implement `src/services/yamlLoader.js`'s
  `loadDashboards(baseUrl)` — fetch `public/dashboard-config/index.json`, then
  `loadConfig()` each listed filename inside its own isolated failure
  boundary; resolve `[]` (not reject) if the index itself is unreachable — no
  hardcoded filename list or count anywhere in this function (depends on T018)
- [X] T020 [US4] Extend `src/main.js` — add
  `const dashboards = await loadDashboards()` after `discoverScenarios()`,
  preserving the fixed boot order; the result is captured but not consumed
  (depends on T019, T014)
- [X] T021 [P] [US4] Implement `src/services/sqlExpander.js`'s
  `expand(sqlTemplate, config, filterState, activeScenarios)` —
  `$mappings.<name>` → `WHEN...THEN` fragments, `$bins.<name>` → expression
  per its `type` (`manual_breaks`/`quantiles`/`spaced_intervals`/
  `equal_intervals` — the last added in a post-implementation fix pass, see
  `contracts/sql-expander.md`),
  `$sql.<name>` → verbatim fragment substitution, `$filters.<id>` → literal
  value or omitted line when `'all'`, **`$scenario.<metric>`** → `UNION ALL`
  over the caller-supplied `activeScenarios` array (contract's bare
  `$scenario` was underspecified for pure substitution — resolved to a
  dot-suffixed form during implementation, see `contracts/sql-expander.md`);
  throw an error naming the specific unresolved reference on any missing
  mapping/bin/fragment/filter name; string substitution only, never
  `eval()`/`Function()`, per `contracts/sql-expander.md` (depends on T007,
  T008)
- [X] T022 [P] [US4] Create `tests/fixtures/all-placeholders-config.yaml` — a
  synthetic `summarize.yaml`-shaped config (mappings/bins/sql_fragments)
  exercising every placeholder type; the query template referencing it lives
  in test code, per `research.md` §2
- [X] T023 [P] [US4] Write `tests/unit/yamlLoader.test.js` — runtime
  fetch+parse behavior of `loadConfig`, error attribution on malformed YAML
  (depends on T018). **PASSED** (4 tests).
- [X] T024 [P] [US4] Write `tests/unit/sqlExpander.test.js` — every placeholder
  kind expands with zero markers remaining (SC-004); `'all'` sentinel omits
  its condition (FR-016); an unresolved `$mappings.does_not_exist`-style
  reference throws naming it specifically (FR-017); assert no `eval`/
  `Function` call appears anywhere in the module's source, comments stripped
  first to avoid false-positiving on this file's own descriptive comment
  (depends on T021). **PASSED** (5 tests).
- [X] T025 [US4] Extend `tests/integration/boot.spec.js` with a "User Story 4"
  describe block: run `sqlExpander.expand()` against
  `all-placeholders-config.yaml` in-page, execute the resulting SQL against a
  registered fixture view, assert the expected row shape (depends on T022,
  T021, T014). **PASSED** (6 passed, 6.9s total — cumulative with US1–US3).

**Checkpoint**: User Stories 1–4 all independently functional — config-driven
queries work end-to-end against real (fixture) data.

---

## Phase 7: User Story 5 - Filter values can be set, read, and subscribed to (Priority: P3)

**Goal**: A named filter's value can be set/read, subscribers are notified
correctly, and unsubscribing stops further notifications.

**Independent Test**: Set a filter's value and confirm every subscriber for
that id (or `'*'`) is notified exactly once, unrelated subscribers are not,
and an unsubscribed subscriber receives nothing further.

### Implementation for User Story 5

- [X] T026 [P] [US5] Write `tests/unit/filterState.test.js` — a subscriber on
  a specific id is notified exactly once per `set()`; a subscriber on an
  unrelated id is not notified; a `'*'` wildcard subscriber is notified on any
  `set()`; a value set before any subscriber exists is still readable via
  `get()` later; an unsubscribed subscriber receives no further notifications
  (SC-005) (depends on T008 — module already built in Foundational).
  **PASSED** (5 tests).

**Checkpoint**: All five user stories independently functional and tested.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final wiring and end-to-end confirmation.

- [X] T027 [P] Add `"dev"` / `"build"` / `"preview"` scripts to `package.json`
  wired to Vite, alongside the existing `"test:unit"`/`"test:integration"`
  (depends on T001). Already present since T001 (written into the initial
  `package.json` alongside the test scripts) — verified, no separate edit
  needed.
- [X] T028 Run the full `quickstart.md` validation
  (`npm run test:unit && npm run test:integration`) and confirm SC-001 through
  SC-007 all pass (depends on T012, T015, T017, T025, T026). **PASSED**: 14
  unit + 6 integration = 20/20 tests. SC-001 (observed queryable, zero
  setup) ✓, SC-002 (scenarios queryable — well under 5s, ~1s per test) ✓,
  SC-003 (URL selection exact/repeatable, 3 variants tested) ✓, SC-004
  (placeholder expansion, zero unresolved markers) ✓, SC-005 (filter
  notification 100%/0%) ✓, SC-006 (full boot, zero panel/layout code exists)
  ✓, SC-007 (one broken scenario doesn't reduce others) ✓.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends only on Foundational.
- **User Story 2 (Phase 4)**: Depends on Foundational **and** on US1's
  `duckdb.js`/`main.js` (T010, T011) — registers scenarios through the same
  connection and extends the same boot stub.
- **User Story 3 (Phase 5)**: Depends on US2's `scenarioDiscovery.js` (T013)
  — adds a step to the same module.
- **User Story 4 (Phase 6)**: Depends on Foundational (`appState.js`,
  `filterState.js`) and on US2's boot-order position (T014) — extends
  `main.js` again.
- **User Story 5 (Phase 7)**: Depends only on Foundational's `filterState.js`
  (T008) — no dependency on US1–US4.
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

Unlike the fully-independent ideal, US2/US3/US4 each extend the same
`src/main.js` boot stub and (US2/US3) the same `scenarioDiscovery.js` module
in place — per FR-021's fixed-order requirement, these build **sequentially**
on one another even though each has its own independently-testable
acceptance criteria. US1 and US5 have no such coupling.

### Parallel Opportunities

- Setup: T002, T003, T004 (after T001)
- Foundational: T007, T008
- US4: T018, T021, T022 first (no interdependencies); then T023, T024 (each
  depends on one first-batch task, not on each other)
- US5's T026 can be done any time after T008 — even alongside US1–US4

---

## Parallel Example: Foundational Phase

```bash
Task: "Implement src/state/appState.js per contracts/app-state.md"
Task: "Implement src/state/filterState.js per contracts/filter-state.md"
```

## Parallel Example: User Story 4

```bash
# First batch — no interdependencies:
Task: "Implement yamlLoader.js's loadConfig/loadManifest"
Task: "Implement sqlExpander.js's expand()"
Task: "Create tests/fixtures/all-placeholders-config.yaml"

# Second batch — each depends on one first-batch task, not each other:
Task: "Write tests/unit/yamlLoader.test.js"
Task: "Write tests/unit/sqlExpander.test.js"
```

---

## Implementation Strategy

### MVP Scope: User Story 1 + User Story 2

Both are P1 in `spec.md` — together they are the actual minimum viable slice:
US1 alone proves the query engine boots without a real dataset behind it; US2
is what makes that boot sequence useful (real observed + published data
queryable with zero setup). Ship both before considering this slice "done" in
any demoable sense.

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — blocking.
2. Complete Phase 3 (US1) → **validate independently** (query engine ready).
3. Complete Phase 4 (US2) → **validate independently** (real data queryable).
4. **MVP checkpoint** — stop and confirm both before continuing.
5. Add Phase 5 (US3) → validate → Phase 6 (US4) → validate → Phase 7 (US5) →
   validate, each independently, in priority order.
6. Phase 8 (Polish) once all five stories are in.

### Incremental Delivery

Each phase's checkpoint is a real, independently-verifiable increment per
`spec.md`'s own Independent Test for that story — no phase requires a later
one to be meaningful on its own terms, even though US2–US4 share code with
their predecessors.

---

## Notes

- `[P]` tasks touch different files with no dependency on incomplete work.
- `[US#]` maps every user-story-phase task to its story for traceability.
- This is a greenfield repo — Phase 1/2 tasks create files that don't exist
  yet; don't assume any existing scaffolding.
- Per FR-022, nothing in this task list creates `src/panels/`, `src/layout/`,
  or `src/scenario/scenarioManager.js` — those are explicitly out of scope.
- Commit after each task or logical group; stop at any checkpoint to validate
  a story independently before moving on.
