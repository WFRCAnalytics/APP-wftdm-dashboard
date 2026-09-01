# Implementation Plan: FlowMapPanel

**Branch**: `010-flowmap-panel` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-flowmap-panel/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add the seventh panel type — `flowmap` — to `panels/registry.tsx`,
following the config → query → render shape every prior data-bound panel
type already uses, but with a fundamentally different rendering model:
this is the first panel type that owns a persistent, imperative,
non-React-managed instance (`maplibregl.Map` + a deck.gl `MapboxOverlay`
hosting a `FlowmapLayer`) across its full mount lifetime, rather than
rebuilding a chart/SVG/DOM output on every data change. A new
`panels/flowmapData.ts` (pure, DOM-free, mirroring `008-sankey-panel`'s
`sankeyGraph.ts`) turns flat query rows into deduplicated locations and
summed flows, applying `008`'s own real link-key-bug lesson as a
precedent to avoid rather than relearn. `FlowMapPanel.tsx` creates the
map/overlay exactly once on mount, updates via `overlay.setProps()` on
data/filter change, and tears down via `map.remove()` on unmount — per
`docs/SPEC.md`'s own documented wiring. Resize handling follows the real,
production `APP-Commute-Explorer` reference app's own explicit
`ResizeObserver` pattern rather than relying solely on MapLibre's native
auto-resize (research.md §2); whether the map survives 004's
`appendChild`-based DOM relocation with its WebGL context intact is
resolved by a mandated empirical Playwright test, not asserted from
research alone (research.md §3, per the user's own explicit instruction
to apply that rigor). The base map uses a minimal, zero-network style —
no external CDN/tile dependency (research.md §9, a real violation caught
and fixed while writing this feature's own contract, not shipped as
written).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React (function
components) — same as every panel-type feature since `003`.

**Primary Dependencies**: `maplibre-gl` (`^4.7.1`), `@deck.gl/core`,
`@deck.gl/layers`, `@deck.gl/mapbox` (`^9.0.0` each), `@flowmap.gl/layers`
(`^9.3.0`) — all four already pinned in the constitution (v2.3.0), all
new to `package.json`. No `@types/*` devDependencies needed — every
package ships its own types (research.md §1, confirmed against each
real published `package.json`). `@luma.gl/*`/`@flowmap.gl/data` resolve
transitively via `@deck.gl/core`/`@flowmap.gl/layers`'s own real
dependencies — verified, not assumed, and not separately pinned.

**Storage**: N/A — reads existing Parquet-backed DuckDB views via the
existing query pipeline; no new persisted data or config file type
(constitution Principle VII). Zone-centroid resolution is entirely an
offline post-processor concern this feature never touches (spec.md
Grammar findings #3; `docs/CALIBRATION-SUMMARIES.md` flags the future
obligation).

**Testing**: Vitest (`panels/flowmapData.ts`'s `buildFlowmapData` —
DOM-free, `environment: 'node'` is sufficient) + Playwright (real map
rendering, the mandated 004-relocation survival test — research.md §3 —
filter reactivity, resize on both a plain window resize and the 004
transition, error/empty states, the `console.warn` exclusion signal, and
a DevTools-equivalent zero-external-request check for the base style).

**Target Platform**: Browser (Vite-built static app) — same as every
other panel type; this feature's map rendering has no server-side
concern, and (research.md §9) makes no external network request itself
either, preserving `wftdm-dashboard here`'s no-internet-required design.

**Project Type**: Single-project web app (existing `src/`/`tests/`
structure — no new top-level directory).

**Performance Goals**: No new goal beyond this app's existing baseline
(panel renders progressively as its own query resolves). `FlowmapLayer`'s
own clustering (`clusteringEnabled`/`clusteringAuto`) handles the
large-flow-count case at the library level, not something this feature
re-implements.

**Constraints**: The `maplibregl.Map`/`MapboxOverlay` instances MUST be
created exactly once per panel mount and MUST survive both a data/filter
change (via `setProps()`, never recreation) and 004's DOM-relocation
mechanism — the latter verified empirically (research.md §3), not
assumed. No external network dependency for the base map (research.md
§9, constitution Principle II's no-CDN discipline).

**Scale/Scope**: One new panel type, one new pure module
(`flowmapData.ts`), one new `FlowMapPanelConfig` type, one new registry
entry, four new `package.json` dependencies, a `vite.config.ts`
`manualChunks` addition. No existing shared module
(`layout/types.ts`'s `DataBoundPanelConfigBase`, `services/sqlExpander.ts`,
`panels/panelQuery.ts`) needs modification — purely additive, like
`008-sankey-panel` and unlike `007`'s own foundational changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v2.3.0:

- **I. TypeScript Throughout, React Permitted When Needed** — PASS.
  `FlowMapPanel.tsx` is a React function component (`.tsx`);
  `flowmapData.ts` is pure logic with no JSX (`.ts`), same split every
  prior panel type's non-trivial logic already uses.
- **II. DuckDB-WASM Query Execution Off the Main Thread, One Shared
  Instance** — PASS. `FlowMapPanel.tsx` queries via `services/duckdb.ts`'s
  existing `query()` import, same as every other panel type; no new
  connection, no new worker. The map/overlay instances are an entirely
  separate concern (WebGL rendering, not query execution) and introduce
  no new DuckDB-WASM touchpoint.
- **III. No eval()** — PASS. No SQL construction beyond
  `panelQuery.ts`/`sqlExpander.ts`'s existing string-templating, reused
  unmodified.
- **IV. YAML Parsed at Runtime** — PASS. `FlowMapPanelConfig` parses from
  the same runtime `dashboard-*.yaml` fetch/parse path every panel type
  config already goes through.
- **V. Parquet-Only Browser Data I/O** — PASS. Reads the same
  Parquet-backed DuckDB views every other panel type reads; no new
  format, no GeoParquet (Grammar findings #3 — that's `zonemap`'s
  concern, deliberately untouched here).
- **VI. Fixed Technology Choices** — PASS. No Mapbox (MapLibre only, per
  the principle's own explicit naming), no Webpack, no Web Storage. Adds
  `maplibre-gl`/`@deck.gl/*`/`@flowmap.gl/layers` — all four already
  named as this project's fixed choice in the Technology Stack Reference
  and pinned peer-dependency list (v2.3.0); this feature implements an
  already-decided choice, not a new one. The base-map style choice
  (research.md §9, no external CDN) directly upholds this principle's
  own no-Web-Storage-adjacent "keep state/dependencies explicit and
  self-hosted" spirit, extended here to a network dependency rather than
  a storage one.
- **VII. Minimal, Fixed Config File Set** — PASS. No new config file
  type; `flowmap` is a `type:` value inside the existing
  `dashboard-*.yaml` grammar (itself corrected this session, not
  invented by this feature — see spec.md's Grammar findings).
- **VIII. Reuse Proven Reference Implementations** — PASS (not N/A, for
  the first time among the panel-type features): `WFRCAnalytics/
  APP-Commute-Explorer`'s `FlowLayer.jsx`/`MapView.jsx` are this
  principle's own designated reference for exactly this
  MapboxOverlay+FlowmapLayer+MapLibre wiring, hover/pick pattern — fetched
  and read directly this session (both for the grammar correction and
  this plan's own resize/relocation research), not re-derived from
  scratch.
- **IX. Fixed Python/JS Source Split** — PASS. No Python package changes;
  all new files live under `src/`.

No violations. Complexity Tracking table below is empty.

**Post-Phase-1 re-check**: re-verified against the actual
`data-model.md`/`contracts/flowmap-panel.md`/`quickstart.md` produced
below. One thing worth naming explicitly: this feature's own contract
draft initially defaulted the base map to an external hosted style URL,
which would have been a real Principle VI/II-adjacent violation (an
undisclosed CDN dependency) — caught and corrected during this same
planning phase (research.md §9), not shipped and found later. No other
principle-relevant design decision emerged during Phase 1 design beyond
what Technical Context already anticipated. Still PASS, no Complexity
Tracking entries.

**Post-implementation re-check**: re-verified against what was actually
built (`src/panels/FlowMapPanel.tsx`, `flowmapData.ts`;
`src/layout/types.ts`'s `FlowMapPanelConfig`; `src/panels/registry.tsx`'s
new entry; `vite.config.ts`'s new `maps` chunk; `package.json`'s four new
dependencies). Still PASS across all nine principles. No new violations
found — every implementation-time finding (tasks.md's own Completion
section: the `Number(null)` coordinate-validity bug, the DuckDB
`HUGEINT` test-query quirk, the over-broad no-CDN test scope, a
Playwright strict-mode locator bug) was a real bug in this feature's own
code or tests, not a constitutional concern. Principle VIII (Reuse Proven
Reference Implementations) is now genuinely exercised for the first time
among the panel-type features, not merely N/A — `APP-Commute-Explorer`'s
own `FlowLayer.jsx`/`MapView.jsx` were fetched and read directly, both
for the `docs/GRAMMAR.md` correction and this plan's own resize/
relocation research, and their proven patterns (explicit `ResizeObserver`
handling, `locMap`-style id-keyed location dedup) carried directly into
`flowmapData.ts`/`FlowMapPanel.tsx` rather than being re-derived.

No Complexity Tracking entries were needed at any point in this feature.

## Project Structure

### Documentation (this feature)

```text
specs/010-flowmap-panel/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── flowmap-panel.md # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── layout/
│   └── types.ts               # MODIFIED: + FlowMapPanelConfig, +
│                               #   'flowmap' in the PanelConfig union
├── panels/
│   ├── registry.tsx            # MODIFIED: + 'flowmap': FlowMapPanel entry
│   ├── FlowMapPanel.tsx         # NEW — the component (contracts/flowmap-panel.md)
│   └── flowmapData.ts           # NEW — pure rows-to-locations/flows
│                                #   transform (research.md §4)
└── (no other src/ file modified — services/, state/, hooks/,
    components/ui/ all reused unmodified, same as 008-sankey-panel)

vite.config.ts                  # MODIFIED: + a manualChunks entry for
                                 #   maplibre-gl/@deck.gl/*/@flowmap.gl —
                                 #   exact boundary decided in tasks.md

tests/
├── unit/
│   └── flowmapData.test.ts      # NEW
├── integration/
│   └── flowmapPanel.spec.ts     # NEW
└── fixtures/
    ├── generate.py               # MODIFIED: + an od_flows-shaped
    │                              #   fixture table
    └── dashboard-config/
        └── dashboard-1-summary.yaml  # MODIFIED: + a type: flowmap panel entry
```

**Structure Decision**: Single-project web app, unchanged from every
prior panel-type feature — no new top-level directory. New files land in
the existing `src/panels/` (component + one pure module) and
`src/layout/types.ts` (config type), mirroring `008-sankey-panel`'s own
file placement exactly. `vite.config.ts` is the one shared-infrastructure
file this feature touches (a genuinely new situation — no panel type
since `003`'s own Plotly chunk addition has needed a build-config
change), because this is the first panel type pulling in large,
previously-absent map-rendering libraries.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally empty.
