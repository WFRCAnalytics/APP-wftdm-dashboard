# Implementation Plan: Graphic Walker Exploration Panel

**Branch**: `014-graphic-walker-panel` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-graphic-walker-panel/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add the ninth panel type — `graphic-walker` — to `panels/registry.tsx`,
closing out this project's originally-listed panel-type roadmap
(CLAUDE.md's Implementation order, item 10). Confirmed directly against
`project-docs/GRAMMAR.md`'s already-documented grammar (not assumed): this is an
*ordinary* panel entry (`dataset`/`limit`/`height`/`width`), not a
special "Explore tab" construct — "Explore tab" is purely an authoring
convention (one full-width panel in its own dashboard file), so no
shell/navigation-level change is needed at all.

Two real, confirmed findings from package research shape the design:
(1) `@kanaries/graphic-walker`'s peer dependency requires React 19 as of
`0.4.83`/`0.5.x`, incompatible with this project's pinned React `^18.3.1`
— the last React-18-compatible release is `0.4.82` (not `0.4.80`, an
earlier candidate rejected once a direct GitHub diff showed it lacks two
already-fixed bugs `0.4.82` has — research.md §2); (2) the library's
`fields` input is required, not auto-inferred from an empty array, so
this feature derives a field schema itself from the same `queryArrow()`
call's Arrow schema already used to fetch rows, via `apache-arrow`'s own
`DataType` predicates (research.md §5) — no second query, no arquero (not
a dependency of this package at all, confirmed).

The panel is a genuine snapshot: one query at mount, no reaction to
global sidebar filters, no persisted viewer state — all three already
documented in `project-docs/GRAMMAR.md`/`project-docs/ARCHITECTURE.md` before this
feature began, confirmed rather than re-derived. Reuses the existing
`services/duckdb.ts` connection, the existing `sqlExpander.ts`
`$scenario.` UNION-ALL mechanism (via a new, small `buildGraphicWalkerQuery()`
in `panelQuery.ts` — literal reuse of `expand()`, not a parallel
reimplementation), and the existing generic `panelCard.tsx`/
`usePanelExpandHost` chrome with zero changes to either (research.md
§7, confirmed by direct read, not assumed).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React (function
components) — same as every panel-type feature since `003`.

**Primary Dependencies**: `@kanaries/graphic-walker` `^0.4.82` — **new**
`package.json` dependency, pinned specifically for React-18 peer
compatibility (research.md §2). `apache-arrow` (`^18.0.0`, already a
dependency) supplies the `DataType` predicates field inference needs
(research.md §5). No deck.gl/MapLibre/any map-rendering package is
touched — this panel type has no map at all.

**Storage**: N/A beyond the existing Parquet-backed DuckDB views every
other panel type already queries — `dataset:` names an existing
`scenario__dataset` view, no new file format or published-asset
directory (unlike `013-zonemap-panel`'s `public/geometry/`).

**Testing**: Vitest (`graphicWalkerFields.ts`'s Arrow-type → field-schema
mapping, DOM-free/pure; `panelQuery.ts`'s new `buildGraphicWalkerQuery()`)
+ Playwright (real `embedGraphicWalker` rendering against the existing
`trip_mode_share` fixture, snapshot-query-count assertions via
`services/duckdb.ts`'s existing `__debugQueryLog()`, multi-scenario union
vs. pinned-scenario behavior, `config.fields` override, expand/collapse
state survival, error/empty states, and a full nine-panel-type
regression tab — quickstart.md).

**Target Platform**: Browser (Vite-built static app) — same as every
other panel type.

**Project Type**: Single-project web app (existing `src/`/`tests/`
structure — no new top-level directory, unlike `013`'s `public/geometry/`).

**Performance Goals**: No new goal beyond this app's existing baseline.
`limit:` (default 100000, per `project-docs/GRAMMAR.md`'s own documented example)
already bounds the one-time query's row count; SC-003 asks only that
this stay comparable to any other panel type loading a similarly-sized
table, not a new performance target.

**Constraints**: No `eval()` (constitution Principle III) — not at risk
here regardless, since this feature introduces no expression-evaluation
surface at all (`buildGraphicWalkerQuery()` only ever substitutes
`dataset`/`scenario`/`limit` as literal identifiers/numbers, the same
convention every other panel-type query builder already follows). No new
WebGL context expected (research.md §4) — a residual, explicitly-flagged
empirical-verification item, not asserted as proven. `@kanaries/
graphic-walker`'s own React-18 peer-compatibility must hold with zero
warnings at `npm install` time (research.md §2, quickstart.md
Prerequisites) — this is a hard constraint this plan depends on holding,
not a nice-to-have.

**Scale/Scope**: One new panel type, one new pure module
(`panels/graphicWalkerFields.ts` — field-schema inference), one new
`GraphicWalkerPanelConfig` type (extending `PanelConfigBase` directly,
not `DataBoundPanelConfigBase` — data-model.md), one new registry entry,
one small addition to `panels/panelQuery.ts` (`buildGraphicWalkerQuery()`
— no `sqlExpander.ts` change at all, its existing `$scenario.` expansion
is reused unmodified), one `vite.config.ts` `manualChunks` addition, one
new `package.json` dependency. No new fixture data (research.md §8) — a
real simplification versus every map-panel-type feature (`010`, `013`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v2.4.0:

- **I. TypeScript Throughout, React Permitted When Needed** — PASS.
  `GraphicWalkerPanel.tsx` is a React function component (`.tsx`);
  `graphicWalkerFields.ts` is pure/DOM-free logic with no JSX (`.ts`),
  same split every prior panel type's non-trivial logic already uses.
- **II. DuckDB-WASM Query Execution Off the Main Thread, One Shared
  Instance** — PASS. The one-time snapshot query goes through
  `services/duckdb.ts`'s existing `queryArrow()` (already exported since
  `001`, simply not previously consumed by any panel type directly) —
  same shared `AsyncDuckDB` instance and worker every other panel type
  already uses. No new connection, no new worker, no new extension.
- **III. No eval()** — PASS. `buildGraphicWalkerQuery()` substitutes
  `dataset`/`scenario`/`limit` as literal SQL text, the same string-
  templating convention every other panel-type query builder already
  follows; no expression-evaluation surface exists in this feature at
  all (unlike `013`'s `comparison: diff`, which this feature has no
  equivalent of).
- **IV. YAML Parsed at Runtime** — PASS. `GraphicWalkerPanelConfig`
  parses from the same runtime `dashboard-*.yaml` fetch/parse path every
  panel type config already goes through.
- **V. Parquet-Only Browser Data I/O** — PASS. `dataset:` resolves to an
  existing Parquet-backed view; no new file format reaches the browser.
- **VI. Fixed Technology Choices** — PASS. No Mapbox/Webpack/Web Storage
  usage; React/Tailwind/shadcn stack unchanged. `@kanaries/graphic-walker`
  is a new dependency but is not one of this principle's enumerated fixed
  choices (maps/build-tool/CSS framework) — adding a panel-type-specific
  library is the same category of addition `d3-sankey`/`marked`/
  `@observablehq/plot` each already were for their own panel types, not a
  Principle VI concern.
- **VII. Minimal, Fixed Config File Set** — PASS. No new config file
  type; `graphic-walker` is a `type:` value inside the existing
  `dashboard-*.yaml` grammar, already documented, not invented by this
  feature.
- **VIII. Reuse Proven Reference Implementations** — N/A, genuinely (not
  silently skipped): the principle's MUST-copy list covers DuckDB-WASM/
  Arrow wiring, MapLibre/deck.gl overlays, and spatial-SQL/GeoParquet
  handling (research.md §10, confirmed by re-reading the actual
  principle text) — this feature touches none of those; it consumes an
  already-exported `queryArrow()` unchanged and introduces no map/
  geometry code.
- **IX. Fixed Python/JS Source Split** — PASS. No Python package changes.

No violations. Complexity Tracking table below is empty.

**Post-Phase-1 re-check**: re-verified against the actual
`data-model.md`/`contracts/graphic-walker-panel.md`/`quickstart.md`
produced below. One thing worth naming explicitly, matching this
project's own established precedent of surfacing a planning-time
correction rather than shipping it silently: an earlier draft of this
plan considered extending `GraphicWalkerPanelConfig` from
`DataBoundPanelConfigBase` (matching every data-bound panel type since
`005`) — checked against `project-docs/GRAMMAR.md`'s actual documented example
and found wrong, since that base type requires a `metric` field this
grammar never uses (its own dataset-binding key is `dataset`); corrected
to extend `PanelConfigBase` directly instead, the same structural choice
`MarkdownPanelConfig` already made for an analogous reason (data-model.md
§1, research.md §1). No other principle-relevant design decision emerged
beyond what Technical Context already anticipated. Still PASS, no
Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/014-graphic-walker-panel/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── graphic-walker-panel.md  # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── layout/
│   └── types.ts                # MODIFIED: + GraphicWalkerFieldOverride,
│                                #   + GraphicWalkerPanelConfig (extends
│                                #   PanelConfigBase directly, NOT
│                                #   DataBoundPanelConfigBase —
│                                #   data-model.md §1), + 'graphic-walker'
│                                #   in the PanelConfig union
├── panels/
│   ├── registry.tsx             # MODIFIED: + 'graphic-walker':
│   │                             #   GraphicWalkerPanel entry
│   ├── GraphicWalkerPanel.tsx    # NEW — the component (contracts/
│   │                             #   graphic-walker-panel.md)
│   ├── graphicWalkerFields.ts    # NEW — pure Arrow-schema-to-IMutField[]
│   │                             #   inference (research.md §5), DOM-free
│   ├── panelQuery.ts             # MODIFIED: + buildGraphicWalkerQuery()
│   │                             #   (research.md §6) — reuses the
│   │                             #   existing, UNMODIFIED
│   │                             #   sqlExpander.expand() $scenario.
│   │                             #   mechanism; no sqlExpander.ts change
│   └── PanelEmptyState.tsx,
│       PanelErrorState.tsx       # UNCHANGED — reused directly
└── (services/duckdb.ts's existing queryArrow() consumed unmodified;
    panelCard.tsx/panelExpandHost.tsx consumed unmodified — research.md
    §7 confirms both are already fully generic; hooks/useActiveScenarios.ts
    consumed unmodified)

tests/
├── unit/
│   ├── graphicWalkerFields.test.ts  # NEW
│   └── panelQuery.test.ts           # MODIFIED: + buildGraphicWalkerQuery() cases
├── integration/
│   └── graphicWalkerPanel.spec.ts   # NEW
└── fixtures/
    └── dashboard-config/
        └── dashboard-2-detail.yaml  # MODIFIED: + a type: graphic-walker
                                       #   panel entry, bound to the
                                       #   already-existing
                                       #   trip_mode_share fixture table
                                       #   (research.md §8 — no
                                       #   generate.py change needed)

vite.config.ts                        # MODIFIED: + a 'graphic-walker'
                                       #   manualChunks entry
                                       #   (research.md §9)

package.json                          # MODIFIED: + @kanaries/graphic-walker
                                       #   ^0.4.82 dependency
```

**Structure Decision**: Single-project web app, unchanged from every
prior panel-type feature — no new top-level directory (unlike `013`'s
`public/geometry/`, this feature adds no new published-asset location at
all). New files land in the existing `src/panels/` (component + one pure
module) and `src/layout/types.ts` (config type), mirroring every prior
panel-type feature's own file placement.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally empty.
