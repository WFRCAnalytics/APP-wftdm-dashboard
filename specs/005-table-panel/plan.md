# Implementation Plan: TablePanel

**Branch**: `005-table-panel` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-table-panel/spec.md`

## Summary

Add the third panel type — `table` — to the registry, following the exact
pattern `ValueBoxPanel`/`PlotlyPanel` already established (`003`): a
function component receiving a single `config` prop, `useFilterState` for
filter values, a direct `services/duckdb.ts` import for querying, and the
shared `PanelEmptyState`/`PanelErrorState` components for non-happy-path
states. `project-docs/SPEC.md`'s own description ("table | plain DOM | Sortable,
paginated") settles the technology question up front — no table library is
added; sort/search/pagination are plain client-side array operations over
an already-fetched result set, matching this project's demonstrated bias
against adding a dependency for something directly expressible with what's
already there. `project-docs/GRAMMAR.md`'s actual `type: table` grammar
(`columns`, `sort`, `pagination`, `searchable`) is real, existing, and
followed exactly — not the "derive everything, no config" framing the
feature's own initial description assumed before that grammar was checked
(spec.md's own "Resolved during specification" note). The one substantive
open design question spec.md carried into planning — what `color_scale`/
`domain` actually render as — is resolved in research.md (§4), not
deferred again: both scale endpoints reuse **existing** brand tokens
(`--brand-wfrc-blue`, `--destructive`), introducing zero new colors, with
a fixed-at-`0` diverging midpoint (not the domain's geometric center).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), same as `001`-`004`

**Primary Dependencies**: **None new.** Existing: `react`/`react-dom`,
`lucide-react` (empty-state icon), the existing `Card`/`Button` shadcn
components, `003`'s panel registry and query chain
(`panelQuery.ts`/`sqlExpander.ts`/`services/duckdb.ts`), `004`'s
`panelCard.tsx`/`panelExpandHost.tsx` (consumed automatically, not
modified). `project-docs/SPEC.md`'s own "table | plain DOM" description is taken
as the deciding signal against adding a table library (e.g. TanStack
Table) — research.md §1 confirms this rather than assuming it.

**Component source**: New `src/panels/TablePanel.tsx` (the React/DOM
layer, matching `ValueBoxPanel.tsx`/`PlotlyPanel.tsx`'s existing shape);
new `src/panels/tableLogic.ts` (pure sort/filter/column-resolution/color-
scale logic, split out for the same reason `003` split `plotlyTraces.ts`
out of `PlotlyPanel.tsx` — Vitest-testable pure functions, not requiring
a DOM); new `src/panels/formatValue.ts` (extracted from
`ValueBoxPanel.tsx`'s existing local `formatValue`, so `TablePanel.tsx`
doesn't duplicate the same Python-style-format-string parser — research.md
§2). Modified: `src/layout/types.ts` (new `TableColumnConfig`/
`TablePanelConfig` types), `src/panels/registry.tsx` (new `table` entry),
`src/panels/ValueBoxPanel.tsx` (imports `formatValue` from the new shared
module instead of defining its own copy).

**Storage**: N/A — no new persistence. Consumes the existing query chain
unmodified; `panelQuery.ts`'s `buildPanelQuery` already falls through to
its `SELECT *` branch for any config without a singular `column` field
(confirmed by reading its actual current source, not assumed), so a
`TablePanelConfig` (which has `columns` — plural, optional — not
`column`) needs no change there.

**Testing**: Vitest for the new pure logic module (`tableLogic.ts`) and
the extracted `formatValue.ts` — matching `003`'s established split
(pure logic → Vitest, anything that renders → Playwright). Playwright:
`tests/integration/tablePanel.spec.ts`, extending `dashboardShell.spec.ts`/
`panelExpand.spec.ts`'s existing real-browser/real-fixture-data pattern —
including a check that `004`'s expand-to-dialog mechanism applies to
`table` panels with zero extra wiring (FR-015/SC-005), and that a table's
sort/search/page state survives that expand/collapse round trip the same
way `PlotlyPanel`'s zoom state did in `004` (both are just consequences of
being the same mounted component instance either way — worth confirming
directly rather than assuming it carries over unchanged).

**Target Platform**: Browser — same as `001`-`004`

**Project Type**: Single-project web frontend, additive to `001`-`004`

**Performance Goals**: N/A explicit numeric target; SC-002's "no visible
loading delay" for sort is a structural guarantee (client-side array sort
over already-in-memory rows), not a latency budget to separately measure.

**Constraints**: Sort/pagination/search MUST NOT trigger any additional
query (FR-012) — enforced by construction, since all three operate on the
`rows` state already set by the panel's one data-fetch effect, never
re-invoking `query()`. The table MUST inherit `004`'s expand mechanism
with zero panel-type-specific wiring (FR-015) — satisfied automatically by
being a normal registry entry; `panelCard.tsx`/`panelExpandHost.tsx` need
no changes. `color_scale` cell backgrounds MUST NOT reduce text
legibility at any point in the scale (accessibility carry-over from
`002`/`003`'s existing token-contrast rigor, not a new bar invented here).

**Scale/Scope**: 1 new panel component (`TablePanel.tsx`), 1 new pure
logic module (`tableLogic.ts`), 1 new extracted shared module
(`formatValue.ts`), 2 new types in `layout/types.ts`, 1 new registry
entry, 1 modified existing file (`ValueBoxPanel.tsx`, import-only
change), 1 new Vitest spec, 1 new Playwright spec. No new panel type
beyond `table` itself (`flowmap`/`zonemap`/`sankey`/`markdown`/
`observable-plot` remain deferred, per spec.md's own stated boundary).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | All new/modified files are `.tsx`/`.ts`; React already adopted — this feature is a third, ordinary consumer of the already-established panel pattern, not a new adoption decision | PASS |
| II. DuckDB-WASM off the main thread, one shared instance | Not touched — `TablePanel.tsx` queries through `services/duckdb.ts`'s existing `query()` by direct import, exactly like `ValueBoxPanel.tsx`/`PlotlyPanel.tsx`; no new `AsyncDuckDB`/`Worker`/connection usage | PASS |
| III. No `eval()` | `TablePanel.tsx` builds no SQL of its own — `panelQuery.ts`'s existing `SELECT *` branch (unmodified) already covers it; sort/search/pagination are plain in-memory array operations, not SQL construction of any kind | PASS |
| IV. YAML parsed at runtime | `columns`/`sort`/`pagination`/`searchable` are parsed from `dashboard-*.yaml` at runtime via the existing `layout/types.ts` parsing seam (extended, not replaced) — no build-time baking | PASS |
| V. Parquet-only browser I/O | Not applicable — no new data I/O path; queries the same already-registered views every other panel type queries | PASS (N/A) |
| VI. Fixed Technology Choices | No new UI library — `project-docs/SPEC.md`'s own "plain DOM" description for `type: table` is honored directly (research.md §1); styling uses the existing Tailwind/token set, no new CSS framework | PASS |
| VII. Minimal, Fixed Config File Set | No new config file type; `columns`/`sort`/`pagination`/`searchable` are new *keys* within the existing `dashboard-*.yaml` type's already-documented `type: table` grammar, not a new file | PASS |
| VIII. Reuse Proven Reference Implementations | N/A — none of the four named reference repos (DuckDB-WASM/Arrow, MapLibre+flowmap.gl/deck.gl, spatial-SQL/GeoParquet, Vite+coi-serviceworker) cover data tables; this principle's named scope doesn't reach this feature | PASS (N/A) |
| IX. Fixed Python/JS Source Split | No Python package code touched; all new files under `src/` | PASS |

No unjustified violations. Complexity Tracking table is not needed (left
empty below).

**Post-Phase 1 re-check**: research.md's decisions (no new table-library
dependency; `formatValue.ts` extraction; `tableLogic.ts` pure-module
split; the `color_scale` token/midpoint decision) and data-model.md/
contracts's resulting shapes introduce nothing that revisits the table
above — no principle is touched differently than assessed pre-research.
Still PASS across all nine.

## Project Structure

### Documentation (this feature)

```text
specs/005-table-panel/
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/                  # Phase 1 output
│   ├── table-panel.md
│   └── table-logic.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

Single-project web frontend, additive to `001`-`004`. Only the paths
this feature creates/touches are listed.

```text
src/
├── layout/
│   └── types.ts                 # modified — + TableColumnConfig,
│                                 # TablePanelConfig, added to the
│                                 # PanelConfig union
└── panels/
    ├── registry.tsx              # modified — + 'table': TablePanel
    ├── formatValue.ts            # new — extracted from ValueBoxPanel.tsx's
    │                              # existing local formatValue (research.md §2)
    ├── ValueBoxPanel.tsx          # modified — imports formatValue from the
    │                              # new shared module instead of its own copy
    ├── TablePanel.tsx             # new — the React/DOM layer (see
    │                              # contracts/table-panel.md)
    └── tableLogic.ts              # new — pure column-resolution/sort/
                                    # filter/color-scale logic, no DOM
                                    # dependency (see contracts/table-logic.md)

tests/
├── unit/
│   ├── formatValue.test.ts      # new — moves/extends ValueBoxPanel's
│   │                             # existing inline format-string coverage
│   └── tableLogic.test.ts       # new — column resolution, sort
│                                 # (numeric vs. string), search filtering,
│                                 # color-scale mapping (incl. the
│                                 # fixed-midpoint decision, research.md §4)
└── integration/
    └── tablePanel.spec.ts       # new — Playwright: render from columns:
                                  # config and from derived shape, sort,
                                  # paginate, search-across-full-set,
                                  # 004 expand-dialog inheritance +
                                  # state persistence across that round trip
```

**Structure Decision**: Single-project layout, additive to `001`-`004`.
No new top-level directory — this feature is scoped to `panels/` (one new
component, two new pure modules, one small edit to an existing panel) and
one small addition to `layout/types.ts`'s already-established typed-config
seam.

## Complexity Tracking

*No entries — Constitution Check reported no unjustified violations.*
