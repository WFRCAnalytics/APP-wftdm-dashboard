# Implementation Plan: Hierarchical Chart Panels (Zoomable Treemap & Sunburst)

**Branch**: `058-hierarchical-chart-panels` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/058-hierarchical-chart-panels/spec.md`

## Summary

Add two new panel types — `treemap` and `sunburst` — for rendering
genuinely hierarchical (parent-child) data as interactive, zoomable
diagrams, filling a confirmed gap (§1) that Observable Plot, this app's
default charting library, cannot fill at all. Both share one underlying
"D3 chart host" architecture (§6) for query/data-binding, loading/empty/
error state, and theme-token resolution — the same `useEffect`+`ref`
wrapping shape `ObservablePlotPanel.tsx` already establishes for a
non-React rendering library — while each supplies its own renderer
function implementing the real, current, canonical D3 zoom mechanics for
its specific diagram (§3a/§3b), since the two chart types' zoom
interactions are genuinely different D3 idioms, not a shared drawing
routine. First real content is the already-published `purpose_mode_flow`
metric (§2) — zero new `summarize.yaml` metric needed.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), matching this app's
existing `src/` codebase — no new language/runtime.

**Primary Dependencies**: React 18 (existing); `d3-hierarchy` and
`d3-shape` (**new** dependencies — confirmed absent as direct
dependencies today, research.md §7/§7a; `d3-shape` is for `d3.arc()`
only, needed by the sunburst renderer). `d3-selection`/`d3-transition`/
`d3-scale` are deliberately NOT added — reimplemented as plain functions/
raw DOM manipulation, matching `SankeyPanel.tsx`'s own established
precedent (research.md §7a). No new UI-primitive/CSS dependency —
theming reuses existing `--chart-1..5` tokens and the established
`getComputedStyle()` resolution technique (research.md §5).

**Storage**: N/A directly — both panel types query the existing shared
DuckDB-WASM instance (`services/duckdb.ts`) via the existing
`panelQuery.ts`/`sqlExpander.ts` mechanism, unmodified. No new storage or
persistence of any kind.

**Testing**: Vitest (unit — the flat-rows-to-hierarchy transform and any
other pure logic module, matching every prior panel type's own
`rechartsEncoding.ts`/`sankeyGraph.ts`/`observablePlotEncoding.ts`
precedent) + Playwright (integration — real render, real zoom
interaction, real computed-style dual-theme verification, matching this
project's established per-panel-type test convention).

**Target Platform**: Browser (Chromium, matching this app's existing
Playwright test target and its no-Mapbox/no-Webpack/Vite-only
constraints) — SVG rendering via D3, hosted inside this app's existing
React panel-card layout.

**Project Type**: Existing single-repo web dashboard application — this
feature is two new panel types within the existing `src/panels/` +
`panels/registry.tsx` structure, not a new project or service.

**Performance Goals**: No numeric SLA beyond this app's own existing,
established panel-render/interaction responsiveness (matching how prior
panel-type plans in this project have framed this — e.g.
`029-shadcn-chart-panel`'s own plan) — a zoom-in/zoom-out transition
should feel as immediate as this app's existing chart panel interactions
(hover tooltips, 004's expand/collapse), not introduce a new class of
perceptible lag.

**Constraints**: Must follow the established panel pattern (a React
function component receiving a single `config` prop, querying
`services/duckdb.ts` by direct import, registered in
`panels/registry.tsx` as a lazy-loaded entry) — constitution Development
Workflow section, non-negotiable. No `eval()` (constitution Principle
III). No `localStorage`/`sessionStorage` (Principle VI). Zoom-in/out MUST
NOT trigger a new DuckDB query (FR-014) — pure client-side state/redraw
against the already-fetched result.

**Scale/Scope**: Two new panel types, one shared host architecture, two
renderer functions, one new pure data-transform module (flat rows →
`d3.hierarchy`-ready nested structure), one new real demo panel per chart
type (both against `purpose_mode_flow`) on `dashboard-8-test.yaml` (this
project's own established "exercise a panel type's own mechanics, not
part of the real calibration story" venue — see `040-test-suite-
migration`'s own precedent for `sankey`/`recharts`) — no existing
dashboard content, panel type, or query mechanism is modified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (TypeScript Throughout, React Permitted When Needed)** —
  PASS. New code is TypeScript `.tsx`/`.ts`, following the established
  panel pattern; React is already adopted.
- **Principle II (DuckDB-WASM off main thread, one shared instance)** —
  PASS. Both panel types query via the existing `services/duckdb.ts`
  singleton, unmodified; no new connection/instance of any kind.
- **Principle III (No `eval()`)** — PASS. No dynamic code execution
  anywhere in this feature; SQL is built via the existing, unmodified
  `panelQuery.ts`/`sqlExpander.ts` string-templating mechanism.
- **Principle IV (YAML parsed at runtime)** — PASS. `path`/`value`/
  `color_scheme` (research.md §4) are ordinary `dashboard-*.yaml` fields,
  parsed at runtime exactly like every other panel type's own grammar; no
  build-time baking.
- **Principle V (Parquet-only browser I/O)** — PASS. No new data-format
  path; both panel types consume the same already-published Parquet-backed
  query results every other panel type does.
- **Principle VI (Fixed Technology Choices)** — PASS, with one **required
  amendment** (not a violation): `d3-hierarchy` is a new charting-layer
  dependency, not a CSS framework/component library/icon set (the
  categories Principle VI's fixed-choice list actually restricts) — the
  same category `d3-sankey` already occupies for the `sankey` panel type.
  Per the existing "Charts — Sankey" row's own precedent, the Technology
  Stack Reference table needs a new row, **"Charts — Hierarchical | D3
  (`d3-hierarchy`)"** — a MINOR constitution amendment (existing guidance
  materially expanded: a new named technology for a new capability),
  matching this file's own established precedent for the identical class
  of change (2.2.0→2.3.0's `@deck.gl/layers` addition; the existing
  "Charts — Sankey" row itself). This amendment is scheduled as part of
  this feature's own implementation (not deferred), the same way
  `029-shadcn-chart-panel` amended the table for Recharts.
- **Principle VII (Minimal, fixed config file set)** — PASS. No new
  config file type; `path`/`value`/`color_scheme` are new FIELDS inside
  the existing `dashboard-*.yaml` panel grammar, not a new file.
- **Principle VIII (Reuse proven reference implementations)** — PASS,
  extended in spirit. Neither the official D3 zoomable-treemap nor
  zoomable-sunburst notebook is one of this principle's five named
  MUST-copy repos, but research.md §3 documents fetching and reusing
  their real, current techniques directly, matching this principle's own
  underlying rationale (re-deriving proven interaction mechanics from
  scratch risks reintroducing bugs already solved).
- **Principle IX (Fixed Python/JS source split)** — PASS. This feature
  touches only `src/`; no Python package changes.

**Result**: No unjustified violations. One expected, in-scope
constitution amendment (Technology Stack Reference table row addition) —
recorded here, not in Complexity Tracking, since it is not a deviation
requiring justification, just a documentation update this feature's own
implementation will make (matching `029`'s own identical precedent).

**Post-Phase-1 re-check**: re-verified against the concrete design in
`data-model.md`/`contracts/`/Project Structure below — nothing in the
actual host/renderer split, the two new config types, or the new
`hierarchyData.ts` transform introduces a gate concern the pre-research
pass above didn't already anticipate. Notably: `HierarchicalChartHost.tsx`
still queries exclusively through the existing `services/duckdb.ts`
singleton (Principle II intact even with two chart types sharing one
host — no second connection, no per-renderer query path); `path`/`value`
stay plain YAML fields with no runtime `eval()`/dynamic code path
(Principle III intact even though `path` is an array, a new shape for
this app's grammar, but still parsed data, not executed code). PASS,
unchanged from the pre-research gate above.

## Project Structure

### Documentation (this feature)

```text
specs/058-hierarchical-chart-panels/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This is an existing single-repo web dashboard application
(`src/` = TypeScript app, `python/` = post-processor, per constitution
Principle IX) — this feature adds files following the exact existing
`panels/` layout convention every prior panel type already uses (see
CLAUDE.md's own `src/panels/` tree), it does not introduce a new
top-level structure:

```text
src/
├── layout/
│   └── types.ts                    # MODIFIED: + HierarchicalPanelConfigBase
│                                    #   (path/value/color_scheme,
│                                    #   research.md §4), TreemapPanelConfig,
│                                    #   SunburstPanelConfig; both added to
│                                    #   the PanelConfig union.
├── panels/
│   ├── registry.tsx                 # MODIFIED: + 'treemap'/'sunburst'
│   │                                 #   lazy() entries (matching the
│   │                                 #   existing 10-entry convention).
│   ├── expandablePanelTypes.ts       # MODIFIED: both new types added to
│   │                                 #   EXPANDABLE_PANEL_TYPES (an
│   │                                 #   interactive zoomable chart
│   │                                 #   benefits from 004's expand-to-
│   │                                 #   dialog room, matching table/
│   │                                 #   plotly/sankey/flowmap/zonemap's
│   │                                 #   own default).
│   ├── hierarchyData.ts              # NEW, pure — flat tidy query rows
│   │                                 #   -> a d3.hierarchy()-ready nested
│   │                                 #   structure, grouped by `path` in
│   │                                 #   order, leaves valued by `value`
│   │                                 #   (research.md §4). Vitest-covered,
│   │                                 #   same split-pure-logic-out
│   │                                 #   convention as rechartsEncoding.ts/
│   │                                 #   sankeyGraph.ts/
│   │                                 #   observablePlotEncoding.ts.
│   ├── HierarchicalChartHost.tsx     # NEW — the shared host (research.md
│   │                                 #   §6): query/fetch effect (reusing
│   │                                 #   resolveQueryAndPairs()/
│   │                                 #   ensureRegistered() unmodified,
│   │                                 #   exactly like every other
│   │                                 #   data-bound panel type), loading/
│   │                                 #   empty/error states, container
│   │                                 #   ref + mount/redraw/unmount effect
│   │                                 #   split (ObservablePlotPanel.tsx's
│   │                                 #   own shape), theme-token
│   │                                 #   resolution (research.md §5).
│   │                                 #   Accepts a renderer function as a
│   │                                 #   prop — never imports either
│   │                                 #   concrete renderer directly.
│   ├── hierarchyRenderers/
│   │   ├── treemapRenderer.ts        # NEW — the real, current D3 zoomable-
│   │   │                             #   treemap technique (research.md
│   │   │                             #   §3a): d3.treemap + custom tile(),
│   │   │                             #   scale-domain zoom state, DOM-group
│   │   │                             #   fade in/out per zoom level.
│   │   └── sunburstRenderer.ts       # NEW — the real, current D3 zoomable-
│   │                                 #   sunburst technique (research.md
│   │                                 #   §3b): d3.partition + d3.arc,
│   │                                 #   per-node current/target state,
│   │                                 #   d3.interpolate tweening,
│   │                                 #   arcVisible/labelVisible helpers.
│   ├── TreemapPanel.tsx              # NEW, thin — <HierarchicalChartHost
│   │                                 #   config={config}
│   │                                 #   renderer={treemapRenderer} />,
│   │                                 #   matching every other panel type's
│   │                                 #   own thin-component-over-shared-
│   │                                 #   logic shape.
│   └── SunburstPanel.tsx             # NEW, thin — same shape, sunburstRenderer.
public/
└── demo-dashboard-config/
    └── dashboard-8-test.yaml         # MODIFIED — new real treemap/sunburst
                                       #   panels against purpose_mode_flow
                                       #   (research.md §2), matching the
                                       #   sankey/recharts precedent already
                                       #   established on this tab by
                                       #   040-test-suite-migration.

tests/
├── unit/
│   └── hierarchyData.test.ts         # NEW — pure transform coverage.
└── integration/
    ├── treemapPanel.spec.ts          # NEW — real render, real zoom-in/
    │                                 #   zoom-out, real dual-theme
    │                                 #   computed-style checks, shared
    │                                 #   empty/error state, no-refetch-on-
    │                                 #   zoom (FR-014).
    └── sunburstPanel.spec.ts         # NEW — same coverage, sunburst-
                                       #   specific interaction shape.
```

**Structure Decision**: Extends the existing `src/panels/` structure
directly — no new top-level directory, no new project. The
host/renderer split (one shared `HierarchicalChartHost.tsx` + two small,
chart-type-specific renderer modules under a new `hierarchyRenderers/`
subdirectory) is the concrete implementation of research.md §6's
architectural decision; `TreemapPanel.tsx`/`SunburstPanel.tsx` stay thin
specifically so `panels/registry.tsx`'s existing "one named export per
panel type, one `React.lazy()` entry per type" convention needs no
special-casing for a shared-host panel family.

## Complexity Tracking

*No entries — the Constitution Check above found no violations requiring
justification. The one real deviation from a strict reading of Principle
VI (a new charting dependency) is a documentation amendment already
provided for by that Principle's own established "Charts" table-row
precedent, not an unjustified exception.*
