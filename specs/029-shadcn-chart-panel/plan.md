# Implementation Plan: shadcn/Recharts Chart Panel Type

**Branch**: `029-shadcn-chart-panel` | **Date**: 2026-09-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-shadcn-chart-panel/spec.md`

## Summary

Add a tenth panel type, `type: recharts`, built on shadcn/ui's official
chart component (a thin theming layer over Recharts). Extends
`DataBoundPanelConfigBase` + `ComparisonCapablePanelConfig` exactly like
`plotly`/`table`/`observable-plot` already do, reusing `buildPanelQuery()`
unmodified. Supports `bar`/`line`/`area` chart types in this first version.
Introduces five new `--chart-1`..`--chart-5` design tokens (light + dark,
WCAG-verified, built from this app's own real WFRC brand hues — not a
generic default palette). Fully additive: `plotly`/`observable-plot`/
`sankey` are untouched.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3

**Primary Dependencies**: `recharts` `^2.15.4` (NEW — confirmed absent
from `node_modules` before this feature; the real shadcn CLI install
pinned this specific version, not npm's newer "latest" tag originally
researched — research.md §6's own correction. Peer dependencies confirmed
to include `^18.0.0`, compatible with this app's pinned React `^18.3.1`,
unlike `014-graphic-walker-panel`'s own earlier React-19-only pin
conflict). shadcn's own `chart.tsx` (new `components/ui/chart.tsx`, added
via the shadcn CLI — see research.md §5 for why this departs from this
repo's prior hand-authored-component convention). Real, confirmed
transitive additions: `lodash`, `react-smooth`, `recharts-scale`,
`victory-vendor@^36.6.8`. No other new dependency.

**Storage**: N/A (browser-only, DuckDB-WASM query results; no persistence)

**Testing**: Vitest (`tests/unit/rechartsEncoding.test.ts`, plus new cases
in `tests/unit/tokenContrast.test.ts`), Playwright
(`tests/integration/rechartsPanel.spec.ts`) — matching every prior
panel-type feature's own split.

**Target Platform**: Browser (Chromium/Firefox via Playwright)

**Project Type**: Single project — existing Vite + React dashboard app,
no backend/API component

**Performance Goals**: No new query pattern — reuses the existing
`buildPanelQuery()`/`query()` path every other data-bound panel type
already uses; no additional latency beyond that already-established
baseline. Recharts' own dependency chain (`@reduxjs/toolkit`,
`react-redux`, `immer`, `victory-vendor`) is real and non-trivial —
addressed via its own `manualChunks` entry (research.md §6), matching
`plotly`/`maps`/`graphic-walker`'s own existing precedent, so it never
loads for a dashboard that doesn't use a `recharts` panel.

**Constraints**: MUST NOT modify `plotly`/`observable-plot`/`sankey`
(FR-010); MUST NOT implement Sankey rendering (FR-011); MUST NOT build
legend-click-to-toggle (FR-007); every new visual element MUST be
verified in both light and dark mode via real `getComputedStyle()` checks
(FR-012, the `wftdm-design-system` skill's own non-negotiable dual-theme
requirement).

**Scale/Scope**: One new panel type, one new `components/ui/chart.tsx`
primitive, one new pure transform module, five new design tokens, one new
npm dependency. No change to `panelQuery.ts`, `services/duckdb.ts`, or any
existing panel type.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (TypeScript throughout, React permitted)**: PASS — new
  code is `.ts`/`.tsx`, follows the established function-component panel
  pattern exactly.
- **Principle II (DuckDB-WASM off main thread, one shared instance)**:
  PASS — no new DuckDB instance/connection; reuses the existing shared
  `query()`/`buildPanelQuery()` path unmodified.
- **Principle III (no `eval()`, string-templated SQL only)**: PASS — this
  feature builds no new SQL-construction logic at all; it calls the
  existing, unmodified `buildPanelQuery()`.
- **Principle IV (YAML parsed at runtime)**: PASS — `type: recharts` is a
  new panel entry in the existing `dashboard-*.yaml` grammar, parsed the
  same runtime way every other panel type already is.
- **Principle V (Parquet-only browser I/O)**: PASS — no new data format;
  queries the same registered Parquet-backed views every other panel type
  does.
- **Principle VI (fixed technology choices)**: PASS — `lucide-react`/
  Tailwind/shadcn-on-Radix conventions are unaffected; Recharts is a new
  *charting* dependency, not a UI-primitive-framework choice, and doesn't
  touch the fixed MapLibre/Vite/no-Web-Storage constraints at all. Adding
  it is exactly the kind of additive charting-technology decision
  `project-docs/PIPELINE.md`'s own "five total chart technologies" note already
  anticipated and named as the first to actually be built.
- **Principle VII (minimal, fixed config file set)**: PASS — no new
  config file; `type: recharts` is a new panel-type value inside the
  existing `dashboard-*.yaml` grammar.
- **Principle VIII (reuse proven reference implementations)**: N/A — this
  feature touches no DuckDB-WASM/Arrow wiring, MapLibre/deck.gl overlay,
  or spatial-SQL surface the mandate list covers.
- **Principle IX (fixed Python/JS source split)**: PASS — no Python
  changes; all new code under `src/`.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/029-shadcn-chart-panel/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── recharts-panel.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
src/
├── layout/
│   ├── types.ts                 # RechartsPanelConfig (new), extending
│   │                              # DataBoundPanelConfigBase +
│   │                              # ComparisonCapablePanelConfig
│   └── types.ts (PanelConfig union gains RechartsPanelConfig)
├── components/
│   └── ui/
│       └── chart.tsx             # NEW — shadcn's official chart
│                                  # component, added via the shadcn CLI
│                                  # (research.md §5)
├── panels/
│   ├── registry.tsx              # gains 'recharts': RechartsPanel
│   ├── RechartsPanel.tsx         # NEW — the panel component
│   ├── rechartsEncoding.ts       # NEW — pure, DOM-free transform:
│   │                              # tidy SQL rows -> Recharts' own
│   │                              # per-series wide-row data shape +
│   │                              # ChartConfig, same reason
│   │                              # observablePlotEncoding.ts/
│   │                              # sankeyGraph.ts were split out
│   │                              # (research.md §2)
│   └── panelQuery.ts              # unchanged — buildPanelQuery()
│                                  # already generic over
│                                  # DataBoundPanelConfigBase
├── styles/
│   └── tokens.css                 # gains --chart-1..--chart-5
│                                  # (light + dark — research.md §1)
├── vite.config.ts                 # gains a `recharts` manualChunks
│                                  # entry (research.md §6)
└── tailwind.config.js             # gains a `chart` color-token group
                                   # mirroring --success's own pattern

docs/
└── GRAMMAR.md                     # documents type: recharts

tests/
├── unit/
│   ├── rechartsEncoding.test.ts   # NEW — pure-module tests
│   └── tokenContrast.test.ts      # extended — new chart-color-vs-
│                                  # background non-text-contrast checks
│                                  # (research.md §1)
└── integration/
    └── rechartsPanel.spec.ts      # NEW — real-browser tests, including
                                   # the dual-theme getComputedStyle()
                                   # checks FR-012 requires
```

**Structure Decision**: Single project, existing layout. Follows the exact
same file-split precedent every prior panel-type feature already
established (a `*.tsx` component + a pure `*.ts` transform module,
registered in `panels/registry.tsx`), plus the token-addition precedent
`--success` already established in `tokens.css`/`tailwind.config.js`.

## Post-Design Constitution Check

*Re-evaluated after Phase 1 (data-model.md, contracts/, quickstart.md).*

Design confirmed zero changes to `panelQuery.ts`, `sqlExpander.ts`, or any
existing panel type — the new panel type is additive at every layer
(config type, registry entry, tokens, dependency). The one new dependency
(`recharts`) is a charting library, not a UI-primitive-framework
substitution, so Principle VI's fixed technology choices remain intact.
Every Constitution Check item above still holds; no new violation was
introduced by the concrete design. Complexity Tracking remains not needed.

## Complexity Tracking

*No Constitution Check violations — this section is not needed.*
