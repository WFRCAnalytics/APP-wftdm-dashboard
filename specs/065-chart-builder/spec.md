# Feature Specification: Chart Builder (Explore v2)

**Feature Branch**: `065-chart-builder`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Replace the Graphic Walker Explore tab with a built-in grammar-of-graphics chart builder styled identically to the app's curated charts. Browse raw tables, define data with SQL or a query builder, drag columns onto chart channels, get chart suggestions, style titles, export and import chart configurations." Background research and decisions: `project-docs/CHART-BUILDER-PROPOSAL.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the raw data (Priority: P1)

An analyst opens the builder and wants to see which tables exist for which scenarios, what columns each has, and what the rows look like, before deciding what to chart.

**Why this priority**: The core complaint about the current tool is that the analyst never gets to see or reach the data they want to check. Everything else builds on seeing the data.

**Independent Test**: Open the builder, pick a scenario and a table, and confirm a paged preview and a column list with types appear, with no other feature present.

**Acceptance Scenarios**:

1. **Given** the builder is open, **When** the user chooses a scenario and a table, **Then** the Data tab shows a paged preview whose page size fits the visible area, plus every column with its name and type (nominal, ordinal, quantitative, temporal, geographic, or complex).
2. **Given** several scenarios are selected, **When** the user views the table list, **Then** the list shows the tables available in the selected scenarios and says so when a table is missing from some.
3. **Given** a preview with more rows than one page, **When** the user pages forward and back, **Then** pages are contiguous and stable.

---

### User Story 2 - Define the data with SQL or a query builder (Priority: P1)

The analyst writes a query, or builds one with a form, to filter, select, join, union across scenarios and aggregate, previews the result, and saves it as a named temporary table that charts can use.

**Why this priority**: Charting a precise result is the point of the feature; raw tables rarely contain exactly what the analyst wants to plot.

**Independent Test**: In the Data tab, run a query joining two tables, save the result under a name, and see it listed under "My tables" and previewed.

**Acceptance Scenarios**:

1. **Given** the Data tab, **When** the user runs a read-only query, **Then** the result previews with column types, and errors show a clear message with the position of the problem.
2. **Given** several scenarios selected, **When** the user chooses "Use in query", **Then** a query combining them is inserted with an extra `scenario` column holding each scenario's name.
3. **Given** a query built with the form (columns, filters, join keys and type, group by with aggregates, sort, limit), **When** the user views the SQL, **Then** it shows the equivalent text; **and when** the user edits that text into a form the builder supports, **Then** the form updates to match; **and when** the text uses something the builder cannot express, **Then** the form is shown as disabled with "edited as SQL" and nothing is lost.
4. **Given** a successful result, **When** the user saves it with a name, **Then** it appears under "My tables", can be renamed or deleted, and is selectable as a chart data source.
5. **Given** a statement that would change or damage app data or settings (for example creating or dropping outside the reserved naming area, loading extensions, reading remote files), **When** the user runs it, **Then** it is refused with an explanation.
6. **Given** a long-running query, **When** it is running, **Then** the user sees that it is running, can cancel it, and it stops on its own after a time limit; other dashboard content is not left permanently stuck.

---

### User Story 3 - Build a chart by dragging columns (Priority: P1)

The analyst opens a visualization tab, picks a data source (a raw table or one of "My tables"), drags columns onto channels (x, y, colour, shape, line dash, hatch pattern, size, opacity, facet row and column, order, detail, text) and sees the chart update.

**Why this priority**: This is the headline capability.

**Independent Test**: With a table chosen, drag one nominal and one quantitative column onto x and y and confirm a bar chart appears that matches the look of the app's existing charts.

**Acceptance Scenarios**:

1. **Given** a visualization tab with a data source, **When** the user drags a column to a channel, **Then** the chart updates and the channel shows the column chip with its type.
2. **Given** the same channels, **When** the user uses the keyboard to assign a column to a channel instead of dragging, **Then** the result is identical.
3. **Given** a quantitative column on a channel, **When** the user chooses an aggregate (sum, mean, median, min, max, count, distinct), a binning, a time unit, a sort, or a stacking mode, **Then** the chart reflects it and the calculation is done on the full data, not just the visible rows.
4. **Given** a dropped column that a channel cannot accept, **When** the user drops it, **Then** the drop is refused and the reason is shown.
5. **Given** an existing chart, **When** the user changes the chart type, **Then** compatible encodings are kept.
6. **Given** a colour, shape, dash or pattern channel, **When** the user assigns a column, **Then** points use distinct symbols, lines use distinct dash styles, and bars, areas and polygons use distinct hatch patterns, each with a matching legend; patterns can be used instead of colour.
7. **Given** hover, expand and light or dark theme, **When** the user interacts with a built chart, **Then** it behaves and looks like the app's curated charts (same tooltip, legend, palette, colourblind-safe setting, fonts).
8. **Given** the user adds, switches, duplicates and closes visualization tabs, **When** they return to a tab, **Then** each keeps its own data source and chart.

---

### User Story 4 - Get chart suggestions (Priority: P2)

The analyst either selects columns and is shown which chart types fit them, or selects a chart type and is shown which slots are required and optional.

**Why this priority**: Makes the tool usable by people who do not know which chart suits their data.

**Independent Test**: Select one category and one number column; confirm bar is offered first and pie/donut is offered only when appropriate. Select "scatter" first and confirm two quantitative slots are shown as required.

**Acceptance Scenarios**:

1. **Given** selected columns, **When** the chart picker opens, **Then** viable chart types are ranked, and non-viable ones are greyed out with a reason such as "needs 1 category and 1 number".
2. **Given** a chart type chosen first, **When** the shelves appear, **Then** required slots are marked and each shows the types it accepts.
3. **Given** chart types not yet available, **When** the user hovers them, **Then** they are disabled and say "Coming soon".

---

### User Story 5 - Style titles and notes (Priority: P2)

The analyst adds a title, subtitle, source line and note and chooses each one's size and weight or italic. Font family and colours always come from the app.

**Why this priority**: Needed for charts to be presentable and for exports to be self-explanatory.

**Independent Test**: Add a title in large bold and a source in small italic; confirm both render and appear in the PNG and SVG exports.

**Acceptance Scenarios**:

1. **Given** text fields for title, subtitle, source and note, **When** the user sets size and weight or italic, **Then** the chart updates; no font family or colour option exists.
2. **Given** light and dark themes, **When** the theme changes, **Then** the text follows the theme.

---

### User Story 6 - Export and import (Priority: P2)

The analyst exports a chart as a configuration file, an image, a vector image, or its data as a table file, and later imports a configuration to recreate the chart.

**Why this priority**: Without it nothing survives a page reload, and charts cannot be shared.

**Independent Test**: Export a configuration, reload the page, import it, and confirm an identical chart appears, including its data definition.

**Acceptance Scenarios**:

1. **Given** a built chart, **When** the user exports its configuration, **Then** the file holds the chart definition and its data source (selected scenarios and query), and importing it recreates the chart.
2. **Given** an invalid or incompatible configuration file, **When** imported, **Then** the user sees which part is wrong and nothing existing is overwritten.
3. **Given** a built chart, **When** the user exports PNG, SVG or CSV, **Then** the image matches what is on screen including titles, legends and hatch patterns, and the CSV holds the charted data.
4. **Given** the same chart definition placed in a dashboard configuration file, **When** the dashboard loads, **Then** the chart renders in a normal tile.

---

### User Story 7 - Replace the old Explore tab (Priority: P3)

When the builder is accepted, it replaces or sits beside the existing Explore tab and the old tool and its weight can be removed.

**Why this priority**: Housekeeping once the builder is trusted; it is developed on its own branch first.

**Independent Test**: With the builder enabled, the Explore tab opens it and the old tool is not loaded.

**Acceptance Scenarios**:

1. **Given** the builder is accepted, **When** the Explore tab is opened, **Then** the builder is shown and the previous tool's code is not loaded.

---

### Edge Cases

- A table with zero rows, or a query returning zero rows: clear empty state, no empty axes.
- Very large relations: aggregation happens in the data engine; raw-point charts are capped with a visible notice of how many rows are shown.
- Columns of complex nested types: shown in the list but not draggable.
- A column the app guessed as quantitative but the user wants as nominal (for example an ID): the type can be overridden per chip.
- Many categories (over about 12) on colour: warn and suggest facets or a sorted bar.
- A pie or donut with too many slices or negative values: refuse with a reason.
- A saved temporary table whose source query later fails or whose scenario is removed: show it as broken, keep the name, allow deletion.
- Switching the selected scenarios while a visualization tab depends on them: the tab keeps working from its own saved data source.
- Imported configuration referencing scenarios or tables not loaded: list what is missing and let the user remap or cancel.
- Two tabs or saved tables with the same name: refused with a message.
- Page reload: all tabs and temporary tables are gone by design; export is the way to keep work.
- Two simultaneous long queries: queued, never run concurrently.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The builder MUST have a top bar with a scenario selector, a table selector and tabs, with the first tab always "Data" followed by visualization tabs and an add-tab control; one visualization tab exists initially.
- **FR-002**: The Data tab MUST show a paged preview of the selected table(s), sized to the available height, and each column's name and type.
- **FR-003**: Column types MUST be shown as nominal, ordinal, quantitative, temporal, geographic or complex, inferred automatically, and the user MUST be able to override the type of a column.
- **FR-004**: Users MUST be able to write queries as text and to build them with a form that supports selecting columns, filtering rows, joining tables (keys and type), combining scenarios, grouping with aggregates, sorting and limiting.
- **FR-005**: The form and the text MUST stay in sync in both directions for everything the form supports; for anything it does not support the form MUST be disabled and clearly labelled, never silently dropped.
- **FR-006**: Combining several scenarios MUST add a column with each row's scenario name.
- **FR-007**: Results MUST be savable under a user-chosen name as temporary tables, listed separately from source tables, renamable and deletable, and selectable as a chart data source.
- **FR-008**: User queries MUST be limited to reading data and creating or removing the user's own named temporary tables; anything that could alter app data, settings, extensions or reach remote or local files MUST be refused with an explanation, and a user's saved name MUST NOT be able to hide or replace an app table.
- **FR-009**: Queries MUST run one at a time, show progress, be cancellable, and stop after a time limit.
- **FR-010**: Each visualization tab MUST hold its own data source and chart definition, and tabs MUST be addable, switchable, renamable, duplicable and closable.
- **FR-011**: Users MUST be able to assign columns to channels: x, y, colour, shape, line dash, hatch pattern, size, opacity, facet row, facet column, order, detail and text, by dragging and by an equivalent keyboard-operable action; only channels the chosen chart supports are shown.
- **FR-012**: Each assigned column MUST allow aggregate, binning, time unit, sort and stacking choices where meaningful, and aggregation and binning MUST be computed over the full data.
- **FR-013**: v1 MUST support these chart types: bar (grouped, stacked, 100%), line, area (stacked), scatter, heatmap, histogram, box and pie or donut; all other planned types MUST appear disabled with "Coming soon" on hover.
- **FR-014**: The builder MUST suggest viable chart types, ranked, from the selected columns, and MUST show required and optional slots from a chosen chart type; non-viable types MUST be greyed out with the reason.
- **FR-015**: Changing the chart type MUST keep compatible encodings.
- **FR-016**: Points MUST be distinguishable by symbol, lines by dash style and bars, areas and polygons by hatch pattern, with legends that show them; patterns MUST be usable as an alternative to colour.
- **FR-017**: Charts MUST use the app's palette (including the colourblind-safe setting), fonts, tooltip, legend, tile look and light and dark themes, so they are visually indistinguishable in style from curated charts; no per-chart custom colours or fonts.
- **FR-018**: Title, subtitle, source and note MUST be editable with size and weight or italic only.
- **FR-019**: Users MUST be able to set axis options (title, number or date format, scale type, domain, zero baseline), sort, filters on the chart's data, and reference lines.
- **FR-020**: Users MUST be able to export a chart's configuration (including its data source) as a file, and import such a file to recreate the chart, with clear errors for invalid files.
- **FR-021**: Users MUST be able to export the chart as PNG and SVG and its data as CSV, with titles, legend and patterns included.
- **FR-022**: The chart definition format MUST also be accepted in dashboard configuration files so a chart built in the builder can be placed in a normal tab.
- **FR-023**: Builder state (tabs, definitions, temporary tables, credentials-free settings) MUST live only in memory for the session; nothing is written to browser storage.
- **FR-024**: The builder MUST work and be verified in light and dark themes and be operable by keyboard with accessible names for controls and charts.
- **FR-025**: The builder MUST load only when opened and MUST NOT add a new charting library.
- **FR-026**: When the builder replaces the old Explore tool, the old tool and its dependencies MUST no longer be loaded.

### Key Entities

- **Data source**: what a visualization tab charts: a source table, or a user's saved temporary table, with the scenarios and query that produced it.
- **Temporary table ("My table")**: a named, session-only result of a user query; has a name, defining query, columns and types, and a status (ready or broken).
- **Column**: name, type (nominal, ordinal, quantitative, temporal, geographic, complex), user type override.
- **Chart definition**: chart type, channel assignments (each with column, aggregate, binning, time unit, sort, stacking), filters, scale and axis options, reference lines, text blocks with size and weight or italic.
- **Visualization tab**: a name, a data source and a chart definition.
- **Chart configuration file**: portable form of a chart definition plus its data source; also the form used in dashboard configuration files.
- **Chart suggestion rule**: relates a set of selected column types to ranked chart types, and a chart type to its required and optional slots.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening the builder to seeing a first chart of two columns in under 60 seconds without writing SQL.
- **SC-002**: A user can find any column of any loaded table, with its type, in under 15 seconds.
- **SC-003**: A user can join two tables, save the result and chart it in under 3 minutes.
- **SC-004**: Charts of 100,000-row tables update within 2 seconds of a change, and the page stays responsive.
- **SC-005**: A side-by-side check of built charts against curated charts in light and dark shows no visible difference in fonts, palette, legend, tooltip or spacing style.
- **SC-006**: Exporting a configuration and importing it after reload reproduces the chart in 100% of tested v1 chart types.
- **SC-007**: 100% of statements outside the allowed set are refused, and no app table can be hidden or replaced by a saved name, in testing.
- **SC-008**: All v1 interactions can be completed with keyboard alone.
- **SC-009**: In a review with the analysts who raised the original complaint, they can reach the data they wanted to check in every case tried.
- **SC-010**: Opening any other tab does not load any of the builder's code.

## Assumptions

- Users are WFRC analysts and reviewers who know the model's tables; they may or may not know SQL.
- Data comes only from the Parquet tables the app already loads; no new data formats are read.
- Maps, Sankey, treemap, sunburst, radar, chord, density, tick, text, rule, waffle and error-bar charts are out of scope for v1 and shown as "Coming soon".
- Saved work lives only for the session; the configuration file is the persistence mechanism.
- Font family and colours are never user-selectable.
- The builder is developed on branch `065-chart-builder`; whether it replaces or sits beside the current Explore tab is decided at merge.
- A plain multi-line text box is acceptable for the first version of the SQL editor; richer editing is a later enhancement.
- Two-way sync is delivered for the supported subset and falls back to one-way if the engine cannot read queries back; this is confirmed by an early spike (`project-docs/CHART-BUILDER-PROPOSAL.md` section 12).
- Existing app rules still apply: one shared query connection, session-only state, no new chart library, palette tokens only.

## Updates agreed while prototyping (2026-10-27)

The interactive prototype changed or added the following. Where this section and the sections above disagree, this section wins.

- **FR-027 Data types.** Each column has a data type: Category, Integer, Decimal, Boolean, Text, ID, Date, Date and time, Ordinal, Geometry (nested types are listed as unsupported). The type is inferred and can be overridden. Each type maps to a chart role (category, ordered category, number, date, or none). Text, ID and Geometry have no chart role yet and cannot be placed on a shelf.
- **FR-028 Type filters** list only the types present in the current table, with counts.
- **FR-029 Column summaries.** For every column the Data tab shows a small distribution and a one-line summary, and for the selected column a larger distribution (histogram, rows over time, text length, or rows by category) and summary statistics suited to its type (rows, missing, distinct, min, quartiles, max, mean, standard deviation, earliest and latest, true and false share, uniqueness, and so on). Summaries are computed only for the columns on screen or selected.
- **FR-030 Scale.** The builder must stay usable with 10 to 15 scenarios (searchable picker with select all) and tables of several hundred columns (search, type filter, grouped field list, searchable column pickers).
- **FR-031 Joins.** A query can join up to four tables with inner, left, right and full joins on one or more key pairs. Matching column names are suggested as keys, clashing output names are made unique, and each step shows its row count.
- **FR-032 Query panel.** The right panel has a Builder tab (steps: table, joins, filter, summarize, columns, sort and limit, plus starter queries) and a SQL tab (highlighted editor with line numbers, copy), a Run and Save footer shared by both, and a pinned "My tables" list. All scrolling happens inside the query box.
- **FR-033 Chart screen fit.** In the chart tab the encoding shelves are a single compact row above the chart, and the chart fills the remaining height and redraws at its real size.
- **FR-034 Graphic Walker hidden.** Graphic Walker is removed from navigation and the Explore tab opens the builder. Its code stays in the repository until the builder is accepted (User Story 7 completes the removal).
