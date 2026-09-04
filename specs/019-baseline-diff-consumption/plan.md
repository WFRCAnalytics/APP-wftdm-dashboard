# Implementation Plan: $baseline consumption across panel types (diff/percent-diff rendering)

**Branch**: `019-baseline-diff-consumption` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-baseline-diff-consumption/spec.md`

## Summary

Generalize `013-zonemap-panel`'s existing `buildComparisonDiffQuery()` (currently zonemap-only, hardcoded to `metric_id` as the join key) into one shared mechanism parameterized on an author-named `compare_on: string[]` join key, reused by `plotly`/`table`/`observable-plot`/`zonemap` alike. Add a `$baseline` sentinel value, resolved by each panel's own component (never inside the query-builder itself, matching the existing "caller pre-resolves" convention) via the new `useBaseline()` hook (018-baseline-scenario-designation), gated so an unresolved baseline shows the panel's existing error state rather than building a broken query. Fix two real, confirmed gaps found during research — `formatValue()` renders the literal string `"null"` today, and `TablePanel`'s `cellColor()` gives a null value no distinct visual treatment — so `diff_value: null` (the zero-baseline degenerate case) renders as a defined "N/A" state, not raw artifacts.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3

**Primary Dependencies**: None new. Reuses `panels/panelQuery.ts` (extends `buildComparisonDiffQuery()`), `layout/types.ts` (new shared `ComparisonCapablePanelConfig` mixin, mirroring `MapRenderingPanelConfig`'s existing pattern), `hooks/useBaseline.ts` (018, already built), `panels/zonemapColor.ts`'s `NO_DATA_COLOR` convention (referenced as the pattern to match, not imported — `tableLogic.ts` gets its own token-consistent equivalent, since `zonemapColor.ts`'s constant is module-private and zonemap-specific by design).

**Storage**: N/A — no new state, no persistence. `$baseline` resolution reads `appState.getBaseline()` via the existing `useBaseline()` hook only.

**Testing**: Vitest for the generalized query-builder (`panelQuery.ts`), the `$baseline`-resolution helper, and the `formatValue()`/`cellColor()` null-handling fixes (all pure functions). Playwright for each panel type's real effect-reactivity (baseline change → data refresh, matching FR-016) and the unresolved-baseline error state (FR-011).

**Target Platform**: Browser (Vite-built SPA) — unchanged.

**Project Type**: Single web app (existing `src/` tree) — no new top-level project.

**Performance Goals**: N/A beyond existing — one additional JOIN in the generated SQL, same shape/cost class as `013-zonemap-panel`'s own existing `comparison: diff` query, now just also used by three more panel types.

**Constraints**: MUST NOT modify `013-zonemap-panel`'s existing hardcoded-`a`/`b` `comparison: diff` behavior for any panel that doesn't reference `$baseline` (FR-005/SC-004). MUST NOT route `comparison: diff` queries through `sqlExpander.expand()` for the first time (spec Grammar finding #2 — `$baseline` resolution happens in the caller, not via a new placeholder-regex path).

**Scale/Scope**: `layout/types.ts` (new mixin + 3 panel configs updated), `panels/panelQuery.ts` (generalized query-builder + new `$baseline` resolver, both shared), `panels/PlotlyPanel.tsx`/`plotlyTraces.ts`, `panels/TablePanel.tsx`/`tableLogic.ts`/`formatValue.ts`, `panels/ObservablePlotPanel.tsx`/`observablePlotEncoding.ts`, `panels/ZoneMapPanel.tsx` (migrated onto the generalized builder, behavior unchanged), `docs/GRAMMAR.md`. No new files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript Throughout, React Permitted | All changes `.ts`/`.tsx`, existing convention | PASS |
| II. DuckDB-WASM off main thread, one shared instance | Not touched — this feature only changes what SQL text is built, not how/where it runs | PASS (N/A) |
| III. No eval() — string replacement only | `expr`/resolved-`a`/resolved-`b` remain literal string interpolation, unchanged from `013-zonemap-panel`'s own existing convention (spec FR-010) | PASS |
| IV. YAML parsed at runtime | Not touched — `comparison`/`compare_on` are read the same zero-validation way every other panel field already is (`parseDashboardConfig()`'s existing pass-through cast) | PASS (N/A) |
| V. Parquet-only browser I/O | Not touched | PASS (N/A) |
| VI. Fixed technology choices (incl. no localStorage/sessionStorage) | No new dependency, no Web Storage — `$baseline` resolution reads existing in-memory `appState.ts` state only | PASS |
| VII. Minimal, fixed config file set | No new config file type — `comparison`/`compare_on` are panel-level keys *within* existing `dashboard-*.yaml` | PASS |
| VIII. Reuse proven reference implementations | N/A — no DuckDB-WASM/Arrow wiring, MapLibre/deck.gl, or spatial-SQL surface touched | PASS (N/A) |
| IX. Fixed Python/JS source split | All changes under `src/` | PASS |

No violations. Nothing in Complexity Tracking.

**Post-Phase-1 re-check**: re-evaluated after `research.md`/`data-model.md`/`contracts/` were written — the design (one generalized query-builder function, one shared type mixin, one resolver helper, two narrowly-scoped null-rendering fixes) introduces no new dependency, no new config file type, no Web Storage, no eval()-equivalent, and no change to how/where DuckDB-WASM runs. Table above unchanged, still all PASS.

## Project Structure

### Documentation (this feature)

```text
specs/019-baseline-diff-consumption/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── baseline-diff-consumption.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── layout/
│   └── types.ts             # MODIFIED — new ComparisonCapablePanelConfig
│                             #   mixin (comparison + compare_on), mirroring
│                             #   MapRenderingPanelConfig's existing shape.
│                             #   ZoneMapPanelConfig's own local `comparison`
│                             #   field replaced by the mixin (adds
│                             #   compare_on to it too, optional, defaults
│                             #   to [metric_id]). PlotlyPanelConfig/
│                             #   TablePanelConfig/ObservablePlotPanelConfig
│                             #   each gain the mixin.
├── panels/
│   ├── panelQuery.ts         # MODIFIED — buildComparisonDiffQuery()
│   │                         #   generalized to take (metric, aScenario,
│   │                         #   bScenario, compareOn, expr) instead of
│   │                         #   (config: ZoneMapPanelConfig, diff). New
│   │                         #   resolveComparisonScenarioName(name,
│   │                         #   baseline) — the $baseline sentinel
│   │                         #   resolver, shared by all four call sites.
│   │                         #   New isComparisonDiff() moved here from
│   │                         #   its current ZoneMapPanel.tsx-local
│   │                         #   definition (now shared).
│   ├── ZoneMapPanel.tsx      # MODIFIED — migrated onto the generalized
│   │                         #   builder + shared isComparisonDiff();
│   │                         #   behavior unchanged for existing
│   │                         #   hardcoded-name usage (FR-005). Fetch
│   │                         #   effect gains useBaseline() in its
│   │                         #   dependency array (FR-016), only
│   │                         #   consulted when comparison.a/b references
│   │                         #   $baseline.
│   ├── PlotlyPanel.tsx       # MODIFIED — comparison: diff branch added to
│   │                         #   the fetch effect, useBaseline() added to
│   │                         #   its dependency array (FR-016).
│   ├── plotlyTraces.ts       # Unchanged — diff_value is just another
│   │                         #   column name an author's own trace x/y/
│   │                         #   color config can reference; no new
│   │                         #   trace-building logic needed. Plotly.js's
│   │                         #   own native null-point handling satisfies
│   │                         #   FR-014 for chart-type panels (research.md).
│   ├── TablePanel.tsx        # MODIFIED — comparison: diff branch added to
│   │                         #   the fetch effect, useBaseline() added.
│   ├── tableLogic.ts         # MODIFIED — cellColor() gains an explicit
│   │                         #   null branch (a dedicated, visible "not
│   │                         #   computable" color, matching
│   │                         #   zonemapColor.ts's own NO_DATA_COLOR
│   │                         #   convention) instead of today's silent
│   │                         #   "no color, no distinct indication".
│   ├── formatValue.ts        # MODIFIED — real, confirmed bug fixed:
│   │                         #   formatValue(null, ...) today returns the
│   │                         #   literal string "null" (String(null));
│   │                         #   gains an explicit null branch returning
│   │                         #   a defined "N/A" display value instead.
│   ├── ObservablePlotPanel.tsx # MODIFIED — comparison: diff branch added,
│   │                         #   useBaseline() added to its dependency
│   │                         #   array (FR-016).
│   └── observablePlotEncoding.ts # MODIFIED — real, confirmed finding
│                             #   during implementation, corrected from
│                             #   this plan's own original "unchanged"
│                             #   claim: Observable Plot's barY renders a
│                             #   null y as a real <rect height="0"> at
│                             #   the exact position a genuine 0 value
│                             #   would occupy — silently indistinguishable
│                             #   from "no change," violating FR-014.
│                             #   resolveObservablePlotEncoding() now
│                             #   filters out any row whose configured y
│                             #   value is null before Plot.plot() ever
│                             #   sees it (research.md §6, corrected).
└── docs/
    └── GRAMMAR.md            # MODIFIED — comparison/compare_on documented
                              #   for plotly/table/observable-plot; $baseline
                              #   sentinel documented for a/b wherever
                              #   comparison: diff already appears.

tests/
├── unit/
│   ├── panelQuery.test.ts   # EXTENDED — generalized buildComparisonDiffQuery()
│   │                         #   (multi-column compare_on, still correct
│   │                         #   for the single-column zonemap case),
│   │                         #   resolveComparisonScenarioName() ($baseline
│   │                         #   resolves/passes through/fails correctly)
│   ├── tableLogic.test.ts   # EXTENDED — cellColor() null branch
│   └── formatValue.test.ts  # EXTENDED — formatValue(null, ...) branch
└── integration/
    ├── plotlyPanel.spec.ts       # EXTENDED — comparison: diff with
    │                              #   $baseline, baseline-change reactivity
    ├── tablePanel.spec.ts        # EXTENDED — same, plus the "N/A" cell
    ├── observablePlotPanel.spec.ts # EXTENDED — same
    └── zonemapPanel.spec.ts      # EXTENDED — $baseline sentinel case;
                                   #   existing hardcoded-name tests
                                   #   re-run unchanged (FR-005/SC-004)
```

**Structure Decision**: No new top-level directory or module. Every change either extends an existing file or generalizes an existing function in place — the same footprint shape `018-baseline-scenario-designation` had relative to `sqlExpander.ts`. `panelQuery.ts` is where the shared mechanism lives (FR-006), since that's already the one file every data-bound panel type's query-building already routes through.
