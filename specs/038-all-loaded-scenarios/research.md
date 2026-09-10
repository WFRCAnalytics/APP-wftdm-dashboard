# Phase 0 Research: All Loaded Scenarios Participate by Default

All spec-level `NEEDS CLARIFICATION` were resolved in the spec's own Research
section (items 1–3) before requirements were written. This document is the
**Phase 1 deepening** the spec's Assumptions section defers to it: the definitive
itemized 41-panel disposition table (built from a direct parse of the eight live
`public/demo-dashboard-config/dashboard-*.yaml` files, not the spec's estimated
categories), the per-`valuebox` keep-vs-convert call, the observable-plot/recharts
colour-channel-conflict resolution, the auto-activation rule's concrete shape, and
the fixture-test remediation strategy.

---

## §1 — Auto-activation rule (resolves FR-001 / FR-002 / FR-003 / FR-004 / FR-013)

**Decision**: In `src/services/scenarioDiscovery.ts`, each of the three
registration functions marks its scenario active **iff that scenario's own
registration reached `status === 'ready'`** — no other condition, no
fixture-vs-demo branching.

Concrete edits (confirmed against the file as it stands today):

| Function | Today | After |
|---|---|---|
| `registerObserved()` | `appState.setActive('observed', true)` **unconditionally**, after the try/catch that sets `status` | set active **only** in the `try` success branch, right after `appState.setStatus('observed', 'ready')`. Drop the unconditional call and its stale 037-item-4 comment block. |
| `registerPublishedScenarios()` | never calls `setActive()` | add `appState.setActive(name, true)` immediately after `appState.setStatus(name, 'ready')` in the success branch |
| `registerDemoScenarios()` | never calls `setActive()` | add `appState.setActive(name, true)` immediately after `appState.setStatus(name, 'ready')` in the success branch |

- **FR-002** falls out for free: a `failed` scenario never enters the `try`
  success branch, so it is never activated — including an empty `observed` in a
  real deployment (`registerSummaryFolder` throws on the missing
  `observed/summary/index.json`, `status` becomes `failed`, no `setActive`).
- **FR-003**: `applyURLParams()` is unchanged — it still only *adds*
  (`setActive(name, true)` for named registered entries). It runs last, so it can
  only widen the auto-activated set, never shrink it.
- **FR-004**: a scenario that becomes `ready` after first paint (slow fetch,
  `scenario/scenarioManager.ts` local-folder load) — the local-folder path
  already calls `appState.setActive` on success today; the discovery path now
  does the same in its own success branch. Unpinned panels pick it up through the
  existing `useActiveScenarios()` → `useSyncExternalStore` subscription, no
  reload. **No new reactivity code.**
- **FR-013**: the only predicate is `status === 'ready'`. `registerObserved()`
  gains no ability to peek at another root's `index.json` and no build-time flag.

**Rationale** (from spec item 1, retained): a context-dependent default can only be
a hack; the uniform "participate iff your data is really there" rule achieves the
REQUIRED OUTCOME in the real demo with zero special-casing (`observed` is `failed`
there → never poisons the union; the three `activitysim-*` are `ready` → all
active → every unpinned panel spans all three and the Switch controls them).

**Alternatives considered**:
- *Context-dependent default (fixture-root vs demo-root)* — rejected: needs a
  hidden discriminator (`registerObserved()` fetching `demo-scenarios/index.json`
  to sniff context, or a `import.meta.env` flag) that would itself need docs and
  tests, and is exactly the "accident of history" the feature is removing.
- *Keep `observed` unconditionally active, just unpin demo panels* — rejected:
  in the real demo `observed` is `failed` with no `observed__<metric>` views, so
  any unpinned `$scenario` union would throw a Catalog Error the moment it ran.
  This is precisely why 032 pinned everything; unpinning without fixing the
  activation rule reintroduces the bug.

---

## §2 — Definitive 41-panel disposition table (resolves item-2 audit → FR-007..FR-011)

Source: direct `js-yaml` parse of all eight files in
`public/demo-dashboard-config/index.json`, 2026-09-10. **46 panels total** — 37
pinned `scenario: activitysim-baseline` (singular), 4 carrying
`scenarios: [<all 3>]` (a redundant explicit list), 5 already-unpinned markdown
panels (query no data — out of scope). The 41 = 37 + 4.

**No demo panel uses `comparison: diff` or `$baseline`** — the "legitimate pin
because it demonstrates baseline comparison" category the feature description
anticipated is **empty** for the demo. The real reasons a pin stays are (a) the
chart type draws one dataset per render, (b) the panel's colour/series channel is
already committed to a substantive non-scenario categorical breakdown, or (c) it
is a single-number KPI card.

Legend for **Action**:
`UNPIN` = delete the `scenario:`/`scenarios:` key, nothing else ·
`UNPIN+CH` = delete the key **and** add the per-scenario series channel ·
`UNLIST` = replace `scenarios: [3]` with reliance on the dynamic union, keep the
existing channel · `KEEP+NOTE` = pin stays (rewritten to `scenario:
activitysim-baseline` if it was a list), add a one-line baseline-scope note to the
panel `description`.

| # | File | Type | Title | Current key | Channel today | Action | Notes / channel to add |
|--:|---|---|---|---|---|---|---|
| 1 | 1-summary | valuebox | Households | `scenario=` | — | **KEEP+NOTE** | KPI card, `rows[0]` only — see §3 |
| 2 | 1-summary | valuebox | Persons | `scenario=` | — | **KEEP+NOTE** | KPI card — see §3 |
| 3 | 1-summary | valuebox | Tours | `scenario=` | — | **KEEP+NOTE** | KPI card — see §3 |
| 4 | 1-summary | valuebox | Trips | `scenario=` | — | **KEEP+NOTE** | KPI card — see §3 |
| 5 | 1-summary | valuebox | Total VMT | `scenario=` | — | **KEEP+NOTE** | KPI card — see §3 |
| 6 | 1-summary | recharts | Total Trips by Mode | `scenarios=[3]` | `series: scenario` | **UNLIST** | already has the channel — just drop the list |
| 7 | 1-summary | plotly | Average Trip Distance by Purpose | `scenarios=[3]` | none | **UNPIN+CH** | add `name: $scenario` (list → dynamic union) |
| 8 | 2-person | table | Auto Ownership by Household Segment | `scenario=` | n/a | **UNPIN** | `TablePanel` renders the `scenario` column |
| 10 | 2-person | observable-plot | School Location Distance Distribution | `scenario=` | `fill: school_segment` | **KEEP+NOTE** | fill channel already committed — see §4 |
| 11 | 2-person | observable-plot | Workplace Location Distance Distribution | `scenario=` | none | **UNPIN+CH** | add `fill: scenario` |
| 12 | 2-person | table | Home-Workplace District Flows | `scenario=` | n/a | **UNPIN** | |
| 16 | 2-person | table | CDAP Activity Pattern by Segment | `scenario=` | n/a | **UNPIN** | |
| 17 | 2-person | graphic-walker | Explore: Person/Household Profile | `scenario=` | n/a | **UNPIN** | 028 adds a `scenario` field to pivot on |
| 18 | 3-tour | table | Mandatory Tour Frequency by Person Type | `scenario=` | n/a | **UNPIN** | |
| 19 | 3-tour | table | Mandatory Tour Start/End/Duration (Work Tours) | `scenario=` | n/a | **UNPIN** | |
| 20 | 3-tour | table | Joint Tour Frequency and Composition | `scenario=` | n/a | **UNPIN** | |
| 21 | 3-tour | table | Joint Tour Participation | `scenario=` | n/a | **UNPIN** | |
| 22 | 3-tour | observable-plot | Joint Tour Destination Distance | `scenario=` | `fill: primary_purpose` | **KEEP+NOTE** | fill already committed — see §4 |
| 23 | 3-tour | table | Joint Tour Scheduling | `scenario=` | n/a | **UNPIN** | |
| 24 | 3-tour | plotly | Non-Mandatory Tour Frequency by Purpose | `scenario=` | none | **UNPIN+CH** | add `name: $scenario` |
| 25 | 3-tour | observable-plot | Non-Mandatory Tour Destination Distance | `scenario=` | `fill: primary_purpose` | **KEEP+NOTE** | fill already committed — see §4 |
| 26 | 3-tour | table | Non-Mandatory Tour Scheduling | `scenario=` | n/a | **UNPIN** | |
| 27 | 3-tour | table | At-Work Subtour Frequency | `scenario=` | n/a | **UNPIN** | |
| 28 | 3-tour | table | At-Work Subtour Destination Distance | `scenario=` | n/a | **UNPIN** | |
| 29 | 3-tour | table | At-Work Subtour Scheduling | `scenario=` | n/a | **UNPIN** | |
| 30 | 3-tour | table | Stop Frequency by Tour Purpose | `scenario=` | n/a | **UNPIN** | |
| 31 | 4-mode | table | Tour Mode Share by Segment | `scenario=` | n/a | **UNPIN** | |
| 32 | 4-mode | recharts | At-Work Subtour Mode Share by Purpose | `scenario=` | `series: tour_mode` | **KEEP+NOTE** | series already committed; recharts has no faceting — see §4 |
| 33 | 4-mode | sankey | Trip Purpose to Mode Flow | `scenarios=[3]` | none (sums) | **UNLIST** | union sums flows across active scenarios; renders without error, responds to Switch, but is a *combined* flow not a comparison — weakest unpin, accepted per spec item-2 |
| 34 | 4-mode | plotly | Trip Mode Share by Time-of-Day Period (WALK_LOC) | `scenarios=[3]` | none | **UNPIN+CH** | add `name: $scenario` (list → dynamic union) |
| 35 | 5-trip | table | Trip Purpose Breakdown | `scenario=` | n/a | **UNPIN** | |
| 36 | 5-trip | observable-plot | Trip Destination Distance Distribution | `scenario=` | `fill: primary_purpose` | **KEEP+NOTE** | fill already committed — see §4 |
| 37 | 5-trip | plotly | Trip Departure Hour (Work Trips) | `scenario=` | none | **UNPIN+CH** | add `name: $scenario` |
| 38 | 5-trip | zonemap | SOV Trip Attractions by Zone | `scenario=` | n/a | **KEEP+NOTE** | one choropleth draw per dataset (FR-010) |
| 40 | 6-network | valuebox | Total VMT (straight-line proxy) | `scenario=` | — | **KEEP+NOTE** | KPI card — see §3 |
| 41 | 6-network | zonemap | VMT by Home Zone (straight-line proxy) | `scenario=` | n/a | **KEEP+NOTE** | one choropleth draw per dataset (FR-010) |
| 42 | 6-network | flowmap | Trip Distribution Desire Lines | `scenario=` | n/a | **KEEP+NOTE** | one O-D desire-line set per dataset (FR-010) |
| 43 | 6-network | table | Home-Workplace District Flows | `scenario=` | n/a | **UNPIN** | |
| 44 | 6-network | table | Land Use / Socioeconomics by Zone | `scenario=` | n/a | **UNPIN** | |
| 45 | 6-network | table | Accessibility by Zone | `scenario=` | n/a | **UNPIN** | |
| 46 | 5-explore | graphic-walker | Free-form Visual Analytics — Trip Mode Share | `scenario=` | n/a | **UNPIN** | 028 adds a `scenario` field to pivot on |

*(Panels 9, 13, 14, 15, 39 are the 5 markdown "not available in this demo"
notes — already unpinned, no data query, no action.)*

### §2 tally (must sum to 41)

| Action | Count | Panels |
|---|--:|---|
| **UNPIN** (table) | 18 | 8, 12, 16, 18, 19, 20, 21, 23, 26, 27, 28, 29, 30, 31, 35, 43, 44, 45 |
| **UNPIN** (graphic-walker) | 2 | 17, 46 |
| **UNPIN+CH** (add `name:`/`fill: $scenario`) | 5 | 7, 11, 24, 34, 37 |
| **UNLIST** (drop redundant `scenarios: [3]`, keep channel) | 2 | 6 (recharts, has channel), 33 (sankey, combined flow) |
| **KEEP+NOTE** — channel already committed | 5 | 10, 22, 25, 32, 36 |
| **KEEP+NOTE** — one-draw-per-dataset (zonemap/flowmap) | 3 | 38, 41, 42 |
| **KEEP+NOTE** — KPI valuebox | 6 | 1, 2, 3, 4, 5, 40 |
| **Total** | **41** | |

**Unpinned: 27** (18 + 2 + 5 + 2). **Kept pinned: 14** (5 + 3 + 6).

- **SC-003** ("at least 20 unpinned rendering a legible multi-scenario
  comparison"): 27 unpinned; of those, 26 render a legible per-scenario
  series/column (18 tables' `scenario` column + 2 graphic-walker pivots + 5
  new-channel charts + 1 recharts). The 27th (sankey #33) responds to the Switch
  but shows a combined flow, not a comparison — counted as unpinned, **not**
  counted toward "legible comparison". 26 ≥ 20 ✔.
- **FR-009** ("redundant `scenarios: [all three]` list removed") applies to
  panels 6, 7, 33, 34. #6 → UNLIST (keeps `series: scenario`). #33 → UNLIST
  (sankey, accepted combined-flow). #7 and #34 → UNPIN+CH (they had the list but
  **no** channel, so they also need `name: $scenario` — they render an overplot
  today and would still without the channel).

### §2 deviation from the spec's estimated item-2 categories

The spec's item-2 table estimated "~8" panels in "Unpin + add a per-scenario
series channel", naming "person-household ×2 obs-plot; tour-models 1 plotly + 2
obs-plot; trip-models 1 obs-plot + 1 plotly; mode-choice 1 recharts". The direct
parse shows **5** of those candidates (obs-plot 10/22/25/36, recharts 32) already
bind their `fill`/`series` channel to a real categorical dimension
(`school_segment`, `primary_purpose` ×3, `tour_mode`). Converting them to
multi-scenario would require moving that dimension to a facet — a panel redesign
beyond this feature's "remove the pin, add the one channel" scope. They become
**KEEP+NOTE** (see §4). The genuine "add a free channel" set is the **5** panels
whose colour/name channel is unused today: 7, 11, 24, 34, 37. The spec's
Assumptions section explicitly authorises this refinement ("the plan phase
produces the final itemized 41-row table … the categories and counts here are the
agreed basis").

---

## §3 — `valuebox` keep-vs-convert (resolves FR-011)

Six panels: 1–5 (Summary) and 40 (Network). **Decision for all six:
`KEEP+NOTE`** — stay pinned to `activitysim-baseline`, add a `description` making
the scope explicit (e.g. `"Baseline scenario. Use the Scenarios tab to compare
runs on the charts below."`).

Rationale:
- `ValueBoxPanel` takes `rows[0]` of its result. An unpinned `$scenario` union
  would silently surface whichever scenario's row sorts first — arbitrary and
  misleading (spec item 3). It **cannot** become a plain multi-scenario card.
- The Summary tab is this project's established "landing page / high-level
  snapshot" convention (`CLAUDE.md` Navigation model). A single headline number
  per KPI is the intended shape there.
- `034-metric-panel-redesign` already built the opt-in comparison affordances for
  valueboxes (`sparkline`, `baseline_trend`). Wiring `baseline_trend` here is
  **not** worthwhile: the panel would stay pinned to `activitysim-baseline`, and
  `getBaseline()` also resolves to `activitysim-baseline` by default (earliest
  `pinned === false && status === 'ready'`), so every badge would render 034's
  neutral same-scenario `Minus` state. A meaningful `baseline_trend` needs a
  valuebox pinned to a *variant*, which none of these are.
- Adding a `sparkline` is a possible future polish (it shows the pinned
  scenario's own distribution, not a cross-scenario compare) but is out of this
  feature's "unpin vs keep" scope.

Recorded per panel: **1, 2, 3, 4, 5, 40 → keep pinned to `activitysim-baseline`,
add baseline-scope `description`.** No conversion.

---

## §4 — Colour-channel conflict on obs-plot / recharts (resolves FR-008 boundary)

Five panels bind their only per-series channel to a substantive non-scenario
categorical dimension:

| # | Type | Channel today | Why it can't just take `$scenario` |
|--:|---|---|---|
| 10 | observable-plot | `fill: school_segment` | school segment (e.g. K-8 / 9-12 / university) is the point of the distribution |
| 22 | observable-plot | `fill: primary_purpose` | tour purpose breakdown is the analytical content |
| 25 | observable-plot | `fill: primary_purpose` | same |
| 36 | observable-plot | `fill: primary_purpose` | same |
| 32 | recharts | `series: tour_mode` | mode split is the chart; **recharts has no faceting** (`rechartsEncoding.ts` pivots to one series per `series` value — a single channel) |

`observablePlotEncoding.ts` supports only one `fill`/`stroke`; a second
categorical dimension needs `facet_x`/`facet_y`, which this feature does not add.
`rechartsEncoding.ts` has no facet concept at all.

**Decision**: these 5 stay `KEEP+NOTE` (pinned to `activitysim-baseline`, scope
stated in `description`). Converting them to multi-scenario is a per-panel
faceting redesign — a candidate for a **follow-up feature**, explicitly out of
scope here. This keeps this feature's rule crisp: *unpin + at most one added
channel; if the one channel is already taken, keep the pin and state the scope.*

---

## §5 — Scope-note copy for the 14 `KEEP+NOTE` panels

Each kept-pinned panel gets (or extends) a `description` field. Two templates:

- **KPI valueboxes (1–5, 40)**:
  `"Baseline scenario (activitysim-baseline). Compare runs on the charts below via the Scenarios tab."`
- **zonemap / flowmap (38, 41, 42)**:
  `"Shows the baseline scenario. Multi-scenario map comparison is a separate view."`
- **channel-committed charts (10, 22, 25, 32, 36)**:
  `"Baseline scenario, broken out by <school segment | trip purpose | tour mode>. Use the Scenarios tab to compare runs on other panels."`

Exact wording is finalised during implementation and verified rendering in both
themes (panel `description` is plain text under `CardDescription` — 14px body,
theme-token colour, already dual-theme-correct).

---

## §6 — Fixture-suite test remediation (resolves FR-012 / SC-005)

**Behaviour change in the fixture context**: on a plain `boot()` (no `?s=`), the
fixture suite's `observed` (`ready`) **and** `good_scenario` (`ready`) both
auto-activate; `broken_scenario` (`failed`) does not. Previously only `observed`
was active. The 037 investigation's "~33 failures" figure came from flipping
`observed` fully *inactive* (empty union everywhere) — **not** what this feature
does. Under the recommended rule `observed` stays active whenever its fixture
data is present, so most panels still render; only assertions that pin down the
**exact** active set or the **exact** content of a plain-booted unpinned panel
shift. Expected blast radius: ~8–15 assertions, not 33.

**Two remediation categories** (enumerate exact files/lines during
`/speckit-tasks` with `grep -rn "getActive\|only observed\|active.*observed\|s=good_scenario"`):

1. **Direct active-set assertions** — `boot.spec.ts`
   ("no `?s=` params leaves only observed active" → now `['good_scenario',
   'observed']`), `scenarioManager.spec.ts`, `settingsModal.spec.ts` (any
   Switch-state or `appState.getActive()` check). **Fix**: update the expected set
   to the fixture ready-set. These tests are *asserting the rule* — updating them
   is the point.

2. **Plain-boot unpinned-panel content assertions** — a handful of fixture
   Summary/Detail panels asserted at exact row-count / single-series while
   assuming `observed` was the sole scenario. **Fix**: pin the fixture panel
   itself to `scenarios: [observed]` in `tests/fixtures/dashboard-config/*.yaml`
   (an explicit declaration — FR-012's preferred remedy), **except**:
   - `Scenario Split (Plotly|Recharts|Observable Plot|Table)` (dashboard-1) and
     `Free-form Visual Analytics (Multi-Scenario)` /
     `(Dataset Picker, Multi-Scenario)` (dashboard-2) — these **exist** to test
     the `$scenario` union. They stay unpinned; their tests already boot
     `?s=good_scenario` and expect `observed + good_scenario` = 2, which is
     unchanged under the new rule. No edit.
   - `ValueBox Baseline Trend No Scenario (intentional)`, `Broken Panel
     (intentional)`, `Explore Panel Broken (intentional)` — config-error / error
     state tests, independent of the active set. No edit.

   Candidate fixture panels to pin explicitly (confirm content-assertion coupling
   during tasks): `Total Households`, `Total Trips` (dashboard-1 valueboxes),
   `Average Trip Distance` (dashboard-2 valuebox). Fixture `SUMMARY_KPIS_ROWS`
   are written identically for `observed` and `good_scenario`
   (`tests/fixtures/generate.py`), so `rows[0]` is value-stable regardless of
   union order — but pinning makes the test's intent explicit and immune to a
   future fixture-data divergence.

**FR-012 compliance**: after remediation, no fixture test relies on an implicit
"observed is the only active scenario" global default — every one either declares
`?s=`, sets `scenarios:` on its panel, or asserts the rule's real output.

---

## §6a — Enumerated test touch-points (T001 output, 2026-09-10)

Direct grep of `tests/integration/*.spec.ts` for `getActive` / `.active` /
`__wftdm.*active` / `s=good_scenario` / plain `boot()` + active-set assertions,
cross-checked by reading each hit in context.

### Files that MUST change

| File | Line(s) | Current | After 038 | Fix |
|---|---|---|---|---|
| `boot.spec.ts` | ~101 | `?s=nonexistent_scenario` → `activeNames` `toEqual(['observed'])` | `['good_scenario','observed']` — `good_scenario` auto-activates (ready) | update expected array (sorted) |
| `boot.spec.ts` | ~104–108 | test **title** "no ?s= params leaves only observed active by default" + `activeNames` `toEqual(['observed'])` | ready-set is `observed` + `good_scenario` | rename test → "…leaves every ready scenario active by default"; assert `['good_scenario','observed']` (sorted) |
| `settingsModal.spec.ts` | ~1170–1205 (037 FR-001, ×2 light/dark) | `expect(goodActive).toBe(false)` / `expect(goodSwitch).not.toBeChecked()` + `data-state 'unchecked'` — comment "no ?s= param, never auto-activated" | `good_scenario` is now auto-active | swap the "inactive scenario" assertions to `broken_scenario` (status `failed` → never auto-active → `active` falsy); assert `good_scenario` **checked**; update the comment |

### Files confirmed NOT to need changes (verified in context)

| File | Why |
|---|---|
| `boot.spec.ts` L67 (`observed?.active` true), L96 (`?s=good_scenario` → `['good_scenario','observed']`) | still correct under 038 |
| `scenarioManager.spec.ts` (all `.active` hits: L223/372/503/505/546 local-load scenarios, L390 failed folder, L556 observed) | local-folder-load path is unchanged and already calls `setActive` on success; failed folder still inactive; observed still ready→active |
| `settingsModal.spec.ts` L1137 (FR-019/FR-020 toggle test) | boots `?s=good_scenario`; table count 4→2→4 unchanged (observed + good_scenario, 2 rows each) |
| `dashboardShell.spec.ts` L110–113 (`Total Households`=`1,500`, `Total Trips`=`9,200`) | `rows[0]` of the `$scenario` union; `generate.py` writes `SUMMARY_KPIS_ROWS` identically for `observed` and `good_scenario`, so `rows[0]` value is unchanged. T003's pin makes this deterministic-by-construction but the assertion holds either way. |
| `dashboardShell.spec.ts` L78/85/221, `panelExpand.spec.ts` L262 (`Average Trip Distance`) | visibility / card-styling only, no value assertion |

### Fixture panels pinned by T003 (FR-012 "declare the set explicitly")

`tests/fixtures/dashboard-config/dashboard-1-summary.yaml`: `Total Households`,
`Total Trips` (row_kpis) → add `scenarios: [observed]`.
`tests/fixtures/dashboard-config/dashboard-2-detail.yaml`: `Average Trip
Distance` (row_kpis) → add `scenarios: [observed]`. **Not touched**: the four
`Scenario Split (*)` panels and the two `Free-form Visual Analytics
(*Multi-Scenario*)` panels (they are the union's own coverage; their tests
already declare `?s=good_scenario`), and every `*(intentional)`/`*Broken*` panel
(error-state tests).

### §6b — Pre-existing limitation surfaced by T005 (not a 038 regression)

DA-8 originally also asserted "re-activating a scenario restores the
zero-active panel in place." It does not, and this predates 038: when the
active set is empty, `services/sqlExpander.ts`'s `$scenario` expansion
throws synchronously (`missing("scenario.<metric> (no active scenarios)")`)
inside each unpinned panel's data-fetch effect body — before the
`query().then()/.catch()` — so the throw propagates to `panelCard.tsx`'s
per-panel error boundary, which replaces the panel body and does **not**
auto-reset on a later `activeScenarioNames` prop change. The panel card and
title stay mounted; the body needs a remount to recover.

Before 038 this was only reachable by toggling `observed` off when it was
the sole active scenario — an unlikely path, and no test exercised it.
038 makes "toggle everything off" a slightly more natural gesture, but the
behavior is unchanged. **Out of scope for 038** (fixing it means either
catching the throw in every panel type's effect and mapping it to the
panel's own `empty`/`error` status, or giving `panelCard.tsx`'s boundary a
reset key — both are cross-cutting panel-infrastructure changes). Recorded
as a follow-up. The spec's Edge Case ("goes to empty/error state until the
viewer re-activates one … must not crash") is satisfied for "must not
crash"; the "until re-activates" recovery is the gap.

DA-4/DA-7 (a scenario becoming active while ≥1 was already active — the
panel never hits the throw) works correctly and is covered by
`settingsModal.spec.ts`'s FR-019/FR-020 toggle test and `demoMultiScenario.spec.ts`.

### Demo-content specs (T020/T021)

`demoContentAllPanels.spec.ts` already restores
`public/demo-dashboard-config/index.json` + `public/demo-scenarios/index.json`
(blanked to `[]` by `tests/global-setup.js`) in `beforeAll`/`afterAll` under
`_sharedFixtureLock`. The new `demoMultiScenario.spec.ts` (T020) MUST use the
identical pattern.

---

## §7 — Dual-theme verification plan (standing requirement)

Every panel moving from single-series to multi-series (27 unpinned, of which 26
render new per-scenario series/columns) must be checked in **both** light and
dark mode. Technique per the `wftdm-design-system` skill: live
`getComputedStyle()` assertions in a Playwright spec, not visual spot-checks.
Specifically:
- multi-series **plotly** (7, 24, 34, 37): confirm each scenario trace resolves a
  distinct, theme-correct colour (`plotlyTraces.ts` already resolves
  `$scenario`-split trace colours from tokens — 035).
- multi-series **recharts** (6): `--chart-N` token cycling, already dual-theme
  verified (029).
- multi-series **observable-plot** (11): `fill: scenario` legend text uses
  `currentColor` — inherits `shell.tsx` `text-foreground` (already fixed, 033
  re-verified).
- **tables** (18): the `scenario` column is ordinary themed cell text — no new
  risk, but include one in the dual-theme spec for coverage.
- `KEEP+NOTE` `description` text: plain `CardDescription` — dual-theme-correct
  already; no new assertion needed beyond a smoke check.

---

## §8 — Out of scope (confirmed, carried from spec)

- `$baseline` sentinel / `comparison: diff` mechanism — untouched. No demo panel
  uses it; the fixture `comparison: diff` panels resolve `a`/`b` from the `diff`
  object, never the active set.
- `037`'s Scenarios-tab UI (drag reorder, baseline chip, Switch, tooltip) —
  untouched. This feature only changes *which panels the Switch's existing
  mechanism reaches*.
- Faceting support for obs-plot/recharts (§4) — follow-up feature.
- `valuebox` → `sparkline`/`baseline_trend` conversion (§3) — follow-up.
- Large-N-scenario default behaviour (spec Assumptions) — follow-up if it ever
  arises; demo ships 3.
