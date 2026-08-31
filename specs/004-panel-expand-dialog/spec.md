# Feature Specification: Panel Expand-to-Dialog

**Feature Branch**: `004-panel-expand-dialog`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Feature: Panel expand-to-dialog

Add a generic capability, at the panelCard.tsx level, for a user to expand
any panel to a large near-fullscreen view — not specific to any one panel
type, so every current panel type (valuebox, plotly) and every future one
(table, zonemap, flowmap, etc.) inherits it automatically with no
per-type wiring.

- An expand-icon trigger in the panel card's header, using shadcn's Dialog
  component (Radix UI's Dialog primitive) — the same component family
  already used for Tabs/Tooltip, not a new UI pattern.
- The dialog renders the same registry-resolved panel component
  (registry.tsx's existing type -> component map) inside a much larger
  container, not a separate expanded-specific component per type.
- Standard dialog accessibility, inherited free from Radix: focus trapped
  while open, Escape closes it, clicking outside closes it, focus returns
  to the trigger button on close. Don't re-derive any of this manually.
- Known technical risk to address up front, not rediscover: PlotlyPanel's
  container size changes when it moves into the dialog. Plotly does not
  automatically detect this — reuse the ResizeObserver + Plotly.Plots.resize()
  pattern already built in 003-dashboard-shell-navigation's layout fix
  (src/panels/PlotlyPanel.tsx) rather than re-deriving a fix for the same
  class of bug.
- The panel's own data/query state (loading/ready/empty/error) must not
  reset or re-fetch when moving into or out of the dialog — same query
  result, same component instance conceptually, just a different visual
  container. Determine during planning whether this requires the panel
  component to stay mounted (e.g. rendering both a normal and expanded
  view from one mount, toggling visibility) versus a real
  unmount/remount into the dialog — this affects whether an in-flight
  query could be interrupted or duplicated, and should be resolved with
  the same rigor as 003's unmount-race handling (FR-011), not assumed.
- ValueBoxPanel inherits this mechanism too, even though expanding a
  single number is less obviously useful — no per-panel-type opt-out
  required for this feature; keep the mechanism uniform.

This does not include building any new panel type (table, zonemap,
flowmap remain deferred, same as 003's scope boundary) — only the
expand-to-dialog mechanism itself, using panel types that already exist."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Expand a panel to a large view (Priority: P1)

As a dashboard user reviewing calibration results, I want to expand any
panel — a chart, a value box, or any other panel on the tab — into a
large, near-fullscreen view, so I can read dense visuals and small text
without the panel's normal card-sized constraints.

**Why this priority**: This is the entire feature. Without it, nothing
else in this spec has a reason to exist. It is also the smallest possible
end-to-end slice that delivers real user value on its own.

**Independent Test**: Load any dashboard tab, click the expand control on
any one panel, and confirm that panel's content renders in a large
overlay showing the same data as the panel card did.

**Acceptance Scenarios**:

1. **Given** a panel card showing loaded data, **When** the user activates
   its expand control, **Then** the same panel content is displayed in a
   large overlay that visually dominates the viewport, distinct from the
   panel's normal card-sized presentation.
2. **Given** the expanded view is open, **When** the user presses the
   Escape key, clicks/taps outside the expanded area, or activates an
   explicit close control, **Then** the expanded view closes and the
   dashboard returns to its normal grid layout.
3. **Given** any panel type currently available on a dashboard tab
   (value box, chart, or any future type), **When** the user activates
   its expand control, **Then** the expand behavior works the same way,
   with no panel type excluded or behaving differently.

---

### User Story 2 - Return to the dashboard without losing panel state (Priority: P2)

As a dashboard user, when I close an expanded panel, I want to land back
on the dashboard with that panel showing exactly what it showed before I
expanded it — not a fresh loading spinner, not a re-fetch, not a reset —
so expanding a panel to look closer never costs me time or risks the
panel changing state underneath me.

**Why this priority**: Directly follows P1 — the expand action is only
trustworthy if it doesn't disturb the panel's own state. Without this,
users would learn to distrust the expand control (e.g., avoid expanding
a chart that took a while to load, for fear of triggering a reload).

**Independent Test**: Expand a panel after its data has finished loading,
close the expanded view, and confirm the panel still shows its data
immediately, with no loading indicator reappearing. Separately, expand a
panel while its data is still loading, and confirm only one query runs
and both the panel card and the expanded view reflect the same
loading-then-ready transition.

**Acceptance Scenarios**:

1. **Given** a panel that has already finished loading its data, **When**
   the user expands it and then closes it, **Then** the panel immediately
   shows the same data it showed before expanding, with no loading state
   shown at any point during the round trip.
2. **Given** a panel whose data query is still in flight, **When** the
   user expands it before the query resolves, **Then** the expanded view
   shows the same loading state the panel card was already showing, and
   only one query completes (not a second, duplicate query triggered by
   the expand action).
3. **Given** a panel in its error or empty state, **When** the user
   expands it, **Then** the expanded view shows that same error or empty
   state rather than attempting to reload or silently succeeding.
4. **Given** an expanded panel is open, **When** a global filter changes
   in a way that would normally update that panel, **Then** the expanded
   view updates the same way the panel card would have — this is a normal
   filter-driven update, not something the expand/collapse transition
   itself should suppress.

---

### User Story 3 - Charts render correctly sized inside the expanded view (Priority: P3)

As a dashboard user, when I expand a chart panel, I want the chart to
fill the larger expanded space at the correct size — not stay pinned to
its small card dimensions, and not render blank — so expanding a chart
actually makes it easier to read, which is the whole point of expanding
it.

**Why this priority**: This is a known, specific technical risk (chart
libraries generally don't detect a container resize on their own) called
out up front because it was already hit and fixed once for the dashboard
grid layout itself. It's scoped as its own story because it's testable
independently of P1/P2's general mechanism and because it's the most
likely place for a regression to hide.

**Independent Test**: Expand a chart-type panel and confirm the chart
redraws to fill the expanded container's actual size, with no blank
region, no stale small-sized render, and no cut-off content.

**Acceptance Scenarios**:

1. **Given** a chart-type panel showing a rendered chart at its normal
   card size, **When** the user expands it, **Then** the chart redraws to
   fill the expanded container's dimensions correctly, with no blank or
   incorrectly-sized area.
2. **Given** an expanded chart-type panel, **When** the user closes the
   expanded view, **Then** the chart in the panel card continues to
   render correctly at its original card size (the round trip does not
   leave the chart in a wrong-sized or blank state either direction).

---

### Edge Cases

- What happens when the user rapidly opens and closes the expanded view
  multiple times in quick succession? The dashboard must never show more
  than one expanded view at a time, and repeated toggling must not
  accumulate duplicate data queries or leave the panel in a stuck loading
  state.
- What happens when a panel fails to render at all (an unexpected error
  during rendering, not just a failed data query)? The expanded view must
  fail the same way the panel card already does for that condition, not
  crash the whole dashboard or leave a blank dialog.
- What happens when the user expands one panel while another panel on the
  same tab is still loading? The other panel's loading state must be
  unaffected — expanding one panel is isolated to that panel only.
- What happens on a small viewport (e.g., a narrow browser window)? The
  expanded view must still fit within the visible viewport rather than
  overflow or become unreachable, even though it can't be literally
  "near-fullscreen" in the same way it is on a wide viewport.
- What happens when the user switches dashboard tabs while a panel's
  expanded view is open? Reasonable dashboard navigation behavior applies
  — the expanded view closes rather than persisting over content from a
  different tab.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every panel card, regardless of panel type, MUST display an
  expand control that the user can activate to view that panel's content
  in a large, near-fullscreen overlay.
- **FR-002**: The expand control MUST be available uniformly across all
  panel types — current (value box, chart) and any added in the future —
  with no panel type requiring its own separate implementation or being
  excluded from the mechanism.
- **FR-003**: The expanded view MUST render the same panel content the
  user would see on the dashboard tab — same data, same visualization —
  just presented at a much larger size, not a separate or simplified
  representation.
- **FR-004**: The user MUST be able to close the expanded view by: an
  explicit close control, pressing the Escape key, and clicking or
  tapping outside the expanded area — all three MUST work.
- **FR-005**: While the expanded view is open, keyboard focus MUST remain
  contained within it (tabbing through interactive elements does not
  escape to the rest of the page behind it).
- **FR-006**: When the expanded view closes, keyboard focus MUST return
  to the control that opened it.
- **FR-007**: Expanding or closing a panel's view MUST NOT reset, reload,
  or re-fetch that panel's data — the expanded view and the panel card
  MUST reflect the exact same underlying data/state (loading, ready,
  empty, or error) at every point in time.
- **FR-008**: Expanding or closing a panel's view MUST NOT itself trigger
  an additional data query beyond whatever query the panel would have
  already run on the dashboard tab.
- **FR-009**: Chart-type panels MUST render at a size that correctly
  fills the expanded view's actual dimensions, with no stale, blank, or
  incorrectly-sized rendering, in both directions of the transition
  (collapsed → expanded and expanded → collapsed).
- **FR-010**: Expanding one panel MUST NOT change the state, data, or
  rendering of any other panel on the same dashboard tab.
- **FR-011**: A panel that fails to render inside the expanded view MUST
  be contained to that panel — it must not affect the rest of the
  dashboard behind it, consistent with how a panel's render failure is
  already isolated on the dashboard tab itself.
- **FR-012**: The expanded view's open/close interaction behavior
  (focus trapping, Escape-to-close, outside-click-to-close, focus
  return) MUST match the accessibility behavior of the dialog/overlay
  pattern already established elsewhere in the application, rather than
  a newly custom-built interaction pattern.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can expand any panel on a dashboard tab to a large
  view in a single click or tap, from any panel type present on that tab.
- **SC-002**: 100% of panel types available on the dashboard support the
  expand action with identical interaction behavior — no type-specific
  exceptions or missing controls.
- **SC-003**: After closing an expanded panel, the dashboard is restored
  to its exact pre-expand state — same data displayed, same other panels
  unaffected — with zero additional loading indicators shown as a result
  of the expand/close round trip.
- **SC-004**: Charts read clearly in the expanded view — filling the
  large overlay's available space with no blank regions, cut-off
  content, or leftover small-card sizing — on both first expand and every
  subsequent expand of the same panel.
- **SC-005**: A user relying solely on the keyboard can open, close, and
  navigate within an expanded panel view — no mouse interaction required
  for any part of the expand/close flow.

## Assumptions

- "Near-fullscreen" means the expanded view scales to comfortably fill
  the available viewport (leaving a small margin) rather than a fixed
  pixel size — on narrower viewports it fits within the visible screen
  rather than overflowing.
- The application already has an established, accessible dialog/overlay
  UI pattern in use elsewhere (per the codebase's existing design-token
  and component foundation); this feature reuses that pattern rather than
  introducing a new one.
- The expand control's placement in each panel card's header is uniform
  across panel types and does not require per-panel-type visual
  customization.
- Only one panel's expanded view can be open at a time; opening a second
  panel's expanded view while one is already open first closes the one
  already open, consistent with standard single-overlay dialog behavior.
- Switching the active dashboard tab while an expanded view is open
  closes that expanded view.
- This feature adds no new panel types — it applies only to panel types
  that already exist in the panel registry (value box, chart today; any
  future type automatically, once registered).
