# Implementation Plan: Dashboard Shell, Navigation, and First Two Panel Types

**Branch**: `003-dashboard-shell-navigation` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-dashboard-shell-navigation/spec.md`

## Summary

Build the first real (non-throwaway) UI in this app: a shell that renders
whatever tabs `001-data-state-layer`'s dashboard-config discovery surfaces,
navigated via `002-design-tokens`' shadcn `Tabs` component, styled entirely
through the established token set. Add the panel registry the constitution's
v2.2.0 amendment already specifies (`panels/registry.tsx`, a `type` →
component map) and populate it with the first two panel types — `valuebox`
(config → query → rendered scalar) and `plotly` (YAML config → SQL
expansion → query → `Plotly.react()`, using `project-docs/SPEC.md`'s corrected
two-effect pattern). Technical approach: introduce typed parsing of
`dashboard-*.yaml`'s `header`/`filters`/`layout` structure (currently opaque
`raw: unknown` from `yamlLoader.ts`); a small, new `panelQuery.ts` module
that turns a panel's config + current filter values into the SQL template
`sqlExpander.ts` already knows how to expand (`$filters.x`/`$scenario.x` —
not `$mappings`/`$bins`/`$sql`, which are `summarize.yaml`-only concepts
baked into the Parquet by the offline post-processor, per `project-docs/GRAMMAR.md`'s
own SQL placeholder reference table); and `src/hooks/useFilterState.ts`,
implementing the `useSyncExternalStore` wrapper the constitution already
specifies. A new Playwright fixture fills the gap the spec flagged: no
existing fixture models a real multi-tab, multi-panel `dashboard-*.yaml`.

## Technical Context

**Language/Version**: TypeScript (ES2022 target), same as `001`/`002`

**Primary Dependencies**: `react`, `react-dom`, `@radix-ui/react-tabs`
(all already installed, `002-design-tokens`) for navigation; the existing
`Card`/`Tabs` shadcn components (`src/components/ui/`) for panel cards and
tab navigation; `lucide-react` (already installed) for value-box icons
(`project-docs/GRAMMAR.md`'s `icon:` key); **new** — `plotly.js-dist-min`, not yet
in `package.json`, for the `plotly` panel type

**Component source**: New layout (`shell.tsx`, `navBar.tsx`,
`dashboardRenderer.tsx`, `panelCard.tsx`) and panel
(`ValueBoxPanel.tsx`, `PlotlyPanel.tsx`) components are hand-authored
React source under `src/layout/` and `src/panels/` — not shadcn CLI output
(shadcn's CLI generates primitives, not app-specific composed views); they
*consume* the shadcn primitives `002` already generated

**Storage**: N/A — no new persistence; this feature is a consumer of
`services/duckdb.ts`, `services/yamlLoader.ts`, `services/sqlExpander.ts`,
`state/appState.ts`, and `state/filterState.ts`, all unmodified except
`yamlLoader.ts` gaining typed parsing (additive, `raw: unknown` stays for
backward compatibility with `001`'s existing consumers)

**Testing**: Vitest for pure-logic pieces with no DOM/React dependency
(`panelQuery.ts`'s config→SQL-template construction, and typed
`dashboard-*.yaml` parsing) — same convention `vitest.config.js` already
documents ("pure-logic unit tests only... no browser"). Playwright for
everything that actually renders (shell, navigation, both panel types,
`useFilterState`'s reactivity) — extending `tests/integration/boot.spec.ts`'s
existing pattern, not introducing a new component-testing library
(`@testing-library/react`, etc.) this feature doesn't otherwise need, per
research.md's Testing Strategy decision

**Target Platform**: Browser — same as `001`/`002`

**Project Type**: Single-project web frontend, additive to `001`'s and
`002`'s existing scaffold

**Performance Goals**: N/A explicit numeric target; SC-003's "within the
same interaction" is a qualitative, no-page-reload requirement, not a
latency budget

**Constraints**: Every panel card MUST be styled entirely through `002`'s
token set (FR-003, SC-004 — no ad hoc colors/spacing, no unstyled default
HTML); exactly two panel types this feature (FR-008, no stubs for the
other seven); dashboard renders only against auto-discovered scenario data,
no manual loading UI (FR-009); a panel's query failure or invalid config
MUST NOT affect any other panel (FR-010); an unmounted panel MUST NOT apply
a stale in-flight query result (FR-011)

**Scale/Scope**: 1 new hook (`useFilterState`), 4 new layout components, 2
new panel components + 1 registry, 1 new panel-query-construction module, 1
new typed-config parsing module, 1 new dashboard-config test fixture
(multi-tab, multi-panel — the gap the spec flagged), 1 new Playwright spec

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TypeScript Throughout, React Permitted When Needed | All new code is `.tsx`/`.ts`. React is already adopted (`002-design-tokens`); this feature is the panel/layout layer Principle I's rationale anticipated as a likely next React consumer, not a new adoption decision | PASS |
| II. DuckDB-WASM off the main thread, one shared instance | This feature never constructs its own `AsyncDuckDB`/`Worker`/connection — every panel queries through `services/duckdb.ts`'s existing `query()`, by direct import per the v2.2.0 panel pattern | PASS |
| III. No `eval()` | `panelQuery.ts` builds SQL templates via plain string construction/interpolation only, then hands them to `sqlExpander.ts`'s existing string-replacement expander — no dynamic code execution | PASS |
| IV. YAML parsed at runtime | Typed parsing of `dashboard-*.yaml`'s `header`/`filters`/`layout` happens against `yamlLoader.ts`'s already-runtime-fetched `raw` value — no build-time baking of dashboard content | PASS |
| V. Parquet-only browser I/O | Not applicable — this feature adds no new data I/O path; it queries views `services/duckdb.ts` already registered from Parquet | PASS (N/A) |
| VI. Fixed Technology Choices | Uses the already-fixed UI stack (Tailwind/shadcn/Radix/`lucide-react`) exactly as `002` established; MapLibre/Vite/no-Web-Storage constraints unaffected and unviolated | PASS |
| VII. Minimal, Fixed Config File Set | No new config file type — `dashboard-*.yaml` is the existing type; this feature only adds a *test fixture* of that existing type, not a new type | PASS |
| VIII. Reuse Proven Reference Implementations | None of the four *named* reference repos cover shell/navigation/panel patterns — but checked directly against `APP-Project-Scoresheet` anyway (research.md §8), since it's the actual source `002-design-tokens` already ported fonts/elevation from, even without being a named repo. Result: its empty-state (`EmptyState.tsx`) and error-state (`.banner-error`, with a tested dark-mode contrast correction) patterns are genuinely reusable and are being ported, re-expressed in this project's own tokens; its loading-state and shell/layout structure were checked and confirmed to have no precedent (Scoresheet never needed either), designed fresh rather than left unexamined | PASS |
| IX. Fixed Python/JS Source Split | No Python package code touched; all new files under `src/` | PASS |

No unjustified violations. Complexity Tracking table is not needed (left
empty below).

**Post-Phase 1 re-check**: `research.md`'s decisions (a new pure
`panelQuery.ts` module, typed parsing in `layout/types.ts` rather than
`yamlLoader.ts`, no new `sqlExpander.ts` placeholder kinds, no new
component-testing library) and `data-model.md`/`contracts/`'s resulting
shapes introduce nothing that revisits the table above — no principle is
touched differently than assessed pre-research. Still PASS across all nine.

## Project Structure

### Documentation (this feature)

```text
specs/003-dashboard-shell-navigation/
├── plan.md               # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── dashboard-config-types.md
│   ├── panel-query.md
│   ├── use-filter-state.md
│   ├── panel-registry.md
│   ├── valuebox-panel.md
│   └── plotly-panel.md
├── checklists/
│   └── requirements.md
└── tasks.md                # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

Single-project web frontend, additive to `001`'s and `002`'s existing
scaffold. Only the paths this feature creates/touches are listed.

```text
package.json                      # + plotly.js-dist-min

src/
├── hooks/
│   └── useFilterState.ts         # new — wraps state/filterState.ts with
│                                  # useSyncExternalStore (constitution v2.2.0,
│                                  # see contracts/use-filter-state.md)
├── layout/
│   ├── types.ts                   # new — typed DashboardTabConfig / PanelConfig
│   │                               # parsed from yamlLoader's DashboardConfig.raw
│   │                               # (see contracts/dashboard-config-types.md)
│   ├── shell.tsx                  # new — top-level app shell: navBar + active
│   │                               # tab's dashboardRenderer
│   ├── navBar.tsx                 # new — shadcn Tabs-based tab navigation
│   ├── dashboardRenderer.tsx      # new — renders one tab's layout (rows of panelCards)
│   └── panelCard.tsx              # new — shadcn Card wrapper: title, loading/error
│                                   # states, hosts one registry-resolved panel
├── panels/
│   ├── registry.tsx                # new — type -> component map (valuebox, plotly)
│   ├── panelQuery.ts                # new — PanelConfig + filter values -> SQL
│   │                                # template for sqlExpander.expand() (see
│   │                                # contracts/panel-query.md)
│   ├── ValueBoxPanel.tsx            # new — see contracts/valuebox-panel.md
│   ├── PlotlyPanel.tsx              # new — see contracts/plotly-panel.md
│   ├── plotlyTraces.ts              # new — pure trace-resolution logic split out
│   │                                 # of PlotlyPanel.tsx: plotly.js-dist-min
│   │                                 # references `self` at module-load time,
│   │                                 # which throws in Vitest's Node environment
│   │                                 # even to reach a pure helper defined
│   │                                 # alongside it — kept Vitest-testable by
│   │                                 # depending on Plotly's types only, never
│   │                                 # its runtime module
│   ├── PanelEmptyState.tsx           # new — ported from APP-Project-Scoresheet's
│   │                                 # EmptyState.tsx (research.md §8)
│   └── PanelErrorState.tsx           # new — pattern ported from Scoresheet's
│                                     # .banner-error (research.md §8), re-expressed
│                                     # in this project's own destructive tokens
└── services/
    └── yamlLoader.ts                 # modified — adds typed parse exports;
                                       # existing raw: unknown API unchanged

tests/
├── unit/
│   ├── panelQuery.test.ts          # new — pure config+filters -> SQL template
│   ├── dashboardConfigTypes.test.ts # new — typed parsing of header/filters/layout
│   └── plotlyTraces.test.ts         # new — trace splitting by color/name-as-
│                                     # $scenario, multi-scenario legend correctness
├── fixtures/
│   └── dashboard-shell-config.yaml  # new — real multi-tab, multi-panel
│                                     # dashboard-*.yaml fixture (research.md's
│                                     # resolution of the spec's flagged gap)
└── integration/
    └── dashboardShell.spec.ts        # new — Playwright: renders shell+nav+both
                                       # panel types against fixture data end to end
```

**Structure Decision**: Single-project layout, additive to `001`/`002`.
`layout/` and `panels/` — explicitly excluded from `001` and untouched by
`002` — are built out for the first time here, per the file-tree placeholder
both prior features' `CLAUDE.md` sections already reserved for them.

## Complexity Tracking

*No entries — Constitution Check reported no unjustified violations.*
