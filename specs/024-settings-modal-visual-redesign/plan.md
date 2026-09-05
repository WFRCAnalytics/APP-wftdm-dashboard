# Implementation Plan: Settings Modal Visual Redesign

**Branch**: `024-settings-modal-visual-redesign` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-settings-modal-visual-redesign/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Four independent, visual-only corrections to the already-shipped Settings
modal (020-settings-modal, 021-basemap-catalog-redesign): (1) legible,
color-coded status on the Scenarios tab; (2) a live preview for Raster Tiles
selections, reversing 021's own "no preview" decision now that research
(research.md §1) has confirmed the resolution logic to do this already
exists and just isn't being called from the preview path; (3) visual
polish of the existing Basemap catalog list (no structural change); and (4)
rebuilding the Appearance tab's System/Light/Dark selector on the shared
`Tabs` primitive instead of a plain button row, with an explicit,
tested fix for the resulting nested-`role="tablist"` collision risk
(research.md §3). No underlying mechanism (scenario status computation,
baseline resolution, basemap precedence/resolution, or the stage-then-Apply
flow) changes — every touched file is in the presentation layer.

## Technical Context

**Language/Version**: TypeScript (ES2022 target, Vite) — no change.

**Primary Dependencies**: React (already adopted); Tailwind CSS + shadcn/ui
(Radix UI primitives) + `lucide-react` (already fixed, Constitution
Principle VI); MapLibre GL `^4.7.1` (already pinned) for the raster preview,
via its already-used `type: 'raster'` source support — no new dependency
for any of the four items (research.md §5).

**Storage**: N/A — no new persisted state. Reuses `state/appState.ts`
(`Scenario.status`), `state/basemapState.ts`/`useGlobalBasemap()`, and
`state/themeState.ts`/`useThemeMode()` exactly as they exist today.

**Testing**: Vitest (unit) for any new pure logic; Playwright
(`tests/integration/settingsModal.spec.ts`) for behavior/accessibility —
existing suite, extended, not replaced.

**Target Platform**: Browser (Chromium/Firefox), matching the rest of this
app — no platform change.

**Project Type**: Single-project web frontend (existing `src/` layout) — no
new top-level directory.

**Performance Goals**: No new DuckDB query load (this feature touches no
SQL). The raster preview issues the same handful of XYZ tile requests
MapLibre already issues for any raster source; no measurable regression
expected over the existing vector-style preview's own tile/style fetches.

**Constraints**: No new npm dependency (research.md §5); no `localStorage`/
`sessionStorage` (Constitution Principle VI, unaffected — theme mode still
resets to `system` on a full reload, unchanged); the three-file config set
(Constitution Principle VII) is untouched — no new YAML grammar.

**Scale/Scope**: Four existing components (`scenariosTab.tsx`,
`basemapTab.tsx`, `appearanceTab.tsx`, plus `settingsModal.tsx`'s outer
`TabsList` for the `aria-label` addition), one CSS file (`tokens.css`), and
the existing `settingsModal.spec.ts` integration suite (extended plus two
existing assertions migrated per research.md §3). No new files expected
beyond test additions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. TypeScript throughout, React permitted | All touched files are already `.tsx`/`.ts`; no new plain `.js` | PASS |
| II. DuckDB-WASM off main thread, one instance | Not touched — no SQL/query change in this feature | PASS (N/A) |
| III. No `eval()` | No dynamic code execution introduced | PASS |
| IV. YAML parsed at runtime | No YAML/grammar change | PASS (N/A) |
| V. Parquet-only browser I/O | Not touched | PASS (N/A) |
| VI. Fixed technology choices (MapLibre not Mapbox, Vite not Webpack, no Web Storage, Tailwind/shadcn/Radix/lucide-react) | Raster preview uses MapLibre's native raster source (already the case elsewhere in this codebase); Appearance tab rebuild uses the already-adopted Radix `Tabs` primitive; no Web Storage introduced | PASS |
| VII. Minimal, fixed config file set | No new config file type | PASS (N/A) |
| VIII. Reuse proven reference implementations | Raster preview reuses this app's OWN existing `loadBasemapStyle()` resolution (research.md §1) rather than re-deriving a new mechanism — the strongest form of this principle's intent | PASS |
| IX. Fixed Python/JS source split | Not touched | PASS (N/A) |

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/024-settings-modal-visual-redesign/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory — this feature exposes no external API, CLI
surface, or grammar; it is purely internal UI presentation on top of
already-existing internal interfaces (`appState.ts`, `basemapState.ts`,
`themeState.ts`, `registry.ts`), none of which change shape.

### Source Code (repository root)

```text
src/
├── styles/
│   └── tokens.css              # + --success/--success-foreground token pair
├── layout/
│   ├── settingsModal.tsx       # + aria-label="Settings sections" on outer TabsList
│   └── settings/
│       ├── scenariosTab.tsx    # status → color-treatment rendering (visual only)
│       ├── basemapTab.tsx      # remove raster-preview bypass + placeholder;
│       │                       # visual polish of existing list/section markup
│       └── appearanceTab.tsx   # rebuilt on Tabs/TabsTrigger, aria-label="Theme"
├── panels/basemap/
│   └── loadBasemapStyle.ts     # unchanged (research.md §1) — reused, not modified
└── components/ui/
    └── tabs.tsx                # unchanged — already generic enough (research.md §5)

tests/integration/
└── settingsModal.spec.ts       # migrate 2 role="button" assertions to role="tab";
                                 # add coverage for status coloring, raster preview,
                                 # and the two-distinguishable-tablists requirement
```

**Structure Decision**: Single project, existing layout. Every file touched
already exists; no new directory. `loadBasemapStyle.ts` and `tabs.tsx` are
listed to make explicit that research confirmed they need NO changes
(reused as-is) — a deliberate scope boundary, not an oversight.

## Complexity Tracking

*No violations — table omitted.*
