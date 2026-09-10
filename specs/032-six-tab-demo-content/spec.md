# Feature Specification: Six-Tab ActivitySim Demo Content

**Feature Branch**: `032-six-tab-demo-content`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Regenerate real ActivitySim demo content into a comprehensive six-tab structure, using every panel type — delete the current narrower demo-dashboard-config tabs (Overview, Destination Choice, Transit Service) entirely and replace them with the full six-tab ActivitySim-outline structure documented in project-docs/CALIBRATION-SUMMARIES.md (Summary, Person/Household Models, Tour Models, Mode Choice, Trip Models, Network), using the sidebar's accordion sub-navigation to mirror CALIBRATION-SUMMARIES.md's own submodel breakdown per tab. The Explore tab is unrelated and must be left exactly as-is. Zero fabricated/placeholder/synthetic data anywhere — every number must trace to real ActivitySim output, re-run from the same three proven scenarios (baseline, TAZ-1 employment-density variant, AM/PM transit-service variant). Audit CALIBRATION-SUMMARIES.md's full submodel list against the fresh real output's actual column availability before assuming anything is computable. Author every genuinely computable summary as a summarize.yaml metric, author the six-tab dashboard content using every one of the ten panel types at least once wherever it naturally fits the data shape, re-run the real post-processor CLI and publish, update index.json, and correct CALIBRATION-SUMMARIES.md itself if the audit found anything not actually computable. Fold in the already-written-but-unpublished purpose_mode_flow/od_flows metrics if the audit confirms they're still valid rather than re-deriving them from scratch."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comprehensive six-tab calibration structure replaces the narrow demo (Priority: P1)

An analyst opens the public WFRC TDM Calibration Dashboard demo expecting to
see the same six-tab outline the project's own calibration reference
document (`project-docs/CALIBRATION-SUMMARIES.md`) already describes — Summary,
Person/Household Models, Tour Models, Mode Choice, Trip Models, and
Network — instead of the current, narrower three-tab causal-story demo
(Overview, Destination Choice, Transit Service). Each tab's sidebar
sub-navigation lists sections that match that document's own submodel
headings, so someone already familiar with the reference document can
navigate the live dashboard the same way they navigate the doc.

**Why this priority**: This restructuring is the feature's entire premise —
without it, nothing else (real data, panel-type coverage, documentation
accuracy) has anywhere to live. The user explicitly directed that the old
three tabs' content is not preserved.

**Independent Test**: Load the demo dashboard and enumerate its tabs —
confirm exactly six primary tabs appear, in the documented order, that the
three old tabs are gone, and that each new tab's sidebar sub-navigation
section labels match `CALIBRATION-SUMMARIES.md`'s own headings for that tab
(limited to whichever submodels the audit in User Story 2 confirms are
computable).

**Acceptance Scenarios**:

1. **Given** the demo dashboard is loaded, **When** the sidebar tab list is
   inspected, **Then** exactly six primary tabs appear — Summary,
   Person/Household Models, Tour Models, Mode Choice, Trip Models,
   Network — in that order, plus the unchanged Explore tab.
2. **Given** the demo dashboard is loaded, **When** an analyst looks for
   "Overview", "Destination Choice", or "Transit Service", **Then** none of
   those tabs exist any longer, anywhere in the demo dashboard config.
3. **Given** the Person/Household Models tab is open, **When** its sidebar
   sub-navigation is expanded, **Then** the listed section labels match
   `CALIBRATION-SUMMARIES.md`'s own Person/Household submodel headings
   (Auto Ownership, Work from Home, School Location, Workplace Location,
   Transit Pass Subsidy, Transit Pass Ownership, Telecommute Frequency,
   CDAP) for every one the audit confirms computable.

---

### User Story 2 - Every number traces to real ActivitySim output, with gaps reported honestly (Priority: P1)

The same three real ActivitySim `prototype_mtc` scenarios already
established and verified earlier this session — an unmodified baseline, a
TAZ-1 employment-density variant, and an AM/PM transit-service variant — are
re-run, and their real output is audited column-by-column against every
submodel summary `CALIBRATION-SUMMARIES.md` documents. Every summary that
genuinely computes from that real output appears in the new six-tab
structure; any summary that doesn't is left out of the dashboard and
recorded, with its reason, rather than approximated or invented.

**Why this priority**: This is the non-negotiable data-integrity constraint
carried forward from the two prior demo-content features — a structurally
correct six-tab layout populated with even one fabricated number would
violate the project's own established trust bar for demo content.

**Independent Test**: Pick any displayed number across the six tabs and
trace it — through the post-processor's SQL and the real ActivitySim run's
raw CSV output — back to a genuinely computed value, never a hardcoded
literal or synthetic placeholder.

**Acceptance Scenarios**:

1. **Given** a documented Level-1 (starred) submodel summary, **When** its
   computability is checked against the fresh re-run's real output columns,
   **Then** it either appears in the dashboard backed by a real
   Parquet-derived value, or is explicitly recorded as unavailable with a
   stated reason.
2. **Given** any panel in the six-tab structure, **When** its underlying
   query and source config are inspected, **Then** they read only from real
   scenario-derived Parquet output — no literal numeric placeholder appears
   anywhere in `dashboard-*.yaml` or `summarize.yaml`.
3. **Given** a submodel documented in `CALIBRATION-SUMMARIES.md` turns out
   not computable from the real re-run's output, **When** the dashboard is
   reviewed, **Then** that submodel's section is simply absent from the
   dashboard (never shown empty or fabricated), and
   `CALIBRATION-SUMMARIES.md` itself is updated to say so plainly.

---

### User Story 3 - All ten panel types demonstrated with genuinely fitting data (Priority: P2)

Across the six tabs, every one of the app's ten registered panel types
(valuebox, plotly, observable-plot, table, markdown, sankey, flowmap,
zonemap, graphic-walker, recharts) appears at least once, each chosen
because it's a natural fit for that particular submodel's real data shape —
a distance distribution as a histogram-style chart, a mode-by-purpose
breakdown as a Sankey diagram, a geographic pattern as a zone map — not
forced in merely to check a box.

**Why this priority**: Demonstrating the app's full charting breadth is an
explicit goal of this feature, but it's secondary to first getting the
six-tab structure (US1) and data honesty (US2) right — a complete six-tab
structure using only some panel types still delivers most of the value;
this rounds it out.

**Independent Test**: Enumerate every panel across all six tabs by type and
confirm all ten registered types are represented at least once, with each
instance's data shape genuinely suited to its chosen panel type.

**Acceptance Scenarios**:

1. **Given** the six-tab structure is complete, **When** every panel is
   enumerated by type, **Then** valuebox, plotly, observable-plot, table,
   markdown, sankey, flowmap, zonemap, graphic-walker, and recharts each
   appear at least once.
2. **Given** a submodel's real data is naturally a distance distribution,
   **When** its panel type is chosen, **Then** it uses a histogram-shaped
   visualization rather than a mismatched type chosen only to hit a
   panel-type quota.

---

### User Story 4 - Corrected reference documentation (Priority: P3)

After this feature ships, `project-docs/CALIBRATION-SUMMARIES.md` accurately
reflects exactly what's real and available in the live dashboard versus
what's genuinely not computable from `prototype_mtc`'s real output, so a
future reader never chases a summary that was never actually built.

**Why this priority**: Valuable follow-through and lowest priority of the
four — the dashboard content itself (US1-US3) is the primary deliverable;
keeping the reference document honest is important housekeeping that
depends on the audit already performed for US2.

**Independent Test**: Read `CALIBRATION-SUMMARIES.md` after the feature
ships; every entry either matches a real, present dashboard panel, or
carries an explicit "not computable — reason" note.

**Acceptance Scenarios**:

1. **Given** `CALIBRATION-SUMMARIES.md` documents a summary, **When** that
   summary's real availability is checked against the completed audit,
   **Then** the document's own text matches reality — present-and-correct,
   or explicitly marked unavailable with a reason.

---

### Edge Cases

- What happens when a documented submodel's chooser produces zero real rows
  for a given scenario (e.g. no joint tours in a small synthetic
  population)? The panel renders its existing empty-result state — never a
  fabricated non-zero value.
- What happens if the fresh re-run produces different exact real numbers
  than the original run, due to unpinned stochastic components? Acceptable,
  as long as the two previously-confirmed causal directions (the
  density-variant shift, the transit-variant shift) remain demonstrable —
  exact reproduction of prior numeric values is not required.
- What happens to the two already-written-but-unpublished
  `purpose_mode_flow`/`od_flows` metrics if the fresh re-run's real columns
  no longer match what they assume? They are re-derived fresh against the
  new output rather than assumed valid.
- What happens to the Explore tab during this reorganization? It is left
  completely untouched — not renumbered, not merged, not reordered relative
  to the new six tabs, not otherwise modified.
- What happens when a documented geography segmentation level (e.g. small/
  medium/large district) has no real backing column in `prototype_mtc`'s
  stock zone lookup data? That segmentation level is simply omitted from
  the relevant summary — never fabricated — and the gap is recorded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST remove the existing demo-dashboard-config tabs
  (`dashboard-1-overview.yaml`, `dashboard-2-destination-choice.yaml`,
  `dashboard-3-transit-service.yaml`) and their `index.json` entries
  entirely, without preserving their specific causal-story content.
- **FR-002**: System MUST introduce six primary demo dashboard tabs, in
  this order: Summary, Person/Household Models, Tour Models, Mode Choice,
  Trip Models, Network.
- **FR-003**: Each of the six tabs' sidebar sub-navigation sections MUST
  match `CALIBRATION-SUMMARIES.md`'s own documented submodel breakdown for
  that tab, limited to whichever submodels the audit (FR-007) confirms are
  computable from the real re-run's output.
- **FR-004**: The existing Explore tab (`dashboard-5-explore.yaml`) MUST
  remain unmodified in content, position, and behavior.
- **FR-005**: System MUST re-run the same three real ActivitySim
  `prototype_mtc` scenarios already established this session — an
  unmodified baseline, a TAZ-1 employment-density variant (+40% on
  TOTEMP/RETEMPN/FPSEMPN/HEREMPN/OTHEMPN/AGREMPN/MWTEMPN), and an AM/PM
  transit-service variant (WLK_LOC_WLK_TOTIVT −20%, WLK_LOC_WLK_IWAIT
  −50%) — reproducing the same edits, not new ones.
- **FR-006**: System MUST verify the fresh re-run's real output using the
  same checks already used to verify the original run (row counts,
  checkpoint completeness, the two previously-confirmed real behavioral
  shifts) before building any dashboard content against it.
- **FR-007**: System MUST produce an explicit, complete inventory — for
  every submodel summary documented in `CALIBRATION-SUMMARIES.md` — of
  whether it is computable from the fresh real output, confirmed by
  directly inspecting real column headers rather than assumed.
- **FR-008**: System MUST NOT display any fabricated, placeholder, or
  synthetic value anywhere in the new six-tab structure — every displayed
  number MUST resolve to a real value computed from real ActivitySim
  output via the post-processor.
- **FR-009**: When a documented submodel summary is found not computable,
  system MUST omit it from the dashboard rather than showing an empty or
  fabricated panel, and MUST record the gap and its reason in
  `CALIBRATION-SUMMARIES.md`.
- **FR-010**: System MUST express every new computable summary as a
  `summarize.yaml` metric using only the existing `$mappings`/`$bins`/
  `$sql_fragments` mechanisms — no new post-processor engine code.
- **FR-011**: System MUST re-derive the two previously-written-but-
  unpublished `purpose_mode_flow` and `od_flows` metrics fresh against the
  new re-run's real output, reusing them only if the audit confirms they
  remain valid, and fold their panels into the new structure's Mode Choice
  (sankey) and Network (flowmap) tabs respectively.
- **FR-012**: System MUST choose each panel's type by genuine data shape
  (e.g. distance distributions as histogram-style charts, mode-by-purpose
  breakdowns as Sankey, geographic patterns as zone maps) — never
  selecting a type merely to satisfy panel-type coverage.
- **FR-013**: System MUST ensure that, across the six tabs, every one of
  the ten registered panel types (valuebox, plotly, observable-plot,
  table, markdown, sankey, flowmap, zonemap, graphic-walker, recharts) is
  used at least once.
- **FR-014**: System MUST re-run the real `wftdm-dashboard summarize` CLI
  for all three scenarios against the expanded `summarize.yaml` and
  publish the resulting Parquet output to each scenario's real
  `public/demo-scenarios/{name}/summary/` folder.
- **FR-015**: System MUST update `public/demo-dashboard-config/index.json`
  to list exactly the new six dashboard files plus the unchanged Explore
  file, removing the three deleted tabs' entries.
- **FR-016**: System MUST update `project-docs/CALIBRATION-SUMMARIES.md` to
  correct any documented summary the audit found not computable, so the
  document never describes something that was never actually built.
- **FR-017**: System MUST confirm, before finalizing dashboard content,
  whether ActivitySim's own `prototype_mtc` configuration needs additional
  settings enabled (e.g. trace/output toggles) to produce any column
  `CALIBRATION-SUMMARIES.md` documents but the default configuration
  omits — confirmed directly, not assumed.
- **FR-018**: System MUST reuse the real zone-centroid geometry already
  published at `public/demo-geometry/taz25.geoparquet` for any
  Network-tab map panel, unless the audit finds it incompatible with the
  fresh re-run, in which case the gap MUST be reported per FR-009's
  convention.
- **FR-019**: System MUST ensure each republished scenario's
  `summary/index.json` correctly enumerates every real Parquet file
  actually present, avoiding the missing-enumeration-file gap already
  found and worked around in prior demo-content work.
- **FR-020**: System MUST verify the completed six-tab dashboard end-to-end
  in a real browser load, for all three scenarios, rather than relying on
  offline query checks alone.

### Key Entities

- **Demo Dashboard Tab**: one of the six new primary tabs (or the untouched
  Explore tab); has a title, an ordered list of section labels for sidebar
  sub-navigation, and an ordered list of panel rows.
- **Submodel Summary**: one documented row from `CALIBRATION-SUMMARIES.md`
  (chooser, alternatives, segmentation, target Parquet file); carries a
  computability status (computable / not computable + reason) determined
  by the audit.
- **Real ActivitySim Scenario**: one of the three re-run scenarios
  (baseline, density-variant, transit-variant); produces real CSV output
  consumed by the post-processor.
- **Post-Processor Metric**: one `summarize.yaml` metric entry mapping a
  Submodel Summary to a named Parquet output file.
- **Panel**: one dashboard panel instance of one of the ten registered
  types, bound to one or more Post-Processor Metrics.
- **Calibration Summary Audit**: the explicit inventory produced during
  this feature, recording per-summary computability and reasoning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer opening the demo dashboard sees exactly six primary
  tabs in the documented order, with none of the three previous narrow
  tabs present.
- **SC-002**: A full manual audit of every panel across the six tabs finds
  zero fabricated or placeholder values — 100% of displayed numbers trace
  to real ActivitySim output.
- **SC-003**: Every Level-1 (starred) submodel summary documented in
  `CALIBRATION-SUMMARIES.md` is either present in the live dashboard or
  explicitly marked not computable with a stated reason — no silent gaps.
- **SC-004**: All ten registered panel types each appear at least once
  across the six tabs, confirmed by a direct count.
- **SC-005**: Spot-checking any 10 random `CALIBRATION-SUMMARIES.md`
  entries against the running dashboard finds zero mismatches between what
  the document claims and what the dashboard actually shows.
- **SC-006**: All three real scenarios load successfully in a real browser
  session with no console errors, and every panel reaches a non-error,
  non-perpetually-loading state.
- **SC-007**: The two previously-confirmed causal stories — the
  density-variant's shift toward TAZ 1, and the transit-variant's shift
  toward transit mode share — remain visibly demonstrable somewhere in the
  new six-tab structure.

## Assumptions

- The same pinned ActivitySim version and installation process already
  confirmed compatible earlier this session is reused verbatim; no new
  version research is needed unless that process is found to no longer
  work.
- Exact numeric reproduction of the original run's values is not required —
  only that the same two causal directions remain demonstrable;
  ActivitySim's own stochastic components may shift exact figures between
  re-runs.
- Level-1 (starred) and Level-2 submodel summaries are both rendered as
  ordinary panel rows within a tab's normal top-to-bottom layout; the
  sidebar's accordion sections (030-sidebar-navigation) provide
  jump-navigation labels grouping those rows by submodel, matching how
  that mechanism already works today — not a separate collapsing/hiding
  behavior.
- Geography segmentation is limited to whichever of TAZ / small district /
  medium district / large district / super district genuinely resolve
  from real zone-lookup columns present in `prototype_mtc`'s stock
  `land_use.csv`; any level lacking a real backing column is omitted, not
  fabricated.
- The screenline volumes-vs-observed-AADT comparison reuses whatever real
  observed-counts reference data already exists from prior work; if no
  genuine observed dataset exists for this synthetic network, that entry
  is reported not computable rather than inventing observed counts.
- The existing `public/demo-geometry/taz25.geoparquet` zone geometry
  remains valid for the fresh re-run, since scenario content changes but
  the TAZ 1-25 zone boundaries themselves do not.
- This feature runs in the same environment (Python 3.10 via `uv`) already
  used for the original ActivitySim installation and run this session.
- `dashboard-6-flows.yaml` (the prior feature's unpublished sankey/flowmap
  staging file) is dissolved once its panels are folded into the new Mode
  Choice/Network tabs — it does not survive as its own separate tab.
