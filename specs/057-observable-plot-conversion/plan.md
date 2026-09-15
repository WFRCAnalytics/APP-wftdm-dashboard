# Implementation Plan: Observable Plot Chart Consolidation

**Branch**: `057-observable-plot-conversion` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/057-observable-plot-conversion/spec.md`

## Summary

Re-author the demo dashboard's real chart panels (4 Plotly, 2 Recharts — 6
panels across 4 `dashboard-*.yaml` tabs) to use `type: observable-plot`
instead, and convert the value-box sparkline's shared rendering component
from bare Recharts primitives to Observable Plot. No query/data-layer code
changes anywhere (`panelQuery.ts`, `sqlExpander.ts` untouched) — this is a
YAML re-authoring + one component swap, using panel grammar and encoding
logic (`ObservablePlotPanelConfig`, `resolveObservablePlotEncoding()`) that
already exists and is already proven by the app's five existing
Observable Plot panels. The Sankey panel is explicitly excluded (confirmed:
Observable Plot has no native or composable Sankey support) and stays on
its current D3 (`d3-sankey`) implementation, unchanged. The deliberately
broken/edge-case 8th test tab is explicitly untouched. The `plotly` and
`recharts` panel types, their components, and their registry entries all
remain — this feature stops using them in the real demo content, it does
not remove or deprecate them.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3, existing Vite build — no version changes

**Primary Dependencies**: `@observablehq/plot` (already installed, already used by `ObservablePlotPanel.tsx`/`resolveObservablePlotEncoding()`) — no new dependency added. `plotly.js-dist-min` and `recharts` remain installed and registered (both panel types stay supported; `dashboard-8-test.yaml`'s own broken-panel coverage still exercises both) but are no longer referenced by any real demo-content panel after this feature, aside from `recharts`'s continued, unrelated use as the underlying engine of `components/ui/chart.tsx` (shadcn's chart primitives) if any non-panel surface still references it — confirmed not the case; `RechartsPanel.tsx` is its only real consumer.

**Storage**: N/A — no change to Parquet/DuckDB-WASM query layer

**Testing**: Vitest (`tests/unit/`, e.g. `observablePlotEncoding.test.ts`) + Playwright (`tests/integration/*.spec.ts`)

**Target Platform**: Browser (Vite static build, GitHub Pages deployment) — unchanged

**Project Type**: Web (single frontend app + separate Python post-processor; this feature touches only `src/` and `public/demo-dashboard-config/` and `tests/`)

**Performance Goals**: Parity — a converted panel's render time and interactivity must not regress relative to its Plotly/Recharts predecessor; no new, explicit performance target introduced by this feature.

**Constraints**: Zero changes to `panels/panelQuery.ts`, `services/sqlExpander.ts`, or any other panel type's own component (FR-005, FR-011). `public/demo-dashboard-config/dashboard-8-test.yaml` MUST NOT be modified (FR-010). Every existing Playwright spec that asserts on a converted panel's engine-specific DOM (`.js-plotly-plot`, `.recharts-wrapper`) or engine-specific interaction (Plotly legend click-to-toggle) must be updated to Observable Plot's own established test convention (`.observable-plot-chart svg[viewBox] ...`), not left failing.

**Scale/Scope**: 6 real chart-panel conversions (4 Plotly, 2 Recharts) across 4 `dashboard-*.yaml` files; 1 shared component conversion (`panels/valueBoxSparkline.tsx`); an idiomatic-use audit of 5 existing Observable Plot panels (no code changes expected — see research.md); ~9 Playwright spec files with selector/assertion updates; 0 new panel types, 0 query-layer changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked directly against `.specify/memory/constitution.md` v2.4.1, principle by principle:

- **I. TypeScript Throughout, React Permitted When Needed** — PASS. No new `.js` files; all changes are `.tsx`/`.ts`/`.yaml`.
- **II. DuckDB-WASM off main thread, one shared instance** — PASS, not touched. No query-layer change (FR-005).
- **III. No `eval()`** — PASS, not touched.
- **IV. YAML parsed at runtime** — PASS. `dashboard-*.yaml` edits are ordinary content edits; `js-yaml` parsing behavior is unchanged.
- **V. Parquet-only browser data I/O** — PASS, not touched.
- **VI. Fixed Technology Choices** — PASS on every enumerated MUST (MapLibre/Vite/no Web Storage/Tailwind+shadcn+Radix+lucide-react) — none are touched by this feature.
- **VII. Minimal, fixed config file set** — PASS. No new config file type introduced; this feature edits existing `dashboard-*.yaml` content only.
- **VIII. Reuse proven reference implementations** — PASS/N/A, no DuckDB/MapLibre/spatial work here.
- **IX. Fixed Python/JS source split** — PASS, not touched.

**Non-blocking documentation note** (not a Core Principle, does not gate this feature): the constitution's own **Technology Stack Reference** table (a separate section from the nine numbered principles) lists `Charts — default: Plotly.js`. That cell was already stale before this feature — `CLAUDE.md`'s own `029-shadcn-chart-panel` entry documents Recharts as "this app's new default/primary engine for bar/line/area charts" with no corresponding constitution amendment on record. This feature makes that cell stale in a second, distinct way: after it ships, the real demo content's bar/distribution charts are rendered by Observable Plot, not Plotly. Recommending (out of this feature's own scope, per spec.md's own "Does not include" list, which never asked for a constitution edit) a future documentation-only PATCH amendment updating that table row to reflect actual usage — not a gate on this feature, since no numbered Core Principle addresses "default chart engine" at all.

**Result: PASS.** No Core Principle is violated or requires an amendment. Proceeding to Phase 0.

### Post-Phase-1 re-check

Re-evaluated after Phase 0/1 design (research.md, data-model.md,
contracts/): the design confirms zero new dependencies, zero query-layer
changes, zero new config file types, and zero changes to any of the
Fixed Technology Choices (Principle VI). The only two source-level
changes are content edits to existing `dashboard-*.yaml` files and one
component re-implementation (`panels/valueBoxSparkline.tsx`) that swaps
one already-installed charting library for another already-installed
one used elsewhere in this same codebase. **Result: PASS, unchanged.**

## Project Structure

### Documentation (this feature)

```text
specs/057-observable-plot-conversion/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── panel-conversions.md
│   ├── valuebox-sparkline-plot.md
│   └── test-migration.md
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
# Single project (existing structure, unchanged) — this feature touches:
public/
└── demo-dashboard-config/
    ├── dashboard-1-summary.yaml       # 2 panels re-authored (recharts, plotly → observable-plot)
    ├── dashboard-3-tour-models.yaml   # 1 panel re-authored (plotly → observable-plot)
    ├── dashboard-4-mode-choice.yaml   # 2 panels re-authored (recharts, plotly → observable-plot);
    │                                  #   sankey panel UNCHANGED
    └── dashboard-5-trip-models.yaml   # 1 panel re-authored (plotly → observable-plot)
    # dashboard-2-person-household.yaml, dashboard-6-network.yaml,
    # dashboard-7-explore.yaml, dashboard-8-test.yaml: UNCHANGED

src/
└── panels/
    ├── valueBoxSparkline.tsx          # re-implemented: recharts primitives → @observablehq/plot
    ├── observablePlotEncoding.ts      # audited (research.md) — no code change expected
    └── ObservablePlotPanel.tsx        # audited (research.md) — no code change expected
    # panels/PlotlyPanel.tsx, panels/plotlyTraces.ts, panels/RechartsPanel.tsx,
    # panels/rechartsEncoding.ts, panels/SankeyPanel.tsx, panels/sankeyGraph.ts,
    # panels/registry.tsx, panels/panelQuery.ts, services/sqlExpander.ts: UNCHANGED

tests/
├── unit/
│   └── valueBoxSparkline (or equivalent) tests updated for the new rendering approach
└── integration/
    ├── dashboardShell.spec.ts             # selector update (converted panels)
    ├── demoMultiScenario.spec.ts          # selector/assertion update
    ├── lazyTabLoading.spec.ts             # selector update
    ├── markdownPanel.spec.ts              # comment/assertion update only
    ├── metricStrip.spec.ts                # assertion unaffected (title-only query) — verify
    ├── panelExpand.spec.ts                # selector update (CHART_TITLE panel)
    ├── scenarioColorOverride.spec.ts      # selector + legend-swatch assertion rewrite
    ├── scenarioLabelDisplay.spec.ts       # selector + label-text assertion rewrite
    └── switchControlsUnpinnedPanels.spec.ts  # selector update
```

**Structure Decision**: Existing single-project structure, unchanged. No new directories. This feature is a content re-authoring (`public/demo-dashboard-config/*.yaml`) plus one component re-implementation (`panels/valueBoxSparkline.tsx`) plus test-suite updates, entirely within the app's already-established panel/test layout.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
