# Feature Specification: Unified Settings Modal

**Feature Branch**: `022-settings-modal`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "Feature: Unified Settings Modal — replace the existing, separate header controls (015-theme-toggle's ThemeToggle, 009-scenario-manager's ScenarioLoader) with a single button opening one tabbed modal — Appearance / Scenarios / Basemap / Documentation. The existing header controls are REMOVED entirely, not kept alongside the modal. Appearance relocates the existing System/Light/Dark control unchanged. Scenarios relocates the existing scenario list/add/remove/baseline-marking functionality, lists every loaded scenario's real file path and status, and adds two new capabilities: viewer-controlled scenario reordering and a custom label/shortname per scenario (both in-memory only, no persistence). Basemap is a new tab letting a viewer pick a basemap preset that applies globally across every flowmap/zonemap panel, composing correctly with the already-shipped panel > tab > app-default basemap precedence chain. Documentation is a placeholder tab for a future docs link."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One place to manage dashboard-wide settings (Priority: P1)

A viewer looking at the dashboard wants to change the color theme or manage
which scenarios are loaded. Today those are two separate, independently
placed header controls; a viewer has to already know both exist and where
each one lives. Instead, a single "Settings" button in the header opens one
modal with an Appearance tab (the existing System/Light/Dark control,
unchanged) and a Scenarios tab (the existing scenario list — file path,
status, add/remove, and the baseline star — unchanged). The two previous
header controls are gone; this modal is the only way to reach any of this
functionality.

**Why this priority**: This is the consolidation itself — the core value of
the feature (fewer, more discoverable header controls) and the foundation
every other tab in this feature is added onto. Without it there is no
modal for the Basemap tab or the new Scenarios capabilities to live in.

**Independent Test**: Open the dashboard, confirm no standalone theme or
scenario controls remain in the header, open the new Settings button, and
confirm the Appearance and Scenarios tabs reproduce the exact same
behavior the two removed controls previously offered (theme switches
correctly; scenarios list/add/remove/baseline-mark correctly).

**Acceptance Scenarios**:

1. **Given** the dashboard has loaded, **When** a viewer looks at the
   header, **Then** they see one "Settings" control and neither a
   standalone theme control nor a standalone scenario-list control.
2. **Given** the Settings modal is open on the Appearance tab, **When** a
   viewer selects System, Light, or Dark, **Then** the dashboard's theme
   changes exactly as it did through the previous standalone control, with
   no change in behavior.
3. **Given** the Settings modal is open on the Scenarios tab, **When** a
   viewer views the list, **Then** every currently loaded scenario is shown
   with its real file path and status (registering/ready/failed), and the
   existing add, remove, and mark-as-baseline controls behave exactly as
   they did in the previous standalone control.
4. **Given** the Settings modal is open, **When** a viewer dismisses it
   (close button, overlay click, or Escape), **Then** the modal closes and
   any settings changes made while it was open remain in effect.
5. **Given** the dashboard is running in LOCAL deployment mode (or in a
   browser without File System Access API support), **When** a viewer
   opens the Settings modal's Scenarios tab, **Then** the tab, its
   scenario list, and every control on it except "Load Local Scenario"
   behave exactly as in WEB mode — "Load Local Scenario" alone is shown
   disabled with an explanatory tooltip, never hidden, and the modal
   itself and every other tab remain fully reachable.

---

### User Story 2 - Viewer-wide basemap choice (Priority: P2)

A viewer exploring several map panels across different tabs wants to see
them all on the same basemap without an author having had to configure
that basemap into every panel or tab. A new Basemap tab in the Settings
modal lets the viewer pick a basemap preset that applies across every
flowmap and zonemap panel in the dashboard — but only where an author
hasn't already configured a specific basemap for that panel or its tab; an
author's own explicit choice is never overridden by a viewer's pick.

**Why this priority**: A genuinely new, standalone capability with real
value on its own (no existing UI lets a viewer do this at all today), but
it depends on User Story 1's modal shell existing first, and it is more
technically involved than the reordering/labeling additions in User Story
3 — placed after the foundational consolidation, ahead of the smaller
Scenarios-tab additions because it delivers the most new end-user value
per this feature.

**Independent Test**: With at least one flowmap or zonemap panel that has
no author-configured basemap of its own, open the Settings modal's Basemap
tab, pick a different preset, close the modal, and confirm that panel now
renders with the newly picked basemap — with no page reload. Separately,
confirm a panel or tab that DOES have an author-configured basemap keeps
showing that configured basemap regardless of the viewer's global pick.

**Acceptance Scenarios**:

1. **Given** a flowmap or zonemap panel with no `basemap:` configured on
   either the panel or its tab, **When** a viewer picks a basemap preset in
   the Basemap tab, **Then** that panel's map re-renders with the picked
   basemap without a page reload.
2. **Given** a panel or tab that DOES have an explicit author-configured
   basemap, **When** a viewer picks a different global basemap preset,
   **Then** that panel continues showing its author-configured basemap,
   unchanged.
3. **Given** a viewer has picked a global basemap, **When** they navigate
   to a different tab containing more unconfigured map panels, **Then**
   those panels also render with the viewer's picked basemap.
4. **Given** a viewer has picked a global basemap, **When** they reload the
   page, **Then** the global basemap choice resets to its default (no
   persistence), matching how a manual theme override already behaves.

---

### User Story 3 - Reorder loaded scenarios (Priority: P2)

A viewer working with several loaded scenarios wants to control the order
they're listed and compared in, rather than being stuck with the order
they happened to load in. From the Scenarios tab, a viewer can move a
scenario up or down in the list.

**Why this priority**: A real, independently useful capability, but purely
organizational — it changes how the list is displayed, not what any
scenario does or how the dashboard's data resolves. Delivered after the
Basemap tab because it's a smaller, lower-risk addition to a tab that
already exists once User Story 1 ships.

**Independent Test**: With three or more scenarios loaded, use the reorder
controls to move one scenario to a different position in the Scenarios
tab's list, close and reopen the modal, and confirm the new order is still
shown (for the remainder of the session). Separately, confirm that
whichever scenario the automatic-default baseline rule was resolving to
before the reorder is still the one it resolves to afterward — reordering
the display list must not silently change the baseline.

**Acceptance Scenarios**:

1. **Given** three or more scenarios are loaded, **When** a viewer moves
   one scenario up or down in the Scenarios tab, **Then** the list
   immediately reflects the new order.
2. **Given** a viewer has reordered the scenario list, **When** no scenario
   has been explicitly marked baseline, **Then** the automatic-default
   baseline resolution continues to pick the same scenario it would have
   picked before the reorder (display order and baseline-resolution order
   are independent).
3. **Given** a viewer has reordered the scenario list, **When** they reload
   the page, **Then** the order resets to registration order (no
   persistence).
4. **Given** a viewer has already reordered the scenario list, **When** a
   new scenario registers mid-session, **Then** it appears at the end of
   the current display order — it does not insert at a position based on
   its raw registration order, and it does not disturb the position of any
   already-listed scenario.

---

### User Story 4 - Custom scenario label (Priority: P3)

A viewer working with scenarios whose real names are long internal run
identifiers wants to give one a short, memorable label for their own
session, without renaming the underlying scenario itself.

**Why this priority**: The smallest, most self-contained addition —
cosmetic only, touches no resolution logic, and has no dependency from any
other story in this feature.

**Independent Test**: In the Scenarios tab, assign a custom label to a
loaded scenario and confirm the label (not the original name) is what's
shown in the scenario list and anywhere else the app currently displays
that scenario's name in this control, for the remainder of the session.

**Acceptance Scenarios**:

1. **Given** a scenario is loaded, **When** a viewer assigns it a custom
   label, **Then** that label is shown in place of the scenario's real
   name in the Scenarios tab's list.
2. **Given** a scenario has a custom label, **When** the underlying SQL,
   view names, or `$baseline`/`$scenario` resolution reference that
   scenario, **Then** they continue to use the scenario's real name — the
   custom label is a display-only convenience, not a rename.
3. **Given** a viewer has assigned a custom label, **When** they reload the
   page, **Then** the label is gone and the scenario's real name is shown
   again (no persistence).

---

### User Story 5 - Documentation placeholder (Priority: P3)

A viewer looking for written documentation about the dashboard sees a
Documentation tab in the Settings modal, clearly labeled as a placeholder
until real hosted documentation exists.

**Why this priority**: Lowest-effort, no functional dependency on anything
else — a single static tab.

**Independent Test**: Open the Settings modal's Documentation tab and
confirm it clearly indicates documentation isn't published yet, without
broken links or dead-end navigation.

**Acceptance Scenarios**:

1. **Given** the Settings modal is open, **When** a viewer selects the
   Documentation tab, **Then** they see a clearly labeled placeholder
   indicating where documentation will be linked once it exists.

---

### Edge Cases

- What happens when a viewer tries to move the first scenario further up,
  or the last scenario further down? The reorder controls at either end
  must not error or wrap around — the boundary move is simply unavailable.
- What happens when only one scenario is loaded? Reorder controls have
  nothing to do — they may be disabled or simply produce no visible
  change.
- What happens when a new scenario registers after a viewer has already
  reordered the display list? It is appended to the end of the current
  display order (FR-018) — never inserted at a position implied by its
  raw registration order. This is the resolved behavior, not left
  implicit: registration order keeps driving `getBaseline()`'s automatic
  baseline rule exactly as before (User Story 3's own independence
  guarantee), but the viewer-facing display list is a separate,
  viewer-owned arrangement — a newly arriving scenario jumping into the
  middle of a list a viewer just deliberately arranged would be a more
  surprising outcome than simply appending it, and "append new items at
  the end" also matches how every other growing list already behaves
  elsewhere in this dashboard (e.g. the pre-existing scenario chip list
  in `ScenarioLoader` today, which is unordered but always renders in
  Map-iteration/registration order with no reshuffling of existing
  entries).
- What happens if a scenario is removed while it holds a custom label or a
  non-default position? Both are simply discarded along with the rest of
  that scenario's entry — no orphaned state remains referencing a removed
  scenario.
- What happens if two scenarios end up with the same custom label (or a
  label matching another scenario's real name)? The dashboard does not
  reject or dedupe this — labels are a display convenience, not an
  identifier, and both scenarios remain independently addressable by their
  real (unique) names underneath.
- What happens when a viewer opens the Basemap tab before any flowmap or
  zonemap panel exists anywhere in the loaded dashboard configuration? The
  picker still works and the choice is still recorded; it simply has no
  visible effect until such a panel exists.
- What happens when the global basemap preset a viewer picked fails to
  load (e.g., an unreachable tile source)? The affected panel falls back
  exactly the way an author-configured basemap already falls back today —
  this feature does not change existing basemap-failure behavior (FR-017).
- What happens to the global basemap choice when a viewer switches theme
  mode (Light/Dark/System)? The viewer's explicit global basemap pick is a
  single preset, not a light/dark pair — it continues to apply after a
  theme change; only the un-set case (no viewer pick made) still resolves
  the existing light/dark app-default pair.
- What happens to the "Load Local Scenario" control in LOCAL deployment
  mode (where scenarios already load via their own file-serving path)?
  It stays visible but disabled, with an explanatory tooltip — the same
  treatment already used for a browser lacking File System Access API
  support (FR-019). The Settings modal and the rest of the Scenarios tab
  (list, baseline star, remove, reorder, label) are unaffected and remain
  fully usable in LOCAL mode, exactly as they already do in WEB mode —
  unlike the previous standalone `ScenarioLoader` control, which hid its
  entire self (list included) in LOCAL mode.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard header MUST show exactly one control for
  reaching dashboard-wide settings (theme, scenarios, basemap,
  documentation), replacing the two separate controls that previously
  existed for theme and scenario management.
- **FR-002**: The previous standalone theme control and standalone
  scenario-management control MUST be removed entirely — not hidden, not
  kept as a redundant second way to reach the same functionality.
- **FR-003**: Selecting the settings control MUST open a single modal
  containing four tabs: Appearance, Scenarios, Basemap, and Documentation.
- **FR-004**: The Appearance tab MUST offer the same System/Light/Dark
  choice and the same underlying behavior (mode resolution, including its
  existing no-persistence behavior) that the previous standalone theme
  control offered, presented as three directly visible options (a
  horizontal Light/Dark/System control) — not the compact icon-only
  dropdown that control's most recent, header-crowding-driven redesign
  used; see Assumptions.
- **FR-005**: The Scenarios tab MUST list every currently loaded scenario,
  each showing its real file path and its current status
  (registering/ready/failed).
- **FR-006**: The Scenarios tab MUST offer the same add, remove, and
  mark-as-baseline capabilities, with the same behavior, that the previous
  standalone scenario control offered — except the "Load Local Scenario"
  control's deployment-mode gating, which changes per FR-019: it MUST stay
  visible-but-disabled in LOCAL deployment mode, never fully hidden as the
  previous standalone control did.
- **FR-007**: The Scenarios tab MUST let a viewer change the display order
  of loaded scenarios (e.g., move up/move down), independent of the order
  scenarios were loaded/registered in.
- **FR-008**: A viewer-set display order MUST NOT change which scenario
  the automatic-default baseline resolution rule selects when no scenario
  is explicitly marked baseline — that rule continues to resolve by
  registration order, unaffected by display-order changes.
- **FR-009**: The Scenarios tab MUST let a viewer assign an optional custom
  label to a loaded scenario, displayed in place of that scenario's real
  name wherever the Scenarios tab shows scenario names.
- **FR-010**: A custom label MUST be display-only — it must never be used
  in place of a scenario's real name for view/query resolution
  (`$scenario`, `$baseline`, or any other scenario-name-keyed mechanism).
- **FR-011**: The Basemap tab MUST let a viewer pick one basemap preset
  from the same catalog available to dashboard authors, applied globally
  across every flowmap and zonemap panel in the loaded dashboard.
- **FR-012**: A viewer's global basemap pick MUST take effect only where a
  panel or its tab has no author-configured basemap of its own — it MUST
  NOT override an explicit panel-level or tab-level `basemap:` value
  configured in a dashboard's YAML.
- **FR-013**: A viewer's global basemap pick MUST apply to already-rendered
  map panels reactively, without requiring a page reload.
- **FR-014**: The Documentation tab MUST show a clearly labeled placeholder
  indicating documentation is not yet published, with no broken or
  misleading link.
- **FR-015**: None of this feature's viewer-facing settings (theme
  override, scenario display order, scenario custom labels, global basemap
  pick) MUST persist across a page reload — every one of them resets to
  its default on reload, matching every other piece of this dashboard's
  existing in-memory-only viewer state.
- **FR-016**: The modal MUST be dismissible via a close control, clicking
  outside it, and the Escape key, matching this dashboard's existing modal
  dismissal behavior elsewhere.
- **FR-017**: When a viewer's picked global basemap fails to load (e.g. an
  unreachable tile source), the affected panel MUST use the exact same
  fallback behavior an author-configured basemap already uses on failure
  today — this feature MUST NOT introduce a new or different
  failure-handling path for the global-pick case.
- **FR-018**: A scenario that registers after a viewer has already
  reordered the display list MUST be appended to the end of the current
  display order — it MUST NOT be inserted at a position implied by its
  raw registration order, and it MUST NOT change the position of any
  already-listed scenario.
- **FR-019**: The Settings modal, every one of its four tabs, and the
  Scenarios tab's scenario list/baseline/remove/reorder/label controls
  specifically MUST remain reachable regardless of deployment mode or
  browser capability. A control that genuinely doesn't apply in the
  current context (local scenario loading in LOCAL deployment mode; local
  scenario loading in a browser lacking File System Access API support)
  MUST be shown visible-but-disabled with an explanatory tooltip —
  matching the treatment already used for the browser-capability case —
  never hidden or removed.

### Key Entities

- **Scenario** (existing entity, extended): gains a viewer-controlled
  display-order value (independent of registration order, which continues
  to drive automatic baseline resolution unchanged) and an optional
  viewer-assigned custom label (display-only, never a substitute for the
  scenario's real name in any query or resolution path).
- **Global Basemap Selection**: a single, viewer-set basemap preset choice
  that composes into the existing panel > tab > app-default basemap
  resolution as a replacement for the app-default tier specifically — used
  only when neither a panel nor its tab has its own configured basemap.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The dashboard header shows exactly one settings-related
  control (down from two today), with zero loss of the functionality
  either previous control offered.
- **SC-002**: A viewer can reach theme, scenario management, and basemap
  selection from a single, consistent starting point — no functionality
  from this feature requires knowing about more than one header control.
- **SC-003**: A viewer's global basemap pick visibly applies to 100% of
  flowmap/zonemap panels that have no author-configured basemap of their
  own, across every tab, with no page reload required.
- **SC-004**: A viewer's global basemap pick never changes the rendered
  basemap of a panel or tab that has its own author-configured basemap —
  0% override rate, verified across at least one such panel.
- **SC-005**: A viewer can reorder scenarios and see the updated order
  reflected immediately, with the automatic-default baseline selection
  unaffected by the reorder in every case where no scenario is explicitly
  marked baseline.
- **SC-006**: A viewer can assign and see a custom scenario label take
  effect immediately, with the scenario's real name still correctly
  driving every underlying query.
- **SC-007**: After a page reload, every viewer-set preference introduced
  by this feature (theme override, scenario order, custom labels, global
  basemap) has returned to its default — verified with none left over.

## Assumptions

- **Basemap tab composes at the app-default tier, not above panel-level**
  (resolved design decision, not left open): research into
  `resolveEffectiveBasemap()` (011-basemap-style-system) confirms it is a
  pure function taking panel/tab/theme inputs and falling back to a static
  app-default pair only when neither panel nor tab set anything. A
  viewer's global pick is designed to replace what that fallback resolves
  to — not to become a new, higher-priority tier — so it composes onto the
  existing, already-tested precedence chain without restructuring it. This
  keeps the existing "author's explicit choice always wins" guarantee
  intact, which this feature's own description flagged as the
  highest-risk part to get right.
- **Global basemap selection needs a new, dashboard-wide shared store**,
  not local component state — unlike `ThemeToggle`'s own mode (read by no
  other component), a global basemap choice must be visible to every
  flowmap/zonemap panel across every tab, so it follows the existing
  shared-store-plus-hook shape (`appState.ts`/`useActiveScenarios.ts`,
  `useBaseline.ts`) already established in this codebase, not a new
  pattern.
- **Reordering is a display-order concern only** — it does not change
  `appState.ts`'s underlying registration-order semantics that
  `getBaseline()`'s automatic-default rule already depends on (per this
  feature's own explicit requirement not to silently change that
  behavior). The two orders are tracked independently.
- **No persistence anywhere in this feature** — consistent with this
  dashboard's constitution (no Web Storage) and with `ThemeToggle`'s own
  already-shipped no-persistence precedent: every setting introduced here
  (basemap pick, scenario order, custom labels) is in-memory only and
  resets on reload.
- **A reusable modal primitive already exists** (`components/ui/dialog.tsx`,
  from 004-panel-expand-dialog) and is reused for this modal's chrome — no
  new modal mechanism is built from scratch. The existing
  `components/ui/dropdown-menu.tsx` tab-switcher-adjacent primitives are
  available if useful for the modal's own internal tab control, though the
  specific tab-navigation widget is an implementation decision, not a
  requirement of this spec.
- **Appearance tab reverts to the original three-visible-option control**
  (resolved design decision, not left open — see research.md for the full
  reasoning): 015-theme-toggle's compact icon-only dropdown was a redesign
  driven specifically by header-crowding next to `ScenarioLoader`'s own
  variable width in the shared header row. That constraint doesn't exist
  once the control lives inside its own dedicated modal tab with no
  competing header space, so FR-004 reverts to the original, more
  discoverable three-button form. The underlying mode state and
  System/Light/Dark resolution effect are unchanged either way — only the
  visual presentation reverts.
- **Scenario active/inactive toggling is explicitly OUT OF SCOPE for this
  feature** — a deliberate, considered exclusion, not a silent gap.
  `appState.ts`'s existing `active` field / `setActive()` mutator (which
  drives `resolveActiveScenarios()`'s `$scenario.<metric>` UNION-ALL query
  construction) has no viewer-facing toggle anywhere in this app today;
  `009-scenario-manager`'s own original scope explicitly deferred exactly
  this ("a sidebar toggle for published scenarios"), and it stays deferred
  here too. Unlike this feature's own display-order and custom-label
  additions (research.md confirms neither touches any query-affecting code
  path at all), toggling a scenario active/inactive changes REAL query
  results across every `$scenario.`-driven panel — a materially different
  kind and rigor of change than this feature's other three additions, and
  one the original feature request never named among the Scenarios tab's
  listed capabilities (unlike the Basemap tab, which was explicitly
  requested). Recommended as its own, separately-scoped future feature —
  research.md's closing note records the one real, confirmed technical
  finding that lowers that future feature's own risk (the reactive
  plumbing it would need, `useActiveScenarios()`'s `useSyncExternalStore`
  subscription, is already built and already proven by two independent
  existing mechanisms — `?s=` URL params and local-scenario registration —
  so a future toggle would mostly be exposing already-correct existing
  behavior through new UI, not building new reactivity from scratch).
- **Out of scope**: this feature does not change any underlying mechanism
  it relocates or composes with — theme resolution, scenario registration,
  baseline resolution, and the basemap precedence chain itself all keep
  their current behavior. It consolidates and extends the UI surface over
  them; it does not redesign what already works underneath.
- **Out of scope**: real, hosted documentation content — the Documentation
  tab is a placeholder only; publishing actual documentation is a separate,
  future effort.
