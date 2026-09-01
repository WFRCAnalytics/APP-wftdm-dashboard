# Implementation Plan: ObservablePlotPanel

**Branch**: `007-observable-plot-panel` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-observable-plot-panel/spec.md`

## Summary

Add the fifth panel type — `observable-plot` — to the registry, following
`ValueBoxPanel`/`PlotlyPanel`/`TablePanel`/`MarkdownPanel`'s established
component shape (a function component receiving a single `config` prop,
registered in `panels/registry.tsx`) and, unlike `MarkdownPanel`, the full
query-chain part of that pattern too — `docs/GRAMMAR.md`'s real
`type: observable-plot` grammar always queries a `metric` (research.md §7).
Two grammar findings, verified rather than assumed (per this project's
established discipline), shape the design: chart encodings (`x`/`y`/`fill`/
`stroke`) are bare column names, not `$metric.`-prefixed like `PlotlyPanel`'s
traces (research.md §4); and `$inputs.<id>` — panel-local reactive input
widgets — is real, documented grammar, not illustrative-only, making this
feature materially bigger than "swap Plotly for Observable Plot" (spec.md's
Grammar findings, research.md §2/§3/§8). A third finding, confirmed directly
against `@observablehq/plot`'s real docs/source rather than assumed to work
like `PlotlyPanel`'s `Plotly.react()` + `Plotly.Plots.resize()` pattern:
`Plot.plot()` returns a brand-new detached DOM element on every call, with no
in-place update API and no automatic container-resize awareness — the
ResizeObserver trigger transfers from `PlotlyPanel.tsx`, but the action it
triggers (a full replot-and-swap, not a cheap resize call) does not
(research.md §5).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), same as `001`-`006`

**Primary Dependencies**: One new runtime dependency — `@observablehq/plot`
(`^0.6.17`, `docs/SPEC.md`'s own pinned choice for this panel type). Pulls in
`d3` (`^7.9.0`) as its own transitive dependency; no peer dependencies listed
(confirmed against the real npm registry metadata, unlike the deck.gl/
flowmap.gl/maplibre-gl trio's pinned-peer-version requirement). Ships its own
TypeScript types (`"types": "src/index.d.ts"`) — no `@types/@observablehq
/plot` needed, matching `marked`/`dompurify`'s precedent from
006-markdown-panel. Existing: `react`/`react-dom`, `services/duckdb.ts`,
`services/sqlExpander.ts` (extended, research.md §2), `state/filterState.ts`
(read via `useFilterState` for global filters only — never written to for
panel-local inputs, research.md §3), `004`'s expand-to-dialog mechanism
(consumed automatically, zero observable-plot-specific wiring, per
FR-009/SC-003).

**Component source**: New `src/panels/ObservablePlotPanel.tsx` (the React/DOM
layer — two effects: a data-fetch effect shaped like `PlotlyPanel.tsx`'s, and
a render-and-swap effect that both draws the initial chart and responds to
`ResizeObserver`, since `@observablehq/plot` has no separate cheap
resize-only API to split out the way `Plotly.Plots.resize()` allowed —
research.md §5) plus a new pure module, `src/panels/observablePlotEncoding.ts`
(config + rows → `{markName, data, options, plotOptions}`, no DOM/Plot
runtime dependency — research.md §4/§6, mirroring `plotlyTraces.ts`'s split).
Modified: `src/layout/types.ts` (widen `DataBoundPanelConfigBase.filter` to
`string | Record<string,string> | undefined`, research.md §1; add
`ObservablePlotInputConfig`/`ObservablePlotPanelConfig`), `src/panels/
panelQuery.ts` (`buildPanelQuery` normalizes both `filter` shapes into
`[column, placeholder]` pairs, research.md §1 — a real rewrite of a shared
function three existing panel types already depend on, not an additive-only
change; plus a new export, `extractGlobalFilterIds`, separating `$filters.`
from `$inputs.` references so only the former ever reaches `useFilterState`
— research.md §2/§3, contracts/observable-plot-panel.md), `src/services/
sqlExpander.ts` (`inputs` placeholder kind + new optional `inputState`
parameter on `expand()`, research.md §2 — additive, existing callers
unaffected), `src/panels/registry.tsx` (new `'observable-plot'` entry),
`package.json` (`@observablehq/plot` added). `services/duckdb.ts` itself is
**not modified** — this feature is the first caller of its existing,
previously-uncalled `distinctValues()` export (research.md §9), used by the
panel-local input controls to populate `select`/`multiselect` option lists; a
`range` input's bounds come from a small new `MIN`/`MAX` query issued the
same way (`services/duckdb.ts`'s existing `query()`).

**Storage**: N/A — no new persistence. Panel-local input values live in
component-local `useState` (research.md §3), never `state/filterState.ts` or
any other durable store.

**Testing**: Vitest — `observablePlotEncoding.ts`'s pure resolution logic gets
its own dedicated unit test file, `tests/unit/observablePlotEncoding.test.ts`,
mirroring `plotlyTraces.test.ts`'s existing pattern for a sibling pure module.
`tests/unit/panelQuery.test.ts` (exists — extended, not new) gains cases for
`buildPanelQuery`'s new `Record<string,string>` filter-shape handling, with
its existing string-form assertions required to stay green unchanged.
`tests/unit/sqlExpander.test.ts` (exists — extended, not new) gains cases for
the new `inputs` placeholder kind. Playwright:
`tests/integration/observablePlotPanel.spec.ts`, matching `plotlyPanel`-style
coverage (this project has no standalone `plotlyPanel.spec.ts` file — Plotly
coverage lives inside `dashboardShell.spec.ts`; this feature gets its own
dedicated spec file instead, matching `005`/`006`'s precedent of one
dedicated integration spec per new panel type) — rendering at least two mark
types against fixture data matching a direct query, global-filter reactivity,
the `004` expand/collapse resize-correctness and zero-extra-query assertions,
panel-local input behavior (default value, change re-queries, multiselect
"any of" semantics, cross-panel isolation including a same-`id` fixture
pair), input-value persistence across expand/collapse, empty/error states,
and mixed-panel-type-tab rendering (quickstart.md's full list).

**Target Platform**: Browser — same as `001`-`006`

**Project Type**: Single-project web frontend, additive to `001`-`006`

**Performance Goals**: No new explicit numeric target — chart render/redraw
cost is bounded by the same fixture/production data scale every other panel
type already budgets against; the one new cost this feature introduces is a
full `Plot.plot()` rebuild on every `ResizeObserver` firing (research.md §5),
not benchmarked separately since Observable Plot's own rendering cost for
panel-sized datasets is not a workload this project needs to budget
differently from `PlotlyPanel`'s existing chart-render cost.

**Constraints**: Chart encoding fields (`x`/`y`/`fill`/`stroke`/`facet_x`/
`facet_y`) MUST NOT go through `$metric.<column>` placeholder resolution
(FR-002 — a real grammar constraint, not a style preference). Panel-local
input value changes MUST NOT write to `state/filterState.ts` and MUST NOT be
observable from any other panel instance (FR-005). The panel MUST NOT issue
an additional query solely because of a `004` expand/collapse transition
(FR-006/FR-007, mirroring `003`'s FR-011/`004`'s own unmount-race rigor for
the query side; the chart still visually re-renders on that transition for
sizing reasons, but that redraw is a `Plot.plot()` rebuild against already-
fetched `rows`, not a new `query()` call).

**Scale/Scope**: 1 new panel component (`ObservablePlotPanel.tsx`), 1 new pure
module (`observablePlotEncoding.ts`), 2 new types in `layout/types.ts`
(`ObservablePlotInputConfig`, `ObservablePlotPanelConfig`) plus a widened
shared field (`DataBoundPanelConfigBase.filter`) touching all three existing
data-bound config interfaces' effective type (no field changes of their own —
same "additive re-parent, checkpoint before building on top" shape
006-markdown-panel's `PanelConfigBase` split established), 1 rewritten shared
function (`buildPanelQuery`) with a typecheck-and-existing-tests-still-pass
checkpoint before `ObservablePlotPanelConfig` is added, 1 additive extension
to a second shared function (`sqlExpander.expand()`), 1 new registry entry, 1
new runtime dependency, 1 new Playwright spec, plus new/extended Vitest unit
coverage. No new panel type beyond `observable-plot` itself (`flowmap`/
`zonemap`/`sankey`/`graphic-walker` remain deferred, per spec.md's own stated
boundary). Scoped larger than `005`/`006` specifically because panel-local
reactive input controls (real, documented grammar — spec.md's Grammar
findings) are this application's first interactive filter-value-setting UI of
any kind (research.md §8), not merely a second chart-rendering library swapped
in alongside Plotly.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | New/modified files are `.tsx`/`.ts`; React already adopted — fifth, ordinary consumer of the established panel pattern | PASS |
| II. DuckDB-WASM off the main thread, one shared instance | `ObservablePlotPanel.tsx` queries via the existing `services/duckdb.ts` singleton (direct import, per the established panel pattern) — no new `AsyncDuckDB`/`Worker`/connection introduced | PASS |
| III. No `eval()` | `buildPanelQuery`'s rewrite and `sqlExpander.ts`'s new `inputs` placeholder kind both remain plain string templating/replacement — no dynamic code execution introduced for either the widened `filter:` shape or the new placeholder kind (research.md §1/§2) | PASS |
| IV. YAML parsed at runtime | `mark`/`x`/`y`/`fill`/`stroke`/`facet_x`/`facet_y`/`tip`/`grid`/`inputs` are parsed from `dashboard-*.yaml` at runtime via the existing `layout/types.ts` seam (extended, not replaced) — no build-time baking | PASS |
| V. Parquet-only browser I/O | Panel queries the same `scenario__metric`/`observed__metric` Parquet-backed views every other data-bound panel type already queries — no new data I/O path | PASS |
| VI. Fixed Technology Choices | `@observablehq/plot` is `docs/SPEC.md`'s and the constitution's own Technology Stack Reference's pinned choice for "reactive filter inputs" charts — not a deviation requiring amendment | PASS |
| VII. Minimal, Fixed Config File Set | No new config file type; `mark`/`inputs`/etc. are new *keys* within the existing `dashboard-*.yaml` type's already-documented `type: observable-plot` grammar, not a new file | PASS |
| VIII. Reuse Proven Reference Implementations | N/A — none of the four named reference repos cover Observable Plot rendering; this principle's named scope doesn't reach this feature | PASS (N/A) |
| IX. Fixed Python/JS Source Split | No Python package code touched; all new files under `src/` | PASS |

No unjustified violations. Complexity Tracking table is not needed (left
empty below) — the `buildPanelQuery`/`sqlExpander.ts` changes are real
modifications to shared, already-tested code, but both are additive/backward-
compatible by design (research.md §1/§2) and gated by an explicit checkpoint
task, not an unreviewed risk.

**Post-Phase 1 re-check**: research.md's decisions (`filter:` common-key
widening; `$inputs.<id>` extension to `sqlExpander.ts`; component-local
input-state isolation; confirmed bare-column-name encoding convention;
confirmed different `@observablehq/plot` resize model; pure, DOM-free
`observablePlotEncoding.ts`; reused loading/empty/error state shape; net-new
panel-local input UI) and data-model.md/contracts's resulting shapes introduce
nothing that revisits the table above — no principle is touched differently
than assessed pre-research. Still PASS across all nine.

**Post-implementation re-check** (`/speckit-implement`, all 36 tasks
complete): still PASS across all nine principles, confirmed against what was
actually built, not just planned:
- **I**: every new/modified file is `.ts`/`.tsx` (`ObservablePlotPanel.tsx`,
  `observablePlotEncoding.ts`, `layout/types.ts`, `panelQuery.ts`,
  `sqlExpander.ts`) — no plain `.js` added.
- **II**: `ObservablePlotPanel.tsx`/`PanelLocalInput` query only through
  `services/duckdb.ts`'s existing `query()`/`distinctValues()` exports — no
  new `AsyncDuckDB`/`Worker`/connection.
- **III**: `buildPanelQuery`'s multiselect `IN (...)` branch and
  `sqlExpander.ts`'s array-value `expandInputs` handling (both found
  necessary during implementation, beyond what research.md originally
  scoped — see tasks.md's Completion note) remain plain string
  templating — no `eval()`/`Function()` introduced; the existing
  Principle-III unit test (`sqlExpander.test.ts`'s "never calls eval()"
  case) still passes unchanged.
- **IV**-**IX**: unchanged from the pre-implementation assessment — no new
  config file type, no browser I/O beyond Parquet-backed views, `@observablehq/plot`
  is the constitution's own pinned choice, no reference-repo pattern applies,
  no Python code touched.

No unjustified violations; Complexity Tracking remains empty — every shared-
module change (`buildPanelQuery`, `sqlExpander.expand()`) landed additive/
backward-compatible, verified by its own dedicated checkpoint (T004, T007)
before anything was built on top of it, exactly as planned.

## Project Structure

### Documentation (this feature)

```text
specs/007-observable-plot-panel/
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md              # Phase 1 output
├── quickstart.md              # Phase 1 output
├── contracts/                 # Phase 1 output
│   └── observable-plot-panel.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

Single-project web frontend, additive to `001`-`006`. Only the paths this
feature creates/touches are listed.

```text
src/
├── layout/
│   └── types.ts                    # modified — DataBoundPanelConfigBase.filter
│                                     # widened (research.md §1); +
│                                     # ObservablePlotInputConfig,
│                                     # ObservablePlotPanelConfig
├── services/
│   └── sqlExpander.ts               # modified — + `inputs` placeholder kind,
│                                     # + optional inputState param on expand()
│                                     # (research.md §2, additive/backward-compat)
└── panels/
    ├── panelQuery.ts                 # modified — buildPanelQuery rewritten to
    │                                  # normalize both filter shapes
    │                                  # (research.md §1) — existing string-form
    │                                  # behavior preserved byte for byte
    ├── registry.tsx                  # modified — + 'observable-plot' entry
    ├── observablePlotEncoding.ts     # new — pure, DOM-free encoding
    │                                  # resolution (research.md §4/§6)
    └── ObservablePlotPanel.tsx       # new — the React/DOM layer (see
                                       # contracts/observable-plot-panel.md)

tests/
├── unit/
│   ├── panelQuery.test.ts            # extended (exists) — new
│   │                                  # Record<string,string> filter-shape
│   │                                  # cases, existing cases unchanged
│   ├── sqlExpander.test.ts           # extended (exists) — new
│   │                                  # inputs-placeholder cases
│   └── observablePlotEncoding.test.ts # new — pure resolution logic
└── integration/
    └── observablePlotPanel.spec.ts   # new — Playwright: mark rendering
                                        # (>=2 mark types), global-filter
                                        # reactivity, 004 resize/zero-refetch
                                        # correctness, panel-local input
                                        # behavior + cross-panel isolation +
                                        # expand/collapse persistence,
                                        # empty/error states, mixed-panel-type
                                        # tab rendering
```

**Structure Decision**: Single-project layout, additive to `001`-`006`. No
new top-level directory — this feature is scoped to `panels/` (one new
component, one new pure module) plus modifications to two already-shared
seams (`layout/types.ts`'s typed-config layer, `services/sqlExpander.ts`'s
placeholder dispatch) and one already-shared function's internals
(`panelQuery.ts`'s `buildPanelQuery`) — a real, larger footprint than
`006-markdown-panel`'s single-base-split touch, reflecting this feature's
own larger scope (spec.md's Grammar findings; research.md §1/§2/§8).

## Complexity Tracking

*No entries — Constitution Check reported no unjustified violations.*
