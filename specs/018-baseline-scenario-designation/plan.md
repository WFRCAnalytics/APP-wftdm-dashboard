# Implementation Plan: Baseline scenario designation (foundation)

**Branch**: `020-baseline-scenario` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-baseline-scenario-designation/spec.md`

## Summary

Add a single, always-resolvable "baseline scenario" designation to `appState.ts`'s existing in-memory scenario registry — an explicit viewer choice (mutually exclusive by construction: one string pointer, not a per-scenario boolean) that falls back, whenever unset or invalidated, to the earliest-loaded `status: 'ready'` non-pinned scenario. Expose it to the UI via a new `useBaseline()` hook (mirroring `useActiveScenarios()`), a small control added to the existing `ScenarioLoader` component, and to authored SQL via a new `$baseline.<metric>` placeholder in `services/sqlExpander.ts`, resolving to a single bare view reference (`"{scenario}__{metric}"`) — the same shape `013-zonemap-panel`'s `comparison: diff` `a`/`b` already uses, not `$scenario.x`'s UNION-ALL. No panel type is taught to consume the new placeholder in this feature (FR-011) — correctness is proven by a direct unit test of the expander.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3

**Primary Dependencies**: None new. Reuses `state/appState.ts` (Map-based in-memory store + existing `subscribe()`/`notify()` pub-sub), `services/sqlExpander.ts` (existing placeholder-expansion mechanism), `hooks/useActiveScenarios.ts`'s `useSyncExternalStore` pattern, `layout/scenarioLoader.tsx`, `components/ui/button.tsx`, `lucide-react` (an icon for the new control).

**Storage**: In-memory only (`appState.ts`'s existing `Map`), no persistence — matches constitution Principle VI and this app's existing scenario state exactly; no new storage mechanism.

**Testing**: Vitest for `appState.ts`'s new resolver logic and `sqlExpander.ts`'s new placeholder (pure functions, no DOM) — same layer `sqlExpander.test.ts`/`appState`-adjacent tests already use. Playwright for the `ScenarioLoader` UI control (mark/re-mark/removal-triggers-fallback), matching `009-scenario-manager`'s own existing integration coverage of that component.

**Target Platform**: Browser (Vite-built SPA), no server-side component — unchanged from the rest of this app.

**Project Type**: Single web app (existing `src/` tree) — no new top-level project or package.

**Performance Goals**: N/A beyond this app's existing baseline — resolving `getBaseline()` is an O(n) scan over already-in-memory scenarios (n is realistically single digits), no measurable cost.

**Constraints**: Must not alter `013-zonemap-panel`'s existing `comparison: diff` mechanism (FR-010) or any existing `sqlExpander.expand()` call site's behavior (FR-011 scope boundary — verified zero existing call sites pass a 6th positional argument, so all nine remain byte-for-byte unchanged).

**Scale/Scope**: One new resolver + one new mutation function in `appState.ts`, one new hook, one small UI addition to one existing component, one new placeholder kind in `sqlExpander.ts`. No new files beyond the one new hook.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript Throughout, React Permitted | New code is `.ts` (appState.ts, sqlExpander.ts, useBaseline.ts) or `.tsx` (scenarioLoader.tsx edit) per existing convention | PASS |
| II. DuckDB-WASM off main thread, one shared instance | Not touched — this feature adds no query execution path, only SQL text generation (same as every other placeholder) | PASS (N/A) |
| III. No eval() — string replacement only | New `$baseline.<metric>` placeholder resolved via the exact same regex+switch+string-substitution mechanism as every existing placeholder kind — no dynamic code execution introduced | PASS |
| IV. YAML parsed at runtime | Not touched — no new YAML grammar in this feature (author-facing placeholder syntax is SQL text, not a new YAML key) | PASS (N/A) |
| V. Parquet-only browser I/O | Not touched | PASS (N/A) |
| VI. Fixed technology choices (incl. no localStorage/sessionStorage) | Baseline state is in-memory only, in the existing `appState.ts` module — no Web Storage anywhere | PASS |
| VII. Minimal, fixed config file set | No new config file type introduced — `$baseline.<metric>` is SQL-template syntax used *within* existing `summarize.yaml`/`dashboard-*.yaml` content, not a new file | PASS |
| VIII. Reuse proven reference implementations | N/A — this feature touches no DuckDB-WASM/Arrow wiring, MapLibre/deck.gl, or spatial-SQL/GeoParquet surface the mandate-tier table governs | PASS (N/A) |
| IX. Fixed Python/JS source split | All new code under `src/` (JS app side); no Python touched | PASS |

No violations. Nothing in Complexity Tracking.

**Post-Phase-1 re-check**: re-evaluated after `research.md`/`data-model.md`/`contracts/` were written — the design that emerged (one nullable pointer + a pure resolver in `appState.ts`, one new hook, one new optional trailing `expand()` parameter, a widened-not-replaced existing UI component) introduces no new dependency, no new config file type, no Web Storage, and no eval()-equivalent. Table above is unchanged; still all PASS.

## Project Structure

### Documentation (this feature)

```text
specs/018-baseline-scenario-designation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── baseline-scenario.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── state/
│   └── appState.ts          # MODIFIED — new explicit-baseline pointer,
│                             #   setBaseline()/getBaseline(), unregister()
│                             #   clears the pointer on match (FR-005)
├── hooks/
│   └── useBaseline.ts       # NEW — useSyncExternalStore over
│                             #   appState.subscribe()/getBaseline(),
│                             #   mirrors useActiveScenarios.ts
├── services/
│   └── sqlExpander.ts       # MODIFIED — new 'baseline' placeholder kind,
│                             #   new optional trailing expand() parameter,
│                             #   new expandBaseline() function
└── layout/
    └── scenarioLoader.tsx   # MODIFIED — new baseline-marking control,
                              #   widened to render every registered
                              #   scenario (not just handle-sourced ones)
                              #   for this control specifically

tests/
├── unit/
│   ├── appState.test.ts     # NEW or extended — getBaseline()/setBaseline()/
│   │                         #   removal-fallback resolver logic
│   └── sqlExpander.test.ts  # EXTENDED — $baseline.<metric> resolution,
│                             #   including the unresolved-baseline failure
│                             #   case (FR-009)
└── integration/
    └── scenarioLoader.spec.ts  # EXTENDED — mark/re-mark/removal-triggers-
                                  #   fallback through the real UI control
```

**Structure Decision**: No new top-level directory. This is a small, additive change to three existing modules (`appState.ts`, `sqlExpander.ts`, `scenarioLoader.tsx`) plus one new hook file (`useBaseline.ts`) — the same footprint shape `011-basemap-style-system` had relative to the panel it later fed (`013-zonemap-panel`): foundation only, no new panel/component tree.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
