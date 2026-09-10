# Implementation Plan: Scenarios Tab Redesign — Drag Reorder, Baseline Chip, Verified Active Toggle

**Branch**: `037-scenarios-tab-redesign` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-scenarios-tab-redesign/spec.md`

## Summary

Redesign `layout/settings/scenariosTab.tsx`'s row interaction model, in five
parts, over the already-shipped `035`/`036` state (label/color propagation,
color picker, status treatment):

- **Part A** — no code change. Direct live investigation (spec Research §Part A)
  confirmed the active/inactive `Switch` is wired correctly (`checked={s.active}`,
  no negation; `observed` renders `checked` because it's the only force-active
  scenario by default). Deliverable: a permanent regression test locking this in
  (FR-001).
- **Part B** — relocate the existing up/down move buttons from the trailing
  actions cluster to the row's leading edge, before the status dot.
- **Part C** — add pointer + keyboard drag reordering via `@dnd-kit/core` +
  `@dnd-kit/sortable` (spec Research §Part C recommendation), through a NEW
  single `appState` reorder mutator that the relocated arrows also funnel
  through (FR-004: one reordering code path, not two).
- **Part D** — replace the Star / Star+"Baseline"-text control entirely with
  ONE chip in the identity block beside the name: filled non-interactive
  "Baseline" on the baseline row, outline clickable "Set as baseline" elsewhere,
  no tooltip (its text is self-explanatory).
- **Part E** — add a scoped `Tooltip` on the active/inactive `Switch` explaining
  that it controls which scenarios are included in comparisons/queries.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18.3.1

**Primary Dependencies**: existing — Tailwind CSS v4, shadcn/ui (Radix UI
primitives), `lucide-react`, Vitest, Playwright. **New** — `@dnd-kit/core`
(`^6.3.1`), `@dnd-kit/sortable` (`^10.0.0`), `@dnd-kit/utilities` (`^3.2.2`,
imported directly for `CSS.Transform`); **optional** `@dnd-kit/modifiers`
(`^9.0.0`) for `restrictToVerticalAxis`/`restrictToParentElement`.

**Storage**: N/A — in-memory `state/appState.ts` only; no persistence, no
`localStorage`/`sessionStorage` (Principle VI).

**Testing**: Vitest for the new pure `appState` reorder mutator + any extracted
pure helper; Playwright for the drag interaction (pointer + keyboard), the
Part B relocation's pixel alignment, the Part D chip states, the Part E
tooltip, and the FR-001 Switch-wiring regression — all in both themes.

**Target Platform**: modern evergreen browsers with COOP/COEP (unchanged).

**Project Type**: single static web app (SPA).

**Performance Goals**: 60 fps drag with no layout jank. The list is small
(typically 2–10 scenarios) — no virtualization, no `@dnd-kit` performance
tuning needed.

**Constraints**: both themes verified for every visual change (non-negotiable,
this component's own session history); pixel alignment verified with real
`getBoundingClientRect()` measurement, not visual inspection (FR-015); keyboard
+ screen-reader parity for reordering is required (FR-005/FR-006); the reorder
data operation must be a single source of truth (FR-004).

**Scale/Scope**: one component rewrite (`scenariosTab.tsx`), one new `appState`
export (`reorderScenario`), `moveScenario` reimplemented in terms of it, 3–4
new npm deps, ~6 new/updated Playwright tests + ~4 new Vitest cases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. TypeScript throughout, React permitted | ✅ Pass | All changes in existing `.tsx`/`.ts`; no new plain `.js` in `src/`. |
| II. DuckDB-WASM off main thread, one instance | ✅ N/A | This feature touches no query path. |
| III. No `eval()` | ✅ Pass | No dynamic code execution introduced. |
| IV. YAML parsed at runtime | ✅ N/A | No config files touched. |
| V. Parquet-only browser I/O | ✅ N/A | No data I/O. |
| VI. Fixed technology choices | ✅ Pass — see analysis below | `@dnd-kit` is a headless interaction/behavior toolkit, NOT a "component library, CSS framework, or icon set" — it is the same *category* of dependency as Radix UI itself (which shadcn/ui is built on), or `d3-sankey`/`marked`/`color`/`@observablehq/plot`/deck.gl already in this tree. It ships no styled components, no design tokens, no icons; it does not replace or compete with any shadcn/Radix/Tailwind/`lucide-react` role — shadcn/ui has no drag-and-drop primitive at all. Principle VI's binding list (MapLibre-not-Mapbox, Vite-not-Webpack, no Web Storage, Tailwind + shadcn/ui + Radix + `lucide-react` for the UI layer) is untouched: every styled element in this redesign is still a shadcn/Radix primitive + Tailwind classes, every icon is still `lucide-react` (`GripVertical` for the drag handle, existing `ChevronUp`/`ChevronDown` for the arrows). `react-beautiful-dnd` is also already a transitive dependency of `@kanaries/graphic-walker` in this tree today, so a drag library is not a novel presence. |
| VII. Minimal fixed config file set | ✅ N/A | No config files. |
| VIII. Reuse proven reference implementations | ✅ N/A | The named references cover DuckDB/Arrow/MapLibre/deck.gl/GeoParquet/Vite — none cover a settings-list DnD interaction. `@dnd-kit`'s own official docs are the reference here (spec Research §Part C, fetched directly). |
| IX. Fixed Python/JS source split | ✅ N/A | No Python touched; all work under `src/`. |
| Dev Workflow: panel pattern | ✅ N/A | `scenariosTab.tsx` is a Settings-modal tab, not a dashboard panel; the panel pattern doesn't apply. |

**Gate result: PASS.** The only principle needing analysis is VI, resolved
above — no amendment required, no violation to justify in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/037-scenarios-tab-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── scenarios-tab-row.md   # UI contract for the redesigned row
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── state/
│   └── appState.ts                       # EXTEND — new export `reorderScenario(name, targetIndex)`
│                                         # (full re-sequence of `order` across the ordered list);
│                                         # existing `moveScenario(name, 'up'|'down')` REIMPLEMENTED
│                                         # to delegate to it (one reordering code path, FR-004).
│                                         # No new field on `Scenario`.
├── layout/settings/
│   ├── scenariosTab.tsx                  # REWRITE — Part B (arrows → leading edge), Part C
│   │                                     # (DndContext + SortableContext + a per-row useSortable
│   │                                     # drag handle, GripVertical from lucide-react), Part D
│   │                                     # (single baseline chip in the identity block, replacing
│   │                                     # the Star/Star+text control entirely), Part E (scoped
│   │                                     # Tooltip on the Switch). Every other region — status
│   │                                     # dot/loading text, color swatch, remove button,
│   │                                     # border/background treatment — is carried over unchanged.
│   └── scenarioRow.tsx                   # NEW (optional split) — one row as its own component so
│                                         # `useSortable()` (a hook, must be called unconditionally
│                                         # per-row) has a clean call site; keeps scenariosTab.tsx
│                                         # readable. Pure-presentational, no new state.
└── (no other src/ files change)

tests/
├── unit/
│   └── appState.test.ts                  # NEW or EXTEND — `reorderScenario()` re-sequences
│                                         # correctly (move down, move up, move to first/last,
│                                         # no-op to same index); `moveScenario()` still passes
│                                         # its existing cases after the reimplementation;
│                                         # `getBaseline()` still ignores display order (FR:
│                                         # reordering never changes the automatic baseline).
└── integration/
    └── settingsModal.spec.ts             # EXTEND — a new "User Story (037)" describe block:
                                          #   - FR-001: Switch checked state == real `active` for
                                          #     both an active (`observed`) and inactive scenario,
                                          #     asserted together, both themes.
                                          #   - US1: pointer drag reorders; the relocated arrows
                                          #     still reorder identically; drag released outside
                                          #     restores order; boundary arrows stay disabled;
                                          #     pixel-alignment of every non-reorder control across
                                          #     rows, both themes (real getBoundingClientRect).
                                          #   - US1 keyboard: focus the drag handle, Space to lift,
                                          #     Arrow to move, Space to drop — reorders; an
                                          #     aria-live announcement is emitted.
                                          #   - US2: baseline chip filled "Baseline" non-clickable
                                          #     on baseline row; outline "Set as baseline" clickable
                                          #     elsewhere; clicking moves the filled state + text;
                                          #     no Star/Badge-elsewhere remains.
                                          #   - US3: hovering the Switch shows the explanatory
                                          #     tooltip; the baseline chip has none.
```

**Structure Decision**: Single-project SPA layout, already established. The one
real structural choice is whether to split a row into its own `scenarioRow.tsx`
component. Recommended: yes — `@dnd-kit/sortable`'s `useSortable()` is a hook
that must be called once per row unconditionally, which is cleanest at a
dedicated component's top level rather than inside a `.map()` callback in
`scenariosTab.tsx`. `scenariosTab.tsx` keeps the `DndContext`/`SortableContext`
wrapper, the list, the summary band, and the "Load Local Scenario" control.

## Complexity Tracking

*No constitution violations — this section intentionally empty.*
