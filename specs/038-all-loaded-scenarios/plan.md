# Implementation Plan: All Loaded Scenarios Participate by Default

**Branch**: `038-all-loaded-scenarios` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-all-loaded-scenarios/spec.md`

## Summary

Make every scenario whose data actually loaded (`status === 'ready'`) auto-active at
boot, on all three discovery paths (`observed`, published, demo) — with the only
condition being that scenario's own registration outcome, no fixture-vs-demo
branching. Then remove the `scenario:`/`scenarios:` pin from the demo panels whose
chart type can render a multi-scenario `$scenario` union legibly (27 of 41), adding
a per-scenario series channel to the 5 that need one, and leave the 14 that
genuinely can't (zonemap/flowmap one-draw-per-dataset, KPI valueboxes, colour-channel
-already-committed charts, the combined sankey) pinned with their single-scenario
scope stated in the panel title/description. Update the fixture-suite tests that
silently assumed `observed` was the sole active scenario to declare their
active-scenario set explicitly. No change to `$baseline`/`comparison: diff` or to
`037`'s Scenarios-tab UI.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18, Vite

**Primary Dependencies**: DuckDB-WASM (Web Worker), js-yaml (runtime YAML), Plotly.js,
Recharts, `@observablehq/plot`, MapLibre GL — all already present; **this feature adds
no dependency**.

**Storage**: Parquet/GeoParquet in the browser via DuckDB-WASM; scenario view
namespacing `{name}__{metric}` (unchanged).

**Testing**: Vitest (`tests/unit/`), Playwright (`tests/integration/`). Fixture content
is copied into `public/` by `npm run dev:fixtures` / `tests/global-setup.js`.

**Target Platform**: Static web app (GitHub Pages / `wfrc.utah.gov` subdirectory) +
`wftdm-dashboard serve`/`here` local modes.

**Project Type**: Single-project web app (`src/`) + Python post-processor (`python/`,
untouched by this feature).

**Performance Goals**: No new query cost — auto-activating a `ready` scenario adds it
to the existing `$scenario` `UNION ALL` that unpinned panels already build; a viewer
with N ready scenarios sees N-way unions where they previously saw 1-way pinned
queries. N is small (demo ships 3). Switch toggles re-render reactively via the
existing `useActiveScenarios()` hook — no reload.

**Constraints**: YAML parsed at runtime (Principle IV) — every demo-panel edit is a
`dashboard-*.yaml` content change, never a build-time transform. Dual-theme
verification required for every panel whose rendered content changes from
single-series to multi-series (standing project requirement).

**Scale/Scope**: 1 source file changed (`src/services/scenarioDiscovery.ts`, ~6
lines across 3 functions); 8 demo `dashboard-*.yaml` files edited (27 pins removed, 5
series channels added, 14 scope-note strings added); ~4 fixture `dashboard-*.yaml`
panels pinned explicitly; an enumerated set of fixture-suite test assertions updated
to declare their active-scenario set. No new module, no new config file type, no
schema change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Relevant? | Assessment |
|---|---|---|
| **I. TypeScript-first / React adoption** | Yes | The one source change is in an existing `.ts` file; no new file, no JSX. **PASS.** |
| **II. DuckDB-WASM in a Web Worker; one shared instance** | No | Query execution path unchanged — only *which* scenario names feed the existing `$scenario` expansion. **PASS.** |
| **III. No `eval()` — SQL via string replacement** | Yes | `$scenario` expansion in `services/sqlExpander.ts` is untouched; more names flow through the same string-templating path. **PASS.** |
| **IV. YAML parsed at runtime** | Yes | All demo/fixture panel edits are `dashboard-*.yaml` content, parsed at runtime by `js-yaml` as today. No inlining, no build-time preprocessing. **PASS.** |
| **V. Parquet-only browser I/O** | No | No data-format change. **PASS.** |
| **VI. Fixed technology choices** | Yes | No new framework/component-library/icon-set/CSS-framework. Scope-note text uses existing panel `description`/`title` fields. **PASS.** |
| **VII. Minimal, fixed config file set** | Yes | Edits `dashboard-*.yaml` files only — an existing config type. No new config file, no `dashboard-config.yaml`, no `topsheet.yaml`. Observed/scenario registration stays in `services/scenarioDiscovery.ts` (Principle VII names this the correct home). **PASS.** |
| **VIII. Reuse proven reference implementations** | No | No DuckDB/MapLibre/Vite wiring work. **PASS.** |

**Result: PASS, no violations, Complexity Tracking not required.**

Re-evaluation after Phase 1 design: unchanged — the design introduces no new module,
entity, contract surface, or dependency; it is a behavior change to one existing
function plus content edits to existing config files. **PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/038-all-loaded-scenarios/
├── plan.md              # This file
├── research.md          # Phase 0 — the definitive 41-panel disposition table,
│                        #   valuebox keep-vs-convert calls, channel-conflict
│                        #   resolution, auto-activation rule design, fixture-test
│                        #   remediation strategy
├── data-model.md        # Phase 1 — Scenario.active activation-timing change;
│                        #   panel-config key deltas (per disposition category)
├── quickstart.md        # Phase 1 — runnable validation scenarios (US1/US2/US3)
├── contracts/
│   ├── discovery-activation.md   # the status==='ready' → setActive rule, all 3 paths
│   └── demo-panel-disposition.md # authoritative per-panel edit list (41 rows)
├── checklists/
│   └── requirements.md  # already generated by /speckit-specify — all items pass
└── tasks.md             # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
src/
└── services/
    └── scenarioDiscovery.ts      # CHANGED — registerObserved()/registerPublishedScenarios()/
                                  #   registerDemoScenarios() each call
                                  #   appState.setActive(name, true) iff that scenario's
                                  #   own registration reached status 'ready'.
                                  #   registerObserved() drops its unconditional
                                  #   setActive('observed', true).

public/demo-dashboard-config/     # CHANGED — 8 tab files, per contracts/demo-panel-disposition.md
├── dashboard-1-summary.yaml          #   panels 1-7
├── dashboard-2-person-household.yaml #   panels 8-17
├── dashboard-3-tour-models.yaml      #   panels 18-30
├── dashboard-4-mode-choice.yaml      #   panels 31-34
├── dashboard-5-trip-models.yaml      #   panels 35-38
├── dashboard-6-network.yaml          #   panels 39-45
└── dashboard-5-explore.yaml          #   panel 46

tests/
├── fixtures/dashboard-config/    # CHANGED — pin the fixture's own plain-content-asserted
│   ├── dashboard-1-summary.yaml  #   unpinned valueboxes to `scenarios: [observed]`
│   └── dashboard-2-detail.yaml   #   (NOT the Scenario Split / Multi-Scenario panels —
│                                 #    those stay unpinned; they ARE the union's coverage)
├── unit/
│   └── (no change expected — appState shape unchanged)
└── integration/
    ├── boot.spec.ts             # CHANGED — active-set assertions expect the ready-set
    ├── scenarioManager.spec.ts  # CHANGED — active-set assertions
    ├── settingsModal.spec.ts    # CHANGED — active-set / Switch-state assertions
    └── (enumerate the rest during /speckit-tasks via grep — see research.md §6)
```

**Structure Decision**: Single-project layout (Option 1). The feature touches one
`src/services/` file, the `public/demo-dashboard-config/` content root, the
`tests/fixtures/dashboard-config/` content root, and named `tests/integration/`
specs. No `src/` module is added; no `components/`, `state/`, or `hooks/` change is
needed because `useActiveScenarios()` already delivers the reactive Switch behavior
the feature relies on.

## Complexity Tracking

*Not applicable — Constitution Check passed with no violations.*
