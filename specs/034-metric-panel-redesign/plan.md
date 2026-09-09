# Implementation Plan: Redesigned Metric Panels, Scoped Expandability, and Trend Indicators

**Branch**: `034-metric-panel-redesign` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-metric-panel-redesign/spec.md`

## Summary

Three independent changes to this app's metric/value-box panels: (A) scope the expand-to-dialog affordance away from `valuebox` and ordinary (non-full-page) `graphic-walker` panels, keeping it unchanged for every other panel type; (B) restyle `ValueBoxPanel.tsx` to match shadcn's own real, current dashboard metric-card pattern (label above value, tabular-aligned figures, badge-style trend presentation), confirmed by fetching that real source directly; (C) add two new, independent, optional configuration modes — `sparkline` (a small embedded Recharts chart summarizing a separate grouped metric) and `baseline_trend` (a directional indicator reusing this app's existing `$baseline`-resolution and free-form-`expr` comparison technique via one new, small, additive query-building function, since the existing row-join-based comparison mechanism has no equivalent for a single-row scalar table). No existing panel type's behavior changes except the two named in Part A; no existing `ValueBoxPanelConfig` field's meaning changes.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3 — this app's existing stack, no change.

**Primary Dependencies**: `recharts` (already installed, `029-shadcn-chart-panel`), `lucide-react` (already installed — `TrendingUp`/`TrendingDown`/`Minus` icons), `class-variance-authority` (already installed, used by `button.tsx`) for the new `Badge` primitive's `variant` prop. No new npm dependency.

**Storage**: N/A — reuses the existing DuckDB-WASM query layer (`services/duckdb.ts`) unchanged.

**Testing**: Vitest (unit — pure query-builder/encoding functions) + Playwright (integration — real rendered behavior, both themes), this project's own established convention.

**Target Platform**: Browser (Vite web app), unchanged.

**Project Type**: Single existing web application — no new project/package boundary.

**Performance Goals**: No new goal beyond this app's existing per-panel query/render conventions — a value box's two new optional zones each add at most one small, independent query, matching the cost profile of any other optional panel feature (e.g. a `comparison: diff` config on an existing panel type).

**Constraints**: No new npm dependency (Constitution Principle VI's fixed technology choices — `recharts`/`lucide-react`/`class-variance-authority` already satisfy every real need here). `panelQuery.ts`'s existing exports (`buildPanelQuery`, `buildComparisonDiffQuery`, `resolveComparisonScenarioName`, `isComparisonDiff`, `resolveActiveScenarios`, `extractGlobalFilterIds`) MUST NOT change signature or behavior — every addition is a new, additive export (spec.md's own explicit "does not include" scope boundary; research.md §3).

**Scale/Scope**: One new UI primitive (`components/ui/badge.tsx`), one new exported constant (`EXPANDABLE_PANEL_TYPES`), two new `ValueBoxPanelConfig` fields (`sparkline`, `baseline_trend`), two new query-builder functions, one redesigned panel component (`ValueBoxPanel.tsx`) plus one small new sub-component for the embedded chart.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | PASS | All new/changed code is `.tsx`/`.ts`, following the existing panel-component pattern exactly (a function component receiving `config`, querying `services/duckdb.ts` directly). |
| II. DuckDB-WASM off main thread, one shared instance | PASS | No change to `services/duckdb.ts`; both new query builders produce plain SQL strings handed to the existing `query()`. |
| III. No `eval()` — string replacement only | PASS | `baseline_trend.expr` is interpolated verbatim into a SQL template, identical convention to `ComparisonDiff.expr` (never evaluated in JS). |
| IV. YAML Parsed at Runtime | PASS | `sparkline`/`baseline_trend` are two more optional keys parsed by the existing runtime `js-yaml` pipeline — no build-time schema introduced. |
| V. Parquet-Only Browser Data I/O | PASS | Unaffected — both new query builders read from already-registered scenario views, same as every existing panel query. |
| VI. Fixed Technology Choices | PASS | Reuses `recharts`/`lucide-react`/shadcn-pattern primitives already in place; no new CSS framework, chart library, or icon set. |
| VII. Minimal, Fixed Config File Set | PASS | No new config file type — additive keys inside the existing `dashboard-*.yaml` `type: valuebox` grammar. |
| VIII. Reuse Proven Reference Implementations | N/A | This feature touches no DuckDB-WASM/MapLibre/Vite-worker wiring the reference repos cover. |
| IX. Fixed Python/JS Source Split | PASS | No Python-side change. |

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/034-metric-panel-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   ├── panel-expand-scoping.md
│   └── valuebox-panel-v2.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Real, existing project — no new top-level directory. Every file below already exists except the two marked NEW.

```text
src/
├── layout/
│   ├── panelCard.tsx              # MODIFIED — `isExpandable = config.expandable ??
│   │                               # EXPANDABLE_PANEL_TYPES.has(config.type)`
│   │                               # (data-model.md §1a, spec.md's Part A addendum);
│   │                               # the usePanelExpandHost() call itself stays
│   │                               # unconditional (research.md §1)
│   └── types.ts                   # MODIFIED — PanelConfigBase gains a new optional
│                                   # `expandable?: boolean` field (data-model.md
│                                   # §1a, applies to all ten panel types uniformly);
│                                   # ValueBoxSparklineConfig, ValueBoxBaselineTrendConfig,
│                                   # two new optional fields on ValueBoxPanelConfig
│                                   # (data-model.md §2)
├── panels/
│   ├── expandablePanelTypes.ts     # NEW — EXPANDABLE_PANEL_TYPES (data-model.md §1),
│   │                               # deliberately its OWN file, not co-located
│   │                               # inside registry.tsx — a real, confirmed Vitest
│   │                               # ESM-resolution constraint found during
│   │                               # implementation (see tasks.md T006's own
│   │                               # completion note): registry.tsx eagerly imports
│   │                               # every real panel component, and FlowMapPanel.tsx's
│   │                               # own @flowmap.gl/layers dependency fails to
│   │                               # resolve under Vitest's plain-Node environment.
│   ├── panelQuery.ts                # MODIFIED — two new, purely additive exports:
│   │                               # buildSparklineQuery(), 
│   │                               # buildValueBoxBaselineTrendQuery() (data-model.md
│   │                               # §5). Every existing export unchanged.
│   ├── ValueBoxPanel.tsx            # MODIFIED — redesigned layout (label/value/icon,
│   │                               # tabular-nums), two new independent optional
│   │                               # fetch effects (sparkline, baseline_trend), each
│   │                               # with its own loading/ready/empty-or-no-baseline/
│   │                               # error state (data-model.md §4/§6)
│   └── valueBoxSparkline.tsx        # NEW — small, minimal-chrome Recharts rendering
│                                   # (bare BarChart/LineChart + encodeRechartsData(),
│                                   # no ChartContainer axes/tooltip/legend) — split
│                                   # out of ValueBoxPanel.tsx for the same reason
│                                   # every other panel type's own pure/presentational
│                                   # logic is split out (plotlyTraces.ts,
│                                   # rechartsEncoding.ts, etc.)
├── components/
│   └── ui/
│       └── badge.tsx                # NEW — adapted from shadcn's real, current
│                                   # new-york-v4 registry source (data-model.md §3),
│                                   # this app's first real Badge consumer
tests/
├── unit/
│   ├── panelQuery.test.ts           # EXTENDED — buildSparklineQuery()/
│   │                               # buildValueBoxBaselineTrendQuery() coverage;
│   │                               # every existing test in this file unaffected
│   └── registry.test.ts             # EXTENDED — EXPANDABLE_PANEL_TYPES membership
│                                   # matches contracts/panel-expand-scoping.md's
│                                   # table exactly
└── integration/
    ├── panelExpand.spec.ts          # MODIFIED — a REAL, confirmed consequence of
    │                               # Part A found during planning, not assumed: this
    │                               # existing file's own generic (non-chart-specific)
    │                               # expand-mechanism tests (focus management, state
    │                               # preservation, background-interaction blocking —
    │                               # ~10 of its ~18 tests) use a `valuebox` panel
    │                               # ("Total Households") as their fixture. Once
    │                               # valuebox loses its expand trigger, every one of
    │                               # those tests needs its fixture panel swapped to
    │                               # a still-expandable type (this file's own
    │                               # existing "Mode Share by Purpose" plotly fixture,
    │                               # already used by its chart-specific tests, is the
    │                               # natural candidate — exact choice left to
    │                               # /speckit-tasks). A new, small, dedicated test
    │                               # asserting a valuebox panel specifically has NO
    │                               # expand trigger (contracts/panel-expand-
    │                               # scoping.md) is added alongside, not a
    │                               # replacement for the swapped generic coverage.
    └── valueBoxPanel.spec.ts        # NEW — confirmed no existing spec file for this
                                   # panel type today (direct listing of
                                   # tests/integration/); full Playwright coverage
                                   # of quickstart.md's 7 scenarios, both themes
```

**Structure Decision**: No new project or package boundary — this is a set of additive/scoped changes inside the existing single-project web app structure (`src/panels/`, `src/layout/`, `src/components/ui/`), following the established panel-component/query-builder/pure-module-split conventions this project already uses for every prior panel-type feature (`029-shadcn-chart-panel`, `019-baseline-diff-consumption`).

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
