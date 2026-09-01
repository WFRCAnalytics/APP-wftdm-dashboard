# Implementation Plan: Scenario Manager (local folder loading)

**Branch**: `009-scenario-manager` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-scenario-manager/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add the manual "load a local scenario folder" capability
`services/duckdb.ts`'s `registerScenario(name, dirHandle)` has been ready
for, with zero callers, since `001-data-state-layer`. A new
`src/scenario/` module (`manifestReader.ts` + `scenarioManager.ts`) picks
a folder via `showDirectoryPicker()`, reads its `manifest.yaml` directly
from the handle (a new capability — `yamlLoader.ts`'s existing functions
are fetch-only), resolves name collisions (reject against a published
scenario, replace-cleanly against an already-loaded local one — both
grounded in `appState.ts`/`duckdb.ts`'s own existing documented
behavior), and calls the already-existing `registerScenario()` +
`appState.register()`/`setStatus()`/`setActive()` exactly as their own
doc comments have described since `001`. A new `layout/scenarioLoader.tsx`
hosts the trigger and a minimal loaded-scenario list near the tab bar,
gated on a new `isLocalDeployment()` check (WEB mode only, per
`docs/SPEC.md`'s documented LOCAL/WEB split). The one genuinely new
architectural piece: `appState.ts` gains a small pub/sub mechanism
(mirroring `filterState.ts`'s already-proven, already-consumed pattern),
consumed via a new `useActiveScenarios()` hook, so that activating a local
scenario refreshes already-rendered panels' data **without** discarding
any panel's own local UI state — chosen deliberately over a cheaper
key-based-remount alternative specifically because remount would regress
`004`'s and `007`'s own state-preservation guarantees (research.md §1,
resolving the user's pre-planning instruction to weigh this honestly).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React (function
components) — same as every feature since `003`.

**Primary Dependencies**: None new. Uses the browser's native
`showDirectoryPicker()`/`FileSystemDirectoryHandle` API (Chrome/Edge only,
per `docs/ARCHITECTURE.md`) and the already-installed `js-yaml` (via a
newly factored-out `yamlLoader.ts` export, research.md §4). No new
`package.json` entry.

**Storage**: N/A — locally loaded scenarios are in-memory only for the
page's lifetime (constitution Principle VI: no Web Storage); lost on
reload by design (spec.md Edge Cases/Assumptions).

**Testing**: Vitest (`manifestReader.ts`'s parse/fallback logic,
`scenarioManager.ts`'s pure collision-classification logic, `appState.ts`'s
new `subscribe()` firing correctly — all DOM-free) + Playwright (the full
pick → register → activate → panel-refresh flow, via a fake
`window.showDirectoryPicker` injected through `page.addInitScript()`
backed by real fixture Parquet bytes — research.md §2 — since a real
native folder dialog cannot be driven in a headless/CI run at all, not
merely "harder to automate"). `useActiveScenarios.ts`'s reactive behavior
is deliberately **not** given its own Vitest unit test — `vitest.config.js`
runs `environment: 'node'` (pure logic only, no React renderer), the same
reason `useFilterState.ts` (the hook this one mirrors) has no unit test of
its own either; its behavior is verified indirectly through the Playwright
suite's panel-level assertions instead.

**Target Platform**: Browser (Vite-built static app), WEB deployment mode
specifically (hidden entirely on `localhost` — FR-001, research.md §5).

**Project Type**: Single-project web app (existing `src/`/`tests/`
structure — `src/scenario/` is a new subdirectory, already named and
scoped in `CLAUDE.md`'s file tree since before this feature existed, not
a novel structural addition).

**Performance Goals**: No new goal — folder registration cost is bounded
by `registerScenario()`'s existing per-file `registerFileBuffer()` +
`CREATE VIEW` cost, unchanged by this feature; reads real bytes off local
disk via the File System Access API, not a network fetch.

**Constraints**: `appState.ts`'s new `subscribe()` mechanism MUST NOT
change any existing export's signature or behavior (additive only,
research.md's "Modified — additive only" framing in contracts/); the
five data-bound panel components' diffs (contracts/scenario-manager.md's
panel diff) MUST NOT change any panel's rendering output or local-state
shape — only what triggers their existing data-fetch effect to re-run.

**Scale/Scope**: One new small subdirectory (`src/scenario/`, two files),
one new hook, one new layout component, one small additive change each to
`state/appState.ts` and `services/yamlLoader.ts`, and one identical
three-line mechanical diff repeated across five existing panel components
(`ValueBoxPanel.tsx`, `PlotlyPanel.tsx`, `TablePanel.tsx`,
`ObservablePlotPanel.tsx`, `SankeyPanel.tsx`). No new panel type, no new
`dashboard-*.yaml` grammar, no new config file type.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v2.2.0:

- **I. TypeScript Throughout, React Permitted When Needed** — PASS.
  `scenarioLoader.tsx` is a React function component (`.tsx`);
  `manifestReader.ts`/`scenarioManager.ts`/`useActiveScenarios.ts` are
  `.ts` (the hook has no JSX despite being React-aware, same category as
  `useFilterState.ts`).
- **II. DuckDB-WASM Query Execution Off the Main Thread, One Shared
  Instance** — PASS. `scenarioManager.ts` calls the existing
  `services/duckdb.ts` `registerScenario()`/`unregisterScenario()`
  exports unmodified; no new connection, no new worker, no direct
  `AsyncDuckDB`/`Worker` construction anywhere in this feature.
- **III. No eval()** — PASS. No SQL construction in this feature at all —
  it registers views and toggles activation state; every query this
  feature's data ends up in still goes through the existing
  `sqlExpander.ts` string-templating path, unmodified.
- **IV. YAML Parsed at Runtime** — PASS. `manifest.yaml` is read and
  parsed at the moment a folder is picked (runtime), via the same
  `js-yaml`-backed `parseYAMLText` `yamlLoader.ts` now exports — not
  pre-processed or baked in.
- **V. Parquet-Only Browser Data I/O** — PASS. `registerScenario()`
  (unmodified) reads only `.parquet` files from the picked folder's
  `summary/` subfolder — same format constraint as every other scenario
  source.
- **VI. Fixed Technology Choices** — PASS. No Mapbox, no Webpack, no Web
  Storage (locally loaded scenarios are explicitly not persisted — spec.md
  Assumptions). No new UI-layer primitive introduced — `scenarioLoader.tsx`
  reuses `Button`/`Tooltip` from `components/ui/` unmodified (research.md
  §6). `showDirectoryPicker()` isn't a technology choice this principle's
  enumerated list covers or forbids — it's a native browser API this
  principle's list was never scoped to address.
- **VII. Minimal, Fixed Config File Set** — PASS. `manifest.yaml` is
  already one of the three fixed config file types; this feature adds a
  new *reading path* for a file whose *type* already exists, not a new
  config file type. No new file type created.
- **VIII. Reuse Proven Reference Implementations** — N/A. None of the
  designated reference repos (DuckDB-WASM/Arrow, MapLibre/flowmap.gl,
  spatial-SQL/GeoParquet, Vite+coi-serviceworker) address local
  folder-picker UX; this principle's scope doesn't reach this feature.
- **IX. Fixed Python/JS Source Split** — PASS. No Python package changes;
  all new files live under `src/`.

No violations. Complexity Tracking table below is empty.

**Post-Phase-1 re-check**: re-verified against the actual
`data-model.md`/`contracts/scenario-manager.md`/`quickstart.md` produced
below. The one design decision worth naming here explicitly —
`appState.ts` gaining a pub/sub mechanism, and five existing panel
components each receiving a small mechanical diff — is additive
architecture, not a violation of any principle above (Principle II
still holds: no new DuckDB-WASM connection/worker; Principle I still
holds: still TypeScript/React, no new framework). It's called out in
Technical Context/Constraints because it's real, cross-cutting surface
area for this feature, not because it conflicts with governance. Still
PASS, no Complexity Tracking entries.

**Post-implementation re-check**: re-verified against what was actually
built (`src/scenario/scenarioManager.ts`, `manifestReader.ts`,
`fileSystemAccess.d.ts`; `src/hooks/useActiveScenarios.ts`;
`src/layout/scenarioLoader.tsx`; the `appState.ts`/`yamlLoader.ts`
additions; the five panel-file diffs), not just the pre-implementation
design intent above. Still PASS across all nine principles. Two real,
unanticipated findings worth recording (neither is a violation):
- A new ambient type declaration (`fileSystemAccess.d.ts`) was needed —
  TypeScript's bundled `lib.dom.d.ts` (5.9.3, confirmed directly) declares
  `FileSystemDirectoryHandle` itself (for `StorageManager.getDirectory()`'s
  OPFS use) but not `Window.showDirectoryPicker()`. Not predicted in
  Technical Context/research.md; a small, additive `.d.ts` file, not a
  dependency or technology-choice question Principle VI's list covers.
- `playwright.config.js` needed a real fix (`127.0.0.1` instead of
  `'localhost'`, plus an explicit Vite `--host` bind) once this feature
  introduced the first hostname-sensitive application behavior the whole
  test suite has ever had — every prior feature's tests ran on literal
  `localhost` with nothing caring about hostname, so this collision with
  `isLocalDeployment()`'s correctly-spec'd check had no way to surface
  until now. A test-infrastructure fix, not a principle violation or a
  weakening of the production check itself.

No Complexity Tracking entries were needed at any point in this feature.

## Project Structure

### Documentation (this feature)

```text
specs/009-scenario-manager/
├── plan.md                          # This file (/speckit-plan command output)
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── scenario-manager.md          # Phase 1 output
└── tasks.md                         # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── state/
│   └── appState.ts               # MODIFIED: + subscribe()/notify(),
│                                  #   header comment corrected
│                                  #   (research.md §1)
├── services/
│   └── yamlLoader.ts              # MODIFIED: + parseYAMLText() factored
│                                  #   out of loadConfig (research.md §4)
├── hooks/
│   └── useActiveScenarios.ts      # NEW — appState.subscribe() wrapped
│                                  #   with useSyncExternalStore, mirrors
│                                  #   useFilterState.ts (research.md §1)
├── scenario/                      # NEW subdirectory — CLAUDE.md's file
│   │                              #   tree already named/scoped this
│   │                              #   before this feature existed
│   ├── manifestReader.ts          # NEW — reads manifest.yaml from a
│   │                              #   FileSystemDirectoryHandle
│   │                              #   (research.md §4)
│   └── scenarioManager.ts         # NEW — showDirectoryPicker() flow,
│                                  #   collision handling, deployment-mode
│                                  #   detection (research.md §3, §5)
├── layout/
│   ├── shell.tsx                  # MODIFIED: + <ScenarioLoader /> in
│   │                              #   the header, alongside <NavBar />
│   └── scenarioLoader.tsx         # NEW — trigger + loaded-scenario list
│                                  #   (research.md §6)
└── panels/
    ├── ValueBoxPanel.tsx          # MODIFIED: 3-line mechanical diff
    ├── PlotlyPanel.tsx            # MODIFIED: 3-line mechanical diff
    ├── TablePanel.tsx             # MODIFIED: 3-line mechanical diff
    ├── ObservablePlotPanel.tsx    # MODIFIED: 3-line mechanical diff
    └── SankeyPanel.tsx            # MODIFIED: 3-line mechanical diff
                                    # (all five identical in shape — see
                                    #   contracts/scenario-manager.md's
                                    #   panel diff)

tests/
├── unit/
│   ├── manifestReader.test.ts     # NEW
│   ├── scenarioManager.test.ts    # NEW (pure decision logic only)
│   └── appState.test.ts           # NEW — subscribe() coverage
│                                  #   (no useActiveScenarios.test.ts —
│                                  #   see Testing above)
└── integration/
    └── scenarioManager.spec.ts    # NEW — fake showDirectoryPicker() flow
                                    #   (research.md §2)
```

**Structure Decision**: Single-project web app, unchanged from every
prior feature. `src/scenario/` is a genuinely new subdirectory, but one
`CLAUDE.md`'s file tree has named and scoped since before this feature
was specified (item 7 in CLAUDE.md's Implementation order,
"⏸️ explicitly deferred") — this feature fills a pre-existing, pre-named
gap rather than inventing new structure. The five panel-file touches and
the two state/service-layer additions are the feature's real cross-cutting
surface, called out explicitly in Technical Context rather than
downplayed as "just wiring."

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally empty.
