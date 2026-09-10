# Feature Specification: All Loaded Scenarios Participate by Default

**Feature Branch**: `038-active-scenario-default-behavior`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "All loaded scenarios participate in charts/tables by default, with per-scenario temporary disable via the existing Switch. 89% of the real demo dashboard panels are pinned to a specific scenario, bypassing the active-scenario union entirely — so the Scenarios tab's active/inactive Switch has no visible effect on almost anything a viewer sees. The demo was authored this way because `observed` is force-active by default with empty/placeholder data, which would break an unpinned `$scenario` union the moment it participates. REQUIRED OUTCOME: every genuinely loaded, real scenario participates in every chart/table by default (via the existing dynamic `$scenario` union, not scenario pinning), with the Switch giving a viewer real, universal control to temporarily exclude any one scenario. Does not include: any change to the `$baseline` sentinel / comparison-diff mechanism; any change to 037's Scenarios-tab UI."

## Research (completed before requirements below)

### Item 1 — `observed`'s default-active status

**How the code paths work today** (`services/scenarioDiscovery.ts`, read directly):
`discoverScenarios()` calls `registerObserved()` → `registerPublishedScenarios()` →
`registerDemoScenarios()` → `applyURLParams()`, in that order. All three
registration functions fetch from a fixed URL under `import.meta.env.BASE_URL`
(`observed/`, `scenarios/`, `demo-scenarios/`). **There is no signal available
to `registerObserved()` that distinguishes "fixture-test content root" from
"real demo/production content root"** — the URL is the same in both; the
difference is only *what content the deployer/test-harness put there*.
`registerObserved()` unconditionally calls `appState.setActive('observed',
true)` regardless of whether its own data registration succeeded (`status ===
'ready'`) or failed (`status === 'failed'`, which is what happens in the real
demo where `public/observed/` is empty). `registerPublishedScenarios()` and
`registerDemoScenarios()` never call `setActive()` at all — a published/demo
scenario is inactive until `?s=` or a viewer action.

**The only honest discriminator** is each scenario's OWN registration outcome:
`status === 'ready'` means its data is genuinely present and queryable;
`status === 'failed'` means it isn't. In the real demo, `observed` is `failed`
(no data) and the three `activitysim-*` scenarios are `ready`. In the fixture
suite, `observed` and `good_scenario` are `ready`, `broken_scenario` is
`failed`.

**Recommendation: do NOT make the default context-dependent; fix the tests.**
Rationale:

- A context-dependent default (fixture-root vs. demo-root) can only be
  implemented by a hack — `registerObserved()` peeking at another root's
  `index.json`, or a build-time environment flag. Either is a hidden,
  surprising behavior that would itself need documentation and its own tests.
- The clean, uniform rule that also achieves the REQUIRED OUTCOME:
  **auto-activate every scenario that reaches `status === 'ready'`, for all
  three discovery paths** — `observed` included, but only when it is `ready`.
  No branching on context; a scenario participates iff its data is really
  there.
- Under that rule the real demo behaves correctly with no special-casing:
  `observed` (`failed`) is not activated, so it never poisons the `$scenario`
  union; the three `activitysim-*` scenarios (`ready`) are all active, so every
  unpinned panel spans all three and the Switch controls them.
- The ~33 fixture-suite test failures the 037 investigation found (from
  flipping `observed` inactive) came from `?s=`-less boots of fixture tabs
  whose unpinned panels assumed `observed` was the sole active scenario. Under
  the recommended rule, `good_scenario` also auto-activates in the fixture
  context, so those unpinned panels render a 2-scenario union instead of 1 —
  tests asserting "renders without error" keep passing; tests asserting exact
  row counts / single-series content need updating. **Those tests should
  declare their active-scenario set explicitly** (a `?s=` in the test's
  `boot()`, a `setActive()` in setup, or an explicit `scenarios:` list on the
  fixture panel) rather than depending on a global default that is an accident
  of history. Making each test's scenario expectation explicit is a net
  improvement to the suite's clarity.

### Item 2 — audit of the 41 currently-pinned real demo panels

Parsed every `public/demo-dashboard-config/dashboard-*.yaml` directly. **No
demo panel uses `comparison: diff` or the `$baseline` sentinel** — the
"legitimate pin because it demonstrates baseline comparison" category the
feature description anticipated is **empty** for the demo. The real
categories:

| Category | Count | Panels | Disposition |
|---|---|---|---|
| **Keep pinned — chart type renders ONE dataset per draw** | 4 | `zonemap` ×3 (`SOV Trip Attractions by Zone`, `VMT by Home Zone`, and one more), `flowmap` ×1 (`Trip Distribution Desire Lines`) | A choropleth colours one value per zone; desire lines draw one O-D set. A `$scenario` union produces N rows per zone / N flow sets with no way to disambiguate. Multi-scenario for these types is only meaningful via `comparison: diff` — explicitly out of scope. **Pin stays.** |
| **Decision needed — `valuebox` (architecturally single-scenario)** | 6 | `Households`, `Persons`, `Tours`, `Trips`, `Total VMT` (summary tab), `Total VMT (straight-line proxy)` (network tab) | `ValueBoxPanel` takes `rows[0]` of its result — an unpinned union would silently show whichever scenario's row sorts first, which is arbitrary and misleading. `baseline_trend` *requires* `config.scenario` by design ("config-error" state otherwise). A KPI card is inherently one number for one scenario. **Either stays pinned to `activitysim-baseline` (honest: "baseline KPI"), or is converted to a comparison-capable form (a small multi-scenario bar, or gains `baseline_trend`).** |
| **Unpin + add a per-scenario series channel** | ~8 | the `plotly` / `recharts` / `observable-plot` panels currently pinned to `activitysim-baseline` *singular* (person-household ×2 obs-plot; tour-models 1 plotly + 2 obs-plot; trip-models 1 obs-plot + 1 plotly; mode-choice 1 recharts) | These CAN show multiple scenarios but only if the panel config declares the series: `plotly` needs `color: $scenario` (or `name: $scenario`), `recharts` needs `series: scenario`, `observable-plot` needs `fill: scenario`/`stroke: scenario`. Unpinning without that produces an overplotted single series. **Unpin AND add the series channel — a real content change, not a mechanical edit.** |
| **Unpin — drop the redundant explicit list** | 4 | `Total Trips by Mode` (recharts) + `Average Trip Distance by Purpose` (plotly) on summary; `Trip Purpose to Mode Flow` (sankey) + `Trip Mode Share by Time-of-Day Period` (plotly) on mode-choice — all carry `scenarios: [all 3]` | Already multi-scenario; the hardcoded list just needs replacing with reliance on the dynamic union so they respond to the Switch. Confirm each already declares its series channel (the recharts/plotly ones do; sankey sums across the union without a per-scenario split — acceptable, renders without error). **Unpin, keep the series channel.** |
| **Unpin freely** | ~18 | every `table` panel (person-household ×3, tour-models ×10, mode-choice ×1, trip-models ×1, network ×3) | A `$scenario` union adds a `scenario` discriminator column; `TablePanel` renders it as an ordinary column. Proven by the fixture's own `Scenario Split (Table)` panel. **Unpin.** |
| **Unpin freely** | 2 | `graphic-walker` ×2 (`Explore: Person/Household Profile`, `Free-form Visual Analytics`) | `028-graphic-walker-dataset-picker` already handles the `$scenario` union (adds a `scenario` field the viewer can pivot on). **Unpin.** |

(Markdown panels — 5 — are already unpinned and query no data.)

### Item 3 — how unpinning changes rendered content, per chart type

Confirmed from the panel components directly:

| Panel type | Multi-scenario union behavior | Verdict |
|---|---|---|
| `table` (`TablePanel`) | Renders the extra `scenario` column as-is; one row per scenario×row. | Renders sensibly. Unpin safe. |
| `plotly` (`plotlyTraces.ts`) | Splits one configured trace into one real trace **per distinct value of the field named by `color`/`name`** — but ONLY if that field is the bare `$scenario` sentinel (or another column). With no such field, all union rows land in one overplotted trace. | Needs `color: $scenario` added. |
| `recharts` (`rechartsEncoding.ts`) | Pivots to one series per distinct `series` value — but ONLY if `series` is set (to `scenario`). With no `series`, "single-series case" collapses all rows. | Needs `series: scenario` added. |
| `observable-plot` (`observablePlotEncoding.ts`) | Colours/legends by `fill`/`stroke` if set (to `scenario`). Without it, rows overplot. | Needs `fill: scenario` (or `stroke`) added. |
| `valuebox` (`ValueBoxPanel`) | Takes `rows[0]` only — cannot show multiple scenarios. `baseline_trend` *requires* a pinned `scenario`. | **Cannot become multi-scenario.** Stays pinned or is redesigned. |
| `zonemap` (`ZoneMapPanel`) | Data-driven `fill-color` paint expression colours one value per zone; a union yields N rows per zone. Multi-scenario only via `comparison: diff`. | **Cannot become a plain multi-scenario choropleth.** Pin stays. |
| `flowmap` (`FlowMapPanel`) | Draws one set of O-D desire lines; a union overlays N sets. | **Cannot sensibly union.** Pin stays. |
| `sankey` (`sankeyGraph.ts`) | Maps `source`→`target`; a union sums flows across scenarios with no per-scenario split. | Renders without error but is a *combined* flow, not a comparison. Acceptable to unpin; not ideal. |
| `graphic-walker` | Union adds a `scenario` field the viewer can pivot on (028). | Renders sensibly. Unpin safe. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A viewer excludes one scenario from every chart at once (Priority: P1)

A viewer has three real model runs loaded. Every chart and table on every tab
shows all three by default — as a comparison. The viewer wants to focus on
just two of them for a moment. They open the Scenarios tab, flip one
scenario's Switch off, and **every** unpinned chart and table across every tab
immediately drops that scenario's series/rows, with no page reload. Flipping
it back on restores it everywhere.

**Why this priority**: This is the entire point of the feature — the Switch
going from "affects almost nothing a viewer sees" to "universal, immediate
control over what's compared." Without it, the feature delivers nothing.

**Independent Test**: Load the three demo scenarios (all auto-active), open any
tab with an unpinned multi-scenario chart, toggle one scenario's Switch off,
confirm that chart's series count drops by one and its own
`appState.listByDisplayOrder()`/render reflect it immediately; toggle back on
and confirm restoration. Repeat on a table (row count) and on a second tab.

**Acceptance Scenarios**:

1. **Given** three scenarios loaded and all active, **When** the viewer opens
   an unpinned comparison chart, **Then** it shows one series per active
   scenario, each in that scenario's resolved color, labeled by its resolved
   label.
2. **Given** that chart is visible on tab A, **When** the viewer flips
   scenario X's Switch off on the Scenarios tab, **Then** tab A's chart re-
   renders with X's series gone, immediately, no reload — and so does every
   other unpinned chart/table on every other tab.
3. **Given** scenario X is toggled off, **When** the viewer flips it back on,
   **Then** every unpinned chart/table restores X's series/rows.
4. **Given** a panel that is still deliberately pinned (a `zonemap`,
   `flowmap`, or KPI `valuebox`), **When** the viewer toggles any scenario,
   **Then** that pinned panel does not change — and this is expected, not a
   bug.

---

### User Story 2 - Every loaded scenario shows up without the viewer doing anything (Priority: P1)

A viewer opens the dashboard with the three real model runs published. Without
touching the Scenarios tab or a `?s=` URL, every unpinned chart/table already
shows all three as a comparison. A scenario whose data failed to load
(`observed` with no published data, a broken folder) is simply absent — never
an error banner, never a blank panel.

**Why this priority**: "Participate by default" is half the required outcome;
the other half (US1) is the Switch control. Both are P1 because neither is
useful alone.

**Independent Test**: Boot the real demo content with no `?s=` param; confirm
`appState.getActive()` contains exactly the scenarios whose `status` is
`'ready'`; confirm an unpinned chart renders that many series; confirm a
scenario that failed registration is neither in the active set nor causes any
panel to show an error state.

**Acceptance Scenarios**:

1. **Given** three `activitysim-*` scenarios that register `ready` and an
   `observed` entry that registers `failed`, **When** the dashboard boots with
   no `?s=`, **Then** the three `activitysim-*` scenarios are active and
   `observed` is not.
2. **Given** that boot, **When** any unpinned chart/table renders, **Then** it
   shows exactly the three active scenarios, with no reference to `observed`
   and no error/empty state caused by `observed`.
3. **Given** a `?s=` URL param naming a scenario, **When** the dashboard
   boots, **Then** that scenario is active in addition to the auto-active
   ready ones (the param never *reduces* the active set).

---

### User Story 3 - The demo dashboards read as scenario comparisons, not baseline snapshots (Priority: P2)

Someone browsing the demo sees comparison charts everywhere the chart type
supports it — trip mode share by mode with three bars per mode, tour
frequency tables with a scenario column, distance distributions with three
overlaid lines. The panels that genuinely can only show one dataset per draw
(zone choropleths, the O-D flow map, the headline KPI cards) still show the
baseline run and say so.

**Why this priority**: This is the visible pay-off of the config work, but the
mechanism (US1/US2) is what has to be right first; the exact per-panel
presentation is refinement.

**Independent Test**: Load the demo; for each formerly-pinned panel, confirm
per the item-2 audit table that it either (a) now renders a multi-scenario
comparison with a legible per-scenario series/column, or (b) is still pinned
and its title/subtitle makes the single-scenario scope explicit.

**Acceptance Scenarios**:

1. **Given** the demo mode-choice tab, **When** it loads with three active
   scenarios, **Then** `Total Trips by Mode` and `Trip Mode Share by
   Time-of-Day Period` show three series, one per scenario, and respond to the
   Switch.
2. **Given** a formerly-singular-pinned `plotly`/`recharts`/`observable-plot`
   panel, **When** it is unpinned, **Then** its config also gains the
   per-scenario series channel (`color: $scenario` / `series: scenario` /
   `fill: scenario`) so it renders as a real comparison, not an overplot.
3. **Given** the ~18 formerly-pinned `table` panels, **When** unpinned,
   **Then** each renders a `scenario` column and one row group per active
   scenario, with no config change beyond removing the pin.
4. **Given** a `zonemap`/`flowmap` panel or a headline KPI `valuebox`, **When**
   the audit says "pin stays", **Then** it stays pinned and its
   title/description states it reflects the baseline scenario.

---

### Edge Cases

- **Zero scenarios `ready`** (nothing registered successfully): an unpinned
  `$scenario` panel currently calls `missing("no active scenarios")`. With
  auto-activation this should be rare (any `ready` scenario auto-activates),
  but a deployment with only failed folders must still show a clean per-panel
  empty/error state, never a crash — unchanged from today's behavior.
- **A viewer toggles OFF the last remaining active scenario**: every unpinned
  panel goes to its empty/error state until the viewer re-activates one. This
  is acceptable (the viewer chose it) and must not crash.
- **A scenario registers `ready` after the first render** (a slow folder, a
  locally-loaded scenario): it auto-activates and unpinned panels pick it up
  reactively via the existing `useActiveScenarios()` mechanism — no reload.
- **`?s=` naming a scenario that is `failed`**: it is not activated (matching
  today — `applyURLParams()` only activates registered entries; a failed
  entry has no data to union).
- **The `$baseline` / `comparison: diff` panels** (fixture only; none in the
  demo): their `a`/`b` scenarios resolve from the `diff` object, never from
  the active set — unaffected by this feature, and explicitly out of scope.
- **`scenarios: [explicit list]` panels that are NOT unpinned**: still bypass
  the active set (the list wins). If any are intentionally left pinned, the
  Switch will not affect them — the audit must be explicit about which.

## Requirements *(mandatory)*

### Functional Requirements

**Default participation (US2)**

- **FR-001**: Every scenario whose registration reaches `status === 'ready'`
  MUST be marked active by default at boot — for all three discovery paths
  (observed, published, demo).
- **FR-002**: A scenario whose registration ends in `status === 'failed'`
  MUST NOT be marked active — `observed` included (so an empty `observed` in a
  real deployment never joins the `$scenario` union).
- **FR-003**: `?s=` URL params MUST continue to only *add* to the active set
  (activate the named registered scenarios), never remove auto-activated
  ones.
- **FR-004**: A scenario that becomes `ready` after initial boot (slow fetch,
  local folder load) MUST auto-activate and be picked up by unpinned panels
  reactively, with no page reload.

**Universal Switch control (US1)**

- **FR-005**: Flipping a scenario's Switch on the Scenarios tab MUST
  immediately change every unpinned (`$scenario`-union) chart and table on
  every tab — add or drop that scenario's series/rows — with no page reload.
- **FR-006**: A panel that carries a `scenario:` or `scenarios:` key MUST
  remain unaffected by the Switch (unchanged, by design) — the feature does
  not alter this resolution rule, only which panels carry the key.

**Demo content changes (US3)**

- **FR-007**: The demo dashboard panels identified by the item-2 audit as
  "unpin freely" (tables, graphic-walker) MUST have their `scenario:` /
  `scenarios:` key removed and nothing else changed.
- **FR-008**: The demo panels identified as "unpin + add series channel"
  (`plotly` / `recharts` / `observable-plot` currently pinned to a single
  scenario) MUST have the pin removed AND gain the per-scenario series
  channel appropriate to their type, so they render a legible multi-scenario
  comparison rather than an overplot.
- **FR-009**: The demo panels with a redundant `scenarios: [all three]` list
  MUST have that list removed (relying on the dynamic union) while keeping
  their existing per-scenario series channel.
- **FR-010**: The demo `zonemap` and `flowmap` panels MUST stay pinned; their
  title or description MUST state that they reflect the baseline scenario.
- **FR-011**: Each demo `valuebox` panel MUST either (a) stay pinned to the
  baseline scenario with its scope stated in title/description, or (b) be
  converted to a form that meaningfully reflects multiple scenarios — the
  choice recorded per panel. It MUST NOT be left unpinned as a plain
  single-number card (which would show an arbitrary scenario's row).

**Test-suite honesty (from research item 1)**

- **FR-012**: Fixture-suite tests that currently rely on `observed` being the
  sole auto-active scenario MUST be updated to declare their active-scenario
  set explicitly (via `?s=`, an explicit `setActive()` in setup, or an
  explicit `scenarios:` list on the fixture panel) — not left depending on a
  global default.
- **FR-013**: The `registerObserved()` change MUST NOT introduce any
  context-dependent branching (fixture-root vs. demo-root); the only condition
  is the scenario's own `status`.

### Key Entities

- **Scenario** (`state/appState.ts`, unchanged shape): `active` and
  `setActive()` already exist (`009`). This feature only changes *when*
  `setActive(name, true)` is called during discovery (on `ready`, for all
  paths) — no new field.
- **Panel config** (`dashboard-*.yaml`): the `scenario` / `scenarios` keys are
  unchanged in meaning; this feature removes them from most demo panels and
  adds `color`/`series`/`fill` `$scenario` series channels to some.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a no-`?s=` boot of the real demo content, 100% of scenarios
  whose data is present are active, and every unpinned chart/table shows that
  many series/row-groups.
- **SC-002**: Toggling one scenario's Switch changes every unpinned panel on
  every demo tab within one render, with zero page reloads — verifiable by
  before/after series counts on panels across at least two different tabs.
- **SC-003**: At least 20 of the 41 currently-pinned demo panels are unpinned
  and render a legible multi-scenario comparison (per the item-2 audit); the
  panels that stay pinned (zonemap/flowmap, and any KPI valueboxes kept as
  cards) each state their single-scenario scope in their title or
  description.
- **SC-004**: A scenario whose registration fails causes zero error/empty
  states on any panel that would otherwise union it (it is simply absent).
- **SC-005**: The full existing test suite passes, with every previously
  observed-default-dependent test updated to an explicit active-scenario
  declaration (no test left silently depending on the retired global
  default).

## Assumptions

- "Genuinely loaded, real scenario" = one whose discovery registration
  reached `status === 'ready'`. A `failed` scenario (including an empty
  `observed`) is not "loaded" for this purpose.
- The demo currently ships three real ActivitySim scenarios
  (`activitysim-baseline`, `activitysim-density-variant`,
  `activitysim-transit-variant`); the feature is designed for that set but
  imposes no fixed count.
- Auto-activating every `ready` scenario is acceptable default behavior even
  when many scenarios are loaded — a viewer who wants fewer uses the Switch.
  (If a future deployment loads a very large number of scenarios and an
  all-on default becomes unwieldy, that is a separate follow-up, not this
  feature.)
- The per-panel audit in the Research section is the authoritative
  disposition list; the plan phase produces the final itemized 41-row table
  from it, but the categories and counts here are the agreed basis.
- `valuebox` panels stay single-scenario unless a specific panel is
  explicitly chosen for conversion — the default disposition is "keep pinned,
  state the scope".
- The `$baseline` / `comparison: diff` mechanism, and `037`'s Scenarios-tab
  UI, are untouched.
- Both light and dark themes must be verified for every demo panel whose
  rendered content changes (single-series → multi-series), matching this
  project's standing dual-theme requirement.
