# Implementation Plan: Left Sidebar Navigation, Accordion Sub-Sections, and a Chromeless Full-Page Panel Mode

**Branch**: `030-sidebar-navigation` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-sidebar-navigation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace `shell.tsx`/`navBar.tsx`'s fixed horizontal header + tab strip with
a left sidebar (hand-authored against shadcn/ui's real `Sidebar`
architecture, adapted to this app's own legacy-registry-track/Tailwind v3
conventions — see research.md §1), driven by the same runtime tab-discovery
mechanism `navBar.tsx` already uses. Adds three new, purely additive
`dashboard-*.yaml` grammar fields (`header.icon`, `header.full_page`,
`sections`) so a tab can carry a sidebar icon, render as a chromeless
edge-to-edge single-panel page, and expose its own sub-sections as
accordion sidebar items while active. Removes the Hide-on-Scroll nav mode
and the `ResizeObserver`-based header-height compensation it required
entirely — both become structurally unneeded once the sidebar replaces the
`position: fixed` header. Adds a "Metric Strip" auto-fill grid for
all-`valuebox` rows and documents a twelfths-based `width:` convention,
with zero runtime change to the existing fraction-to-`fr`-unit grid math.

## Technical Context

**Language/Version**: TypeScript, ES2022 target (unchanged — `tsc --noEmit` via `npm run typecheck`)

**Primary Dependencies**: React 18.3 (existing); Tailwind CSS 3.4 + shadcn/ui pattern + `lucide-react` (existing, Constitution Principle VI). New: `@radix-ui/react-separator` (a real, new explicit `package.json` dependency — see research.md §2 for why this is the *only* new Radix package needed, smaller than shadcn's own generic `sidebar.tsx` implies). No new non-Radix dependency.

**Storage**: N/A — sidebar expand/collapse state is in-memory React state only, explicitly NOT persisted (no cookie, no `localStorage`/`sessionStorage`), matching this app's own established no-persisted-UI-preference convention (`state/basemapState.ts`'s "No persistence" precedent) and Constitution Principle VI's Web Storage prohibition in spirit even though a cookie isn't literally named there (research.md §3).

**Testing**: Vitest (`npm run test:unit`) for new pure logic modules (row/section resolution, metric-strip detection); Playwright (`npm run test:integration`) for the sidebar shell, full-page mode, and accordion sub-nav, including dual-theme `getComputedStyle()` assertions per `wftdm-design-system`'s non-negotiable.

**Target Platform**: Browser (unchanged) — no new platform constraint. No dedicated mobile/off-canvas experience is built (research.md §4); the existing icon-collapsed state also applies below a narrow-viewport breakpoint.

**Project Type**: Single web app (`src/`) — unchanged.

**Performance Goals**: No new performance target — this is a presentation-layer/layout feature. Existing panel-type performance characteristics (query timing, WebGL context budget) are explicitly untouched (FR-022).

**Constraints**: Zero code-level hardcoding of tab count/name/icon/sections anywhere in the sidebar or full-page mechanism (spec.md's own "Explicit scope boundary" section — carried into every design decision below, not re-litigated). Dual-theme correctness is non-negotiable (FR-021).

**Scale/Scope**: This repo's own fixture/demo content — up to ~9 sidebar items (6 ActivitySim tabs + Explore Data + whatever else a fixture/demo set already carries), up to 13 sub-sections on one tab (Tour Models, per spec.md's own research). The mechanism itself has no hardcoded ceiling on either count (FR-003).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against every one of the constitution's nine principles directly,
not assumed clean by default:

| Principle | Check | Result |
|---|---|---|
| I. TypeScript throughout, React permitted | New code is `.tsx`/`.ts`, React already adopted | ✅ Pass |
| II. DuckDB-WASM off main thread, one instance | Not touched — no query/data-layer change | ✅ Pass (N/A) |
| III. No `eval()` | Not touched — no new SQL/dynamic code execution | ✅ Pass (N/A) |
| IV. YAML parsed at runtime | The three new grammar fields (`icon`, `full_page`, `sections`) are parsed by the existing `js-yaml`-based `yamlLoader.ts`/`layout/types.ts` parse path at runtime, same as every existing field — no build-time baking | ✅ Pass |
| V. Parquet-only browser I/O | Not touched | ✅ Pass (N/A) |
| VI. Fixed technology choices | MapLibre/Vite/Tailwind/shadcn/`lucide-react` all unchanged; no Mapbox/Webpack introduced. Web Storage: sidebar state is explicitly NOT persisted anywhere (see Technical Context/Storage above) — this is a stricter posture than shadcn's own default (a cookie), chosen specifically to stay inside this principle's own rationale ("state explicit and inspectable," not silently persisted) even though cookies aren't the literal named mechanism | ✅ Pass |
| VII. Minimal, fixed config file set | The three new fields are additive keys on the EXISTING `dashboard-*.yaml` file type — no new config file type is created | ✅ Pass |
| VIII. Reuse proven reference implementations | Not applicable — this principle's MUST-copy list is scoped to DuckDB-WASM/MapLibre/spatial-SQL/Vite+coi-serviceworker patterns, none of which this feature touches. shadcn/ui's own real `Sidebar` architecture is consulted directly (research.md §1) as this app's own already-established PRIMARY design reference (`wftdm-design-system` skill's Provenance section), not a Principle VIII obligation | ✅ Pass (N/A) |
| IX. Fixed Python/JS source split | Not touched — no Python package change | ✅ Pass (N/A) |

**No violations found. Complexity Tracking table below is intentionally
empty** — every design decision in Phase 0/1 either reuses an existing
pattern or is justified directly against a principle above, with no
unjustified deviation requiring a tracked exception.

## Project Structure

### Documentation (this feature)

```text
specs/030-sidebar-navigation/
├── plan.md                     # This file (/speckit-plan command output)
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   ├── sidebar-shell.md        # UI contract: sidebar shell, footer, full-page mode
│   └── dashboard-grammar.md    # Grammar contract: icon/full_page/sections fields
└── tasks.md                    # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

This is a single-project web app (existing structure, unchanged — see
`CLAUDE.md`'s own file tree). No new top-level directory is introduced;
this feature adds/removes files within the existing `src/` tree only:

```text
src/
├── components/ui/
│   ├── sidebar.tsx              # NEW — hand-authored (not CLI-fetched — see
│   │                             # research.md §1), adapted to this repo's
│   │                             # legacy-registry/Tailwind-v3 conventions:
│   │                             # SidebarProvider, Sidebar, SidebarHeader,
│   │                             # SidebarContent, SidebarFooter, SidebarMenu,
│   │                             # SidebarMenuItem, SidebarMenuButton,
│   │                             # SidebarTrigger, useSidebar. No Sheet/
│   │                             # Skeleton/Input sub-components (research.md
│   │                             # §4 — not needed for this app's own scope).
│   └── separator.tsx            # NEW — small, generic; the one new Radix
│                                 # primitive this feature actually needs
├── layout/
│   ├── shell.tsx                 # REWRITTEN — SidebarProvider/Sidebar/
│   │                             # SidebarInset composition; the ResizeObserver/
│   │                             # headerHeight/paddingTop measurement
│   │                             # machinery is REMOVED (structurally
│   │                             # unneeded — see research.md §5), not adapted
│   ├── navBar.tsx                # DELETED — superseded by sidebarNav.tsx
│   │                             # (research.md §6 — not a reusable
│   │                             # primitive like dropdown-menu.tsx, a
│   │                             # bespoke composition tied to the old shell)
│   ├── sidebarNav.tsx            # NEW — this app's own composition of
│   │                             # components/ui/sidebar.tsx: primary items
│   │                             # from discovered tabs (icon + label),
│   │                             # active-tab-only section sub-nav,
│   │                             # DashboardBrand in SidebarHeader,
│   │                             # SettingsModal in SidebarFooter
│   ├── dashboardRenderer.tsx     # MODIFIED — new full-page branch (FR-008),
│   │                             # Metric Strip row detection (FR-018),
│   │                             # section-id anchors for scroll-to (FR-016)
│   ├── panelCard.tsx             # MODIFIED — chromeless-mode support, OR
│   │                             # a new sibling FullPagePanel component
│   │                             # bypasses it entirely (data-model.md
│   │                             # decides the exact shape)
│   ├── dashboardLayout.ts        # NEW — pure module: isMetricStripRow(),
│   │                             # resolveSections() (validates sections:
│   │                             # row references, warns on mismatch —
│   │                             # Edge Cases), findFullPagePanel()
│   │                             # (validates full_page tab has exactly
│   │                             # one panel)
│   ├── types.ts                  # MODIFIED — DashboardTabConfig gains
│   │                             # header.icon?/header.full_page?/sections?
│   └── settings/appearanceTab.tsx # MODIFIED — "Top Bar Behavior" control
│                                 # removed (FR-006)
├── hooks/
│   ├── useNavBarVisibilityMode.ts # DELETED (FR-006)
│   └── useScrollDirection.ts      # DELETED — dead code once shell.tsx's
│                                   # own wiring is removed (its one caller)
├── state/
│   └── navBarVisibilityState.ts   # DELETED (FR-006)
└── panels/
    └── GraphicWalkerPanel.tsx     # Likely UNCHANGED (research.md §7 — the
                                    # height-chain fix is expected to land
                                    # entirely in the new full-page ancestor
                                    # chain, not inside this file; confirmed
                                    # or corrected during implementation,
                                    # not assumed here)

docs/
└── GRAMMAR.md                     # MODIFIED — documents header.icon/
                                    # header.full_page/sections/twelfths
                                    # convention (FR-019)

tests/
├── unit/dashboardLayout.test.ts   # NEW
└── integration/
    ├── sidebarNav.spec.ts         # NEW
    ├── fullPagePanel.spec.ts      # NEW
    └── sectionSubNav.spec.ts      # NEW
```

**Structure Decision**: Single-project web app, existing `src/` tree — no
new top-level directory. This feature is a shell/layout-layer change
(`layout/`, `components/ui/`, `panels/GraphicWalkerPanel.tsx` if needed,
`project-docs/GRAMMAR.md`), following the exact same file-organization convention
every prior panel/shell feature in this project's history has used
(`003-dashboard-shell-navigation`, `020-settings-modal`,
`021-basemap-catalog-redesign`).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this table is intentionally empty (see Constitution Check
above).

## Constitution Check — post-Phase-1 re-evaluation

Re-checked against Phase 0/1's actual design output (research.md,
data-model.md, contracts/), not just the pre-design intent above:

- **Principle VI (Web Storage)**: confirmed still clean — research.md §3
  settled on plain in-memory React state, no cookie, no `localStorage`/
  `sessionStorage` anywhere in the design. The one new dependency
  (`@radix-ui/react-separator`, research.md §2) is a visual-only
  primitive with no storage/persistence behavior of its own.
- **Principle VII (fixed config file set)**: confirmed still clean —
  data-model.md's three additions (`header.icon`, `header.full_page`,
  `sections`) are all fields on the EXISTING `dashboard-*.yaml` file
  type; no fourth config file type is introduced anywhere in the design.
- **Principle IV (YAML at runtime)**: confirmed still clean — all three
  new fields parse through the existing runtime `parseDashboardConfig()`
  path (data-model.md §1), no build-time step added.
- **No new violation surfaced by Phase 1 design that Phase 0 didn't
  already anticipate.** Gate still passes; Complexity Tracking remains
  empty.
