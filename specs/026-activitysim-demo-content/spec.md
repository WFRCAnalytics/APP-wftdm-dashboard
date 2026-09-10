# Feature Specification: Real ActivitySim scenario content — summarize.yaml, post-processed scenarios, and dashboard panels

**Feature Branch**: `026-activitysim-demo-content`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Real ActivitySim scenario content — summarize.yaml, post-processed scenarios, and dashboard panels. Design and build the first real, non-synthetic content this dashboard has ever shown: a summarize.yaml against ActivitySim's actual real column shape, run through 025-python-postprocessor's already-built pipeline against three real, already-generated ActivitySim scenario datasets (baseline, a land-use density variant, a transit-service variant), and dashboard-*.yaml panels that specifically demonstrate this project's own real, documented causal story between the three scenarios."

## Research Findings (carried forward — do not re-derive)

1. **`public/scenarios/`, `public/dashboard-config/`, and `public/observed/` are entirely gitignored today** (`.gitignore` lines 85–87, confirmed via `git ls-files` returning nothing under any of the three). Every file currently on disk under them was placed there by `npm run dev:fixtures` (`scripts/copy-fixtures.js`), which copies from `tests/fixtures/{observed,scenarios,dashboard-config}` and **destructively `rmSync`s the destination directory first**. There is no real, checked-in content anywhere in this project today — this feature is the first.
2. Per explicit user decision, this feature's real content lives at a **new, separate top-level root** — never gitignored, never touched by `copy-fixtures.js` — rather than sharing `public/scenarios/`/`public/dashboard-config/` with the ephemeral fixture-copy workflow.
3. `project-docs/GRAMMAR.md`'s `summarize.yaml` worked example (sources/mappings/bins/sql_fragments/metrics) uses **illustrative, non-ActivitySim column names** (`num_persons`, `tour_purpose`, `start_time`/`end_time`, `orig`/`dest`, `time_period`) that do not match real ActivitySim output. This feature's own `summarize.yaml` must use the real confirmed column names instead: `hhsize`, `primary_purpose`, `start`/`end`, `origin`/`destination`, `depart` (an hour-of-day integer, bucketed against `network_los.yaml`'s real `periods: [0,3,5,9,14,18,24]` → EA/AM/MD/PM/EV).
4. `sources`/`mappings`/`bins`/`sql_fragments`/`metrics` grammar, and the shared `comparison: diff` / `compare_on` / `$baseline` sentinel grammar (available identically on `plotly`, `table`, `observable-plot`, and `zonemap` panels), are confirmed directly from `project-docs/GRAMMAR.md` and already implemented/tested — this feature only needs to *use* them correctly, not extend them.
5. **No usable real zone-boundary geometry exists for the 25-zone `prototype_mtc` example.** The only geometry ActivitySim's own example bundle ships (`output/summarize/taz1454.geojson`) is a **1,454-zone full-region MTC geometry** (`TAZ1454` property, confirmed by direct inspection) — an unrelated, much larger zone system whose IDs do not correspond to `prototype_mtc`'s own 25 TAZs (1–25). A `zonemap` panel would therefore require either fabricated geometry (not real) or skipping the zone-boundary join entirely. Per the feature's own "generic ActivitySim content" framing, fabricating geometry is out of scope — **`zonemap` is not used in this feature's panel set.**
6. Real column shapes (confirmed against actual generated `final_*.csv` output, not ActivitySim docs alone): households has `income, hhsize, HHT, auto_ownership, num_workers, household_id, home_zone_id`; persons has 63 columns including `age, sex, home_zone_id, school_zone_id, workplace_zone_id`; tours has `person_id, tour_type, primary_purpose, tour_id, origin, destination`; trips has `person_id, household_id, outbound, trip_count, tour_id, purpose, depart, trip_mode, mode_choice_logsum, trip_id, origin, destination`; land_use has 29 columns including `TOTHH, TOTEMP, TOTACRE, PRKCST, RETEMPN, FPSEMPN, HEREMPN, OTHEMPN, AGREMPN, MWTEMPN, DISTRICT, SD, COUNTY`, and a zone-id column.
7. Documented causal stories to make visible (both already measured this session against the real generated data): the **density variant** raises TAZ 1 employment ~40%, producing a real +37–40% increase in trips/tours/work-tours destined to TAZ 1; the **transit variant** cuts AM/PM `WALK_LOC` in-vehicle-time 20% and wait-time 50%, producing a real ~+1 percentage-point `WALK_LOC` mode-share increase specifically in AM and PM, with MD/EV essentially flat as an internal control.
8. The three real ActivitySim outputs already exist on disk (scratch location, generated earlier this session) as independent, `cmp`-verified copies: `baseline/output/`, `density-variant/output/`, `transit-variant/output/`, each with `final_households.csv`, `final_persons.csv`, `final_tours.csv`, `final_trips.csv`, `final_land_use.csv`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the density variant's destination-choice shift (Priority: P1)

A person evaluating this dashboard opens it, sees three real ActivitySim scenarios available (a baseline and two variants), and can view a panel that shows trips/tours by destination zone — making the density variant's real, documented pull of trips toward TAZ 1 directly visible without needing to already know the story ahead of time.

**Why this priority**: This is the dashboard's first-ever demonstration against real, non-synthetic model output, and the density-variant story is the more visually direct of the two (a single zone's counts rising sharply) — it is the anchor proof that the whole real-data pipeline (raw ActivitySim CSVs → `summarize.yaml` → Parquet → dashboard panel) works end to end.

**Independent Test**: Load the dashboard, select the baseline and density-variant scenarios, open the "trips/tours by destination zone" panel, and confirm TAZ 1's bar/row is visibly higher for the density variant than the baseline, consistent with the ~+37% real increase already measured.

**Acceptance Scenarios**:

1. **Given** the baseline and density-variant scenarios are both loaded, **When** the viewer opens the destination-zone panel, **Then** TAZ 1's trip count for the density variant is visibly and correctly higher than the baseline's TAZ 1 count.
2. **Given** only the density-variant scenario is loaded, **When** the viewer opens the panel, **Then** it renders correctly with no error, showing that scenario's own destination-zone distribution alone.

---

### User Story 2 - See the transit variant's AM/PM mode-share shift (Priority: P1)

A person evaluating this dashboard can view a panel that shows trip mode share broken out by time-of-day period, making the transit variant's real AM/PM-specific `WALK_LOC` increase directly visible, while the untouched MD/EV periods visibly stay flat as a built-in credibility check.

**Why this priority**: Equal to User Story 1 — together the two stories are this feature's whole reason to exist. This one is the subtler, more instructive case (a real cross-scenario comparison using time-of-day segmentation, not just a single zone spike) and exercises a second, distinct real metric/panel design.

**Independent Test**: Load the baseline and transit-variant scenarios, open the mode-share-by-period panel, and confirm the AM and PM `WALK_LOC` shares are visibly higher for the transit variant while MD and EV shares are visibly close to unchanged.

**Acceptance Scenarios**:

1. **Given** the baseline and transit-variant scenarios are both loaded, **When** the viewer opens the mode-share-by-period panel, **Then** `WALK_LOC`'s AM and PM shares are visibly higher for the transit variant than the baseline.
2. **Given** the same two scenarios, **When** the viewer inspects the MD and EV periods on the same panel, **Then** the transit variant's shares are close to the baseline's (no comparable jump), demonstrating the effect is period-specific rather than a broad shift.

---

### User Story 3 - Compare a variant against baseline using the built-in diff mechanism (Priority: P2)

A person evaluating this dashboard marks the baseline scenario as the diff baseline (or relies on it being the automatic default) and views at least one panel using the project's existing `comparison: diff` / `$baseline` mechanism, seeing a real, computed difference between a variant and the baseline rendered directly — the first time this already-built capability has ever been exercised against real data.

**Why this priority**: Demonstrates a capability the project has already fully built and tested (018–021) but never shown working against anything but synthetic fixtures. Valuable, but the underlying story is already visible via Stories 1–2's side-by-side panels, so this is additive polish rather than the core proof.

**Independent Test**: With the baseline scenario resolved as the diff baseline, open a panel configured with `comparison: { type: diff, a: '$baseline', b: <variant> }` and confirm it renders a real, non-zero, correctly-signed `diff_value` for at least one row/column that is known (from the already-measured evidence) to differ between that variant and the baseline.

**Acceptance Scenarios**:

1. **Given** the baseline scenario is the resolved diff baseline and the density-variant scenario is loaded, **When** the viewer opens the diff panel comparing `$baseline` against the density variant, **Then** TAZ 1's row shows a positive `diff_value` consistent with the real measured increase.
2. **Given** no scenario currently resolves as baseline (e.g., the baseline scenario was removed), **When** the viewer opens the same diff panel, **Then** it shows its ordinary defined error/empty state rather than a broken or silently-zero result.

---

### User Story 4 - Get oriented with overview KPIs and mode/purpose breakdowns (Priority: P3)

A person evaluating this dashboard sees a landing-page-style set of scalar KPIs (household/person/trip counts, VMT, average trip length) and general mode-share/trip-purpose breakdowns for whichever real scenario(s) are loaded, giving context around the two headline stories rather than dropping the viewer straight into them.

**Why this priority**: Rounds out the demo into something that reads as a genuinely informative dashboard rather than two isolated proof panels, but is not required to prove either causal story.

**Independent Test**: Load any one of the three real scenarios and confirm the KPI/overview panels render real, non-zero, internally-consistent values (e.g., total trips roughly matches the sum across mode-share categories).

**Acceptance Scenarios**:

1. **Given** the baseline scenario is loaded alone, **When** the viewer opens the landing tab, **Then** KPI value boxes show real household/person/trip counts matching the real row counts already confirmed for that scenario's output.
2. **Given** all three scenarios are loaded together, **When** the viewer opens the mode-share and trip-purpose panels, **Then** each renders one series per scenario with no error.

---

### Edge Cases

- A viewer loads only one of the three scenarios (or two, or a combination the demo wasn't specifically tuned for) — every panel must still render a defined result (data, empty, or error state) rather than assuming all three are always present.
- A panel using `$baseline` when no scenario currently resolves as baseline (per Story 3, Scenario 2) — must show the panel's existing, already-defined "unresolved baseline" state, not a crash.
- The time-of-day bucketing metric must correctly reproduce the real EA/AM/MD/PM/EV boundaries already confirmed from `network_los.yaml` (`periods: [0,3,5,9,14,18,24]`) — an off-by-one in the bucket boundaries would misattribute the AM/PM-specific transit effect to the wrong periods and silently invalidate Story 2's whole premise.
- `final_land_use.csv`'s zone-id column and `final_trips.csv`/`final_tours.csv`'s `destination`/`origin` columns must join correctly (same zone-numbering scheme) — since no zone geometry validates this independently (finding #5 above), a silent join mismatch would misrepresent the destination-zone panel with no visual sign anything is wrong; this must be checked directly against real data during implementation, not assumed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single `summarize.yaml`, authored against the real confirmed ActivitySim column names (Research Finding #6), MUST run unmodified through the existing `wftdm-dashboard summarize` CLI (025-python-postprocessor) against all three real raw output directories (baseline, density-variant, transit-variant) to produce three independent scenario folders (Parquet + auto-generated `manifest.yaml` each).
- **FR-002**: The metric set MUST include, at minimum: (a) trips and/or tours aggregated by destination zone (to make the density-variant story visible), (b) trip mode share aggregated by time-of-day period, correctly bucketed into EA/AM/MD/PM/EV per the real confirmed period boundaries (to make the transit-variant story visible), (c) scalar summary KPIs (household/person/trip counts, VMT, average trip length) for landing-page value boxes, (d) an overall trip-mode-share breakdown, and (e) a trip-purpose breakdown.
- **FR-003**: The generated scenario content MUST be published at a new top-level location, separate from `public/scenarios/`/`public/dashboard-config/`/`public/observed/`, discovered at startup the same way those existing paths are (an `index.json` listing filenames/scenario names, fetched by the browser) — additive to, not a replacement of, the existing fixture-copy-driven discovery at those original paths.
- **FR-004**: This new discovery path MUST be genuinely checked into git (not gitignored) — it is this project's first real, committed dashboard content, distinct from the ephemeral, gitignored fixture-copy workflow.
- **FR-005**: At least one dashboard panel MUST use the project's existing `comparison: diff` mechanism with `a: '$baseline'`, demonstrating that already-built capability against real data for the first time.
- **FR-006**: The baseline scenario (from the three real datasets) MUST be positioned to resolve as the automatic diff baseline under the project's existing, unmodified baseline-resolution rule (earliest registered, non-pinned, `status: ready` scenario) — requiring no change to that resolution logic itself, only correct registration order.
- **FR-007**: Dashboard panels MUST use only already-built, already-shipped panel types applicable to this data (`valuebox`, `plotly`, `table`, `observable-plot`) — `zonemap` MUST NOT be used, per the confirmed absence of usable real zone geometry for this ActivitySim example (Research Finding #5), and no new panel type may be introduced.
- **FR-008**: The three real ActivitySim raw output directories MUST each be processed independently, through the same unmodified `summarize.yaml`, in a way that is traceable back to which of the three real raw datasets produced which scenario folder (e.g., via `manifest.yaml`'s `scenario_name`/`notes` fields).
- **FR-009**: This feature MUST NOT modify `tests/fixtures/`, any file under it, any test assertion in the automated Vitest/Playwright suite (`tests/unit/`, `tests/integration/*.spec.ts`), or the existing `copy-fixtures.js` fixture-copy behavior for `public/scenarios/`/`public/dashboard-config/`/`public/observed/`. **Amendment, confirmed necessary during implementation and approved by the user before being made**: `tests/global-setup.js`/`tests/global-teardown.js` (Playwright test-harness infrastructure — not `tests/fixtures/`, not a `.spec.ts` assertion file, not `copy-fixtures.js`) required a small, additive change. Root cause: unlike every other path under `public/`, the new `public/demo-scenarios/`/`public/demo-dashboard-config/` content is real, git-tracked, and *permanently* present, but Playwright's `webServer` (`playwright.config.js`) serves the raw `public/` tree directly — so the new content was bleeding into every test run unconditionally, breaking 5 real assertions that count/name scenarios or tabs exactly. Fixed by having `global-setup.js` blank the two new `index.json` files to `[]` for the duration of the run (identical effect to the content not existing) and `global-teardown.js` restore their original content after — no test assertion, fixture file, or `copy-fixtures.js` behavior was touched. See `research.md` for the full record, including a rejected first attempt (directory renaming, which hit a real, repeatable Windows `EPERM`).
- **FR-010**: This feature MUST NOT modify the existing scenario-registration/baseline-resolution logic (`state/appState.ts`, `services/scenarioDiscovery.ts`) — any code change needed to also discover the new content root (FR-003) MUST be additive (a new, parallel registration call) rather than a change to the existing observed/`public/scenarios/` registration path.
- **FR-011**: This feature MUST NOT introduce any WFRC-specific naming, branding, or customization — the summarize.yaml, scenario names, and dashboard panels remain generic ActivitySim/`prototype_mtc` demo content.
- **FR-012**: Every metric's SQL MUST use only placeholders (`$mappings`, `$bins`, `$sql`) and grammar already supported by the existing `services/sqlExpander.ts`/postprocessor `expand.py` — no new grammar may be introduced by this feature.

### Key Entities

- **summarize.yaml (this feature's own)**: The single authored config driving the CSV→Parquet conversion for all three scenarios; defines `sources` (the real `final_*.csv` files), `mappings` (e.g. trip-mode grouping), `bins` (e.g. time-of-day period), `sql_fragments` (reusable joins), and `metrics` (the five-plus named aggregations from FR-002).
- **Scenario folder (×3: baseline, density-variant, transit-variant)**: Post-processor output — a `manifest.yaml` plus `summary/*.parquet` files, one folder per real ActivitySim run, published under the new content root.
- **Dashboard panel config (new dashboard-*.yaml content)**: The tab/panel layout demonstrating both causal stories plus the `$baseline` diff panel and overview KPIs, published alongside the new content root's own discovery `index.json`.
- **New content-root index.json (×2: scenarios, dashboard-config)**: Discovery manifests for the new root, mirroring the existing `public/scenarios/index.json`/`public/dashboard-config/index.json` shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer loading all three real scenarios can identify, without prior explanation, which scenario shows a destination-choice pull toward one specific zone, purely from the destination-zone panel.
- **SC-002**: A viewer loading all three real scenarios can identify, without prior explanation, which scenario shows an AM/PM-specific (not all-day) travel-mode shift, purely from the mode-share-by-period panel.
- **SC-003**: The magnitude shown in the destination-zone panel for the density variant is within the already-measured real range (approximately +37% to +40% increase in TAZ 1 trips/tours vs. baseline) — i.e., the panel's numbers match, not merely gesture at, the real underlying data.
- **SC-004**: The magnitude shown in the mode-share-by-period panel for the transit variant's AM and PM `WALK_LOC` share is within the already-measured real range (approximately +1 percentage point vs. baseline), while MD stays within a small fraction of a point of baseline.
- **SC-005**: The `$baseline` diff panel renders a real, non-error result with the baseline scenario as the default, requiring zero manual scenario-list configuration from a first-time viewer.
- **SC-006**: None of the three real scenario folders, the new `summarize.yaml`, or the new dashboard panel configs depend on or reference anything under `tests/fixtures/`, and running the existing fixture-copy/test workflows (`npm run dev:fixtures`, `npm run test:integration`) is unaffected by this feature's content existing alongside them.

## Assumptions

- The three real ActivitySim output datasets (baseline, density-variant, transit-variant) already exist on local disk from this session's earlier work and are usable as this feature's raw input without re-running ActivitySim.
- "New top-level content root" (per explicit user decision) means new sibling directories to the existing `public/observed/`/`public/scenarios/`/`public/dashboard-config/` — e.g. `public/demo-observed/` (if any observed-style reference data is needed), `public/demo-scenarios/`, `public/demo-dashboard-config/` — each with its own `index.json`, fetched by a small, additive boot-sequence change rather than by reusing the existing fixture-copy-targeted paths. Exact naming is an implementation-time decision, not fixed by this spec.
- No "observed" reference dataset is required for this feature — the three real scenarios are compared against each other (baseline vs. variants), not against a survey/count reference; observed data support remains whatever the existing (unmodified) `public/observed/` mechanism already provides.
- "Additive" boot-sequence change (FR-010) means `main.ts` gains a second discovery call for the new content root; it does not preclude a small, clearly-scoped code change — it precludes altering the existing call's behavior for `public/observed/`/`public/scenarios/`/`public/dashboard-config/`.
- Zone-numbering consistency between `final_land_use.csv`'s zone-id column and `final_trips.csv`/`final_tours.csv`'s `origin`/`destination` columns (needed for the destination-zone metric) will be directly verified against the real data during implementation before the metric is considered complete (per the Edge Cases entry above) — not assumed from column naming alone.
- `manifest.yaml`'s auto-generated `color` (Tableau10, hash-based) and `run_date` fields are acceptable as-is for this demo content; no bespoke branding or fixed color assignment is required (consistent with FR-011).
