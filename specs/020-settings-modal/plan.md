# Implementation Plan: Unified Settings Modal

**Branch**: `022-settings-modal` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-settings-modal/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace the two independent header controls (`ThemeToggle`, `ScenarioLoader`)
with one `SettingsModal` (a `Dialog` + four-tab `Tabs`, both reused
unchanged from existing primitives), consolidating theme and scenario
management with zero behavior change, and adding three genuinely new
capabilities: viewer-controlled scenario display-order (a new `order`
field on `Scenario`, structurally independent of the `getBaseline()`
registration-order rule), an optional display-only custom scenario
`label`, and a global, viewer-picked basemap that fills
`resolveEffectiveBasemap()`'s existing app-default fallback tier (one new
optional trailing parameter) without altering its panel > tab priority.
All four new pieces of state are in-memory only, matching this
dashboard's constitution (no Web Storage) and `ThemeToggle`'s own
already-shipped no-persistence precedent.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3

**Primary Dependencies**: `@radix-ui/react-dialog` (existing,
`components/ui/dialog.tsx`), `@radix-ui/react-tabs` (existing,
`components/ui/tabs.tsx`) — no new package dependency introduced by this
feature

**Storage**: N/A — in-memory module-level state only (`state/appState.ts`
extended, `state/basemapState.ts` new), no persistence anywhere
(constitution: no Web Storage; FR-015)

**Testing**: Vitest (pure logic: `appState.ts`, `basemapState.ts`,
`resolveEffectiveBasemap.ts`), Playwright (`settingsModal.spec.ts`
replacing `themeToggle.spec.ts`'s and `scenarioManager.spec.ts`'s
UI-facing coverage)

**Target Platform**: Browser (same as the rest of this dashboard) —
WEB and LOCAL deployment modes both affected identically (the
Scenarios tab's "Load Local Scenario" visibility stays gated on
`isLocalDeployment()`, unchanged from today)

**Project Type**: Single-page web application (existing `src/` structure)

**Performance Goals**: N/A — no new query, render-loop, or network
workload; the modal is closed/unmounted content by default (Radix
`Dialog`'s existing Presence-based mount/unmount, per `dialog.tsx`'s own
header comment)

**Constraints**: Zero behavior change to relocated functionality (theme
switching, scenario add/remove/baseline-mark); zero change to
`getBaseline()`'s automatic-default resolution rule; zero change to
`resolveEffectiveBasemap()`'s existing panel > tab precedence for an
author-configured basemap

**Scale/Scope**: One new top-level component (`SettingsModal`) + four tab
components; two files deleted (`themeToggle.tsx`, `scenarioLoader.tsx`,
logic moved not duplicated); one existing module extended
(`appState.ts`); one new small state module (`basemapState.ts`) + one new
hook (`useGlobalBasemap.ts`); one extended function signature
(`resolveEffectiveBasemap()`) with two one-line call-site updates
(`FlowMapPanel.tsx`, `ZoneMapPanel.tsx`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. TypeScript Throughout, React Permitted When Needed** — PASS. All
  new files are `.tsx`/`.ts`; React is already adopted project-wide, this
  feature adds no new usage boundary.
- **II. DuckDB-WASM off main thread, one shared instance** — N/A. This
  feature touches no query path at all (no panel gains a new query; the
  two panel call-site changes are a resolver-argument addition only).
- **III. No `eval()`** — PASS. No dynamic code execution anywhere in this
  feature; no SQL is touched.
- **IV. YAML parsed at runtime** — N/A. This feature adds no new YAML
  grammar (dashboard-authored `basemap:`/`default_basemap:` are
  untouched; the viewer's global pick is pure runtime UI state, never
  written back to any YAML).
- **V. Parquet-only browser data I/O** — N/A. No data format touched.
- **VI. Fixed Technology Choices** — PASS. MapLibre/Vite/no-Web-Storage
  all unaffected; the new UI is built from the already-adopted
  Tailwind + shadcn/ui (Radix) + `lucide-react` stack, no new UI library.
  No `localStorage`/`sessionStorage` introduced (FR-015 requires the
  opposite).
- **VII. Minimal, fixed config file set** — PASS. No new config file
  type; `dashboard-*.yaml`'s existing `basemap:`/`default_basemap:`
  grammar is read, never written or extended.
- **VIII. Reuse proven reference implementations** — PASS (trivially —
  this feature touches no DuckDB-WASM/Arrow wiring, MapLibre+deck.gl
  overlay construction, or spatial-SQL/GeoParquet handling; the one
  MapLibre-adjacent change, `resolveEffectiveBasemap()`'s new parameter,
  is a plain-TypeScript branch addition to an already-existing, already-
  proven-pattern function, not new MapLibre/deck.gl wiring).
- **IX. Fixed Python/JS source split** — N/A. No Python package files
  touched.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/020-settings-modal/
├── plan.md               # This file (/speckit-plan command output)
├── research.md           # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── settings-modal.md # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md
└── tasks.md               # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This project is a single static web app + Python post-processor
(existing `src/`/`tests/`/`python/` split, constitution Principle IX) —
no new top-level project or structural option is introduced.

```text
src/
├── state/
│   ├── appState.ts          # EXTENDED — order/label/path fields +
│   │                         # moveScenario()/listByDisplayOrder()/
│   │                         # setLabel()/clearLabel(); getBaseline()
│   │                         # and unregister() UNCHANGED
│   └── basemapState.ts      # NEW — global basemap store (mirrors
│                             # appState.ts's/filterState.ts's own
│                             # subscribe/notify shape)
├── hooks/
│   └── useGlobalBasemap.ts  # NEW — useSyncExternalStore over
│                             # basemapState.ts, mirrors useBaseline.ts
├── scenario/
│   └── scenarioManager.ts   # EXTENDED — loadLocalScenario() passes
│                             # dirHandle.name as the new `path` field
├── services/
│   └── scenarioDiscovery.ts # EXTENDED — registerObserved()/
│                             # registerPublishedScenarios() pass their
│                             # existing folder-URL variable as `path`
├── panels/
│   ├── basemap/
│   │   ├── types.ts                    # EXTENDED — BasemapSource
│   │   │                                # gains 'global'
│   │   └── resolveEffectiveBasemap.ts  # EXTENDED — new optional
│   │                                    # 4th param, new 3rd-priority
│   │                                    # branch (research.md §6)
│   ├── FlowMapPanel.tsx     # EXTENDED — +useGlobalBasemap() call,
│   │                         # +1 arg to resolveEffectiveBasemap()
│   └── ZoneMapPanel.tsx     # EXTENDED — same one-line change
└── layout/
    ├── shell.tsx             # EXTENDED — header renders <SettingsModal />
    │                         # instead of <ScenarioLoader />+<ThemeToggle />
    ├── settingsModal.tsx     # NEW — Dialog + Tabs shell, 4 tabs
    ├── scenarioLoader.tsx    # DELETED — logic moved into
    │                         # settings/scenariosTab.tsx, not duplicated
    ├── themeToggle.tsx       # DELETED — logic moved into
    │                         # settings/appearanceTab.tsx, not duplicated
    └── settings/             # NEW directory
        ├── appearanceTab.tsx     # relocated ThemeToggle mode-state/effect
        │                         # logic (unchanged); visual form reverts
        │                         # to the original three-visible-option
        │                         # design, not the dropdown (research.md §9)
        ├── scenariosTab.tsx      # relocated ScenarioLoader logic +
        │                         # reorder/label controls
        ├── basemapTab.tsx        # NEW — preset picker over basemapState.ts
        └── documentationTab.tsx  # NEW — static placeholder

tests/
├── unit/
│   ├── appState.test.ts             # EXTENDED — order/label/FR-008/FR-018 cases
│   └── resolveEffectiveBasemap.test.ts  # EXTENDED — 5th truth-table row
└── integration/
    ├── settingsModal.spec.ts        # NEW — replaces themeToggle.spec.ts's
    │                                 # and scenarioManager.spec.ts's
    │                                 # UI-facing coverage
    ├── themeToggle.spec.ts          # DELETED (component it tests is gone)
    └── scenarioManager.spec.ts      # its Vitest-covered pure-logic
                                      # scope stays in appState.test.ts/
                                      # scenarioManager.test.ts; its own
                                      # UI-flow Playwright cases move into
                                      # settingsModal.spec.ts
```

**Structure Decision**: existing single-project `src/`/`tests/` layout,
unchanged. This feature is purely additive/relocating within it — no new
top-level directory, no new build target, no new project-structure
option.

## Complexity Tracking

*No Constitution Check violations — this section is empty by design.*
