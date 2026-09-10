# Phase 0 Research: Viewer-Selectable Dataset Picker for Graphic Walker Panels

No `[NEEDS CLARIFICATION]` markers remained in the Technical Context — this
feature is additive over an already-built panel type and reuses existing
mechanisms throughout. This document records the concrete decisions made
while resolving the spec's own "Research Findings" section into an
implementable design, each confirmed directly against real, installed
source, not general knowledge.

## §1. Where the live catalog of view names comes from

**Decision**: Use `services/duckdb.ts`'s existing `listViews()` export
directly. No new DuckDB introspection query (`information_schema.tables`,
`SHOW TABLES`, etc.) is written.

**Rationale**: `listViews()` returns `Array.from(allViews)`, a module-level
`Set<string>` populated **exclusively** inside `createViewOverParquet()` —
confirmed by direct read of `services/duckdb.ts`: that private function has
exactly two callers, `registerScenario()` and `registerFileURL()`, and
nothing else in the module (or anywhere else in `src/`, confirmed via
`grep`) ever touches `allViews`. This means the registry is already a
closed, complete, accurate list of every view this app itself created —
no DuckDB-internal, extension-internal, or temp-table noise can appear in
it, because nothing else ever populates it. Querying
`information_schema.tables` directly would have required a **new** filter
to exclude DuckDB/extension-internal system tables (a real, unresearched
risk the spec's own research flagged) — reusing `listViews()` sidesteps
that risk entirely rather than solving it.

**Alternatives considered**:
- `SELECT * FROM information_schema.tables` / `SHOW TABLES` — rejected:
  would surface whatever the `spatial` extension (loaded lazily by any
  `zonemap` panel) or DuckDB itself registers internally, requiring a new,
  unverified exclusion list this app has never needed before.
- A new `services/duckdb.ts` export purpose-built for this feature —
  rejected: `listViews()` already does exactly this job with zero
  modification needed; adding a parallel export would duplicate it.

## §2. Excluding non-metric views (the "zonemap-geom" contamination)

**Decision**: A view is only offered as a selectable dataset if its name
starts with `${activeScenarioName}__` for some name in the current
`useActiveScenarios()` result, for **every** currently active scenario
(§3 below covers the "every" part). The metric name is everything after
that matched prefix.

**Rationale**: Confirmed directly (`panels/zoneGeometry.ts`) that a second,
real view-name family exists in `listViews()`'s output:
`zonemap-geom__{boundariesFile}`, registered whenever any `zonemap` panel
loads geometry. `"zonemap-geom"` is never itself a value that
`appState.register()` (and therefore `useActiveScenarios()`) can produce —
scenario names come from `manifest.yaml`/folder names, never this
hardcoded geometry-cache prefix — so filtering by "starts with a *real,
currently active scenario name* + `__`" excludes this family by
construction, with no guessed regex and no dependency on the geometry
module's own internal naming staying stable.

**Alternatives considered**:
- A regex allow-list like `/^[\w-]+__[\w-]+$/` — rejected: `zonemap-geom__*`
  matches that shape too (it's a syntactically identical `__`-joined pair),
  so it would not actually exclude the contamination this feature needs to
  exclude.
- A hardcoded exclude-list of known non-metric prefixes (e.g.
  `'zonemap-geom'`) — rejected: brittle against any future non-metric view
  family added elsewhere in this codebase; the active-scenario-name check
  is self-maintaining because it's anchored to data this app already
  tracks as the source of truth for "what counts as a scenario," not a
  separately maintained list.

## §3. Bare metric name vs. scenario+metric compound identifier

**Decision**: The picker offers bare metric names (e.g. `trip_mode_share`),
identical in form to every other panel type's own `metric:`/`dataset:`
config value. A metric is only offered if a `{scenario}__{metric}` view
exists for **every** currently active scenario name (set intersection
across active scenarios' own metric-name sets, not a union).

**Rationale**: `panels/panelQuery.ts`'s existing `buildGraphicWalkerQuery()`
already has exactly this grammar — a bare `config.dataset`, expanded via
`$scenario.<dataset>` when `config.scenario` is unset, which
`services/sqlExpander.ts`'s existing, unmodified `expandScenario()` turns
into `UNION ALL`-ed `SELECT * FROM "{name}__{metric}"` — **one clause per
active scenario, unconditionally**. Confirmed by direct read: this
function has no fallback for a scenario missing the referenced metric — a
missing view fails the whole query (DuckDB throws "table does not exist"),
exactly like every other panel type's own omitted-`scenario:` config
already implicitly assumes today (no test or code path in this codebase
handles a partial-availability metric gracefully). Rather than teaching
`expandScenario()` a new partial-union behavior (a change to shared,
heavily-relied-upon code, out of proportion to this feature's scope), the
picker's own dataset list is filtered so it can never offer a choice that
would hit this pre-existing failure mode. This is what makes spec FR-005
("every listed choice is guaranteed to load successfully") true by
construction, with zero change to `sqlExpander.ts`.

**Alternatives considered**:
- Picker entries as `{scenario}/{metric}` compound identifiers (viewer
  picks one specific scenario's copy of a metric directly, bypassing the
  union) — rejected: this would be a second, inconsistent dataset-binding
  grammar unique to this one panel type, when every other panel type (and
  this panel type's own existing `scenario:`-unset behavior) already
  expresses "all active scenarios, unioned, tagged by a `scenario` column"
  as the norm. The spec's own framing ("consistent with every OTHER
  data-bound panel type's own scenario-handling grammar") rules this out.
- Offering the **union** of metric names across any active scenario
  (broader list, but a selection could fail for scenarios lacking it) —
  rejected per FR-005 above; would require either a new partial-union SQL
  path or accepting predictable failures, neither acceptable.

## §4. Query-lifecycle integration point

**Decision**: `GraphicWalkerPanel.tsx` gains one new piece of local state,
`selectedDataset: string | undefined`, initialized from `config.dataset`
(unchanged — `dataset` stays a required field; see §6). The existing query
effect's dependency array gains `selectedDataset` in place of relying on
`config.dataset` directly for the query it builds; internally it builds an
**effective config** (`{ ...config, dataset: selectedDataset ?? config.dataset }`)
and passes that to the existing, unmodified `buildGraphicWalkerQuery()`.
A second, new effect (or the same one, gated) recomputes the *available*
dataset list whenever `activeScenarioNames` changes, using the new pure
`graphicWalkerDatasets.ts` module against `listViews()`.

**Rationale**: `activeScenarioNames` is already in the existing query
effect's dependency array (confirmed by direct read) — this panel type
*already* re-queries when the active scenario set changes; that is
existing behavior, not new reactivity being introduced. Extending the same
existing dependency to also refresh the *options list* is symmetric with
what it already does for the *selected* data, not a new reactivity axis.
Global filters remain untouched — no `useFilterState` call is added
anywhere in this component (FR-009/014's own FR-005 stays intact).

**Alternatives considered**:
- A wholly separate `useEffect` polling `listViews()` on an interval —
  rejected: `listViews()` is synchronous and cheap (an in-memory `Set`
  read), and this panel already has a reactive signal
  (`activeScenarioNames`) that changes at exactly the moments the catalog
  could change (scenario activation/deactivation is the only thing that
  ever adds/removes `{scenario}__*` views during a session).

## §5. Composing with an author-pinned `scenario:`

**Decision**: If `config.scenario` is still set (the existing pin
mechanism), the picker lists metric names available for **that one
scenario only** (no cross-scenario intersection needed — there's only one
scenario in play), and switching datasets re-queries
`"{config.scenario}__{selected}"` directly, exactly mirroring
`buildGraphicWalkerQuery()`'s own existing pinned-scenario branch.

**Rationale**: This composes with zero new grammar — `dataset_picker` and
`scenario` are orthogonal existing/new fields on the same config object,
and `buildGraphicWalkerQuery()`'s existing `config.scenario ? ... : ...`
branch already does the right thing once `dataset` is replaced with the
current selection before calling it.

## §6. Whether `dataset:` becomes optional

**Decision**: `dataset` on `GraphicWalkerPanelConfig` stays a **required**
field, unconditionally — no type change, no migration needed for any
config that doesn't set `dataset_picker`. When `dataset_picker: true` is
also set, the existing `dataset` value is simply the panel's *initial*
selection (FR-011's "author's originally configured dataset when one is
still provided" branch — always true under this decision, since it's
never actually optional).

**Rationale**: Keeps this feature purely additive at the type level (no
existing config, and no other code that constructs a
`GraphicWalkerPanelConfig`, e.g. test fixtures, needs to change) and
avoids a genuinely harder question (what a fully dataset-less config's
"deterministic first choice" should be, and how a real dashboard author
would ever discover what that default even is) that the spec does not
need this feature to answer to deliver its core value.

**Alternatives considered**:
- Making `dataset` optional when `dataset_picker` is true (a discriminated
  union) — rejected as unnecessary complexity: every real authoring
  scenario already has a natural "this is the dataset I built the panel
  around" default to provide; forcing authors to always name one, even in
  picker mode, costs nothing and removes a whole class of "what's the
  default" edge cases.

## §3a. Addendum — a real gap found during implementation: view existence ≠ schema compatibility

**Found**: while implementing T013-T016 (see tasks.md), a live DuckDB check
confirmed a real, reachable gap in §3's own design: `listSelectableDatasets()`
only checks that a `{scenario}__{metric}` **view exists** for every scenario
in scope — it has no way to know whether that view's real **columns** are
the same across scenarios. `sqlExpander.ts`'s existing, unmodified
`expandScenario()` UNIONs each scenario's own `SELECT *` **positionally**;
DuckDB requires every branch of a `UNION ALL` to have the same number of
result columns, confirmed directly:

```
BinderException: Set operations can only apply to expressions with
the same number of result columns
```

This is reachable in this project's own real fixture data:
`tests/fixtures/generate.py`'s `vmt_by_home_taz` has 2 columns under
`observed` (`VMT_BY_HOME_TAZ_OBSERVED_COLUMNS`) but 3 under `good_scenario`
(`VMT_BY_HOME_TAZ_COLUMNS`) — a deliberate departure documented there for
`013-zonemap-panel`'s own, unrelated testing needs. A view exists for that
metric in both scenarios, so §3's original design would have offered it as
a picker choice — and selecting it in an unpinned (union) panel would throw
the instant a viewer picked it, directly violating FR-005/SC-002 ("every
listed choice is guaranteed to load successfully").

**Decision**: added `filterSchemaConsistent()` alongside
`listSelectableDatasets()` in the same pure module — it takes the
existence-based candidate list plus a precomputed `scenarioName -> (metric
-> column-signature string)` map and excludes any candidate whose
signature differs between scenarios (or is missing for one). The function
itself stays pure/DOM-DB-free, matching every other export in this module;
`GraphicWalkerPanel.tsx` is responsible for the actual DuckDB round trip
(one `information_schema.columns` query per scenario in scope, only when
`scenarioScope.length > 1` — a single pinned scenario never builds a
UNION at all, so there's nothing to compare). This makes the picker's
own async availability computation genuinely a `useEffect`+state pair
rather than a `useMemo`, since fetching real column names requires a
query.

**Why this is unlikely in real production data, but still worth guarding**:
one `summarize.yaml` metric definition runs, via the same post-processor,
identically against every scenario's own raw data — a metric's real output
schema should always be the same across scenarios by construction. The gap
is real and reachable in hand-authored test fixtures (and would be
reachable in production too, for any inconsistency a `summarize.yaml`
edit introduces between one scenario's run and another's, which the
post-processor has no cross-scenario consistency check of its own for
today), so this is closed for real rather than assumed away.

**Alternatives considered**:
- Do nothing, document as a "known limitation" inherited from
  `sqlExpander.ts`'s own pre-existing `$scenario.` assumption — rejected
  once confirmed reachable in this feature's OWN fixture data: silently
  shipping a picker entry known to fail the moment it's selected is
  exactly the "leaks a dead-end choice" failure User Story 2 exists to
  prevent, not a pre-existing risk this feature merely inherits passively.
- Teach `sqlExpander.ts`'s `expandScenario()` a schema-tolerant union
  (e.g. `UNION ALL BY NAME`) — rejected: a change to shared code every
  other panel type also depends on, out of proportion to this feature's
  scope (the same reasoning §3's original decision already used to reject
  changing `expandScenario()`).

## §7. UI control choice

**Decision**: Build the picker as a small trigger button + `DropdownMenu`
(Radix `DropdownMenuRadioGroup`/`DropdownMenuRadioItem`), reusing
`components/ui/dropdown-menu.tsx` — the same already-installed primitive
`layout/settings/appearanceTab.tsx`'s original theme control and `020`'s
original Basemap tab picker both already used for an equivalent
single-select-from-a-list control.

**Rationale**: No new dependency (`@radix-ui/react-select` is not
installed; `@radix-ui/react-dropdown-menu` already is). Matches
Principle VI's shadcn/ui-on-Radix constraint without adding a new Radix
package for a control this codebase has already solved twice with the one
it has. Visual detail (exact placement above the embedded `<GraphicWalker>`
view, spacing, truncation for long metric names) is implementation-phase
work, informed by this project's own established practice of grounding a
picker/list UI in a concrete reference (`project-docs/PIPELINE.md`'s
`gropaul/dash` precedent) rather than iterating blind — deferred to
`/speckit-tasks` and the actual component implementation, not decided here.

**Alternatives considered**:
- A bare native `<select>` — rejected: every other single-select control
  already added to this app's Settings UI uses the shadcn/Radix pattern;
  a bare unstyled `<select>` would be a visual regression relative to
  established precedent, and the spec's own request called out that this
  needs real visual design attention, not a bare control.
- Adding `@radix-ui/react-select` for a "more correct" native-select-like
  primitive — rejected: introduces a new dependency for a job the already-
  installed `dropdown-menu` primitive already does, with two direct
  precedents in this same codebase.
