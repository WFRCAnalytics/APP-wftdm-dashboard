---

description: "Task list for Dashboard Shell, Navigation, and First Two Panel Types (003-dashboard-shell-navigation)"
---

# Tasks: Dashboard Shell, Navigation, and First Two Panel Types

**Input**: Design documents from `/specs/003-dashboard-shell-navigation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — `panelQuery.ts` and `layout/types.ts` get Vitest unit
tests (pure logic, per research.md §5's established convention); the shell,
navigation, and both panel types get one Playwright integration spec
(rendering behavior, per that same convention — no new component-testing
library).

**Organization**: Tasks are grouped by user story (spec.md priorities:
US1/US2 = P1, US3 = P2).

## Path Conventions

Single-project web frontend, additive to `001-data-state-layer`'s and
`002-design-tokens`' existing scaffold.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add `plotly.js-dist-min` to `package.json`; run `npm install`
- [X] T002 [P] Write `tests/fixtures/dashboard-shell-config.yaml` — a real,
  `docs/GRAMMAR.md`-shaped `dashboard-*.yaml` with `header`, one `filters`
  entry (`purpose`), and a `layout` with at least one `valuebox` row bound
  to `summary_kpis.total_households` and one `plotly` row bound to
  `trip_mode_share` with `filter: $filters.purpose` (research.md §1) —
  matches `tests/fixtures/generate.py`'s existing Parquet schema exactly,
  no new fixture data needed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The hook, typed parsing, query-building, and shared
presentation pieces every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Write `src/hooks/useFilterState.ts` per
  `contracts/use-filter-state.md` — wraps `state/filterState.ts` with
  `useSyncExternalStore`, exactly the constitution v2.2.0 implementation
  (memoized snapshot — do not return a fresh object on every call)
- [X] T004 Write `src/layout/types.ts` per
  `contracts/dashboard-config-types.md` — `FilterDefinition`,
  `PanelConfigBase` (including `scenario`/`scenarios`, both real per
  `docs/GRAMMAR.md`), `ValueBoxPanelConfig`, `PlotlyTraceConfig`,
  `PlotlyPanelConfig`, the `PanelConfig` union, `DashboardTabConfig`, and
  `parseDashboardConfig()` (throws on missing `header.tab`/`header.title`,
  defaults `filters`/`layout` safely)
- [X] T005 Write `src/panels/panelQuery.ts` per `contracts/panel-query.md`
  — `buildPanelQuery()` (bare `$scenario.<metric>`/`$filters.<id>`
  templates only, never `$mappings`/`$bins`/`$sql`; `scenario` singular
  bypasses the union with a direct `"<scenario>__<metric>"` reference;
  `$filters.x` sits alone on its own line per the `all`-sentinel omission
  rule), `resolveActiveScenarios()` (`config.scenarios` override wins,
  `scenario` singular short-circuits it entirely), and the exported
  `EMPTY_SUMMARIZE_CONFIG` constant (with its "intentionally empty"
  comment) — depends on T004's `PanelConfig` type
- [X] T006 [P] Write `src/panels/PanelEmptyState.tsx` — ported from
  `APP-Project-Scoresheet`'s `EmptyState.tsx` (research.md §8): icon +
  message + optional hint, `lucide-react` icon, this project's
  `text-muted-foreground` token in place of Scoresheet's own gray token
- [X] T007 [P] Write `src/panels/PanelErrorState.tsx` — structure ported
  from Scoresheet's `.banner-error` (icon + message + `role="alert"`,
  research.md §8), styled with this project's `border-destructive`/
  `text-destructive` tokens on the flat `card` surface (deliberately not
  porting Scoresheet's tinted-background token — no WCAG-verified
  equivalent exists yet in `002`'s token set, research.md §8's explicit
  reasoning)
- [X] T008 [P] Write `src/panels/registry.tsx` — `export const registry:
  Record<string, ComponentType<PanelProps>> = {}`, empty for now; US2 and
  US3 each add their own entry later

**Checkpoint**: Hook, typed config parsing, query building, and shared
empty/error presentation all exist. User story implementation can begin.

---

## Phase 3: User Story 1 - An analyst navigates a real, professionally-styled dashboard shell (Priority: P1) 🎯 MVP

**Goal**: The dashboard's actual entry point renders whatever tabs are
discovered, navigable, styled entirely through `002`'s token set.

**Independent Test**: Configure a dashboard-config set (the new fixture),
load the app, confirm the visible tab set matches it exactly, tab
switching works with no reload, and every rendered panel card — even one
with no implemented panel type yet — shows the shared, token-styled chrome
(title, border, `shadow-md`), not unstyled default HTML.

### Implementation for User Story 1

- [X] T009 [US1] Write `src/layout/panelCard.tsx` per
  `contracts/panel-registry.md` — shadcn `Card`, `config.title` in a
  `CardTitle` (`font-heading`), a `PanelErrorBoundary` class component
  (React error boundaries require a class — the one deliberate exception
  to function-components-only) wrapping the registry-resolved panel
  component, falling back to `PanelErrorState` for both an unknown
  `config.type` and a caught render-time throw (depends on T006, T007,
  T008)
- [X] T010 [US1] Write `src/layout/dashboardRenderer.tsx` — renders one
  active tab's `layout` (`Record<string, PanelConfig[]>`) as ordered rows
  of `panelCard`s, each sized by its `width` fraction within its row
  (depends on T009)
- [X] T011 [US1] Write `src/layout/navBar.tsx` — wraps `002`'s shadcn
  `Tabs`/`TabsList`/`TabsTrigger`, one `TabsTrigger` per discovered
  `DashboardTabConfig`, labeled by `header.tab` — no tab count/name
  hardcoded (FR-001)
- [X] T012 [US1] Write `src/layout/shell.tsx` — top-level app shell:
  `navBar` (T011) + the active tab's `dashboardRenderer` (T010); active-tab
  selection is local component state (depends on T010, T011)
- [X] T013 [US1] Update `src/main.ts` — after `loadDashboards()`, parse
  each loaded config via `layout/types.ts`'s `parseDashboardConfig()`
  (T004), mount `<Shell dashboards={...} />` (T012) into `index.html`'s
  `#app` via `ReactDOM.createRoot`, replacing the current "loaded, not
  consumed" stub comment — this is the first feature where `main.ts`
  actually renders anything
- [X] T014 [US1] Manually verify `quickstart.md` steps 1–2 against the new
  fixture: `npm run dev`, confirm the visible tab set exactly matches
  `dashboard-shell-config.yaml`'s `header.tab` entries in order, and that
  switching tabs changes content with no full page reload (depends on
  T013)

**Checkpoint**: User Story 1 is independently testable — the real
dashboard entry point renders a navigable, token-styled shell.

---

## Phase 4: User Story 2 - An analyst sees a real number, computed from real data (Priority: P1) 🎯 MVP

**Goal**: `ValueBoxPanel` proves the full config → query → rendered-value
pipeline.

**Independent Test**: Configure a value-box panel against a known fixture
metric column, load the dashboard, confirm the displayed number matches
that column's actual value.

### Implementation for User Story 2

- [X] T015 [US2] Write `src/panels/ValueBoxPanel.tsx` per
  `contracts/valuebox-panel.md` — the full `buildPanelQuery` →
  `resolveActiveScenarios` → `sqlExpander.expand()` (with
  `EMPTY_SUMMARIZE_CONFIG`) → `query()` chain in a cancellation-guarded
  `useEffect`; `loading`/`ready`/`empty`/`error` states using
  `PanelEmptyState`/`PanelErrorState` (T006, T007) and an `animate-pulse`
  skeleton for loading (no Scoresheet precedent, designed fresh per
  research.md §8); `config.format` (Python-style format string) applied to
  the displayed value; `config.icon` resolved via `lucide-react`'s dynamic
  icon lookup with a graceful no-icon fallback (research.md §7) (depends
  on T003, T005)
- [X] T016 [US2] Register `valuebox: ValueBoxPanel` in
  `src/panels/registry.tsx` (T008) (depends on T015)
- [X] T017 [US2] Manually verify `quickstart.md` step 3: confirm the
  rendered value-box panel's displayed number matches
  `dashboard-shell-config.yaml`'s bound fixture column exactly (depends on
  T014, T016)

**Checkpoint**: User Stories 1 AND 2 both independently functional — a
real, navigable dashboard with one real, correct panel.

---

## Phase 5: User Story 3 - An analyst sees a real, filter-reactive chart (Priority: P2)

**Goal**: `PlotlyPanel` proves the fuller pipeline — SQL expansion,
`$metric.col`/bare-`$scenario` trace resolution, and filter reactivity via
`docs/SPEC.md`'s corrected two-effect pattern.

**Independent Test**: Configure a chart panel whose query includes a
`$filters.x` placeholder, load the dashboard, change that filter's value,
confirm the chart redraws in place (not torn down and rebuilt).

### Implementation for User Story 3

- [X] T018 [US3] Write `src/panels/PlotlyPanel.tsx` per
  `contracts/plotly-panel.md` — same query chain as `ValueBoxPanel`
  (T015's pattern); `resolveTrace()` resolving each `PlotlyTraceConfig`'s
  `$metric.<column>` references and the bare `$scenario` sentinel against
  the query result (research.md §3) — this is `docs/SPEC.md`'s own
  dashboard-config example implemented exactly as written, not literal
  column names; two-effect split — data fetch + `Plotly.react()` (no
  purge, `[config, filters]` deps) and a separate unmount-only
  `Plotly.purge()` effect (empty deps); `loading`/`empty`/`error` states
  using `PanelEmptyState`/`PanelErrorState`, loading placeholder kept
  DOM-but-hidden so `Plotly.react()` always has a mounted container to
  target (depends on T003, T005)
- [X] T019 [US3] Register `plotly: PlotlyPanel` in `src/panels/registry.tsx`
  (T008) (depends on T018)
- [X] T020 [US3] Manually verify `quickstart.md` step 4: confirm the chart
  renders real fixture data, then change the `purpose` filter (via
  `state/filterState.ts`'s `set()` from the browser console) and confirm
  the chart redraws in place with no flash/rebuild (depends on T014, T019)

**Checkpoint**: All three user stories independently functional and
verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Write `tests/unit/panelQuery.test.ts` — `buildPanelQuery`'s
  template construction (bare `$scenario.x`, `scenario`-singular bypass,
  `$filters.x` alone-on-its-own-line) and `resolveActiveScenarios`'s three
  cases (override, default passthrough, both-set precedence), per
  `contracts/panel-query.md`'s Given/When/Then
- [X] T022 [P] Write `tests/unit/dashboardConfigTypes.test.ts` —
  `parseDashboardConfig`'s success case, its throw on missing
  `header.tab`/`header.title`, and its safe defaults for absent
  `filters`/`layout`, per `contracts/dashboard-config-types.md`'s
  Given/When/Then
- [X] T023 Write `tests/integration/dashboardShell.spec.ts` (Playwright) —
  extends `boot.spec.ts`'s pattern (real browser, real DuckDB-WASM,
  `tests/fixtures/generate.py`'s Parquet) against the new fixture: tab set
  matches config (SC-001), tab switch with no reload (FR-002), value-box
  number matches fixture data (SC-002), filter change redraws the Plotly
  panel without a reload (SC-003), and a deliberately-broken panel config
  (test-local, not the main fixture) shows a scoped error without
  affecting sibling panels (SC-006) — depends on T014, T017, T020
- [X] T024 Run `npm run test:unit -- panelQuery dashboardConfigTypes` and
  `npm run test:integration -- dashboardShell`; confirm all pass (depends
  on T021, T022, T023)
- [X] T025 [P] Visual QA sweep against SC-004's four checkable properties:
  every panel card uses `shadow-md`/`border`; spacing throughout uses
  Tailwind's token-driven scale, not arbitrary pixel values; navigation is
  `002`'s shadcn `Tabs`, not raw HTML; every text element carries the
  correct `font-heading`/`font-body` class per `002`'s mapping — inspect
  rendered output and component source directly, the same way `002`'s
  "zero literal hex values" was checked (depends on T014, T017, T020)
- [X] T026 Run the full `quickstart.md` validation end to end (all 7 manual
  steps, including step 6's temporary-broken-panel check and step 7's
  unmount-safety check) and confirm SC-001 through SC-006 all pass (depends
  on T024, T025)
- [X] T027 [P] Confirm `npm run build` and `npm run typecheck` both pass
  with the new dependency and every file this feature added

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on
  US2/US3 — independently testable with zero panel types implemented (a
  panel card can render the "unknown type" fallback and still prove
  navigation + visual quality).
- **User Story 2 (Phase 4)**: Depends on Foundational and on US1's
  `panelCard.tsx`/`registry.tsx`/`main.ts` wiring being in place to render
  against (T014) — not on US3.
- **User Story 3 (Phase 5)**: Same dependency shape as US2 — depends on
  US1's shell existing, not on US2.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- Foundational: T003, T006, T007, T008 (T004 blocks T005; T005 otherwise
  independent of T003/T006/T007/T008)
- US2 and US3 can be built in parallel once US1's T014 checkpoint is
  reached — neither depends on the other, only on the shell existing
- Polish: T021, T022, T025, T027

---

## Parallel Example: Foundational Phase

```bash
Task: "Write src/hooks/useFilterState.ts per contracts/use-filter-state.md"
Task: "Write src/panels/PanelEmptyState.tsx, ported from Scoresheet's EmptyState.tsx"
Task: "Write src/panels/PanelErrorState.tsx, pattern ported from Scoresheet's .banner-error"
Task: "Write src/panels/registry.tsx as an empty type-to-component map"
```

## Parallel Example: User Story 2 + User Story 3

```bash
# Once US1's T014 checkpoint is reached, these can run at the same time:
Task: "Build ValueBoxPanel.tsx and register it (Phase 4, US2)"
Task: "Build PlotlyPanel.tsx and register it (Phase 5, US3)"
```

---

## Implementation Strategy

### MVP Scope: User Story 1 + User Story 2

Both P1 in `spec.md`. US1 alone proves the shell/navigation genuinely works
against real discovered config; US2 is the smallest possible proof that a
panel type can go from YAML to a correct rendered result using the new
React pattern. Together they're a real, demonstrable dashboard — not just
navigation chrome.

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — blocking.
2. Complete Phase 3 (US1) → validate at T014's checkpoint.
3. Complete Phase 4 (US2) → validate.
4. **MVP checkpoint.**
5. Add Phase 5 (US3) → validate, in priority order.
6. Phase 6 (Polish) once all three stories are in.

### Incremental Delivery

Each phase's checkpoint is independently verifiable per `spec.md`'s own
Independent Test for that story. US2 and US3 both build on US1's shell but
have their own distinct pass/fail criteria and can be worked in either
order (or in parallel) once US1's checkpoint is reached.

---

## Notes

- `[P]` tasks touch different files with no dependency on incomplete work.
- `[US#]` maps every user-story-phase task to its story for traceability.
- This feature makes `src/main.ts` render for the first time — every prior
  feature (`001`, `002`) left it a non-rendering stub or a separate demo
  entry point.
- Per FR-008/FR-009, nothing in this task list stubs any of the other
  seven panel types or builds any part of the scenario folder-picker.
- Commit after each task or logical group; stop at any checkpoint to
  validate a story independently before moving on.
