# Implementation Plan: Scenario Label Propagation & Color Override

**Branch**: `035-scenario-label-color` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/035-scenario-label-color/spec.md`

## Summary

Two independent, presentation-only additions to how scenario identity
renders. **Part A**: propagate the existing `Scenario.label` field
(`020-settings-modal`) to the four real display surfaces confirmed by
spec.md's own audit — Plotly trace legend names, Recharts `chartConfig`
labels, Observable Plot's row-driven legend/axis text, and table cell
values in a `scenario`-keyed column — via `label ?? name`, resolved only
after all query/grouping/join logic (which keeps using the real name)
has already run. **Part B**: add a new `Scenario.colorOverride` field plus
a Scenarios-tab swatch control, and — since spec.md's audit found the
existing `manifest.yaml` `color` field has zero current rendering
consumers — wire up `colorOverride ?? manifestColor` as the real default
color at the same three chart panel types (not table, which has no
per-scenario color dimension). Both fields live in-memory only on the
existing `Scenario` object in `state/appState.ts`, resolved through one
new, narrow hook (`hooks/useScenarioDisplay.ts`) and one new pure module
(`panels/scenarioDisplay.ts`) threaded into the four already-existing pure
encoding/trace-resolution modules as an additional parameter — no new
panel type, no new query, no change to `services/sqlExpander.ts` or
`panels/panelQuery.ts`.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3 — matching the existing panel-layer convention (constitution v2.2.0)

**Primary Dependencies**: None new. Reuses `services/duckdb.ts` (unmodified), `state/appState.ts` (extended), `plotly.js-dist-min`, `recharts`, `@observablehq/plot`, `lucide-react` (all already installed)

**Storage**: N/A (in-memory only — no persistence, per FR-013 and constitution's no-`localStorage`/`sessionStorage` rule)

**Testing**: Vitest (pure-logic unit tests for `panels/scenarioDisplay.ts` and the four extended pure modules) + Playwright (real-browser integration tests for label/color propagation across the four panel types and the Scenarios-tab swatch control)

**Target Platform**: Browser (Chromium/Firefox via Playwright), same as every existing panel feature

**Project Type**: Single web application (`src/` — no backend/mobile split)

**Performance Goals**: No new query — this is a pure client-side, post-query display transform. No measurable performance impact expected (a `Map` lookup per row/category, same order of magnitude as existing `formatValue()` calls already in these render paths)

**Constraints**: Must not change any DuckDB view name, SQL, or React state key (FR-003); must not persist (FR-013); must not touch `$baseline`/comparison-diff query logic (spec.md's explicit exclusion)

**Scale/Scope**: 4 panel types touched for Part A (`plotly`, `recharts`, `observable-plot`, `table`); 3 of those 4 touched for Part B (`plotly`, `recharts`, `observable-plot` — `table` has no per-scenario color dimension); 1 new field + 2 new functions on `state/appState.ts`; 1 new hook; 1 new pure module; 1 new UI control in `layout/settings/scenariosTab.tsx`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript Throughout, React Permitted | All new/changed files are `.ts`/`.tsx`, matching existing panel-layer split (pure logic `.ts`, JSX `.tsx`) | PASS |
| II. DuckDB-WASM off main thread, one shared instance | Zero changes to `services/duckdb.ts` or any query path — this feature never touches DuckDB | PASS |
| III. No `eval()` | No dynamic code execution anywhere in this feature — plain object/Map lookups and string interpolation only | PASS |
| IV. YAML parsed at runtime | No new YAML grammar — `label`/`colorOverride` are runtime UI state, never YAML-configured | PASS |
| V. Parquet-only browser I/O | No new data read path — this feature reads zero new files | PASS |
| VI. Fixed technology choices (MapLibre/Vite/no Web Storage/Tailwind+shadcn+Radix+lucide-react) | `colorOverride` is explicitly in-memory only (FR-013) — no `localStorage`/`sessionStorage` introduced; the new swatch control is a native `<input type="color">` (no new component library); `X` clear-icon reuses `lucide-react`, already the fixed icon set | PASS |
| VII. Minimal, fixed config file set | No new config file type; no change to `dashboard-*.yaml`/`summarize.yaml`/`manifest.yaml` grammar (the manifest `color` field already exists — this feature only newly *reads* it in the frontend, doesn't change how it's written) | PASS |
| VIII. Reuse proven reference implementations | N/A — this feature touches none of the DuckDB-WASM/MapLibre/spatial-SQL/Vite-setup surfaces those references cover | PASS (not applicable) |
| IX. Fixed Python/JS source split | Zero Python changes — `python/wftdm_dashboard/postprocessor/manifest.py`'s existing color-generation logic is unmodified; this feature only consumes the field it already writes | PASS |

No violations. Complexity Tracking table is not needed.

**Post-Phase-1 re-check**: Phase 1 design (data-model.md/contracts/
quickstart.md) introduced no new dependency, no persistence, no new
config file type, and no new component-library primitive (the color
swatch is a bare native `<input type="color">`, confirmed in research.md
§6) — all nine gates above still PASS unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/035-scenario-label-color/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── scenario-display-resolution.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── state/
│   └── appState.ts               # EXTEND: Scenario gains colorOverride?:
│                                  # string; new setColorOverride()/
│                                  # clearColorOverride(), mirroring the
│                                  # existing setLabel()/clearLabel() pair
│                                  # exactly (same file, same pattern,
│                                  # same unregister()-discards-it-for-free
│                                  # behavior — no new module, per spec.md's
│                                  # own corrected-precedent Assumption)
├── hooks/
│   └── useScenarioDisplay.ts     # NEW: useSyncExternalStore over
│                                  # appState.subscribe()/list(), returns a
│                                  # memoized ScenarioDisplayMap (name ->
│                                  # {label?, color?}) — color already
│                                  # resolved as colorOverride ?? manifest
│                                  # color (FR-007/FR-011), so every
│                                  # consumer reads one flat value
├── panels/
│   ├── scenarioDisplay.ts        # NEW, pure, dependency-free (same
│                                  # reason panels/expandablePanelTypes.ts
│                                  # is its own file — Vitest-importable
│                                  # with no heavy transitive deps):
│                                  # resolveScenarioLabel(name, map),
│                                  # resolveScenarioColor(name, map)
│   ├── plotlyTraces.ts           # EXTEND: resolveTraces() gains an
│                                  # optional 3rd param, scenarioDisplay —
│                                  # applied only when the split column is
│                                  # 'scenario' (name + marker.color)
│   ├── PlotlyPanel.tsx           # EXTEND: calls useScenarioDisplay(),
│                                  # threads it into resolveTraces()
│   ├── rechartsEncoding.ts       # EXTEND: encodeRechartsData() gains an
│                                  # optional 3rd param — applied only
│                                  # when config.series === 'scenario'
│                                  # (chartConfig[key].label + .color)
│   ├── RechartsPanel.tsx         # EXTEND: calls useScenarioDisplay(),
│                                  # threads it into encodeRechartsData()
│   ├── observablePlotEncoding.ts # EXTEND: resolveObservablePlotEncoding()
│                                  # gains an optional 3rd param — applied
│                                  # only when fill/stroke === 'scenario'
│                                  # (row-level value substitution + an
│                                  # explicit color.domain/range, all-or-
│                                  # nothing per contracts/ below)
│   ├── ObservablePlotPanel.tsx   # EXTEND: calls useScenarioDisplay(),
│                                  # threads it into
│                                  # resolveObservablePlotEncoding()
│   ├── TablePanel.tsx            # EXTEND: cell-render branch for a
│                                  # `scenario`-keyed column substitutes
│                                  # the label — column HEADER unaffected
│   └── tableLogic.ts             # UNCHANGED — the substitution is a pure
│                                  # render-time branch in TablePanel.tsx
│                                  # itself, not a tableLogic.ts concern
│                                  # (headers/sort/filter/color-scale logic
│                                  # there needs no scenario-awareness)
└── layout/settings/
    └── scenariosTab.tsx          # EXTEND: each row's existing trailing
                                   # actions cluster gains a native
                                   # <input type="color"> swatch (sized to
                                   # match the existing h-6 w-6 icon
                                   # buttons) + a conditional "clear
                                   # override" X button, calling the new
                                   # appState.setColorOverride()/
                                   # clearColorOverride()

tests/
├── unit/
│   ├── scenarioDisplay.test.ts   # NEW — resolveScenarioLabel/Color
│   ├── plotlyTraces.test.ts      # EXTEND (existing file)
│   ├── rechartsEncoding.test.ts  # EXTEND (existing file)
│   └── observablePlotEncoding.test.ts # EXTEND (existing file — confirmed
│        via `ls tests/unit/` before planning; an earlier draft of this
│        plan wrongly assumed it didn't exist)
└── integration/
    ├── scenarioLabelDisplay.spec.ts   # NEW — Part A, all 4 panel types
    ├── scenarioColorOverride.spec.ts  # NEW — Part B, all 3 panel types
    #   + the Scenarios-tab swatch control itself
    └── settingsModal.spec.ts         # EXTEND — existing Scenarios-tab
                                       # row-anatomy coverage gets the new
                                       # swatch control folded in
```

**Structure Decision**: Single project, existing `src/`/`tests/` layout —
no new top-level directory. Every change is additive to already-existing
files, plus two genuinely new, narrow modules (`panels/scenarioDisplay.ts`,
`hooks/useScenarioDisplay.ts`) following this codebase's established
"split pure logic from the React component that calls it" convention
(`plotlyTraces.ts`/`sankeyGraph.ts`/`flowmapData.ts`/
`observablePlotEncoding.ts`/`rechartsEncoding.ts`/
`expandablePanelTypes.ts` are all direct precedents).

## Complexity Tracking

*No Constitution Check violations — this table is intentionally empty.*
