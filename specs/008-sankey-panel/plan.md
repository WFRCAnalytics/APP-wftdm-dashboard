# Implementation Plan: SankeyPanel

**Branch**: `008-sankey-panel` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-sankey-panel/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add the sixth and final originally-listed panel type — `sankey` — to
`panels/registry.tsx`, following the config → query → render shape every
prior data-bound panel type already uses. The primary technical approach:
a pure `panels/sankeyGraph.ts` module turns flat query rows into a
node-link `FlowGraph` (nodes namespaced by source/target column identity —
a correction to the original spec's self-loop premise, found and reasoned
through during this planning phase, see research.md §4) and runs
`d3-sankey`'s own pure layout computation over it; `SankeyPanel.tsx` then
builds real SVG DOM from that layout's output (`d3-sankey` computes
coordinates only, never DOM — research.md §2) and rebuilds it on both data
changes and container resizes, since `d3-sankey`'s layout extent is
pixel-absolute (research.md §3, ruling out a cheap `viewBox`-style rescale).
Categorical coloring resolves `color_scheme` against `d3-scale-chromatic`'s
named exports, falling back to a new (not previously precedented in this
codebase — research.md §6) small token-derived palette when omitted.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React (function
components) — same as every panel type since `003`.

**Primary Dependencies**: `d3-sankey` (`^0.12.3`, new — research.md §1),
`d3-scale-chromatic` (`^3.1.0`, new explicit declaration of an
already-transitively-present package — research.md §1), plus
`@types/d3-sankey` (`^0.12.5`) and `@types/d3-scale-chromatic` (`^3.1.0`)
as devDependencies — neither library ships its own TypeScript types,
unlike `@observablehq/plot` (research.md §1). No other new dependency;
`services/duckdb.ts`, `hooks/useFilterState.ts`, `panels/panelQuery.ts`
(`buildPanelQuery`, `extractGlobalFilterIds`) are all reused unmodified.

**Storage**: N/A — reads existing Parquet-backed DuckDB views via the
existing query pipeline; no new persisted data or config file type
(constitution Principle VII).

**Testing**: Vitest (`panels/sankeyGraph.ts`'s `buildFlowGraph`/
`layoutFlowGraph`, `panels/sankeyColor.ts`'s `resolveNamedColorScheme` — all
DOM-free, `environment: 'node'` is sufficient, research.md §2/§7) +
Playwright (`SankeyPanel.tsx`'s real rendering, resize behavior, filter
reactivity, 004 dialog inheritance, error/empty states, the
`console.warn` exclusion signal).

**Target Platform**: Browser (Vite-built static app) — same as every other
panel type; no server-side concern.

**Project Type**: Single-project web app (existing `src/`/`tests/`
structure — no new top-level directory).

**Performance Goals**: No new goal beyond this app's existing baseline
(panel renders progressively as its own query resolves, doesn't block other
panels) — `d3-sankey`'s layout computation is O(nodes + links), trivial at
this app's realistic data scale (a handful to a few dozen mode/category
nodes, not thousands).

**Constraints**: `d3-sankey`'s layout must be recomputed on every
container-resize event, not just data changes (research.md §3) — the
ResizeObserver guard from 007 is reused specifically to avoid a redundant
rebuild loop, not merely copied for convenience.

**Scale/Scope**: One new panel type, one new pure module
(`sankeyGraph.ts`), one new small color-resolution module
(`sankeyColor.ts`), one new `SankeyPanelConfig` type, one new registry
entry. No existing shared module (`layout/types.ts`'s
`DataBoundPanelConfigBase`, `services/sqlExpander.ts`) needs modification
this time — unlike 007, this feature is purely additive to those.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v2.2.0:

- **I. TypeScript Throughout, React Permitted When Needed** — PASS.
  `SankeyPanel.tsx` is a React function component (`.tsx`); `sankeyGraph.ts`
  and `sankeyColor.ts` are pure logic with no JSX (`.ts`), same split every
  prior panel type's non-trivial logic already uses.
- **II. DuckDB-WASM Query Execution Off the Main Thread, One Shared
  Instance** — PASS. `SankeyPanel.tsx` queries via `services/duckdb.ts`'s
  existing `query()` import, same as every other panel type; no new
  connection, no new worker.
- **III. No eval()** — PASS. No SQL construction beyond
  `panelQuery.ts`/`sqlExpander.ts`'s existing string-templating, reused
  unmodified.
- **IV. YAML Parsed at Runtime** — PASS. `SankeyPanelConfig` parses from
  the same runtime `dashboard-*.yaml` fetch/parse path every panel type
  config already goes through; no build-time dashboard content.
- **V. Parquet-Only Browser Data I/O** — PASS. Reads the same
  Parquet-backed DuckDB views every other panel type reads; no new format.
- **VI. Fixed Technology Choices** — PASS. No Mapbox, no Webpack, no Web
  Storage. Adds `d3-sankey`/`d3-scale-chromatic` — neither is a choice
  this principle fixes or forbids (its enumerated list is maps/build-tool/
  storage/UI-layer only); `docs/SPEC.md`'s own Panel types table already
  names `d3-sankey` as this panel type's pinned charting choice, so this
  isn't a new technology decision being made here, just the
  already-decided one being implemented.
- **VII. Minimal, Fixed Config File Set** — PASS. No new config file type;
  `sankey` is a `type:` value inside the existing `dashboard-*.yaml`
  grammar, not a new file.
- **VIII. Reuse Proven Reference Implementations** — N/A. None of the
  designated reference repos (DuckDB-WASM/Arrow, MapLibre/flowmap.gl,
  spatial-SQL/GeoParquet, Vite+coi-serviceworker) cover Sankey-diagram
  rendering; this principle's scope doesn't reach this feature.
- **IX. Fixed Python/JS Source Split** — PASS. No Python package changes;
  all new files live under `src/`.

No violations. Complexity Tracking table below is empty.

**Post-Phase-1 re-check**: re-verified against the actual `data-model.md`/
`contracts/sankey-panel.md`/`quickstart.md` produced below, not just the
pre-research intent above. Nothing in Phase 1 design introduced a
violation: no new config file type, no new persisted state, no framework
other than React, no DuckDB-WASM main-thread usage, no `eval()`. The one
design decision worth naming here explicitly — a new token-derived
categorical color palette (research.md §6) — is additive UI styling, not a
principle-scoped technology choice (Principle VI's UI-layer list is
Tailwind/shadcn/Radix/`lucide-react`, all unchanged), so it doesn't require
a constitution amendment. Still PASS, no Complexity Tracking entries.

**Post-implementation re-check**: re-verified against what was actually
built (`src/panels/sankeyGraph.ts`, `src/panels/sankeyColor.ts`,
`src/panels/SankeyPanel.tsx`, `src/layout/types.ts`'s `SankeyPanelConfig`,
`src/panels/registry.tsx`'s new entry), not just the pre-implementation
design intent above. Still PASS across all nine principles, with two real
findings worth recording (neither is a violation):
- `panelQuery.ts`/`sqlExpander.ts` were confirmed genuinely unmodified —
  `plan.md`'s Technical Context predicted this and implementation matched
  it exactly, unlike 007 (whose Foundational phase did need real, if
  backward-compatible, changes to both).
- `d3-sankey` pulls its own nested `d3-array`/`d3-shape` copies (research.md
  §1) — real, small duplicate-code bundling, not a Principle VI violation
  (that principle's fixed-choice list is maps/build-tool/storage/UI-layer
  only; a charting library's own transitive dependency shape isn't in its
  scope). No `npm run build` bundle-size regression check was run as part
  of this feature — noted here as a known, accepted gap, not silently
  assumed harmless.

No Complexity Tracking entries were needed at any point in this feature.

## Project Structure

### Documentation (this feature)

```text
specs/008-sankey-panel/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── sankey-panel.md   # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── layout/
│   └── types.ts               # MODIFIED: + SankeyPanelConfig, + 'sankey'
│                               #   in the PanelConfig union
├── panels/
│   ├── registry.tsx            # MODIFIED: + 'sankey': SankeyPanel entry
│   ├── SankeyPanel.tsx          # NEW — the component (contracts/sankey-panel.md)
│   ├── sankeyGraph.ts           # NEW — pure rows-to-graph transform +
│   │                            #   d3-sankey layout wrapper (research.md §7)
│   └── sankeyColor.ts           # NEW — pure color_scheme name resolution
│                                #   (research.md §6)
└── (no other src/ file modified — services/, state/, hooks/,
    components/ui/ all reused unmodified, unlike 007's sqlExpander.ts/
    DataBoundPanelConfigBase changes)

tests/
├── unit/
│   ├── sankeyGraph.test.ts      # NEW
│   └── sankeyColor.test.ts      # NEW
├── integration/
│   └── sankeyPanel.spec.ts      # NEW
└── fixtures/
    ├── generate.py               # MODIFIED: + a sankey-shaped fixture table
    └── dashboard-config/
        └── dashboard-1-summary.yaml  # MODIFIED: + a type: sankey panel entry
```

**Structure Decision**: Single-project web app, unchanged from every prior
panel-type feature — no new top-level directory, no backend/frontend split.
New files land in the existing `src/panels/` (component + two pure
modules) and `src/layout/types.ts` (config type), mirroring 005/006/007's
own file placement exactly.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally empty.
