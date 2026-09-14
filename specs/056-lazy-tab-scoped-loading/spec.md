# Feature Specification: Lazy, Tab-Scoped Data Loading

**Feature Branch**: `056-lazy-tab-scoped-loading`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Instead of eagerly registering every scenario's every metric at boot, register/fetch only the specific scenario+metric combinations actually needed to render whatever tab a viewer is currently on, deferring everything else until it's actually needed. Fix B of a two-fix investigation — Fix A (consolidating each scenario's Parquet files into one combined file) is explicitly deferred and out of scope here."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fast landing on the tab a viewer actually opens (Priority: P1)

A viewer opens the dashboard. Today, the app waits for every scenario's every metric to finish loading before anything becomes usable, even though the landing tab only ever displays a handful of those metrics. Instead, the app should become interactive as soon as the data the *current* tab's own panels actually need is ready — independent of how many other scenarios or metrics exist in the deployment.

**Why this priority**: This is the whole point of the feature — the landing tab is what every viewer waits on, every single visit, and it is also the tab whose real data need is smallest relative to the deployment's total data volume. Fixing this delivers the entire user-facing benefit even if nothing else in this spec is built.

**Independent Test**: Load the app fresh and time how long the landing tab takes to show correct, complete data, in a deployment with many scenarios/metrics configured. Can be fully tested and delivers value on its own, with no dependency on the other stories below.

**Acceptance Scenarios**:

1. **Given** a fresh visit to the dashboard, **When** the landing tab finishes loading, **Then** every panel on that tab shows correct data, and no data for metrics not referenced by that tab's panels has been loaded yet.
2. **Given** a deployment with many scenarios and many metrics configured, **When** a viewer loads the app, **Then** the landing tab becomes usable in an amount of time that depends on that tab's own real data need, not on the deployment's total metric count.
3. **Given** a viewer switches from the landing tab to a different tab for the first time in their session, **When** that tab activates, **Then** it shows a real loading indicator for its own panels while its data loads, then displays correct results.
4. **Given** a viewer switches back to a tab they already visited earlier in the session, **When** that tab re-activates, **Then** its panels display immediately with no repeated loading wait, using the data already loaded during the earlier visit.

---

### User Story 2 - Activating a scenario after arriving on a tab shows that scenario's data correctly (Priority: P2)

A viewer is looking at a tab, then turns on a scenario that was not previously active (or that has just finished loading). The tab's panels should pick up that scenario's data as soon as it is ready, with a visible loading indication in the meantime — never a silently incomplete or stale result that looks finished but isn't.

**Why this priority**: This is the direct, necessary consequence of loading data lazily per tab rather than everything at boot — without this behavior, lazy loading would create a real, confusing gap that doesn't exist today (where all scenario data is already present the moment a scenario becomes active). It's essential correctness, not a nice-to-have, but it only matters once User Story 1 exists.

**Independent Test**: With one scenario active on a tab that references several metrics, activate a second scenario while remaining on that tab. Confirm every affected panel transitions through a visible loading state and then shows results including the newly active scenario — verifiable without needing the Explore-tab behavior in User Story 3.

**Acceptance Scenarios**:

1. **Given** a viewer is on a tab with one scenario active, **When** they activate a second, not-yet-loaded scenario, **Then** every panel on that tab that depends on the newly active scenario shows a loading indicator and then updates to include that scenario's data.
2. **Given** the same situation, **When** the newly activated scenario's data finishes loading, **Then** no panel ever displays a result that silently omits the new scenario without indicating it is still loading.
3. **Given** a viewer deactivates a scenario, **When** the panels on the current tab re-render, **Then** that scenario's data no longer appears in any result, immediately.
4. **Given** a scenario's data fails to load for a tab's panel, **When** that failure occurs, **Then** the affected panel shows the same kind of per-panel error state the app already shows today for a failed load — not a silent gap and not a crash of the rest of the tab.

---

### User Story 3 - Free-form data exploration still offers every real dataset (Priority: P3)

A viewer on the Explore tab expects to pick from the complete list of real datasets available for whichever scenarios are currently active — exactly as today — even though, under lazy loading, most of those datasets may not have been loaded yet because the viewer never visited the tabs that reference them.

**Why this priority**: This is the one genuinely hard case in the whole feature — the Explore tab's dataset picker is deliberately comprehensive by design, which is in direct tension with "only load what's needed." It's lower priority than Stories 1 and 2 because it only affects one tab, but it must work correctly for the feature to be safe to ship, since a narrowed picker list would be a real, visible regression.

**Independent Test**: Load the app fresh and go straight to the Explore tab, without visiting any other tab first. Confirm the dataset picker still lists every real dataset available for the active scenario(s) — not just the one the tab's own default view happens to reference — and that picking any of them successfully loads and displays it.

**Acceptance Scenarios**:

1. **Given** a viewer navigates directly to the Explore tab as the very first thing they do in a session, **When** the dataset picker renders, **Then** it lists the same complete set of real datasets a viewer would see today, regardless of visit order.
2. **Given** the viewer selects a dataset from that list that has not yet been loaded, **When** they make that selection, **Then** the app shows a loading indicator and then renders that dataset correctly, with no error and no missing data.
3. **Given** the viewer switches the active scenario(s) while on the Explore tab, **When** the scenario selection changes, **Then** the picker's list of available datasets updates to reflect what is genuinely available for the now-active scenario(s), consistent with today's behavior.

---

### Edge Cases

- A tab whose panels reference no plain per-scenario metric at all (e.g., a tab built entirely from cross-scenario comparison panels) must not trigger any load beyond what those comparison panels genuinely need.
- A comparison/baseline panel that references the *same* metric across two specific scenarios must load that metric for both of those scenarios specifically — not for every active scenario, and not for only one.
- A tab configured with a deliberately broken or nonexistent metric/dataset reference (used today for testing error states) must fail to load that one reference the same clear way it fails today, without preventing the tab's other, valid panels from loading correctly.
- A viewer who never visits a given tab during a session never causes that tab's data to load at all — this is the intended behavior, and nothing elsewhere in the app may depend on that data having already loaded regardless of visit history.
- Multiple panels on the same tab that reference the same scenario+metric combination must not each trigger a separate, duplicate load of that data.
- A scenario that finishes loading its own metadata *after* a viewer has already been sitting on a tab that needs its data (e.g., a slow scenario registration) must still correctly trigger that tab's panels to load and display it once ready, the same as User Story 2's toggle case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST, when a viewer activates a tab, load only the distinct scenario+metric (or scenario+dataset) combinations that tab's own panels actually reference for whichever scenarios are currently active — not every metric for every scenario in the deployment.
- **FR-002**: The system MUST deduplicate loading within a tab: when two or more panels on the same tab reference the same scenario+metric combination, that combination is loaded once, not once per panel.
- **FR-003**: The system MUST reuse data already loaded: revisiting a previously-visited tab, or visiting a tab whose data need was already satisfied by an earlier tab visit or scenario activation, must not re-trigger a load for data already present.
- **FR-004**: The system MUST, when a viewer activates a scenario that is not yet loaded for the tab currently being viewed, load that scenario's data for that tab's needs on demand, and show a real loading indicator for every affected panel until it completes.
- **FR-005**: The system MUST NOT display a result that silently omits a newly-activated scenario's data without indicating that a load is still in progress — a panel is either still loading, showing a completed correct result, or showing an explicit error; it is never done-looking but actually incomplete.
- **FR-006**: The system MUST immediately stop including a deactivated scenario's data in every panel's results, regardless of whether that scenario's data remains loaded in the background.
- **FR-007**: The Explore tab's dataset-selection control MUST continue to offer the complete set of real datasets available for the currently active scenario(s), regardless of which tabs the viewer has or has not visited earlier in the session.
- **FR-008**: The system MUST, when a viewer selects a not-yet-loaded dataset from the Explore tab's picker, load it on demand with a visible loading indicator before rendering it.
- **FR-009**: The system MUST produce identical query results for any given panel, active-scenario selection, and filter state as it does today — this feature changes only *when* underlying data becomes available, never *what* a query returns.
- **FR-010**: The system MUST NOT run a panel's query against data that has not finished loading — a panel must wait for its own data dependency to complete loading before it queries, never racing or returning partial/undefined results.
- **FR-011**: The system MUST surface a failed lazy load through the same per-panel error state the system already uses today for a failed load, without preventing sibling panels on the same tab from loading and displaying correctly.
- **FR-012**: The system's underlying data-loading setup MUST be no more complex than the new, smaller, tab-scoped loading pattern actually requires — once this feature is built and its real loading pattern is measured, any part of the current loading machinery that is no longer necessary for that measured workload must be simplified or removed rather than left in place unused.

### Key Entities

- **Tab Data Requirement**: The distinct, deduplicated set of scenario+metric (or scenario+dataset) combinations that a given tab's real panels reference. Computed from the tab's own configuration and the currently active scenario set; drives what gets loaded when that tab activates.
- **Metric Load State**: For a given scenario+metric combination, whether it has not yet been requested, is currently loading, has successfully loaded, or has failed to load. Drives each dependent panel's loading/ready/error display.
- **Dataset Catalog**: The complete, real list of datasets/metrics available for a given scenario, known independent of whether any of them have actually been loaded yet. Used specifically so the Explore tab's dataset picker can offer choices that have not yet been loaded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Time to a fully interactive, correctly-populated landing tab on a fresh visit does not increase as additional scenarios or additional metrics unrelated to the landing tab are added to a deployment.
- **SC-002**: A session that visits only a subset of the available tabs loads correspondingly less total data than a session that visits every tab — verified by comparing total data loaded across the two sessions.
- **SC-003**: Switching to a tab not yet visited in the current session always completes with fully correct data, using a real, visible loading state throughout, with no partial or silently-stale result ever shown.
- **SC-004**: Activating a previously-inactive scenario while viewing a tab that needs its data updates every affected panel to a correct, complete result, with no panel ever appearing finished while actually incomplete.
- **SC-005**: The Explore tab's dataset-selection list is identical in content, at any point in a session, to what a viewer would see today — regardless of what order tabs were visited in beforehand.
- **SC-006**: Every existing panel, across every panel type and every real demo tab, produces the same query results after this change as before it, for the same scenario and filter selections — a full pass over existing coverage shows no behavior change beyond loading timing.

## Assumptions

- **Real per-tab fan-out is small and bounded.** Traced directly from this deployment's own real tab configurations (not assumed): across the seven real content tabs, the number of distinct metrics a single tab's panels reference ranges from 3 (the landing/Summary tab) to 13 (the Tour Models tab); the Explore tab references no metric list at all, binding instead to a single default dataset selection. None of the seven approaches the deployment's full real metric catalog (35 distinct metrics today). This confirms per-tab granularity is both a meaningful reduction from full eager loading and not so fine-grained that it would lose real, existing cross-panel reuse — the Network tab's own two panels both reference the same metric today, confirming that within-tab deduplication (FR-002) is a real, not theoretical, requirement.
- **The Explore tab is a deliberate, documented exception to "only load the current tab's own referenced data."** Its dataset picker's whole purpose is to expose every real dataset a viewer could choose, not only the one its own configuration defaults to — so its available-choices list must be sourced independent of what has actually loaded so far (the Dataset Catalog entity above), with the on-demand load happening at the moment of selection rather than at tab-activation time.
- **Whether today's parallelized, multi-engine data-loading design remains necessary is an open, empirical question, not a foregone conclusion.** The current design was built and tuned for a workload of roughly one hundred files loaded together at boot; this feature is expected to shrink a typical single load to a much smaller handful of files per tab activation. Whether that smaller, more frequent workload still benefits from the current parallelized approach, or whether a simpler single-engine approach now performs just as well with less complexity, can only be determined by building this feature and measuring the new, real workload — not by assuming either answer in advance. Making that determination, and simplifying the loading design to match if a simpler approach is sufficient, is explicitly in scope for this feature.
- **This feature changes timing, not meaning.** The existing rules for which scenarios are active, how a baseline/comparison query resolves, and how filters apply are all unchanged inputs to unchanged query logic — this feature only changes when the underlying data those rules operate on becomes available.
- **Scenario-level readiness and metric-level loading are two different, independently-tracked things.** A scenario already has its own top-level readiness state today (registering, ready, or failed) before any of its individual metrics are considered. This feature's Metric Load State operates one level below that, only for a scenario that is already ready — it does not change how scenario-level readiness itself is determined or displayed.
- File consolidation (combining a scenario's many small files into fewer, larger ones) is a separate, explicitly deferred effort and is not part of this feature; this feature's benefit does not depend on that decision either way.
