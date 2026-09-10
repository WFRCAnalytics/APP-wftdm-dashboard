# Research: Dashboard Shell, Navigation, and First Two Panel Types

**Feature**: `003-dashboard-shell-navigation` | **Date**: 2026-08-30

---

## 1. Test fixture gap — resolution

**Decision**: Add a new fixture, `tests/fixtures/dashboard-shell-config.yaml`
— a real, `project-docs/GRAMMAR.md`-shaped `dashboard-*.yaml` with `header`, one
`filters` entry, and a `layout` containing at least two tabs' worth of rows
(one `valuebox` row, one `plotly` row) — rather than extending
`all-placeholders-config.yaml`.

**Rationale**: Confirmed by reading `all-placeholders-config.yaml` directly
— it is a `summarize.yaml`-shaped fixture (`mappings`/`bins`/`sql_fragments`),
purpose-built for `sqlExpander.test.ts`'s placeholder-expansion tests. It has
no `header`/`filters`/`layout` keys at all; extending it to also serve as a
navigation/panel-rendering fixture would conflate two different config file
*types* (`summarize.yaml` vs. `dashboard-*.yaml`) in one file, which
constitution Principle VII exists specifically to prevent — the two types
are deliberately separate for a reason, and a fixture file shouldn't blur
that distinction just because it's test-only. A second, purpose-shaped
fixture is the direct, unambiguous fix.

**Alternatives considered**:
- *Extend `all-placeholders-config.yaml`* — rejected per above (wrong shape,
  wrong config type).
- *Generate the fixture programmatically* (like `tests/fixtures/generate.py`
  does for Parquet) — rejected: `generate.py`'s own docstring scopes it to
  "tiny synthetic Parquet fixtures," and a hand-authored YAML fixture is
  more directly reviewable as an example of the real grammar than a script
  that emits YAML would be.

**What the new fixture needs to exercise** (driven by spec.md's Acceptance
Scenarios): at least 2 tabs (for SC-001's "at least two different configured
tab counts" — achieved by testing against a 1-tab and a 2-tab variant, or by
editing this fixture's tab count between test runs), one `valuebox` panel
bound to a real fixture metric column (`summary_kpis.total_households`, from
`tests/fixtures/generate.py`'s existing schema), one `plotly` panel bound to
`trip_mode_share` with a `filter: $filters.purpose` reference (existing
fixture data already has a `purpose` column), and one global `purpose`
filter definition.

---

## 2. Turning a panel config into a SQL query — `panelQuery.ts`

**Decision**: A new, small, pure module, `src/panels/panelQuery.ts`,
exporting `buildPanelQuery(config: PanelConfig, filters: Record<FilterId,
FilterValue>): string` — constructs a bare SQL template using only
`$scenario.<metric>` and `$filters.<id>` placeholders, then hands that
template to `sqlExpander.ts`'s existing `expand()` unchanged.

**Rationale**: Reading `project-docs/GRAMMAR.md`'s own SQL placeholder reference
table settles this precisely: `$mappings.x`/`$bins.x`/`$sql.x` are scoped to
*`summarize.yaml`'s* metric SQL (the offline post-processor, before Parquet
is written) — a dashboard panel's `filter:`/trace config only ever uses
`$filters.x`/`$inputs.x` (sidebar/panel-local filter values) and
`$scenario.x`/`$metric.col` (which scenario views to union, which result
column to plot). This means a panel's query never needs `summarize.yaml`'s
`raw` config at all — the columns a panel's SQL selects already exist in the
Parquet, mapped/binned by the offline post-processor. `panelQuery.ts` is
therefore pure — it never reads a `summarize.yaml`-shaped config — and
`sqlExpander.expand()` needs no change: `$filters`/`$scenario` are the only
placeholder kinds a panel query ever contains, and both are already
implemented. `$inputs.x` (panel-local reactive input) is out of scope: it
only appears in the `plot` (Observable Plot) panel type's grammar, which
this feature explicitly excludes (spec.md, out-of-scope list).

Concretely, for a `valuebox` panel (`metric: summary_kpis`, `column:
total_trips`), the constructed template is:
```sql
SELECT "total_trips" FROM ($scenario.summary_kpis)
```
For a `plotly` panel (`metric: trip_mode_share`, `filter:
$filters.purpose`), the template adds a `WHERE` clause on its own line, per
`project-docs/GRAMMAR.md`'s documented `$filters.x`-must-sit-alone-on-its-own-line
rule for correct `all`-sentinel omission:
```sql
SELECT * FROM ($scenario.trip_mode_share) t
WHERE 1=1
  AND purpose = '$filters.purpose'
```
`buildPanelQuery` is responsible only for assembling this template
correctly (which columns, which metric, which filter bindings) from a
`PanelConfig` — not for the placeholder substitution itself, which stays
`sqlExpander.ts`'s job (no duplicated expansion logic between the two
modules).

**Alternatives considered**:
- *Extend `sqlExpander.ts` itself with a `buildPanelQuery` export* —
  rejected: `sqlExpander.ts`'s existing contract (`sql-expander.md`) scopes
  it to placeholder expansion over an already-assembled template; conflating
  "assemble the template" with "expand placeholders in a given template"
  would widen that module's responsibility beyond its documented contract
  for no benefit — the two concerns compose cleanly as separate functions.
- *Let each panel component build its own query inline* — rejected: would
  duplicate the column-selection/filter-binding logic between
  `ValueBoxPanel.tsx` and `PlotlyPanel.tsx` (and every future panel type),
  exactly the kind of per-panel-type divergence the registry pattern exists
  to avoid.

---

## 3. Resolving `$metric.col` in Plotly trace configs

**Decision**: `$metric.col` resolution is a `PlotlyPanel.tsx`-local concern,
resolved entirely in JS after the query returns — not a `sqlExpander.ts`
placeholder kind. `PlotlyPanel` reads a trace's `x`/`y`/`color`/etc. keys,
and for any value matching `$metric.<column>`, maps it to
`rows.map(r => r[column])`; a bare `$scenario` value (as in
`project-docs/GRAMMAR.md`'s `name: $scenario` example) maps to the query result's
own `scenario` column (added by `panelQuery.ts`'s `$scenario.<metric>`
template, which already labels each unioned row with its source scenario
name — see `sqlExpander.ts`'s existing `expandScenario`).

**Rationale**: `$metric.col`/`$scenario` in a trace config select *which
column of the already-fetched result set* becomes a trace's `x`/`y`/`color`
— fundamentally a data-shaping step, not a SQL-generation step. Handling it
in `sqlExpander.ts` would require that module to understand Plotly's trace
shape, which is exactly the kind of panel-type-specific knowledge the
registry pattern (constitution v2.2.0) keeps out of shared services.

**Alternatives considered**:
- *A generic `resolveMetricPlaceholders()` shared helper* — considered for
  reuse if a second chart-rendering panel type (`plot`, Observable Plot)
  is added later; not built now since `plot` is out of scope for this
  feature and speculative generalization for a type that doesn't exist yet
  isn't justified. `PlotlyPanel.tsx`'s own resolution logic is written
  straightforwardly enough that extracting it later, if `plot` needs the
  same shape, is a small refactor, not a rewrite.

---

## 4. Typed `dashboard-*.yaml` parsing

**Decision**: New `src/layout/types.ts` defines `DashboardTabConfig`
(`header`, `filters[]`, `layout: Record<string, PanelConfig[]>`) and a
discriminated-union `PanelConfig` (`ValueBoxPanelConfig | PlotlyPanelConfig`
for this feature, extensible by `type` for future panel types) plus a
`parseDashboardConfig(raw: unknown): DashboardTabConfig` function. Consumed
by `shell.tsx`/`dashboardRenderer.tsx`, called once per loaded
`DashboardConfig` from `yamlLoader.loadDashboards()`.

**Rationale**: `yamlLoader.ts`'s `DashboardConfig.raw: unknown` was a
deliberate `001` decision (`raw` is genuinely untyped YAML at that layer —
`001` never needed to know dashboard *content* shape, only that a file was
fetched and parsed). This feature is the first consumer that actually needs
typed access to `header`/`filters`/`layout`, so the natural seam is a
parsing function at the point of use (`layout/`), not a change to
`yamlLoader.ts`'s own contract — `DashboardConfig.raw: unknown` stays valid
for any other future consumer with different needs.

**Alternatives considered**:
- *Add the typed shape directly to `yamlLoader.ts`* — rejected: would
  make `services/yamlLoader.ts` (a generic fetch+parse service, per its own
  contract) responsible for knowing dashboard-*.yaml's specific content
  schema, coupling a generic service to one config file type's shape.
- *Runtime schema validation (zod, etc.)* — rejected as unnecessary for
  this feature's scope: dashboard-config YAML is authored and published by
  the same team maintaining the app (per `CLAUDE.md`'s config file
  provenance), not arbitrary user input; a malformed file is a config
  authoring bug to catch via FR-010's panel-scoped error state at query
  time, not a class of input needing a validation library. Revisit if a
  future feature exposes dashboard-config authoring to less-trusted users.

---

## 5. Testing strategy — Vitest vs. Playwright split

**Decision**: `panelQuery.ts` and `layout/types.ts`'s parsing function are
pure functions with no DOM/React dependency — tested with Vitest, following
`vitest.config.js`'s existing documented scope ("pure-logic unit tests
only... no browser"). Everything that actually renders — the shell, tab
navigation, both panel types, `useFilterState`'s reactivity, filter-driven
re-queries — is verified by a new Playwright spec,
`tests/integration/dashboardShell.spec.ts`, extending `boot.spec.ts`'s
existing pattern (real browser, real DuckDB-WASM, fixture Parquet from
`tests/fixtures/generate.py`).

**Rationale**: This is the existing, already-established split in this
codebase (`vitest.config.js`'s own comment draws exactly this line for
`001`), not a new decision this feature is inventing. Introducing
`@testing-library/react` (or similar) to unit-test React components/hooks
in isolation would be a second, parallel rendering-test mechanism alongside
Playwright's real-browser coverage — redundant given Playwright already
exercises the real render path against real (fixture) data, and this
feature has no component complex enough to need isolated unit-level
rendering tests that Playwright can't cover end-to-end.

**Alternatives considered**:
- *Add `@testing-library/react` + `jsdom` for hook/component unit tests* —
  rejected per above; revisit if a future feature's component logic is
  complex enough that Playwright's end-to-end granularity becomes
  insufficient for fast, isolated iteration.

---

## 6. Panel registry wiring — `registry.tsx`, `panelCard.tsx`, error/empty states

**Decision**: `panels/registry.tsx` is exactly the `Record<string,
ComponentType<PanelProps>>` the constitution's v2.2.0 amendment and
`project-docs/SPEC.md` already specify — `{ valuebox: ValueBoxPanel, plotly:
PlotlyPanel }` for this feature. `panelCard.tsx` (shadcn `Card`) is the
single place that (a) looks up a panel's component from the registry by
`config.type`, (b) renders a title (`config.title`, `font-heading` per
`002`'s typography mapping), and (c) hosts a React error boundary around
the resolved panel component, so FR-010's "a panel's query failure MUST NOT
affect any other panel" holds even for a component that throws during
render, not just one that catches its own query rejection.

**Rationale**: Centralizing the error boundary in `panelCard.tsx` (rather
than duplicating one inside every panel component) means FR-010 is
structurally guaranteed for every current and future registry entry, not
dependent on each panel author remembering to add their own try/catch —
the same "centralize the shared concern once" reasoning the registry
pattern itself is built on.

**Alternatives considered**:
- *Each panel component handles its own errors internally, no shared
  boundary* — rejected: relies on every panel author remembering to do
  this correctly; a thrown error (not just a rejected promise) in one
  panel would otherwise crash the whole tab, violating FR-010.

---

## 7. Value-box icons (`lucide-react`)

**Decision**: `ValueBoxPanel.tsx` resolves `config.icon` (a kebab-case
string, e.g. `"car"`, `"person-walking"`, per `project-docs/GRAMMAR.md`) to a
`lucide-react` icon component via `lucide-react`'s own dynamic icon lookup
(its exported icon map, keyed by PascalCase name derived from the kebab
string), falling back to rendering no icon if the name doesn't resolve —
never a build error for an unrecognized icon name, since icon names are
config-authored data, not code.

**Rationale**: Matches constitution Principle VI's fixed choice of
`lucide-react` for icons exactly; a graceful fallback (rather than a
missing-icon crash) is consistent with FR-010's general "config errors are
visible, not fatal" posture, scoped down to a single missing icon rather
than the whole panel failing.

---

## 8. Loading/empty/error state visual pattern — checked against `APP-Project-Scoresheet`

Not one of constitution Principle VIII's four named reference repos, but —
per the explicit instruction to check before designing this feature's
panel-scoped loading/empty/error states from scratch — it's the actual
source `002-design-tokens` already ported fonts, elevation, and the shadcn
setup from. Investigated directly via the GitHub API (not assumed), same
standard as every other cross-repo fetch this project has done.

**Findings** (mixed — reusable for two of three states, genuinely absent
for the third):

- **Empty state — reusable.** `src/components/EmptyState.tsx`: a small,
  real component — `lucide-react` icon + message + optional hint,
  inheriting a single gray text color token rather than introducing new
  ones. Its own comment explains it replaced ad hoc `<p
  className="field-hint">` lines the app used to have scattered wherever it
  had nothing to show — exactly the kind of "don't re-derive this, it's
  already solved" case Principle VIII exists for, even though this isn't
  one of its named repos.
- **Error state — reusable.** No standalone `Banner.tsx` component, but a
  real, consistently-used CSS pattern (`src/styles/app.css`): a shared
  `.banner` base class (padding/radius/font-size/margin, all token-driven)
  plus `.banner-warning`/`.banner-error`/`.banner-success` variant
  modifiers, each an icon + message, `role="alert"` (blocking/warning) or
  `role="status"` (informational) for accessibility — used consistently
  across `CriteriaEditor.tsx`, `ReviewersEditor.tsx`,
  `DashboardScreen.tsx`'s `CompletionStatusBanner`, and
  `ImportScoresPanel.tsx`. `.banner-error`'s background is a dedicated
  token, `--banner-error-background`, with a *documented, tested* per-mode
  contrast correction (`tests/unit/bannerErrorContrast.test.ts`) — dark
  mode uses a stronger `color-mix()` percentage (45% vs. light's 20%)
  because the same percentage read measurably weaker in dark mode, a
  manual-sweep finding with its own regression test. This is exactly the
  "already WCAG-adjusted, don't re-derive it" situation `002-design-
  tokens`' own research.md §4 was written to catch for color tokens
  generally.
- **Loading state — genuinely absent, not overlooked.** No
  `Spinner`/`Skeleton` component, no `isLoading`-driven UI pattern anywhere
  in `src/`. Checked directly, not inferred from absence of a matching
  filename: grepped every screen/feature component for `loading`/`spinner`
  and found nothing. This tracks with Scoresheet's actual architecture —
  it loads a project file once from disk (`features/load/`) and then
  operates entirely in-memory; it has no async query-in-flight UX need the
  way this dashboard's DuckDB-WASM queries do. There is nothing to port
  here, said explicitly rather than left as an unexamined "N/A."
- **Shell/layout structure — genuinely absent, not overlooked.** Scoresheet
  is a single-screen-at-a-time wizard (`features/{load,configuration,
  reviewer-forms,dashboard}/*Screen.tsx`, one active at a time via
  `ProjectContext`/`projectReducer`), not a tabbed, multi-panel dashboard.
  No `Tabs`-based navigation, no card-grid composition pattern exists to
  reuse structurally for `shell.tsx`/`navBar.tsx`/`dashboardRenderer.tsx`.
  This part of research.md §6's design has no Scoresheet precedent and was
  correctly derived fresh.

**Decision**: Port the *structural* pattern for both reusable states,
re-expressed against this project's own token names (not Scoresheet's —
its `--banner-error-background`/`--color-danger`/`--color-success` don't
exist here; ours are `--destructive`/`--destructive-foreground`, per
`002-design-tokens`' token-contract.md):

- `panels/PanelEmptyState.tsx` (shared, used by `panelCard.tsx` and
  directly by panel components for panel-specific empty results like
  `ValueBoxPanel`'s zero-rows case) — icon + message + optional hint,
  mirroring `EmptyState.tsx`'s exact prop shape (`icon: LucideIcon`,
  `message: string`, `hint?: string`).
- `panels/PanelErrorState.tsx` (shared, rendered by `panelCard.tsx`'s error
  boundary and by a panel's own caught query-rejection) — icon (`lucide-
  react`'s `TriangleAlert`, matching Scoresheet's warning-icon choice) +
  message, `role="alert"`, styled with `border-destructive` and
  `text-destructive` on the existing `card` surface (`bg-card`) rather than
  porting Scoresheet's dedicated tinted-background token and its dark-mode
  correction — `002-design-tokens`' token set has no
  `--destructive`-tinted-background equivalent yet, and one hasn't been
  independently WCAG-verified the way Scoresheet's has. Adding one
  speculatively, un-verified, to chase an exact visual match would be the
  wrong kind of reuse (copying a value without copying the verification
  behind it, exactly what `002`'s own research.md warned against for
  colors generally). `border`-plus-flat-surface reads clearly enough for
  this feature's error state; a tinted background token is a reasonable
  future `002`-adjacent addition if a later feature finds the flat version
  visually too weak — not a gap this feature needs to close.
- Loading state (`ValueBoxSkeleton`/an equivalent for `PlotlyPanel`) is
  designed fresh, since there's genuinely nothing to port — a simple
  `animate-pulse` (Tailwind's built-in utility, no new token needed)
  placeholder matching the panel's expected shape.

**Constitution Check note**: this changes how Principle VIII's "N/A" for
this feature should be read (`plan.md`'s Constitution Check table, updated
accordingly) — not because Scoresheet becomes a fifth named reference repo
(it isn't, and this doesn't amend the constitution to make it one), but
because the *spirit* of Principle VIII — reuse a proven pattern rather than
re-derive one for a domain a sibling repo has already solved — is honored
here voluntarily, the same way `002-design-tokens` voluntarily reused
Scoresheet's fonts/shadows without Scoresheet being a named repo for those
either.

---

## Summary

| # | Decision |
|---|---|
| 1 | New fixture (`dashboard-shell-config.yaml`), not an extension of `all-placeholders-config.yaml` |
| 2 | `panelQuery.ts` builds bare `$scenario.x`/`$filters.x` SQL templates; `sqlExpander.ts` unchanged |
| 3 | `$metric.col`/`$scenario` in Plotly traces resolved in `PlotlyPanel.tsx` from the query result, not in `sqlExpander.ts` |
| 4 | New `layout/types.ts` for typed `dashboard-*.yaml` parsing; `yamlLoader.ts`'s `raw: unknown` contract unchanged |
| 5 | Vitest for pure logic (`panelQuery.ts`, `types.ts`); Playwright for anything that renders — no new component-testing library |
| 6 | Shared error boundary lives in `panelCard.tsx`, not duplicated per panel type |
| 7 | `lucide-react`'s dynamic icon lookup for value-box icons, with a graceful no-icon fallback |
| 8 | Empty/error state patterns ported from `APP-Project-Scoresheet` (`EmptyState.tsx`, `.banner-error`), re-expressed in this project's own tokens; loading-state and shell/layout structure confirmed to have no Scoresheet precedent, designed fresh |
