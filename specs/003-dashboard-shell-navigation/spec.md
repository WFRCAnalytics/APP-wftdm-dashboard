# Feature Specification: Dashboard Shell, Navigation, and First Two Panel Types

**Feature Branch**: `003-dashboard-shell-navigation`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "Feature: Dashboard shell, navigation, and first two panel types

Build the visible dashboard shell — the first feature in this project
with real, non-throwaway UI — using 002-design-tokens' actual components
and tokens, not framework defaults:

- layout/shell.tsx, navBar.tsx, dashboardRenderer.tsx: render whichever
  tabs 001-data-state-layer's loadDashboards()/dashboard-config discovery
  surfaces (generic — no hardcoded tab count or names), using shadcn's
  Tabs component from 002 for navigation, styled entirely through the
  existing token set.
- panels/registry.tsx per the constitution's amended (v2.2.0) pattern:
  React function components, config prop, useFilterState hook, direct
  services/duckdb.ts import — no factory functions, no manual
  element/destroy wiring.
- Two panel types to start: ValueBoxPanel (simplest — proves config ->
  query -> rendered number) and PlotlyPanel (proves the full pipeline:
  YAML config -> sqlExpander -> query -> Plotly.react() render, using
  SPEC.md's corrected two-effect pattern). The other seven panel types
  (table, plot, flowmap, zonemap, sankey, graphic-walker, markdown) are
  out of scope for this feature.
- scenario/scenarioManager.js (folder-picker UI) remains deferred, same
  as every prior slice — this feature renders against auto-discovered
  scenarios only (001's existing public/scenarios/ fixtures), no manual
  loading UI yet.
- Visual bar, stated explicitly as a requirement, not an aside: this
  must look like a considered, professional SaaS product using 002's
  actual tokens/components/typography/elevation — not a functional-but-
  generic layout that happens to satisfy the panel contract. Real visual
  hierarchy between nav, tab content, and panel cards; consistent
  spacing; no unstyled default HTML elements bleeding through.
- Test fixture gap to resolve during research: 001's existing fixtures
  include one placeholder-testing dashboard config
  (all-placeholders-config.yaml, built for sqlExpander unit/integration
  tests) but nothing shaped like a real multi-tab, multi-panel
  dashboard-*.yaml for exercising actual navigation + multiple rendered
  panels together. Determine whether to extend existing fixtures or add
  new ones — this is a real open question for research.md, not something
  to guess past.

Constitution Principle VI (Tailwind/shadcn/Radix/lucide-react) and the
amended Development Workflow panel pattern already fix the technical
approach — this spec should describe outcomes, not re-derive those
choices, same discipline as 001 and 002's specs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An analyst navigates a real, professionally-styled dashboard shell (Priority: P1)

An analyst opens the dashboard and sees a navigable set of tabs matching
whatever dashboard configuration is actually in effect — not a fixed,
hardcoded set — presented with real visual hierarchy and polish, not a
functional-but-generic scaffold. Switching tabs changes the visible content
without a full page reload.

**Why this priority**: This is the whole visible product for this feature.
Without a shell that renders the right tabs and looks like a considered
product, nothing else in this feature has anywhere to appear, and the
"first real UI" bar this feature exists to clear isn't met regardless of
what else works underneath.

**Independent Test**: Configure a set of dashboard tabs (any count, any
names) via the existing dashboard-config discovery mechanism, load the app,
and confirm the visible tab set exactly matches what was configured, that
switching tabs changes the displayed content, and that the shell's
navigation, spacing, and typography visibly draw on the established design
token set rather than unstyled default HTML.

**Acceptance Scenarios**:

1. **Given** a dashboard-config set with any number of tabs, **When** the
   app loads, **Then** exactly that set of tabs is visible, in the order
   the configuration lists them, with no tab count or name hardcoded into
   the shell.
2. **Given** the shell is rendered, **When** a different tab is selected,
   **Then** that tab's content displays without a full page reload, and the
   previously active tab's content is no longer shown.
3. **Given** the rendered shell, **When** a first-time viewer looks at it
   without prompting, **Then** they describe it as a considered, polished
   product — consistent spacing, clear visual separation between
   navigation, tab content, and individual panel cards — not as a
   functional prototype with default browser styling showing through.
4. **Given** the dashboard-config set changes (a tab is added, removed, or
   renamed) between loads, **When** the app reloads, **Then** the visible
   tab set reflects the new configuration with no code change.

---

### User Story 2 - An analyst sees a real number, computed from real data (Priority: P1)

An analyst sees at least one value-box panel on a tab, displaying a single
computed number that traces back to a real query against loaded scenario
data — proving the full config → query → rendered-value pipeline works
before any richer visualization is attempted.

**Why this priority**: This is the simplest possible proof that a panel
type can go from a YAML-described config to a real, correct, rendered
result using the new React panel pattern. A dashboard shell with zero
working panels isn't a viable increment; this is the smallest slice that
makes it one.

**Independent Test**: Configure a value-box panel against a known metric
column in an auto-discovered scenario's data, load the dashboard, and
confirm the displayed number matches that column's actual value.

**Acceptance Scenarios**:

1. **Given** a value-box panel configured against a specific metric,
   **When** the dashboard loads, **Then** the displayed number matches the
   underlying data for the currently active scenario.
2. **Given** the value-box panel is displayed, **When** the underlying
   scenario data changes (a different scenario becomes active), **Then**
   the displayed number updates to reflect the newly active scenario
   without a page reload.
3. **Given** a value-box panel's configured query returns no data (e.g. an
   empty result set), **When** it renders, **Then** it shows a clear
   empty/unavailable state rather than a blank space or a broken layout.

---

### User Story 3 - An analyst sees a real, filter-reactive chart (Priority: P2)

An analyst sees at least one chart panel that renders real query results
using the charting library, and that redraws when a global filter changes —
proving the fuller pipeline (YAML config → SQL expansion → query → chart
render → filter reactivity) beyond the simpler value-box case.

**Why this priority**: This demonstrates the more complex, more common
panel shape (a real chart, not just a scalar) and proves filter reactivity
end to end, but the dashboard is already a viable, demonstrable increment
without it once User Story 1 and 2 are in place — it's the next
increment, not the minimum one.

**Independent Test**: Configure a chart panel whose query includes a
placeholder tied to a global filter, load the dashboard, change that
filter's value, and confirm the chart redraws with results reflecting the
new filter value, without the chart being torn down and rebuilt from
scratch on every redraw.

**Acceptance Scenarios**:

1. **Given** a chart panel configured against real scenario data, **When**
   the dashboard loads, **Then** the chart renders results that match the
   underlying query.
2. **Given** the chart panel is displayed, **When** a global filter it
   subscribes to changes, **Then** the chart's displayed data updates
   accordingly, without the whole dashboard or the panel's container
   visibly flashing/rebuilding.
3. **Given** the tab containing the chart panel is switched away from and
   back to, **When** the panel remounts, **Then** it renders correctly
   again with no leaked state or duplicated chart instances from the
   previous mount.

---

### Edge Cases

- What happens when dashboard-config discovery returns zero tabs (e.g. a
  missing or empty `index.json`)? The shell MUST show a clear
  no-dashboards-available state rather than rendering blank or erroring
  the whole app.
- What happens when zero scenarios are auto-discovered (no scenario data
  registered at all)? Panels MUST show an empty/unavailable state per
  scenario-less rendering, not a crash, and the shell itself MUST still
  render its navigation.
- What happens when a panel's configured query fails (malformed SQL
  expansion, missing column, unregistered view)? That panel MUST show a
  visible error state scoped to itself — it MUST NOT crash the tab or the
  rest of the dashboard.
- What happens when a panel's YAML config is missing a required field?
  The panel MUST fail visibly and specifically (which panel, why) rather
  than silently rendering nothing or crashing unrelated panels.
- What happens when a user switches tabs while a panel's query is still
  in flight? The in-flight query's result MUST NOT be applied to a panel
  that has since unmounted (no state updates on unmounted components, no
  race where a stale response overwrites a newer one).
- What happens when two panels on the same tab request the same
  underlying data? Each panel manages its own query independently — no
  cross-panel query sharing or caching is required by this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard shell MUST render the tab set discovered via
  the existing dashboard-config discovery mechanism, with no tab count or
  name hardcoded into shell/navigation code.
- **FR-002**: Switching between tabs MUST change the displayed content
  without a full page reload.
- **FR-003**: The shell, navigation, and every panel card MUST be styled
  entirely through the existing design token set (colors, typography,
  spacing, elevation) established by the prior design-token feature — no
  new ad hoc colors, spacing values, or unstyled default HTML elements
  visible in the rendered output.
- **FR-004**: New panel types MUST be added to a central panel registry
  mapping a panel `type` string to a component, per the constitution's
  panel pattern — no panel-specific wiring embedded directly in layout
  code.
- **FR-005**: The system MUST provide a value-box panel type that queries
  configured data and displays a single computed value.
- **FR-006**: The system MUST provide a chart panel type that queries
  configured data (including SQL expanded from YAML placeholders) and
  renders it as a chart, redrawing in place (not tearing down and
  rebuilding) when the underlying data changes.
- **FR-007**: Both panel types MUST re-query and update when a global
  filter value they subscribe to changes, without requiring a page reload.
- **FR-008**: This feature MUST support exactly these two panel types;
  the remaining panel types are explicitly out of scope and MUST NOT be
  stubbed in as partial or placeholder implementations.
- **FR-009**: The dashboard MUST render using only automatically
  discovered scenario data; this feature MUST NOT include a manual
  scenario-loading or folder-picker interface.
- **FR-010**: A panel whose query fails, or whose configuration is
  invalid, MUST display a visible, panel-scoped error state without
  affecting other panels or the rest of the dashboard.
- **FR-011**: A panel unmounted while a query is in flight MUST NOT apply
  that query's result after unmounting.

### Key Entities

- **Dashboard Tab**: One entry from the discovered dashboard-config set —
  a name and an ordered collection of panels to render when active.
- **Panel**: A single configured visualization or value display on a tab,
  identified by a `type` (this feature adds `valuebox` and `plotly`) and
  the query/display configuration that type needs.
- **Panel Registry Entry**: The mapping from a panel `type` string to the
  component responsible for rendering it — the mechanism by which a new
  panel type becomes available to any dashboard-config without layout
  code changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The set of tabs visible in the running dashboard always
  exactly matches the currently discovered dashboard-config set, verified
  across at least two different configured tab counts with no code
  changes between them.
- **SC-002**: A rendered value-box panel's displayed number matches its
  underlying source data in 100% of tested cases.
- **SC-003**: A rendered chart panel's displayed data updates to reflect a
  changed global filter value within the same interaction — no page
  reload, no manual refresh action required.
- **SC-004**: The rendered shell and every panel card are verifiably built
  from `002-design-tokens`' established token/component set, not default
  or ad hoc styling — each checkable directly from rendered output or
  component source, the same way `002`'s "zero literal hex values" was
  grep-checkable:
  - Every panel card uses the `shadow-md`/`border` elevation tokens from
    `002`, not an unstyled default container.
  - Spacing throughout the shell and panel cards uses the token-driven
    Tailwind spacing scale (utility classes resolving to token-based
    values), not arbitrary hardcoded pixel values.
  - Tab navigation uses `002`'s shadcn `Tabs` component, not raw/unstyled
    HTML elements.
  - Every text element carries the correct `font-heading`/`font-body`
    class per `002`'s established per-element typography mapping.
- **SC-005**: Zero manual data-loading steps (no folder picker, no manual
  scenario selection) are required between opening the dashboard and
  seeing both panel types render real data.
- **SC-006**: A panel whose query fails does not prevent any other panel
  on the same tab, or any other tab, from rendering correctly.

## Assumptions

- Constitution Principle VI (Tailwind CSS, shadcn/ui, Radix UI primitives,
  `lucide-react`) and the amended Development Workflow panel pattern
  (constitution v2.2.0 — React function components, a `config` prop, the
  `useFilterState` hook, direct `services/duckdb.ts` imports) already fix
  the technical approach; this spec describes outcomes against that
  approach rather than re-deriving it, matching how `001` and `002`'s
  specs treated their own already-fixed technical choices.
- "Auto-discovered scenarios" means whatever `001-data-state-layer`'s
  scenario discovery mechanism registers at boot — this repository does
  not currently have real data checked into `public/scenarios/` or
  `public/observed/` (those directories don't exist yet on disk); only
  `tests/fixtures/scenarios/` exists today, generated for the Playwright
  integration suite and not committed. Verifying this feature end-to-end
  will require either those test fixtures or a locally populated
  `public/scenarios/` folder — not a gap this spec resolves, but one the
  planning phase needs to account for rather than assume away.
- The existing `tests/fixtures/all-placeholders-config.yaml` is a
  `summarize.yaml`-shaped fixture (mappings/bins/sql_fragments), built for
  `sqlExpander` tests — it does not model a real multi-tab, multi-panel
  `dashboard-*.yaml`. Whether this feature extends existing fixtures or
  adds a new one shaped like a real dashboard config is left to the
  planning phase's research, not decided here.
- "Professional SaaS product" quality (FR-003, SC-004) is assessed by
  direct visual review against the established design tokens/components,
  not by an automated visual-regression tool, unless the planning phase
  determines otherwise.
- The seven panel types explicitly out of scope for this feature (table,
  plot, flowmap, zonemap, sankey, graphic-walker, markdown) are deferred
  entirely — no placeholder registry entries, no partial implementations.
- The scenario folder-picker (`scenario/scenarioManager.ts`) remains
  deferred, consistent with every prior feature slice; this feature does
  not depend on it and does not build any part of it.
