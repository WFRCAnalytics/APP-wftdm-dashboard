# Implementation Plan: Viewer-Selectable Dataset Picker for Graphic Walker Panels

**Branch**: `028-graphic-walker-dataset-picker` | **Date**: 2026-09-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-graphic-walker-dataset-picker/spec.md`

## Summary

`GraphicWalkerPanel.tsx` (`014-graphic-walker-panel`) is bound to one fixed,
author-configured `dataset:` at a time. This feature adds an opt-in
`dataset_picker: true` flag to `GraphicWalkerPanelConfig` that shows the
viewer a control listing every metric name genuinely queryable across all
currently active scenarios (derived from `services/duckdb.ts`'s existing
`listViews()` registry, filtered to active-scenario-prefixed views), lets
them switch it, and re-queries/re-renders Graphic Walker against the new
selection — reusing the existing `buildGraphicWalkerQuery()`/`$scenario.`
union mechanism unmodified, just with a viewer-controlled dataset name
instead of always `config.dataset`. Panels that don't set the flag are
byte-for-byte unchanged.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3

**Primary Dependencies**: `@kanaries/graphic-walker` 0.4.82 (existing,
unmodified), `@radix-ui/react-dropdown-menu` ^2.1.2 (existing — reused for
the picker control, no new dependency), `services/duckdb.ts` (existing),
`services/sqlExpander.ts` (existing, unmodified)

**Storage**: N/A (browser-only, DuckDB-WASM in-memory views; no persistence
of the viewer's selection — Principle VI's no-Web-Storage rule)

**Testing**: Vitest (pure-module unit tests, `tests/unit/`), Playwright
(panel-level integration tests, `tests/integration/`) — matching every
prior panel-type feature's own split

**Target Platform**: Browser (Chromium/Firefox via Playwright; no
platform-specific behavior)

**Project Type**: Single project — existing Vite + React dashboard app
(`src/`), no backend/API component

**Performance Goals**: Switching datasets re-queries against an
already-registered, already-loaded Parquet view — no new network fetch is
required (DuckDB-WASM's own httpfs cache already holds the file's bytes
from initial scenario registration); re-render should feel instantaneous
to the viewer (SC-001), matching this panel type's existing one-shot query
latency.

**Constraints**: MUST NOT introduce reactivity to global dashboard filters
(FR-009, 014's own FR-005 stays intact); MUST NOT change behavior for any
panel that doesn't opt in (FR-002); MUST NOT persist the viewer's selection
(Principle VI); every offered dataset MUST be guaranteed queryable
(FR-005) — no new SQL construction risk beyond what `sqlExpander.ts`'s
existing, unmodified `expandScenario()` already guarantees.

**Scale/Scope**: One panel type (`graphic-walker`), one new pure module,
one new config field, one small UI control. No change to any other panel
type, to `services/duckdb.ts`'s public API, or to `sqlExpander.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (TypeScript throughout, React permitted)**: PASS — new code
  is `.ts`/`.tsx`, React already adopted, panel already a function
  component.
- **Principle II (DuckDB-WASM off main thread, one shared instance)**:
  PASS — no new DuckDB instance/connection/worker; reuses the existing
  shared instance via existing `query`/`queryArrow`/`listViews` exports.
  No new export needed on `services/duckdb.ts` beyond consuming
  `listViews()`, which already exists with zero callers today.
- **Principle III (no `eval()`, string-templated SQL only)**: PASS — the
  viewer-selected dataset name is substituted into the exact same
  `buildGraphicWalkerQuery()` template path every existing config already
  goes through (string interpolation, not `eval`). The dataset name itself
  is drawn only from the app's own live view registry (never raw viewer
  text input), so it can't inject arbitrary SQL any more than an author's
  own `dataset:` value already could.
- **Principle IV (YAML parsed at runtime)**: PASS — `dataset_picker` is a
  new optional key in `dashboard-*.yaml`'s existing `graphic-walker` panel
  grammar, parsed the same runtime way every other key already is; no
  build-time processing introduced.
- **Principle V (Parquet-only browser I/O)**: PASS — no new data format;
  every dataset offered is already a registered Parquet-backed view.
- **Principle VI (fixed technology choices)**: PASS — no Mapbox/Webpack/
  Web Storage; UI control reuses the already-installed
  `@radix-ui/react-dropdown-menu` shadcn-pattern primitive
  (`components/ui/dropdown-menu.tsx`), the same one `ThemeToggle`/`020`'s
  original Basemap tab already used for an equivalent single-select list —
  no new UI dependency added.
- **Principle VII (minimal, fixed config file set)**: PASS — no new config
  file; `dataset_picker` is a new field inside the existing
  `dashboard-*.yaml` panel grammar.
- **Principle VIII (reuse proven reference implementations)**: N/A — this
  feature touches no DuckDB-WASM/Arrow wiring, MapLibre/deck.gl overlay, or
  spatial-SQL surface the mandate list covers; it's a query-target-selection
  UI over an already-built query path.
- **Principle IX (fixed Python/JS source split)**: PASS — no Python
  changes; all new code under `src/`.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/028-graphic-walker-dataset-picker/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── graphic-walker-dataset-picker.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
src/
├── layout/
│   └── types.ts                    # GraphicWalkerPanelConfig gains
│                                    # `dataset_picker?: boolean` (additive)
├── panels/
│   ├── GraphicWalkerPanel.tsx      # gains local `selectedDataset` state,
│   │                                # the picker control, and a new
│   │                                # available-datasets effect
│   ├── graphicWalkerDatasets.ts    # NEW — pure module: derives the
│   │                                # selectable dataset list from
│   │                                # listViews() + active scenario names
│   ├── graphicWalkerFields.ts      # unchanged — already generic/reusable
│   └── panelQuery.ts               # buildGraphicWalkerQuery() unchanged;
│                                    # called with an effective config
│                                    # whose `dataset` is the current
│                                    # selection, not always config.dataset
├── services/
│   └── duckdb.ts                   # unchanged — listViews() already
│                                    # exists (zero callers today)
└── services/sqlExpander.ts         # unchanged

tests/
├── unit/
│   └── graphicWalkerDatasets.test.ts   # NEW — pure-module tests
└── integration/
    └── graphicWalkerPanel.spec.ts      # extended with dataset-picker
                                          # coverage (existing 014 test file)
```

**Structure Decision**: Single project, existing layout — this feature adds
one new pure module (`panels/graphicWalkerDatasets.ts`), extends one
existing component and one existing type file, and adds test coverage in
the same two test trees (`tests/unit/`, `tests/integration/`) every prior
panel-type feature already used. No new top-level directory, no new
service, no new dependency.

## Post-Design Constitution Check

*Re-evaluated after Phase 1 (data-model.md, contracts/, quickstart.md).*

Design added exactly one new pure module
(`panels/graphicWalkerDatasets.ts`), one new optional config field
(`dataset_picker`), and one new small UI control built on an
already-installed primitive — no new dependency, no new service, no
change to `services/duckdb.ts`'s or `services/sqlExpander.ts`'s public
contracts. Every Constitution Check item above still holds; no new
violation was introduced by the concrete design. Complexity Tracking
remains not needed.

## Complexity Tracking

*No Constitution Check violations — this section is not needed.*
