# Feature Specification: Explore settings for the whole site

**Feature Branch**: `069-explore-site-settings`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Phase E of project-docs/CONFIGURATION.md (step 11), built on the site configuration, schema table, cascade, check command and JSON Schema from 066 to 068: a deployer sets the Explore tab's options once for the whole site, and the limits the first pass left fixed (chart row cap, scatter sample, histogram bins, legend series, list sizes) become settings too."

## What already exists (not redone here)

The 066 cascade already lets the site file set `explore.limits` (csv_rows, page_size, undo_steps, max_joins), `explore.features`, `explore.charts.allow`, `explore.tables.include`/`exclude`, `explore.columns` and `explore.presets`, and a panel's own keys win. This feature fills the two gaps: the chart a new tab starts with cannot be set site-wide, and several limits are fixed in the code.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deployer chooses how big and how detailed Explore charts may be (Priority: P1)

A deployer whose model outputs are larger or smaller than the demo's wants to tune the Explore chart builder once, for the whole site: how many groups a chart may draw before it says it is truncated, how many points a scatter plot samples, how many bins a histogram uses, how many legend values are drawn, how many distinct values a filter list offers, and how many rows a pivot table shows. They set each in `dashboard-config.yaml` under `explore.limits`, and every Explore panel follows it. A panel that sets the same key keeps its own value.

**Why this priority**: These are the limits that visibly change what viewers see and how heavy a chart is on the viewer's machine; today only a code change can adjust them.

**Independent Test**: Lower the chart row cap and the legend limit in the site file, open Explore with a chart that exceeds both, and confirm the chart is truncated at the new values with the on-screen note quoting them; remove the keys and confirm the old values return.

**Acceptance Scenarios**:

1. **Given** a site-wide chart row cap of 1000, **When** a viewer draws a chart with more groups, **Then** at most 1000 are drawn and the note says so with that number.
2. **Given** a site-wide scatter sample of 2000, **When** a viewer draws a scatter plot of a larger table, **Then** it shows a sample of 2000 points and says it is a sample.
3. **Given** a histogram bin count, a legend limit, a distinct-values limit and a pivot row limit, **When** each is exercised, **Then** each follows its setting (a histogram has that many bins, a legend shows that many values and says it is cut, a filter list offers that many values, a pivot shows that many rows and says how many are hidden).
4. **Given** the site sets a limit and one panel sets the same key, **When** that panel opens, **Then** the panel's value is used, and other panels use the site's.
5. **Given** none of the new keys, **When** Explore opens, **Then** it behaves exactly as today.

---

### User Story 2 - A deployer sets the starting chart and the other options once (Priority: P2)

A deployer chooses the chart type a new chart tab starts with (for example a line chart for a time-series site) in the site file instead of repeating it on each Explore panel. The other options (features, tables, columns, presets) already work site-wide; this story confirms they are documented, checked and shown together with the new keys as one coherent `explore:` block.

**Why this priority**: Small, and it completes the block so a deployer never has to edit a panel for an app-wide choice.

**Independent Test**: Set the default chart in the site file, open a fresh chart tab, and confirm it starts with that chart; set a different one on a panel and confirm the panel wins; name a chart that the allow-list hides and confirm it is reported and the first allowed chart is used.

**Acceptance Scenarios**:

1. **Given** a site default chart, **When** a viewer opens a new chart tab in any Explore panel, **Then** it starts with that chart.
2. **Given** a panel default chart as well, **When** that panel opens, **Then** the panel's chart is used.
3. **Given** a default chart that is not one of the allowed charts, **When** the app loads, **Then** it is reported with the key path and the first allowed chart is used.

---

### User Story 3 - A deployer is told about mistakes before and after deploying (Priority: P2)

A deployer writes a limit outside its range, a text where a number belongs, an unknown key under `explore.limits`, or an unknown chart name. The app still loads, the setting keeps its default (or is pulled into range, as the existing Explore limits are), and each problem is listed in the configuration note and by the `check` command with its key path. The reference and the editor schema list every new key with its range and default.

**Why this priority**: The project rule that a wrong value is reported and never fatal; it applies to the new keys exactly as to the old ones.

**Independent Test**: Put one of each mistake in a site file; the app loads, each setting is at its default or limit, and each problem appears once in the note and in `check`.

**Acceptance Scenarios**:

1. **Given** a value outside the allowed range, **When** the app loads, **Then** it is reported with the range, and the nearest limit is used (matching how the existing Explore limits behave).
2. **Given** a non-number, **When** the app loads, **Then** it is reported and the default is used.
3. **Given** an unknown key under `explore.limits`, **When** the app loads or `check` runs, **Then** it is reported by its path.
4. **Given** the generated reference and editor schema, **When** compared with the settings, **Then** every new key appears with its description, range and default.

### Edge Cases

- A limit set lower than the data needs: charts and lists truncate and say so; nothing errors.
- A very large value: it is pulled to the range maximum with a message, so a deployer cannot make a chart that freezes the browser by accident.
- The same key at site level and on a panel with a value outside its range at one level only: the bad level is reported, the other level is used.
- Histogram bins also appear in the Data tab's column summaries: the setting changes the chart's histogram; the summary mini-charts keep their size (assumption below).
- A deployment with no `explore:` block: unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The site file MUST accept, under `explore.limits`, these new keys: `chart_rows`, `scatter_sample`, `histogram_bins`, `legend_series`, `distinct_values`, `pivot_rows`, each an integer with documented bounds and today's value as the default.
- **FR-002**: Each new key MUST follow the existing cascade for `explore.limits` (site, page, panel; maps merge per key; the panel's own value wins).
- **FR-003**: The chart builder MUST use the configured chart row cap, scatter sample, histogram bin count, legend limit, distinct-values limit and pivot row limit wherever it applied the fixed value, including the on-screen truncation notes, which MUST quote the configured numbers.
- **FR-004**: The site file MUST accept `explore.charts.default`, cascading as a scalar (a lower level replaces it), naming a chart the builder offers.
- **FR-005**: A default chart not among the allowed charts MUST be reported and the first allowed chart used.
- **FR-006**: A wrong value (wrong type, out of range, unknown key or chart name) MUST be reported with its key path in the configuration note and the `check` command, MUST keep the app loading, and MUST leave the setting at its default or at the nearest limit, consistent with the existing Explore limits.
- **FR-007**: Every new key MUST be one row in the schema table so the generated reference, the editor schema, the validator and `check` list it with its range and default.
- **FR-008**: With none of the new keys set, every Explore panel MUST behave exactly as before (same caps, sample, bins, legend, lists, default chart).
- **FR-009**: No setting MAY weaken the SQL guard, the read-only behaviour of the builder or the time limit on running queries; those are out of scope.
- **FR-010**: Documentation (the configuration plan, the grammar note, the project instructions, the history) MUST describe the new keys and mark Phase E step 11 done.

### Key Entities

- **Explore limits**: the numeric bounds of the chart builder (existing: csv_rows, page_size, undo_steps, max_joins; new: chart_rows, scatter_sample, histogram_bins, legend_series, distinct_values, pivot_rows), each with a default and a range.
- **Starting chart**: the chart type a new chart tab begins with, resolved site, then page, then panel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer can change all six chart limits and the starting chart for every Explore panel by editing only `dashboard-config.yaml`, with no panel file edits.
- **SC-002**: A deployment that sets none of the new keys renders every Explore view and note identically to before this change.
- **SC-003**: Each kind of mistake (type, range, unknown key, unknown chart) is reported once with its key path in both the configuration note and `check`, and in every case the app loads.
- **SC-004**: Every new setting appears in the generated reference and the editor schema with its range and default.
- **SC-005**: Truncation notes always quote the number in force, so a viewer is never told "15" or "50,000" when the site changed it.

## Assumptions

- The new keys live under the existing `explore.limits` map (one group of numbers), rather than a new block, so the cascade and its panel spelling already work.
- Defaults are today's constants: chart rows 50 000, scatter sample 5 000, histogram bins 12, legend series 15, distinct values 200, pivot rows 500. Bounds follow the existing style (the nearest end is used, with a message); the exact ranges are fixed in the plan.
- The Data tab's column-summary mini histograms and top-values counts, label truncation lengths and the 60-second query time limit are display or safety constants and stay fixed.
- Only the app-wide cascade is added. A separate `panel_defaults` block for other panel types is a later design.
- The starting chart is the only option in the `charts` group that does not cascade today; the allow-list already does.

## Out of Scope

- The network block (fonts, basemap allow-list, mirrored DuckDB extensions).
- `panel_defaults` for other panel types, the data layer, new chart types, per-user settings.
- The query time limit and any SQL guard behaviour.
