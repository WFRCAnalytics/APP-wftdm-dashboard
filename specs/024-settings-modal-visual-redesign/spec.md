# Feature Specification: Settings Modal Visual Redesign

**Feature Branch**: `024-settings-modal-visual-redesign`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Settings modal visual redesign — basemap list polish, scenario tab overhaul, raster preview, and theme toggle rebuild. Four related visual/UX redesign items for the Settings modal (020/021's own shipped work), bundled as one feature given their shared surface area: (1) Basemap tab — visual polish of the existing flat list, not an accordion; keep the shared live preview mechanism as-is. (2) Scenarios tab — full visual overhaul, currently 'very default and ugly'; add semantic status coloring (green/ready, red/error, yellow/warning) reusing established design tokens where a semantic match exists. (3) Raster Tiles — add live preview support, reversing 021's FR-008 'no live preview for raster providers' decision, via MapLibre's native raster source, reusing the same shared persistent preview map. (4) Appearance tab — rebuild using Radix's real Tabs/TabsTrigger primitive instead of the current plain Button-row, while avoiding this project's documented nested role=\"tab\" collision risk since the Settings modal's own outer navigation is itself a Tabs region."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scenarios tab is legible and status is visible at a glance (Priority: P1)

An analyst juggling several loaded scenarios (published runs, a locally-loaded folder, the pinned Observed Data row) opens Settings → Scenarios and can immediately tell, without reading each row's parenthetical text, which scenarios are ready to use, which failed to load, and which are still registering — the row layout itself is no longer described as "default and ugly," with clear visual grouping of a scenario's identity, status, and available actions (reorder, mark baseline, relabel, remove).

**Why this priority**: This is the most visible, most-used tab in the modal and the one explicitly called out as a real usability problem, not just a polish nit — it's the day-to-day surface for anyone comparing multiple model runs.

**Independent Test**: Open Settings → Scenarios with a mix of ready, failed, and still-registering scenarios loaded; confirm each row's status is distinguishable by more than its text label alone, and that every existing action (reorder, baseline star, relabel, remove) still works exactly as before.

**Acceptance Scenarios**:

1. **Given** a scenario whose status is "ready", **When** the Scenarios tab renders that row, **Then** the row's status indicator is visually distinct (via color) from a "failed" or "registering" row, without changing what text or tooltip content is shown.
2. **Given** a scenario whose status is "failed", **When** the Scenarios tab renders that row, **Then** the status indicator uses the same semantic "error" treatment already used elsewhere in this app (e.g. the existing scenario-load error message), not a newly-invented color.
3. **Given** a scenario whose status is "registering" (still loading), **When** the Scenarios tab renders that row, **Then** the row is visually marked as pending/in-progress and is distinguishable from both "ready" and "failed".
4. **Given** the redesigned Scenarios tab, **When** a viewer reorders a scenario, marks a different one as baseline, edits a label, or removes a locally-loaded scenario, **Then** each action behaves identically to before this feature (no behavioral regression from a visual-only change).

---

### User Story 2 - Raster tile providers can be previewed before applying (Priority: P2)

A viewer browsing the Raster Tiles dropdown in Settings → Basemap wants to see what a candidate raster provider (e.g. a satellite-imagery or terrain provider) actually looks like before committing to it as their global basemap, the same way they already can for every vector-style entry in the other three catalog sections.

**Why this priority**: This closes a real, previously-shipped functional gap (raster selections could only be judged by name) — it's a capability addition, not pure polish, but it depends on nothing else in this feature and can ship on its own.

**Independent Test**: Open Settings → Basemap, select a raster provider from the dropdown, and confirm the shared preview map updates to show real raster tiles for that provider (no placeholder message), the same Apply-to-commit flow as every other section, and no change to any other section's behavior.

**Acceptance Scenarios**:

1. **Given** the Basemap tab is open with a vector-style entry staged, **When** a viewer selects a raster provider from the Raster Tiles dropdown, **Then** the shared preview map re-renders using that provider's real tiles instead of showing the "no live preview" placeholder message.
2. **Given** a raster provider is staged and previewed, **When** the viewer selects a vector-style entry from one of the other three sections instead, **Then** the preview map switches back to that vector style with no leftover raster tiles or errors.
3. **Given** a raster provider is staged and its preview is showing, **When** the viewer clicks Apply, **Then** that raster provider becomes the global basemap exactly as it does today (no change to the staging/Apply mechanism itself).
4. **Given** a raster provider whose tiles fail to load (network error), **When** its preview is attempted, **Then** the preview area shows a clear failure state rather than a blank or broken map, and the rest of the tab remains usable.

---

### User Story 3 - Basemap catalog list reads more clearly (Priority: P3)

A viewer scanning the four (soon five, per the raster capability above) sections of the Basemap tab's catalog can more easily tell sections apart and pick out the currently-staged entry, thanks to improved spacing, sizing, typography, and hover/active states — without the list becoming an accordion or gaining new thumbnail images.

**Why this priority**: Pure visual polish with no functional change and no dependency on the other three items — lowest risk, but also lowest incremental value compared to closing the raster-preview gap or fixing the Scenarios tab's legibility problem.

**Independent Test**: Open Settings → Basemap and visually compare section headings, entry spacing, and the staged/hover/focus states of an entry button against the pre-change version; confirm the staging and Apply mechanism (which entry is staged, what Apply commits) is unchanged.

**Acceptance Scenarios**:

1. **Given** the Basemap tab's catalog list, **When** a viewer hovers over an unstaged entry, **Then** a visible hover state appears distinct from both the resting and staged states.
2. **Given** the currently-staged entry in any section, **When** the tab renders, **Then** that entry is visually distinguishable from every other entry in the list at a glance (not only via the existing `aria-checked`/`data-staged` attributes).
3. **Given** the existing section headings (UGRC Vector Tiles, CARTO Vector Tiles, OpenFreeMap, Raster Tiles), **When** the tab renders, **Then** each heading is visually separated from the entries above and below it.
4. **Given** this visual-only change, **When** the same staging/Apply/preview interactions from the already-shipped Basemap tab are exercised, **Then** they behave identically to before (no mechanism change).

---

### User Story 4 - Appearance tab uses a real tab control (Priority: P4)

A viewer choosing between System/Light/Dark in Settings → Appearance interacts with a proper tab-like control (keyboard arrow-key navigation between options, standard tab semantics) instead of a row of independently-clickable buttons, matching how this app already builds its other tab strips.

**Why this priority**: An internal-consistency and future-maintainability improvement (the codebase's own shared `Tabs` primitive replaces a one-off button row) rather than a fix to a reported defect — lowest urgency of the four, and it carries a real, known collision risk (a second `role="tablist"` region nested inside the modal's own outer one) that must be handled correctly, not just shipped and patched later.

**Independent Test**: Open Settings → Appearance, use keyboard arrow keys to move between System/Light/Dark, confirm the selection is applied the same way as clicking, confirm the selection still survives switching to another Settings tab and back (the existing fix for the theme-reset regression), and confirm no test or accessibility tool that queries the page for tabs/tablists is confused by the modal now containing two nested tab regions.

**Acceptance Scenarios**:

1. **Given** the Appearance tab is open, **When** a viewer uses arrow keys to move focus between the System/Light/Dark options, **Then** focus moves between them the way it already does in every other `Tabs`-based control in this app.
2. **Given** a Light or Dark selection made via the new control, **When** the viewer switches to a different Settings tab and back to Appearance, **Then** the previously-selected mode is still shown as selected (no regression of the already-fixed tab-remount theme reset).
3. **Given** the Settings modal's own outer tab strip (Appearance/Scenarios/Basemap/Documentation) and the Appearance tab's new inner System/Light/Dark tab strip are both mounted at once, **When** either strip is queried by role or label (by an automated test or an assistive technology), **Then** the two strips are unambiguously distinguishable from one another.
4. **Given** this visual-only change, **When** a mode (System/Light/Dark) is selected, **Then** the actual theme-application behavior (which mode applies `.dark`, matchMedia listening while in System mode) is unchanged from before this feature.

### Edge Cases

- A scenario's status changes (e.g. "registering" → "ready") while the Scenarios tab is open — the status indicator must update live, not require closing and reopening the tab.
- A raster provider preview is requested for a provider whose only variant requires selecting from an `<optgroup>` — the preview must reflect the actual selected variant's tiles, not the parent provider's default.
- The raster preview is left staged (not yet Applied) and the viewer closes the modal — no raster tiles should be fetched or applied beyond what the preview itself already fetched for display purposes.
- A screen reader or automated test queries "all tabs on the page" while the Settings modal is open on the Appearance tab — it must be able to tell the outer Settings navigation apart from the inner theme-mode control.
- Very long scenario labels or paths in a Scenarios tab row must still allow the status indicator and action buttons to remain visible (existing truncation behavior preserved).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Scenarios tab MUST visually indicate each scenario's status (ready / failed / registering) using color, in addition to the existing text status, reusing this app's established semantic design tokens rather than introducing arbitrary new colors for concepts that already have one (e.g. the same "error" treatment already used for the scenario-load error message).
- **FR-002**: The Scenarios tab MUST continue to expose every action available today (reorder up/down, mark-as-baseline, inline relabeling, remove a locally-loaded scenario) with identical behavior — this is a visual redesign, not a functional change to scenario management.
- **FR-003**: The Scenarios tab's redesigned layout MUST remain legible and fully functional with realistic data volume (a pinned Observed Data row plus multiple published/local scenarios) and with long scenario names, labels, or paths.
- **FR-004**: The Basemap tab's Raster Tiles section MUST render a live preview of the currently-staged raster provider in the same shared preview map used by the other three sections, replacing today's static "No live preview for raster providers" placeholder.
- **FR-005**: The raster live preview MUST use the same tile-URL resolution already used to build a raster basemap when Applied (no separate/duplicate provider-resolution logic), so the preview is guaranteed to match what Apply would actually produce.
- **FR-006**: Switching the staged selection between a raster provider and any vector-style entry (in either direction) MUST correctly update the shared preview map with no leftover tiles, layers, or error state from the previously-staged selection.
- **FR-007**: If a staged raster provider's tiles fail to load, the preview area MUST show a distinct failure indication rather than a blank map or a silent failure, without affecting the rest of the tab.
- **FR-008**: 021-basemap-catalog-redesign's FR-008 ("no live preview for raster providers — Apply to use it") is superseded by this feature's FR-004 through FR-007 above; no interface text or behavior in the shipped app may continue to state that raster providers have no preview.
- **FR-009**: The Basemap tab's existing flat, non-accordion, four/five-section list structure MUST be preserved — this feature changes visual spacing, sizing, typography, and hover/active/staged states only, not the list's structure, its section grouping, or the staging/Apply/preview mechanism.
- **FR-010**: Every basemap catalog entry MUST have a visibly distinct resting, hover, and staged-selection appearance.
- **FR-011**: The Appearance tab's System/Light/Dark selector MUST be rebuilt using this app's shared `Tabs`/`TabsTrigger` primitive (the same one the Settings modal's own outer navigation and the dashboard's top-level tab strip already use), replacing the current independent button row.
- **FR-012**: The rebuilt Appearance tab control MUST preserve exactly the same selection behavior and value storage as today — a Light/Dark selection MUST still survive switching to a different Settings tab and back (the existing tab-remount fix), and MUST still reset to System only on a full page reload.
- **FR-013**: Because the Appearance tab's new control introduces a second `role="tablist"` region nested inside the Settings modal's own outer tab navigation (itself a `role="tablist"`), any query or test that targets "the tabs" MUST be able to unambiguously scope to one region or the other — this feature MUST NOT reintroduce this project's previously-documented nested-tab-region collision (the same class of issue already found and fixed once in this app's dashboard shell test suite).
- **FR-014**: None of the four items in this feature may alter the underlying mechanisms they sit on top of: scenario registration/status computation, baseline resolution, basemap resolution precedence (panel > tab > global > app-default), or the basemap staging/Apply flow. Every change in this feature is presentation-layer only.

### Key Entities

- **Scenario status indicator**: A visual treatment (color, distinguishable from text alone) attached to each scenario row in the Scenarios tab, derived directly from that scenario's existing status value — not a new stored field, purely a rendering of existing state.
- **Raster provider preview style**: A basemap style constructed on the fly from a selected raster provider's resolved tile URL, used only to drive the shared preview map's display — not persisted, not a new catalog entry type, and not the style that is ultimately applied (Apply still stores the provider selection itself, exactly as today).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer can identify a failed scenario in the Scenarios tab within one glance, without reading the row's text, in a user test with mixed-status scenarios loaded.
- **SC-002**: A viewer can distinguish "ready," "failed," and "registering" scenario rows from one another using color alone, verified against this app's existing color-contrast/token conventions.
- **SC-003**: 100% of raster tile providers in the curated Raster Tiles dropdown produce a real, visible tile preview in the shared preview map when selected (excluding genuine network failures, which show a failure state instead).
- **SC-004**: Every action available in the Scenarios and Basemap tabs before this feature (reorder, baseline, relabel, remove, stage, preview, Apply) remains available and produces the identical outcome after this feature ships.
- **SC-005**: No automated accessibility or interaction test that queries "the tabs" on a page with the Settings modal open produces an ambiguous match between the modal's outer tab navigation and the Appearance tab's inner System/Light/Dark control.
- **SC-006**: A Light or Dark theme selection, once made in the redesigned Appearance tab, is still the selected value after switching to any other Settings tab and back, in 100% of manual and automated checks.

## Assumptions

- **No true "warning" scenario status exists today.** This app's real scenario status model has exactly three values: `registering`, `ready`, and `failed` — there is no "loaded with a warning" state to color yellow. This feature maps `ready` to a success/green treatment and `failed` to this app's existing error/destructive treatment, and gives `registering` a neutral, in-progress visual treatment (not a new color) rather than inventing a third, currently-meaningless status. If a genuine warning state is added to the scenario data model in the future, this feature's color scheme is expected to extend to it, but that data-model change is out of scope here.
- **This app's design-token system does not currently define a "success" (green) semantic token** — only `--destructive` (error/red) has an established semantic meaning today. This feature is expected to add one new success token pair (light/dark) following the same pattern as the existing tokens, rather than hardcoding a raw color value; exact hue is a design decision made during implementation, not a scope decision made here.
- The Basemap tab's shared preview map, staging state, and Apply mechanism (all shipped by 021-basemap-catalog-redesign) are assumed correct and unchanged by this feature except where FR-004 through FR-007 explicitly extend them to cover raster providers.
- The Settings modal's fixed modal height/width and vertical left-side tab navigation (both already shipped) are assumed already correct and are not touched by this feature.
- No new npm dependency is expected to be needed for any of the four items — MapLibre already supports raster sources natively, and this app's `Tabs`/`TabsTrigger` primitive already exists and already supports the interaction pattern the Appearance tab needs.
