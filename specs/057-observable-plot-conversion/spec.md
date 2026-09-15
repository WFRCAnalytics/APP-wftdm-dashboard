# Feature Specification: Observable Plot Chart Consolidation

**Feature Branch**: `057-observable-plot-conversion`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Convert all existing demo chart panels to Observable Plot (falling back to D3 only where Observable genuinely can't do the job) — a first pass that re-authors every Plotly and Recharts chart panel in the real demo dashboard content (including the value-box sparkline mode) to render via Observable Plot, leaves the Sankey panel on its current D3 implementation if Observable Plot has no genuine native/composable support for it, and separately audits the panels already on Observable Plot for idiomatic correctness. Deep visual refinement toward Observable Plot's specific strengths is explicitly deferred to a later effort."

## Pre-Spec Research Findings

Resolved directly against this project's own real demo content and the installed Observable Plot package before any requirement below was written:

1. **Sankey diagrams**: Observable Plot has **no** built-in Sankey mark and **no** documented composition pattern for one. Confirmed by inspecting the installed `@observablehq/plot` package's full mark list directly (no `sankey` anywhere in source) and Observable Plot's own official documentation (its `link` mark's docs make no mention of Sankey diagrams or d3-sankey composition). A public feature request for Sankey support has sat open and unresolved on Observable Plot's own issue tracker since 2022. This is a confirmed gap, not an assumption — the existing Sankey panel stays on its current D3-based (`d3-sankey`) implementation, unchanged, per the explicit fallback decision.
2. **Hierarchical / exotic chart types (treemap, sunburst, etc.)**: A direct read of every real `dashboard-*.yaml` file in `public/demo-dashboard-config/` found no panel of any hierarchical/exotic chart type anywhere in the real demo content. The only appearance of an exotic type (`chart_type: pie`) is a single, deliberately-invalid panel inside the broken-panel test tab, whose entire purpose is proving the app rejects an unsupported chart type — not a real chart to convert. (For completeness: Observable Plot's own `tree`/`cluster` marks are node-link hierarchy layouts, not treemap/sunburst — irrelevant here since no real panel of that shape exists to convert.)
3. **Value-box sparkline**: currently rendered with bare Recharts primitives inside a fixed, small (40px-tall), axis-less, chrome-less container. Confirmed Observable Plot supports both an explicit small `width`/`height` and axis suppression (`axis: null` on a scale) — its normal, documented way of producing a minimal embedded chart. Converting this shared rendering primitive is feasible with no loss of its current compact presentation.
4. **Data-shape compatibility**: every panel type in this app (Plotly, Recharts, and the existing Observable Plot panels alike) is already fed the identical flat, tidy row array from the same shared query pipeline. The panels already on Observable Plot already consume this exact shape today with no reshaping — confirming every panel being converted needs no query or data-layer change, only a different rendering configuration.

**Real conversion inventory** (every chart panel in the demo content's 6 primary tabs + Explore that is not already Observable Plot, excluding the broken-panel test tab — see Edge Cases):

| Tab | Panel | Current engine | Current chart shape |
|---|---|---|---|
| Summary | Total Trips by Mode | Recharts | bar, split by scenario |
| Summary | Average Trip Distance by Purpose | Plotly | bar, split by scenario |
| Tour | Non-Mandatory Tour Frequency by Purpose | Plotly | grouped bar, split by scenario |
| Mode Choice | At-Work Subtour Mode Share by Purpose | Recharts | bar, split by mode |
| Mode Choice | Trip Mode Share by Time-of-Day Period (WALK_LOC) | Plotly | bar, split by scenario |
| Trip | Trip Departure Hour (Work Trips) | Plotly | grouped bar, split by scenario |
| *(all tabs)* | value-box sparkline mechanism | Recharts | mini bar/line, no current real usage |
| Mode Choice | Trip Purpose to Mode Flow | D3 (`d3-sankey`) | **excluded — stays on D3, see Finding 1** |

**Already-Observable-Plot audit** (5 real panels, all `barY` distance-distribution histograms with a categorical color breakdown): School Location Distance Distribution, Workplace Location Distance Distribution (Person & Households tab); Joint Tour Destination Distance, Non-Mandatory Tour Destination Distance (Tour tab); Trip Destination Distance Distribution (Trip tab). A direct read of the shared encoding logic these panels all go through found it already correct and idiomatic: proper null-value filtering, correct legend handling, and a per-mark-shape tooltip-precision fix already in place. No leftover workaround or confirmed defect was found. Four of the five are intentionally pinned to a single baseline scenario, by explicit prior design choice, because their color channel already encodes a categorical breakdown (school segment / tour purpose) and comparing scenarios as well would need faceting — a genuine opportunity for Observable Plot's own strengths, but a capability *addition*, not a defect fix, so it is left to the later, separate polish effort per this feature's own "first pass" framing (see Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent chart rendering across the dashboard (Priority: P1)

A WFRC planner or reviewer clicking through the calibration dashboard's tabs today sees charts rendered by two different, visually-inconsistent charting engines (Plotly and Recharts) side by side with Observable Plot charts, with different fonts, tooltip behavior, and interaction patterns. After this change, every chart panel that can genuinely be rendered by Observable Plot is, so the dashboard presents one consistent charting engine and interaction pattern everywhere Observable Plot's real capabilities allow it.

**Why this priority**: This is the entire point of the feature — a visibly inconsistent set of charting engines is what a reviewer notices first, and it's the most common panel type in the dashboard.

**Independent Test**: Open each of the four affected tabs (Summary, Tour, Mode Choice, Trip) and confirm every chart panel that was previously Plotly renders via Observable Plot, showing the same data.

**Acceptance Scenarios**:

1. **Given** the Summary tab is loaded, **When** the "Average Trip Distance by Purpose" panel renders, **Then** it displays via Observable Plot and shows the same trip-distance-by-purpose figures as before conversion.
2. **Given** the Tour tab is loaded, **When** the "Non-Mandatory Tour Frequency by Purpose" panel renders, **Then** it displays via Observable Plot, still split per active scenario.
3. **Given** the Mode Choice tab is loaded, **When** the "Trip Mode Share by Time-of-Day Period (WALK_LOC)" panel renders, **Then** it displays via Observable Plot with the same per-scenario, per-period shares.
4. **Given** the Trip tab is loaded, **When** the "Trip Departure Hour (Work Trips)" panel renders, **Then** it displays via Observable Plot with the same departure-hour-by-scenario figures.

---

### User Story 2 - Recharts panels (including value-box sparklines) converted (Priority: P2)

The same consistency goal, for every chart panel currently rendered by Recharts, plus the value-box panel's optional embedded sparkline chart, which uses Recharts today for a much smaller, chrome-less presentation.

**Why this priority**: Fewer panels affected than User Story 1, but the same visual-consistency value, plus it closes a second, distinct rendering-engine gap (recharts) rather than leaving one converted engine and one not.

**Independent Test**: Open the Summary and Mode Choice tabs and confirm the two Recharts-rendered chart panels now render via Observable Plot; independently, configure (or exercise the existing test-tab configuration of) a value-box sparkline and confirm it renders via Observable Plot at its existing compact size.

**Acceptance Scenarios**:

1. **Given** the Summary tab is loaded, **When** the "Total Trips by Mode" panel renders, **Then** it displays via Observable Plot, still split per active scenario.
2. **Given** the Mode Choice tab is loaded, **When** the "At-Work Subtour Mode Share by Purpose" panel renders, **Then** it displays via Observable Plot, still split per mode.
3. **Given** a value-box panel configured with a sparkline, **When** it renders, **Then** the sparkline displays via Observable Plot at its existing small, axis-less, chrome-less size, with no layout shift to the surrounding value-box.

---

### User Story 3 - Existing Observable Plot panels confirmed correct (Priority: P3)

The five chart panels already rendered via Observable Plot are reviewed for genuinely correct, idiomatic use — the right mark for their data shape, no leftover authoring workaround — while everything else in the dashboard is already being touched by this feature.

**Why this priority**: Lowest risk/value of the three — these panels already work today. This is a verification pass with fixes only where a real, concrete issue is confirmed, not a redesign.

**Independent Test**: Review each of the five existing Observable Plot panels' configuration and rendering directly against Observable Plot's own idiomatic patterns; fix only confirmed, concrete issues.

**Acceptance Scenarios**:

1. **Given** each of the five existing Observable Plot panels, **When** reviewed against Observable Plot's own documented idioms for their data shape, **Then** each is confirmed either already correct or has its confirmed defect fixed.
2. **Given** no concrete defect is found in a given already-Observable-Plot panel, **When** the review concludes, **Then** that panel is left unchanged rather than speculatively altered.

---

### Edge Cases

- The Sankey diagram panel ("Trip Purpose to Mode Flow," Mode Choice tab) is explicitly excluded from conversion (see Pre-Spec Research Finding 1) and must continue to render exactly as it does today, unaffected by every other panel on the same tab being converted.
- The deliberately broken/edge-case test tab (the near-invisible 8th sidebar entry used for error-state test coverage) is explicitly out of scope: its per-panel-type broken-config coverage — including entries that exercise Plotly's, Recharts', and Sankey's own error rendering — is left exactly as-is, since converting real content does not remove or deprecate the Plotly or Recharts panel types themselves as valid, supported panel types for future dashboard authors.
- A converted panel whose current chart shape has no clean one-to-one Observable Plot equivalent may be re-authored to a different (but analytically equivalent) chart shape, per the feature's own explicit "free re-authoring" allowance — this must not change which underlying data the panel queries or the comparison/breakdown dimension it presents.
- What happens if a converted panel's query returns zero rows, or an error? The panel's existing loading/empty/error-state behavior (shared across all panel types) must be unaffected by the engine change underneath it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every chart panel in the real demo dashboard content that currently renders via the Plotly engine (four panels: Summary's "Average Trip Distance by Purpose," Tour's "Non-Mandatory Tour Frequency by Purpose," Mode Choice's "Trip Mode Share by Time-of-Day Period," Trip's "Trip Departure Hour") MUST be re-authored to render via the Observable Plot engine instead.
- **FR-002**: Every chart panel in the real demo dashboard content that currently renders via the Recharts engine (two panels: Summary's "Total Trips by Mode," Mode Choice's "At-Work Subtour Mode Share by Purpose") MUST be re-authored to render via the Observable Plot engine instead.
- **FR-003**: The value-box panel's optional sparkline display MUST be re-implemented to render via the Observable Plot engine instead of Recharts, preserving its existing compact, axis-less, chrome-less presentation and its existing embedded size within the value-box.
- **FR-004**: The Sankey diagram panel type and its one real usage in the demo content MUST remain unchanged, on its current D3-based implementation — no engine change, since no genuine Observable Plot support for Sankey diagrams exists (Pre-Spec Research Finding 1).
- **FR-005**: Every panel converted under FR-001/FR-002/FR-003 MUST continue to query and present the exact same underlying data it presented before conversion — this feature changes only how a panel's already-correct query results are rendered, never what is queried or how comparison/diff results are computed.
- **FR-006**: Every panel converted under FR-001/FR-002 MUST preserve its existing per-scenario or per-category breakdown (e.g., a comparison across active scenarios, or a split by mode/purpose) using Observable Plot's own equivalent mechanism for that breakdown, even where the specific chart shape changes.
- **FR-007**: A converted panel's chart type or shape MAY change from what it uses today, if Observable Plot's own real strengths (faceting, statistical transforms, distribution-shaped marks) produce a better fit for that panel's underlying data shape — this is explicitly allowed, not a defect to avoid.
- **FR-008**: The five chart panels already rendered via Observable Plot in the real demo dashboard content MUST each be reviewed for correct, idiomatic use; any concrete, confirmed defect or leftover authoring workaround found during that review MUST be fixed as part of this feature.
- **FR-009**: The review in FR-008 MUST NOT make speculative changes to an already-Observable-Plot panel absent a concrete, confirmed issue — first-pass discipline applies to the audit as much as to the conversions.
- **FR-010**: The deliberately broken/edge-case test tab (`dashboard-8-test.yaml`) MUST NOT be modified by this feature — its existing Plotly, Recharts, and Sankey error-state test entries continue to exercise those panel types exactly as they do today.
- **FR-011**: No dashboard navigation, tab structure, filter behavior, or panel-to-panel layout may change as a result of this feature — only the rendering engine (and, where FR-007 applies, a panel's own chart shape) may change.
- **FR-012**: A viewer-facing capability a converted panel currently offers via hovering over or interacting with its data (e.g., a tooltip showing the underlying value at a point) MUST continue to be available after conversion, using Observable Plot's own equivalent mechanism, even if the exact interaction differs from the panel's prior engine.

### Key Entities

- **Chart Panel**: A single dashboard panel bound to a rendering engine (Plotly, Recharts, Observable Plot, or — for Sankey — D3) and a query result; this feature changes the engine a panel is bound to, never the query result it renders.
- **Panel Type**: The registered kind of panel (e.g., `plotly`, `recharts`, `observable-plot`, `sankey`, `valuebox`) a dashboard author can select in configuration; this feature does not remove or deprecate any panel type, even one no longer used by the real demo content after conversion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every one of the six real, non-test-tab chart panels currently using Plotly or Recharts renders via Observable Plot after this feature ships, with zero remaining Plotly or Recharts chart panels in the real demo dashboard content outside the Sankey exception.
- **SC-002**: The value-box sparkline mechanism renders via Observable Plot, with no visible change to its size or placement within a value-box panel.
- **SC-003**: Every converted panel shows the same underlying figures a reviewer would have seen before conversion, confirmed by direct side-by-side comparison of the displayed values.
- **SC-004**: The Sankey panel renders its existing flow diagram correctly and is visibly unaffected by every other panel conversion happening on its own tab.
- **SC-005**: All five panels already on Observable Plot are confirmed correct, with any real issue found resolved and no unnecessary change made to a panel with no confirmed issue.
- **SC-006**: A reviewer clicking through all six primary tabs plus Explore after this feature ships finds zero broken, blank, or error-state chart panel that was working before the conversion.

## Assumptions

- The value-box sparkline mechanism has no current real usage in the demo dashboard content (only a deliberately-broken test-tab configuration referencing a missing metric) — FR-003 converts the shared rendering capability itself, verified through direct testing rather than through a real, visible demo panel.
- Observable Plot has no built-in equivalent to Plotly's legend click-to-toggle-series-visibility interaction (an already-known, previously-accepted gap for this app's other non-Plotly charting engine). A panel that currently offers this via Plotly loses it upon conversion to Observable Plot; this is accepted as a disclosed, first-pass trade-off per this feature's own explicit "do not over-invest in polish" framing, not treated as a blocking regression.
- Unpinning the four already-Observable-Plot panels that are currently pinned to a single baseline scenario (by using faceting to show both their existing categorical breakdown and a per-scenario comparison at once) is a genuine, real opportunity, but is a capability *addition* rather than a defect fix — left to the later, separate visual-refinement effort this feature explicitly defers to, not undertaken here.
- "The real demo dashboard content" means the 6 primary tabs (Summary, Person & Households, Tour, Mode Choice, Trip, Network) plus the Explore tab in `public/demo-dashboard-config/`, excluding the deliberately broken/edge-case 8th test tab (`dashboard-8-test.yaml`), which is out of scope per FR-010.
- Query-building, comparison/diff logic, and filter/scenario resolution are unchanged by this feature — every converted panel continues to use the exact same underlying query mechanism it uses today; only the component that renders the already-correct query result changes.
