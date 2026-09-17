# Implementation Plan: Pie & Radar Chart Panels

**Branch**: `060-radar-pie-charts` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/060-radar-pie-charts/spec.md`

## Summary

Add two new panel types — `pie` and `radar` — filling a confirmed gap
(research.md §1) that Observable Plot, this app's default charting
library, cannot fill at all (no arc/pie mark, no polar coordinate
system). Both are standalone, D3-rendered panel components following
`SankeyPanel.tsx`'s own established shape (a self-contained
fetch-effect + render-and-swap-effect component, not a shared "host"
the way `treemap`/`sunburst` share `HierarchicalChartHost.tsx` — pie and
radar have genuinely different config grammars and neither has a zoom
concept, so a forced shared host would buy nothing treemap/sunburst's
identical-grammar-plus-zoom sharing does). `d3-shape` — already a fixed,
installed dependency (`^3.2.0`, used today only by the sunburst
renderer's `d3.arc()`) — supplies both `d3.pie()`/`d3.arc()` for the pie
chart; the radar chart needs no D3 layout package at all, just hand-rolled
polar trigonometry, matching this project's own established "D3 layout
math (where a real algorithm exists) + plain DOM/SVG for everything else"
convention. **No new npm dependency is added by this feature.** First
real demo content reuses two already-published, real `summarize.yaml`
metrics — `trip_purpose_share` (pie, single-scenario pin) and
`trip_mode_share` (radar, unpinned multi-scenario `$scenario` union,
`series: scenario`) — zero new post-processor metric needed.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), matching this app's
existing `src/` codebase — no new language/runtime.

**Primary Dependencies**: React 18 (existing); `d3-shape` (existing,
already a direct dependency — `d3.pie()`/`d3.arc()` for the pie chart).
No new dependency for the radar chart (hand-rolled polar math, no D3
layout package — confirmed no D3 "radar chart" layout module exists in
this project's own dependency tree or is warranted for what is
fundamentally trigonometry over N evenly-spaced angles). `d3-scale-
chromatic` (existing) reused for the optional named `color_scheme`.

**Storage**: N/A directly — both panel types query the existing shared
DuckDB-WASM instance (`services/duckdb.ts`) via the existing
`panelQuery.ts`/`sqlExpander.ts` mechanism, unmodified. No new storage or
persistence of any kind.

**Testing**: Vitest (unit — the two pure rows-to-chart-geometry
transforms, matching every prior panel type's own `sankeyGraph.ts`/
`hierarchyData.ts`/`rechartsEncoding.ts` precedent) + Playwright
(integration — real render, real hover-tooltip content, real dual-theme
computed-style verification, matching this project's established
per-panel-type test convention).

**Target Platform**: Browser (Chromium, matching this app's existing
Playwright test target) — SVG rendering via plain
`document.createElementNS()` (never `d3-selection`/`d3-transition`,
matching `SankeyPanel.tsx`'s/`HierarchicalChartHost.tsx`'s own
established convention), hosted inside this app's existing React
panel-card layout.

**Project Type**: Existing single-repo web dashboard application — this
feature adds two new panel types within the existing `src/panels/` +
`panels/registry.tsx` structure, not a new project or service.

**Performance Goals**: No numeric SLA beyond this app's own existing,
established panel-render/interaction responsiveness — a pie/radar render
or resize should feel as immediate as `SankeyPanel.tsx`'s existing
ResizeObserver-driven redraw, matching how prior chart-panel-type plans
in this project have framed this (`029-shadcn-chart-panel`,
`058-hierarchical-chart-panels`).

**Constraints**: Must follow the established panel pattern (a React
function component receiving a single `config` prop, querying
`services/duckdb.ts` by direct import, registered in `panels/registry.tsx`
as a lazy-loaded entry) — constitution Development Workflow section,
non-negotiable. No `eval()` (Principle III). No `localStorage`/
`sessionStorage` (Principle VI). Neither chart type introduces a
`comparison: diff`/baseline-comparison mode — out of scope per spec.md's
Assumptions, matching `SankeyPanelConfig`'s own precedent of not mixing
in `ComparisonCapablePanelConfig` either.

**Scale/Scope**: Two new panel types, two standalone panel components
(no shared host — see Summary), two new pure data-transform modules, one
small new shared presentational legend component (genuinely identical
need in both — a color-swatch + label list — unlike the two components'
genuinely different chart geometry), one new shared tiny color-scheme
resolution module (consolidating what `sankeyColor.ts`/`hierarchyColor.ts`
would otherwise duplicate a third and fourth time within this same
feature), two real demo panels (one pie, one radar) added to already-live
demo dashboard tabs — no existing dashboard content, panel type, or query
mechanism is modified.

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
  `panelQuery.ts`/`sqlExpander.ts` string-templating mechanism (the exact
  same `buildPanelQuery()` + `sqlExpander.expand()` pair
  `SankeyPanel.tsx` already uses, reused verbatim).
- **Principle IV (YAML parsed at runtime)** — PASS. `category`/`value`
  (pie) and `axis`/`value`/`series` (radar) are ordinary `dashboard-*.yaml`
  fields, parsed at runtime exactly like every other panel type's own
  grammar; no build-time baking.
- **Principle V (Parquet-only browser I/O)** — PASS. No new data-format
  path; both panel types consume the same already-published Parquet-backed
  query results every other panel type does.
- **Principle VI (Fixed Technology Choices)** — PASS, with one **required
  amendment** (not a violation), matching `058-hierarchical-chart-panels`'
  own precedent exactly: the Technology Stack Reference table needs a new
  row, **"Charts — Pie/Radar | D3 (`d3-shape`)"**, immediately below the
  existing "Charts — Hierarchical" row — `d3-shape` is already a pinned,
  installed dependency (added for the sunburst renderer's `d3.arc()`), so
  this amendment names an EXISTING technology being reused for a new
  capability rather than introducing a new package, but still follows this
  file's own established "one row per charting capability" documentation
  convention (the Sankey row and Hierarchical row are each scoped to their
  own capability, not merged). A MINOR amendment (existing guidance
  materially expanded — a new named capability row, not a wording fix),
  matching the versioning-policy reasoning the 2.4.2→2.5.0 amendment
  already used for the identical class of change. Scheduled as part of
  this feature's own implementation, not deferred (same as `029`'s and
  `058`'s own precedent).
- **Principle VII (Minimal, fixed config file set)** — PASS. No new
  config file type; `category`/`value`/`axis`/`series`/`color_scheme` are
  new FIELDS inside the existing `dashboard-*.yaml` panel grammar, not a
  new file.
- **Principle VIII (Reuse proven reference implementations)** — PASS, not
  applicable — no DuckDB-WASM/MapLibre/spatial-SQL/Vite-setup work is
  involved; this principle's five named repos have no bearing on a pure
  SVG-charting feature (the same conclusion `058`'s own Constitution Check
  reached for D3 chart geometry, satisfied there via direct research
  instead — this feature's own research.md §3 does the equivalent for the
  standard pie-chart/radar-chart geometry, both textbook D3 patterns with
  no ambiguity requiring an external reference implementation).
- **Principle IX (Fixed Python/JS source split)** — PASS. This feature
  touches only `src/`; no Python package changes.

**Result**: No unjustified violations. One expected, in-scope
constitution amendment (Technology Stack Reference table row addition) —
recorded here, not in Complexity Tracking, since it documents an existing
dependency's expanded use, not a deviation requiring justification.

**Post-Phase-1 re-check**: re-verified against the concrete design in
`data-model.md`/`contracts/` below — nothing in the two new panel
components, the two new pure transform modules, or the shared legend/color
modules introduces a gate concern the pre-research pass above didn't
already anticipate. Both panel components query exclusively through the
existing `services/duckdb.ts` singleton (Principle II intact); `category`/
`value`/`axis`/`series` stay plain YAML fields with no runtime `eval()`/
dynamic code path (Principle III intact). PASS, unchanged from the
pre-research gate above.

## Project Structure

### Documentation (this feature)

```text
specs/060-radar-pie-charts/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── pie-panel.md
│   └── radar-panel.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This is an existing single-repo web dashboard application
(`src/` = TypeScript app, `python/` = post-processor, per constitution
Principle IX) — this feature adds files following the exact existing
`panels/` layout convention every prior panel type already uses (see
CLAUDE.md's own `src/panels/` tree); it does not introduce a new
top-level structure:

```text
src/
├── layout/
│   └── types.ts                 # MODIFIED: + PieChartPanelConfig,
│                                 #   RadarChartPanelConfig (both extend
│                                 #   DataBoundPanelConfigBase only —
│                                 #   no ComparisonCapablePanelConfig
│                                 #   mixin, matching SankeyPanelConfig's
│                                 #   own precedent); both added to the
│                                 #   PanelConfig union.
├── panels/
│   ├── registry.tsx              # MODIFIED: + 'pie', 'radar' lazy entries
│   ├── expandablePanelTypes.ts   # MODIFIED: + 'pie', 'radar'
│   ├── PieChartPanel.tsx         # NEW — standalone component, mirrors
│   │                             #   SankeyPanel.tsx's exact shape
│   │                             #   (mount-tooltip effect, fetch effect,
│   │                             #   render-and-swap effect, no separate
│   │                             #   unmount teardown)
│   ├── pieData.ts                # NEW, pure — rows -> aggregated
│                                  #   {category,value}[] (sums duplicate
│                                  #   categories, excludes non-positive
│                                  #   values, reports excludedCount —
│                                  #   mirrors sankeyGraph.ts's
│                                  #   buildFlowGraph() convention) +
│                                  #   d3.pie()/d3.arc() wedge-geometry
│                                  #   computation (mirrors sankeyGraph.ts's
│                                  #   layoutFlowGraph() convention: pure,
│                                  #   DOM-free, Vitest-testable)
│   ├── RadarChartPanel.tsx       # NEW — standalone component, same shape
│   │                             #   as PieChartPanel.tsx
│   ├── radarData.ts              # NEW, pure — rows -> {axes: string[],
│   │                             #   series: {name, values}[]} (missing
│   │                             #   axis value per series treated as 0,
│   │                             #   FR-... edge case) + polar-coordinate
│   │                             #   vertex-point computation (hand-rolled
│   │                             #   trigonometry, no D3 layout package)
│   ├── polarChartColor.ts        # NEW, pure — named color_scheme
│   │                             #   resolution, mirrors sankeyColor.ts/
│   │                             #   hierarchyColor.ts's identical shape,
│   │                             #   shared by BOTH new panel types
│   │                             #   (avoids a 3rd/4th near-identical
│   │                             #   copy within one feature — see
│   │                             #   research.md §5)
│   └── ChartLegend.tsx           # NEW — small shared presentational
│                                 #   component (color swatch + label
│                                 #   list), used by both PieChartPanel.tsx
│                                 #   and RadarChartPanel.tsx — genuinely
│                                 #   identical need in both, unlike their
│                                 #   different chart-geometry modules
├── tests/
│   ├── unit/
│   │   ├── pieData.test.ts       # NEW
│   │   └── radarData.test.ts     # NEW
│   └── integration/
│       ├── pieChartPanel.spec.ts   # NEW — Playwright
│       └── radarChartPanel.spec.ts # NEW — Playwright
project-docs/
└── GRAMMAR.md                    # MODIFIED: + `type: pie` / `type: radar`
                                   #   reference sections (Panel types
                                   #   reference), immediately after the
                                   #   existing `type: treemap`/`sunburst`
                                   #   section
public/demo-dashboard-config/
├── dashboard-5-trip-models.yaml  # MODIFIED: + one real `type: pie` panel
│                                 #   bound to trip_purpose_share, pinned
│                                 #   to one scenario (a pie chart shows
│                                 #   exactly one series — spec.md
│                                 #   Assumptions)
└── dashboard-4-mode-choice.yaml  # MODIFIED: + one real `type: radar`
                                  #   panel bound to trip_mode_share,
                                  #   unpinned ($scenario union),
                                  #   series: scenario
.specify/memory/
└── constitution.md               # MODIFIED: + "Charts — Pie/Radar" row
                                   #   (Technology Stack Reference), MINOR
                                   #   version bump + Sync Impact Report
```

**Structure Decision**: Existing single-project layout, unchanged. This
feature is purely additive within `src/panels/`, `src/layout/types.ts`,
and `panels/registry.tsx` — the same shape every prior panel-type feature
(005 through 059) has already used; no new directory root, no new build
target, no new test runner.

## Complexity Tracking

*No entries — no Constitution Check violation requires justification. The
one recorded amendment above (Technology Stack Reference row) is an
in-scope documentation update, not a deviation.*
