# Feature Specification: Data and State Layer Scaffold

**Feature Branch**: `001-data-state-layer`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "Feature: Data and state layer scaffold (no UI). Build the boot-time data/state layer for the dashboard, with no visual components yet: package.json, vite.config.js, index.html per docs/CLAUDE.md; services/duckdb.js + services/duckdb.worker.js — DuckDB-WASM init in a Web Worker, query(), registerScenario(), registerFileURL(); services/scenarioDiscovery.js — registers public/observed/ and public/scenarios/* at startup, applies ?s= URL params; services/yamlLoader.js + services/sqlExpander.js; state/appState.js + state/filterState.js; src/main.js — boot sequence stub only (calls the above in order, per the Boot sequence section of CLAUDE.md), no rendering. Do not build panels. Do not build layout components (shell, navBar, dashboardRenderer). Do not build scenarioManager.js (folder picker) — that's the next slice."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - App boots to a ready, queryable state with no visible UI (Priority: P1)

The application starts up, brings its scenario-data query engine online without blocking
the page, and reaches a "ready" state where scenario data can be queried — even though
nothing is drawn on screen yet.

**Why this priority**: Nothing else in the dashboard (panels, layout, filters) can work
until the app can reliably reach this ready state. It is the foundation every later slice
builds on.

**Independent Test**: Load the app in a browser with no panels/layout present; from the
console (or an automated test), issue a query against the query engine and confirm it
returns results without the page ever having frozen or become unresponsive.

**Acceptance Scenarios**:

1. **Given** a fresh page load, **When** the application finishes starting up, **Then** a
   query can be issued against scenario data and returns a result.
2. **Given** the application is starting up, **When** the query engine is initializing,
   **Then** the page remains responsive to input (the initializing work does not run on
   the main thread).

---

### User Story 2 - Observed data and published scenarios are ready to query automatically (Priority: P1)

On startup, the always-available observed reference dataset and every scenario published
to the app are made queryable automatically, with no manual folder selection required.

**Why this priority**: This is what makes the dashboard usable out of the box — an
analyst or a shared link should show real data immediately, not an empty state requiring
setup.

**Independent Test**: Load the app fresh and confirm the observed dataset and every
scenario listed in the published scenario index are each independently queryable,
without invoking any folder-selection action.

**Acceptance Scenarios**:

1. **Given** a fresh page load, **When** startup completes, **Then** the observed
   reference dataset is queryable and marked active by default.
2. **Given** a fresh page load, **When** startup completes, **Then** every scenario
   listed in the published scenario index is independently queryable.
3. **Given** one scenario in the published index has missing or unreadable data,
   **When** startup runs, **Then** the other scenarios and the observed dataset still
   become queryable (the one failure does not block the rest).

---

### User Story 3 - A shared link pre-selects specific scenarios (Priority: P2)

Visiting the app with scenario-selection parameters in the URL results in exactly those
scenarios (and no others beyond the stated defaults) being marked active.

**Why this priority**: Shareable deep links are called out as a core use case (an analyst
sends a colleague a link to a specific scenario comparison); it depends on Story 2 already
having made scenarios discoverable.

**Independent Test**: Load the app with a URL containing scenario-selection parameters
and confirm the set of active scenarios matches exactly what the URL specified.

**Acceptance Scenarios**:

1. **Given** a URL with one or more scenario-selection parameters referencing published
   scenarios, **When** the app starts, **Then** exactly those scenarios are marked active.
2. **Given** a URL with a scenario-selection parameter that does not match any published
   or observed scenario, **When** the app starts, **Then** startup still completes and the
   unmatched reference is ignored rather than blocking the app.
3. **Given** a URL with no scenario-selection parameters, **When** the app starts,
   **Then** the observed dataset is active by default and no other scenario is
   auto-activated.

---

### User Story 4 - Dashboard config placeholders expand into runnable queries (Priority: P2)

A dashboard configuration file's shorthand placeholders (value mappings, binning rules,
reusable join fragments, the current value of a named filter, and a cross-scenario union)
expand into literal, executable query text against the currently registered scenario data.

**Why this priority**: This is what lets the later panel-building slice be purely
configuration-driven, per the project's YAML-driven design — panels will not need custom
query-building code, only config. It depends on Story 1 (something to query against).

**Independent Test**: Feed a sample configuration containing every placeholder type and
confirm the produced query text executes successfully against registered scenario data
and returns the expected shape of result.

**Acceptance Scenarios**:

1. **Given** a configuration file is loaded at run time, **When** its content is parsed,
   **Then** its structure is available for use without having been baked into the built
   application ahead of time.
2. **Given** a mapping placeholder, a binning placeholder, a reusable-join placeholder,
   a current-filter-value placeholder, and a multi-scenario placeholder all appear in one
   query definition, **When** the query is expanded, **Then** the result is literal query
   text with every placeholder replaced, containing no unresolved placeholder markers.
3. **Given** a filter placeholder whose current value is the "all" sentinel, **When** the
   query is expanded, **Then** the corresponding filter condition is omitted rather than
   producing a condition that matches nothing.

---

### User Story 5 - Filter values can be set, read, and subscribed to (Priority: P3)

A named filter's current value can be set and read, and interested parties can subscribe
to be notified when a filter they care about changes, then unsubscribe later.

**Why this priority**: Needed before any reactive panel can exist, but on its own it has
no visible effect — it is infrastructure for the next slice (panels), so it is lower
priority than getting data flowing.

**Independent Test**: Set a filter's value and confirm every subscriber registered for
that filter id (or for "all filters") is notified exactly once, while subscribers for
unrelated filter ids are not notified; confirm a subscriber that has unsubscribed
receives no further notifications.

**Acceptance Scenarios**:

1. **Given** a subscriber registered for a specific filter id, **When** that filter's
   value is set, **Then** the subscriber is notified.
2. **Given** a subscriber registered for a specific filter id, **When** a different
   filter's value is set, **Then** the subscriber is not notified.
3. **Given** a subscriber has unsubscribed, **When** the filter it was watching changes
   again, **Then** it receives no further notification.

---

### Edge Cases

- What happens when a published scenario's data cannot be read (missing/corrupt file)?
  Startup MUST continue and make the remaining scenarios and observed data queryable
  rather than failing the whole boot sequence.
- What happens when the URL references a scenario name that isn't published or observed?
  The reference is ignored; startup completes normally with the remaining valid
  selections applied.
- What happens when two registered scenarios would produce a naming collision for the
  same view? The system MUST keep each scenario's data namespaced separately so one
  scenario's data never silently overwrites or merges with another's.
- What happens when a configuration placeholder references a mapping/bin/fragment/filter
  name that does not exist in the loaded config? Expansion MUST fail in a way that is
  attributable to the specific missing reference, rather than silently producing an
  incomplete or incorrect query.
- What happens when a filter is set to a value before any subscriber has registered for
  it? The value MUST still be stored and readable by a later caller/subscriber.
- What happens when the same scenario is registered twice (e.g., re-registered after
  being unregistered)? The second registration MUST replace the first cleanly, with no
  leftover data from the prior registration remaining queryable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST initialize the scenario-data query engine without blocking the
  page's main thread or user interaction.
- **FR-002**: System MUST expose exactly one shared query engine instance for the entire
  application to use — no other part of the system may create a separate instance.
- **FR-003**: System MUST provide a way to submit a query and receive back the matching
  rows of data.
- **FR-004**: System MUST allow registering a named scenario's set of summary data files
  so each of the scenario's metrics becomes independently queryable, namespaced by that
  scenario's name.
- **FR-005**: System MUST allow unregistering a previously registered scenario, after
  which its data is no longer queryable.
- **FR-006**: System MUST support registering a scenario's data by direct file location
  (URL), in addition to registering it from a locally selected folder, so that both the
  served/self-hosted deployment mode and the local-folder deployment mode are supported.
- **FR-007**: System MUST provide a way to retrieve the distinct values present in a
  given column of a given registered dataset.
- **FR-008**: System MUST provide a way to list all datasets currently registered and
  queryable.
- **FR-009**: At startup, system MUST automatically register the always-available
  observed reference dataset and mark it active by default.
- **FR-010**: At startup, system MUST automatically discover and register every scenario
  published to the app, without requiring a manual folder-selection action.
- **FR-011**: At startup, system MUST read scenario-selection parameters from the page
  URL and mark the referenced scenarios active, ignoring any reference that does not
  match a known observed or published scenario.
- **FR-012**: A failure to register any single published scenario MUST NOT prevent the
  remaining scenarios or the observed dataset from being registered.
- **FR-013**: System MUST load and parse dashboard configuration content (tab/panel
  definitions and per-scenario metadata) at the time it is needed, rather than baking its
  structure into the built application ahead of time.
- **FR-014**: System MUST expand named configuration placeholders — value mappings,
  binning/bucketing rules, reusable join fragments, the current value of a named filter,
  and a cross-scenario union — into literal, executable query text.
- **FR-015**: System MUST build expanded query text using literal text substitution only;
  it MUST NOT execute arbitrary or dynamically constructed code to produce or run a query.
- **FR-016**: When a filter placeholder's current value is the "all" sentinel, the
  expanded query MUST omit the corresponding filter condition rather than produce a
  condition that matches no rows.
- **FR-017**: System MUST reject expansion of a placeholder that references a mapping,
  bin, fragment, or filter name absent from the loaded configuration, identifying which
  reference could not be resolved.
- **FR-018**: System MUST maintain a central store of current filter values, readable and
  settable by filter identifier.
- **FR-019**: System MUST allow any interested party to subscribe to one or more filter
  identifiers (or to all filters) and be notified only when a value it is subscribed to
  changes, and MUST allow that party to unsubscribe.
- **FR-020**: System MUST maintain a registry of which scenarios are currently
  loaded/active, readable independently of any visual component.
- **FR-021**: The startup sequence MUST perform query-engine initialization, scenario
  discovery, URL-parameter application, and configuration loading in a fixed, repeatable
  order, and MUST reach a fully ready state without requiring any panel or layout/visual
  component to exist.
- **FR-022**: This slice MUST NOT render any visual output, and MUST NOT include panel
  components, layout/shell components, or the local-folder scenario picker — those are
  explicitly out of scope for this slice.

### Key Entities

- **Scenario**: A named model run or the observed reference dataset. Carries metadata
  (name, run date, display color, notes) and owns a set of metric datasets once
  registered.
- **Registered Dataset (View)**: One scenario's one metric's data, made queryable under a
  name namespaced to that scenario so datasets from different scenarios never collide.
- **Filter**: A named, shared input value (identifier + current value) that later
  reactive panels will read and react to changes on.
- **Dashboard Configuration**: The parsed structure of a tab-layout/panel-definition file
  or a scenario's metadata file, loaded at run time.
- **Configuration Placeholder**: A named shorthand (mapping, bin, reusable join fragment,
  current-filter-value reference, or cross-scenario union) that resolves to literal query
  text during expansion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Immediately after startup completes, a caller can query the observed
  dataset and get back data, with zero manual setup steps.
- **SC-002**: Every scenario published to the app is independently queryable within 5
  seconds of startup on a typical broadband connection, with zero manual folder
  selections performed.
- **SC-003**: Loading the app with a scenario-selection link results in the active
  scenario set matching what the link specified, 100% of the time across repeated loads
  of the same link.
- **SC-004**: A configuration sample containing every supported placeholder type expands
  into query text with zero unresolved placeholders and zero manual edits required.
- **SC-005**: Setting a filter value notifies 100% of subscribers registered for that
  filter (or for "all filters") and 0% of subscribers registered for unrelated filters.
- **SC-006**: The full startup sequence completes and leaves the system able to answer
  queries, in a run where no panel, layout, or rendering code was ever loaded.
- **SC-007**: One published scenario having unreadable data does not reduce the number of
  other scenarios successfully made queryable at startup.

## Assumptions

- The observed reference dataset and the set of published scenarios are already present
  in the app's expected data locations before this slice runs; publishing new scenario
  data into those locations is out of scope for this feature.
- A 5-second startup budget (SC-002) is a reasonable default for the current expected
  number and size of published scenarios; it is not a hard contractual SLA.
- The runtime environment (browser) supports running the query engine off the main
  thread; environments that cannot are out of scope.
- When a single published scenario fails to register, the reasonable default behavior is
  to skip it and continue registering the rest (fail-soft), rather than aborting startup.
- Duplicate or repeated scenario-selection entries in the URL are treated as a single
  selection of that scenario (no duplicate-related error).
- This slice has no visual output; verification happens via direct calls to the
  query/state APIs (console or automated tests), not by inspecting rendered UI.
- Panels, layout/shell components, and the local-folder scenario picker are explicitly
  deferred to later slices, per the feature description's stated scope, and are not
  covered by this specification.
