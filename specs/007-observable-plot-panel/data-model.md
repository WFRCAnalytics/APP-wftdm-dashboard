# Data Model: ObservablePlotPanel

**Feature**: `007-observable-plot-panel` | **Date**: 2026-08-31

No new persisted data, no new config file, no new config file type
(constitution Principle VII unaffected). This feature's shapes are: the typed
parsing of `type: observable-plot`'s already-documented `dashboard-*.yaml`
grammar (`layout/types.ts`), a widened common `filter` field shared by every
data-bound panel type (research.md §1), an extended SQL-placeholder dispatch
(`services/sqlExpander.ts`, research.md §2), and one new pure encoding-
resolution module (research.md §4/§6).

---

## `DataBoundPanelConfigBase` (modified — `filter` field widened)

| Field | Type | Notes |
|---|---|---|
| `metric` | `string` | Unchanged |
| `filter` | `string \| Record<string, string> \| undefined` | **Widened.** Was `string?`. `project-docs/GRAMMAR.md`'s common-keys table always documented both the bare `$ref` string form and an `inline` map form (research.md §1) — `observable-plot` is simply the first panel type to use the map form. `ValueBoxPanelConfig`/`PlotlyPanelConfig`/`TablePanelConfig` are unaffected in practice (they only ever author the string form), but must still typecheck against the widened union — a checkpoint task verifies this before `ObservablePlotPanelConfig` is added, mirroring 006-markdown-panel's `PanelConfigBase`-split checkpoint |
| `scenario` | `string?` | Unchanged |
| `scenarios` | `string[]?` | Unchanged |

---

## `ObservablePlotInputConfig` (new)

One entry in an `observable-plot` panel's `inputs:` list — `project-docs/GRAMMAR.md`'s
documented shape, verbatim:

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Referenced via `$inputs.<id>` in this same panel's own `filter:` map. Scoped to the owning panel instance only (research.md §3) — a second panel declaring the same `id` is a distinct, independent input, never a collision |
| `label` | `string` | Rendered control label |
| `type` | `'select' \| 'multiselect' \| 'range'` | Same three-value vocabulary `FilterDefinition.type` already uses for global filters — no fourth value observed in any documented example |
| `column` | `string` | Which column (from this panel's own queried result set) the control's selectable options are drawn from |
| `default` | `string` | Value in effect before any user interaction (research.md §3 — held in component-local `useState`, initialized to this) |

No `all_option` field appears in any documented `inputs:` example (unlike
`FilterDefinition`, which has one) — not added here; `$inputs.` placeholder
lines still go through the same 'all'-value line-drop pass as `$filters.`
lines for consistency (research.md §2), but nothing in this feature's own
fixtures or grammar currently produces the literal value `'all'` for an
input.

---

## `ObservablePlotPanelConfig` (`type: 'observable-plot'`, extends `DataBoundPanelConfigBase` — new)

| Field | Type | Notes |
|---|---|---|
| `mark` | `string` | Names an `@observablehq/plot` mark-constructor export (e.g. `'barY'`, `'lineY'`) — looked up dynamically as `Plot[markName]`, not an exhaustive hardcoded enum, matching how `PlotlyTraceConfig.type` is a plain `string` rather than a closed union of every Plotly trace type |
| `x` | `string?` | Literal column name — **not** `$metric.`-prefixed (research.md §4) |
| `y` | `string?` | Literal column name |
| `fill` | `string?` | Literal column name |
| `stroke` | `string?` | Literal column name |
| `facet_x` | `string?` | Literal column name — maps to Plot's `fx` channel |
| `facet_y` | `string?` | Literal column name — maps to Plot's `fy` channel |
| `tip` | `boolean?` | Passed through to the mark's own `tip` option |
| `grid` | `boolean?` | Passed through to `Plot.plot()`'s top-level grid option |
| `inputs` | `ObservablePlotInputConfig[]?` | Panel-local reactive input widgets (spec.md User Story 2) |

`DataBoundPanelConfigBase`'s common fields (`title`, `width`, `height`,
`metric`, `filter`, `scenario`, `scenarios`) apply unchanged — `filter` here
is where `$inputs.<id>` placeholders actually appear, per
`project-docs/GRAMMAR.md`'s own examples (a map value, never `x`/`y`/etc.).

**Union update**: `layout/types.ts`'s `PanelConfig` becomes
`ValueBoxPanelConfig | PlotlyPanelConfig | TablePanelConfig |
MarkdownPanelConfig | ObservablePlotPanelConfig | UnknownPanelConfig` — a
`type: observable-plot` entry now parses to a real, narrowed type instead of
falling through to `UnknownPanelConfig`'s wide shape.

---

## `ResolvedObservablePlotEncoding` (internal — `panels/observablePlotEncoding.ts`, not part of the YAML grammar)

The pure, DOM-free output `observablePlotEncoding.ts` hands to
`ObservablePlotPanel.tsx` (research.md §4/§6):

| Field | Type | Notes |
|---|---|---|
| `markName` | `string` | Copied from `config.mark` verbatim — the component looks up `Plot[markName]`, throwing into the shared error state (via a caught exception, same as an unresolvable metric) if it's not a real export |
| `data` | `Record<string, unknown>[]` | The queried rows, passed through unchanged |
| `options` | `Record<string, unknown>` | `{x, y, fill, stroke, fx: facet_x, fy: facet_y, tip}` — only the keys actually present on `config`, so Plot's own per-mark defaults apply to anything the author omitted. `tip` is NOT `config.tip` copied verbatim — it's `resolveTipMode(config.mark)`'s result: `"x"` for `barY`, `true` (Plot's `"xy"` default) for every other mark, a mark-aware correction found necessary post-implementation (research.md §4's correction, a real hover bug) — `@observablehq/plot`'s own `tip: true` shorthand isn't mark-shape-aware and creates "dead spots" on bar marks otherwise |
| `plotOptions` | `Record<string, unknown>` | Top-level `Plot.plot()` options distinct from the mark's own: `{grid}` when `config.grid` is set; `{color: {legend: true}}` when `config.fill` or `config.stroke` is set — not `config`-driven, a mark-aware internal default found necessary post-implementation (research.md's second correction, a real legend bug) since `project-docs/GRAMMAR.md` documents no `legend:` key and Plot's own `color: {legend: true}` isn't automatic; plus the caller-supplied `width`/`height` measured from the container at render time (research.md §5 — not part of `config` at all, since Plot itself has no automatic container awareness) |

---

## Panel-local input state (internal — `ObservablePlotPanel.tsx`, component-local `useState`, not part of the YAML grammar)

| Value | Meaning |
|---|---|
| `Record<string, string \| string[]>` | Current value per declared input `id` — a plain string for `select`/`range`, a string array for `multiselect`. Initialized from each input's own `default` on mount. Never read by, or written from, any other component instance (research.md §3) |

`ObservablePlotPanel.tsx` wraps this state in a small `{ get(id) }` object
literal satisfying `sqlExpander.ts`'s `FilterStateLike` interface when calling
`expand()` — no new interface, no import of `state/filterState.ts` for this
purpose.

## `panelQuery.ts`'s new `extractGlobalFilterIds` export

| Signature | `(filter: DataBoundPanelConfigBase['filter']) => FilterId[]` |
|---|---|
| Purpose | Given `config.filter` in either shape (§`DataBoundPanelConfigBase` above), returns every `$filters.<id>` referenced — deliberately excluding any `$inputs.<id>` entries, which `useFilterState` must never subscribe to (research.md §3, FR-005) |

`ObservablePlotPanel.tsx` is this function's only caller — no existing panel
type needs it, since a bare-string `filter:` can only ever reference one
`$filters.<id>` (today's `useFilterState([config.filter.replace(/^\$filters\./, '')])`
pattern in `PlotlyPanel.tsx` already handles that single-id case inline). It
lives in `panelQuery.ts`, not `ObservablePlotPanel.tsx` itself, because it is
pure config-shape logic in the same family as `buildPanelQuery`'s own
`filter:`-shape normalization (research.md §1) — Vitest-tested alongside it
in `tests/unit/panelQuery.test.ts`, not deferred to Playwright-only coverage.

## Panel-local input option sourcing (internal — `PanelLocalInput`, research.md §9)

| Input type | Options query | Notes |
|---|---|---|
| `select` / `multiselect` | `distinctValues(view, config.column)` (`services/duckdb.ts` — an existing, previously-uncalled export) | `view` resolves the same way the panel's own metric does: `config.scenario` if set, else `resolveActiveScenarios(config, activeScenarios)[0]` |
| `range` | `SELECT MIN("<column>") AS min, MAX("<column>") AS max FROM "<view>"` (new, small, plain-string-templated query — no existing helper covers min/max) | Same `view` resolution as above |

Deliberately **unfiltered** by any of the panel's own `filter:` bindings,
including the input's own — research.md §9 explains why a filtered options
query would collapse a `select`/`multiselect`'s choices to (at most) its own
current selection. Fetched once per input on mount, re-fetched only if
`config`/active-scenario resolution changes — never on a keystroke or a
sibling input's value changing.

**Edge case resolution — mismatched `default` (spec.md's Edge Cases,
research.md §9)**: no validation of `default` against the fetched option
list is performed. A `select`/`multiselect` value the fetched options don't
contain still drives the main query exactly as configured; that query then
legitimately returns zero rows, resolving through the existing
`PanelEmptyState` path (§7 of research.md) like any other unmatched filter
value — not a new failure mode. `PanelLocalInput`'s own rendering still
injects an `<option>` for the current value if the fetched list doesn't
contain it, so the control visibly reflects what's actually selected rather
than silently defaulting its *displayed* selection to some other option. A
`range` input's mismatched `default` is clamped to `[min, max]` by the
browser's native `<input type="range">` behavior before any query is even
built — a categorically different (more graceful) failure mode than
`select`/`multiselect`'s, not treated as equivalent.

---

## Relationships

```
dashboard-*.yaml's type: observable-plot entry
        |
        v  layout/types.ts's parseDashboardConfig()
  ObservablePlotPanelConfig { mark, x, y, fill, stroke, facet_x, facet_y,
                               tip, grid, inputs?, ...DataBoundPanelConfigBase }
        |
        v  panels/registry.tsx lookup by .type === 'observable-plot'
  ObservablePlotPanel.tsx
        |
        +-- useFilterState(config.filter's $filters.<id> ids)  [global]
        +-- component-local useState per inputs[].id            [panel-local,
        |                                                         research.md §3]
        |
        v  panelQuery.ts's buildPanelQuery() — normalizes config.filter's
        |  string | Record<string,string> shape (research.md §1) into
        |  "AND col = 'placeholder'" lines, one per entry
        v  sqlExpander.ts's expand(template, config, filterState,
        |  activeScenarios, inputState) — inputState new, resolves
        |  $inputs.<id> the same way filterState resolves $filters.<id>
        |  (research.md §2)
  literal SQL
        |
        v  services/duckdb.ts's query()
  rows: Record<string, unknown>[]
        |
        v  observablePlotEncoding.ts (pure, no DOM — research.md §6)
  ResolvedObservablePlotEncoding { markName, data, options, plotOptions }
        |
        v  ObservablePlotPanel.tsx's own render effect
  Plot[markName](data, options)  ->  a NEW detached DOM element each call
  (research.md §5 — no in-place update API, unlike Plotly.react())
        |
        v  container.replaceChildren(newElement) — swapped on BOTH a
        |  data/config change AND a ResizeObserver-triggered resize
        |  (research.md §5 — a real difference from PlotlyPanel's
        |  cheap Plotly.Plots.resize() call)
  PanelEmptyState (zero rows) -- or -- PanelErrorState (rejected query /
  unrecognized mark) -- or -- the rendered chart
```

`004`'s expand-to-dialog mechanism (`usePanelExpandHost`) relates to this
panel type exactly as it does to every other registry entry — `
ObservablePlotPanel` is just another `PanelComponent` it portals (FR-009/
SC-003). Because the portal host never remounts the component across the
expand/collapse transition, panel-local input state (above) and the
currently-mounted `Plot.plot()` element both survive that transition without
any observable-plot-specific handling — the ResizeObserver-triggered
rebuild-and-swap (research.md §5) is what keeps the *rendered size* correct on
that transition; it is not what keeps *state* correct, which `004`'s existing
mechanism already guarantees for every panel type.
