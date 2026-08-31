# Implementation Plan: Panel Expand-to-Dialog

**Branch**: `004-panel-expand-dialog` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-panel-expand-dialog/spec.md`

## Summary

Add a generic expand-to-dialog affordance at the `panelCard.tsx` level so
any panel — every current type (`valuebox`, `plotly`) and every future
registry entry — can be viewed in a large, near-fullscreen Radix `Dialog`
with zero per-panel-type wiring. The central technical decision (weighed in
research.md §1, not picked for implementation speed) is to keep exactly one
mounted instance of the panel component per card and relocate its existing
DOM container between an inline location and a dialog location, rather than
either lifting query state into a shared cache for two mounted instances,
or letting the toggle silently recreate the chart's container. This
structurally guarantees FR-007/FR-008 (no reset, no duplicate query)
instead of merely testing for it. The second flagged risk — Radix's
outside-click detection against Plotly's own legend-click interactivity
(research.md §2) — is carried forward as a required, named Playwright
assertion, not assumed safe; both pass.

**Implementation surfaced two significant corrections to the plan as
written**, both fully documented in research.md rather than silently
folded in: (1) the relocation mechanism itself — a plain `createPortal`
target swap, this plan's original design — does not preserve mounted
state across a container change; it was replaced with the proven
"persistent portal host node, imperatively moved" technique (research.md
§1b), confirmed via the actual, real-cause debug evidence (a query-count
log and a container-identity marker), not merely re-reasoned. (2) `FR-009`
(chart resize) required a small, one-line change to `PlotlyPanel.tsx`
itself (a hardcoded pixel container height couldn't grow into the dialog)
— this plan's "zero panel changes" claim did not fully hold; documented in
`contracts/panel-card.md`. `forceMount` (originally planned to keep the
dialog's portal target always available) was also tried and reverted after
it was found to break page accessibility outside the dialog entirely
(research.md §1a) — a normal, Presence-driven mount turned out to be both
simpler and sufficient once §1b's mechanism no longer needed it.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), same as `001`/`002`/`003`

**Primary Dependencies**: **new** — `@radix-ui/react-dialog` (`^1.1.x`,
matching the version line already pinned for `@radix-ui/react-tabs`/
`@radix-ui/react-tooltip`, research.md §7). Existing, unmodified: `react`/
`react-dom`, `lucide-react` (`Maximize2`/`X` icons), `plotly.js-dist-min`
(already installed by `003`; this feature adds no new chart capability,
only re-verifies `003`'s existing `ResizeObserver` fix against a new
container context), the existing `Card`/`Button` shadcn components and
`003`'s panel registry — all consumed, none altered in contract.

**Component source**: New `src/components/ui/dialog.tsx` (hand-authored,
matching `tabs.tsx`/`tooltip.tsx`'s existing pattern — not CLI output, per
`003`'s same note); new `src/layout/panelExpandHost.tsx` (hand-authored,
the generic mechanism itself, a hook — `contracts/panel-expand-host.md`);
modified `src/layout/panelCard.tsx`. Also modified, found necessary during
implementation and not originally planned: `src/components/ui/button.tsx`
(added an `icon` size variant — no existing one fit a label-less trigger)
and `src/panels/PlotlyPanel.tsx` (its container's hardcoded pixel height
couldn't grow into the dialog; changed to fill its actual parent —
`contracts/panel-card.md`).

**Storage**: N/A — no new persistence, no new config file, no new config
file type (constitution Principle VII unaffected; data-model.md). Purely
transient, local component state (research.md §5 — no lifted/global
"which panel is expanded" store).

**Testing**: No new pure-logic module — the portal-target-swap mechanism is
inherently DOM/React-dependent (refs, `createPortal`, Radix internals),
unlike `003`'s `panelQuery.ts`/`plotlyTraces.ts`. Entirely Playwright:
`tests/integration/panelExpand.spec.ts`, extending
`dashboardShell.spec.ts`'s existing real-browser/real-fixture-data pattern
(research.md §6) — no new component-testing library.

**Target Platform**: Browser — same as `001`/`002`/`003`

**Project Type**: Single-project web frontend, additive to `001`/`002`/`003`

**Performance Goals**: N/A explicit numeric target; SC-001's "single
click/tap" and SC-003's "zero additional loading indicators" are
qualitative, structurally-guaranteed-by-design outcomes (research.md §1),
not a latency budget to separately measure.

**Constraints**: The *mechanism* — knowledge of panel types, the registry,
config shapes — MUST live at `panelCard.tsx`/`panelExpandHost.tsx` only;
`ValueBoxPanel.tsx`/`PlotlyPanel.tsx`/any future panel component MUST
require zero *awareness of the expand mechanism* (FR-002; data-model.md's
`usePanelExpandHost` signature: `title`/`children`/a common `height`
field only, no panel-type-specific knowledge). This held for
`ValueBoxPanel.tsx` completely; `PlotlyPanel.tsx` needed one CSS value
changed (`height: '100%'` instead of a hardcoded pixel default) to satisfy
FR-009 — a sizing fix, not new awareness of expand/collapse existing (it
has no idea whether its container is currently inline or in a dialog).
Expand/collapse MUST NOT alter `config`/`filters` — the panel component's
own fetch-effect dependency array — since that is the actual mechanism
FR-007/FR-008 rely on being undisturbed; confirmed via a query-count log
across the full round trip, not merely asserted. Radix's accessibility
behavior (focus trap, Escape, outside-click) MUST be inherited, not
re-implemented (FR-012) — true for focus-trap/outside-click; focus*-return*
specifically needed one explicit `onCloseAutoFocus` handler, since this
mechanism's trigger button isn't a `<DialogTrigger>` (research.md,
`contracts/panel-expand-host.md`).

**Scale/Scope**: 1 new dependency, 1 new shadcn primitive (`dialog.tsx`),
1 new generic host hook (`panelExpandHost.tsx`), 1 modified component
(`panelCard.tsx`), 2 small modified files found necessary during
implementation (`button.tsx`, `PlotlyPanel.tsx`), 1 new Playwright spec.
No new panel type (spec.md's explicit scope boundary, matching `003`'s).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | All new/modified files are `.tsx`; React already adopted — this feature extends the existing panel/layout layer, not a new adoption decision | PASS |
| II. DuckDB-WASM off the main thread, one shared instance | Not touched — this feature adds no query, no new `AsyncDuckDB`/`Worker`/connection usage; every panel's existing `query()` call is untouched by expand/collapse (that's the whole point of research.md §1's decision) | PASS (N/A) |
| III. No `eval()` | Not applicable — no SQL construction in this feature at all | PASS (N/A) |
| IV. YAML parsed at runtime | Not applicable — no new config key, no new YAML shape; the expand affordance is uniform/always-on, requiring nothing from `dashboard-*.yaml` (data-model.md) | PASS (N/A) |
| V. Parquet-only browser I/O | Not applicable — no new data I/O path | PASS (N/A) |
| VI. Fixed Technology Choices | `@radix-ui/react-dialog` is exactly "shadcn/ui, built on Radix UI primitives" — the same component family already used for `Tabs`/`Tooltip` (constitution's own wording), not a new UI library or pattern | PASS |
| VII. Minimal, Fixed Config File Set | No new config file type; no new key added to the existing `dashboard-*.yaml` type either — confirmed in data-model.md | PASS |
| VIII. Reuse Proven Reference Implementations | N/A — none of the four named reference repos (DuckDB-WASM/Arrow, MapLibre+flowmap.gl/deck.gl, spatial-SQL/GeoParquet, Vite+coi-serviceworker) cover dialogs/modals; this principle's named scope doesn't reach this feature | PASS (N/A) |
| IX. Fixed Python/JS Source Split | No Python package code touched; all new files under `src/` | PASS |

No unjustified violations. Complexity Tracking table is not needed (left
empty below).

**Post-Phase 1 re-check**: research.md's decisions (single-instance portal
relocation over lifted shared state or dual-render; default Radix
outside-click handling pending a required dedicated test rather than a
custom `onInteractOutside` override; local-only expand state) and
data-model.md/contracts's resulting shapes introduce nothing that revisits
the table above — no principle is touched differently than assessed
pre-research. Still PASS across all nine.

**Post-implementation re-check**: the two corrections found during actual
implementation (the portal mechanism itself, §1b; the `PlotlyPanel.tsx`
height fix) are both implementation-detail corrections to *this plan*, not
new information bearing on any constitution principle — Principle I
(TypeScript/React) still holds (`PlotlyPanel.tsx`'s one-line change is
still `.tsx`, still consumes `services/duckdb.ts` the same way), and no
other principle's PASS above depends on any claim these corrections
touched. Still PASS across all nine, confirmed after the full Playwright
suite (26 tests: `boot.spec.ts`, `dashboardShell.spec.ts`,
`panelExpand.spec.ts`) and unit suite (53 tests) both passed together.

## Project Structure

### Documentation (this feature)

```text
specs/004-panel-expand-dialog/
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/                  # Phase 1 output
│   ├── panel-expand-host.md
│   ├── dialog-primitive.md
│   └── panel-card.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

Single-project web frontend, additive to `001`/`002`/`003`. Only the paths
this feature creates/touches are listed.

```text
package.json                        # + @radix-ui/react-dialog

src/
├── components/
│   └── ui/
│       ├── dialog.tsx              # new — hand-authored shadcn-pattern
│                                    # Dialog wrapper around
│                                    # @radix-ui/react-dialog (see
│                                    # contracts/dialog-primitive.md)
│       └── button.tsx              # modified — added `icon` size variant
│                                    # (found necessary, not in original plan)
├── layout/
│   ├── panelExpandHost.tsx         # new — the generic expand mechanism,
│                                    # a hook: a persistent portal host
│                                    # node, imperatively moved between an
│                                    # inline anchor and a Dialog anchor
│                                    # (see contracts/panel-expand-host.md;
│                                    # research.md §1b — not a createPortal
│                                    # target swap, which was tried first
│                                    # and found not to preserve mount state)
│   └── panelCard.tsx               # modified — adds expand trigger to
│                                    # CardHeader, wires the registry-
│                                    # resolved panel component through
│                                    # usePanelExpandHost (see
│                                    # contracts/panel-card.md)
├── panels/
│   ├── ValueBoxPanel.tsx           # unmodified
│   ├── registry.tsx                # unmodified
│   └── PlotlyPanel.tsx             # modified — container height changed
│                                    # from a hardcoded pixel default to
│                                    # 100% (found necessary for FR-009,
│                                    # not in original plan — see
│                                    # contracts/panel-card.md)
└── services/
    └── duckdb.ts                   # modified — added a debug query-count
                                     # log (__debugQueryLog), purely
                                     # additive test instrumentation, no
                                     # existing export's behavior changed
                                     # (used by panelExpand.spec.ts to
                                     # verify FR-008 deterministically)

tests/
└── integration/
    └── panelExpand.spec.ts         # new — Playwright: expand/collapse
                                     # round trip, focus management, no
                                     # duplicate query, chart container
                                     # identity, Plotly-legend-vs-outside-
                                     # click (research.md §2)
```

**Structure Decision**: Single-project layout, additive to `001`/`002`/
`003`. No new top-level directory — this feature is scoped mainly to one
new UI primitive (`components/ui/dialog.tsx`), one new layout-level
mechanism (`layout/panelExpandHost.tsx`), and one modified existing file
(`panelCard.tsx`), plus the small, transparently-documented corrections
above (`button.tsx`, `PlotlyPanel.tsx`, `duckdb.ts`) found necessary during
implementation rather than anticipated in this plan's first draft.

## Complexity Tracking

*No entries — Constitution Check reported no unjustified violations.*
