# Feature Specification: Scenarios Tab Redesign — Drag Reorder, Baseline Chip, Verified Active Toggle

**Feature Branch**: `037-scenarios-tab-redesign`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Scenarios tab comprehensive redesign — drag-and-drop reorder, consolidated baseline chip, verified active-toggle correctness, and discoverability hints. Building on 035/036's already-shipped work (label/color propagation, the color picker, row status treatment) — this feature redesigns the row's interaction model and fixes a suspected real bug. PART A — investigate whether the active/inactive Switch is genuinely wired backwards or a rendering/timing artifact; fix at the root if found, else explain precisely why the screenshot appeared that way. PART B — move the reorder controls from the trailing action cluster to the START of the row (leading edge, before the status dot). PART C — add real drag-and-drop row reordering, with required research into real, well-established React DnD libraries; existing up/down arrows must remain fully functional as a keyboard-accessible fallback. PART D — consolidate the baseline indicator into ONE interactive chip beside the scenario name, replacing the star/star+text entirely: filled/non-clickable reading 'Baseline' on the current baseline row, outline/muted/clickable reading 'Set as baseline' on every other row. PART E — add a discoverable tooltip for the active/inactive Switch explaining its effect on comparisons/queries."

## Research (completed before writing requirements below)

### Part A investigation — is the active/inactive Switch wired backwards?

Re-read `layout/settings/scenariosTab.tsx`'s actual, current source directly (not
assumed from prior summaries) before investigating: the Switch's `checked` prop is
bound to `s.active` directly — `checked={s.active}` — with no negation anywhere in
the expression, and `onCheckedChange` calls `appState.setActive(s.name, checked)`
with the raw boolean Radix hands back, again no negation. On the data side,
`state/appState.ts`'s own `Scenario.active` field and `setActive()` function
(`009-scenario-manager`) are the same, unmodified mechanism `036`'s own Part C
wired the Switch to — there is no second, shadow "active" concept anywhere in this
codebase that could be confused with the real one.

Confirmed live, not just read from source: a temporary, since-deleted Playwright
spec booted a plain `/` (no `?s=` URL param — this fixture set's default), opened
the Scenarios tab, and for each of the three real fixture scenarios read (a) the
real `appState.get(name)?.active` value directly, (b) the rendered Switch's own
`aria-checked`/`data-state` attributes, and (c) a screenshot of the row:

| Scenario | `appState.active` | Switch `aria-checked` | Switch `data-state` |
|---|---|---|---|
| `observed` | `true` | `true` | `checked` |
| `good_scenario` | `false` | `false` | `unchecked` |
| `broken_scenario` | `false` | `false` | `unchecked` |

Every value agrees, in both directions, for every scenario — the Switch is **not**
wired backwards. `observed`'s own switch rendered visibly filled/dark (the real
`data-[state=checked]:bg-primary` treatment), while `good_scenario`/
`broken_scenario` rendered visibly light/muted (`data-[state=unchecked]:bg-input`)
— confirmed by direct visual inspection of the captured screenshot, not just the
DOM attributes.

**Root cause of the "every row looks off" impression, confirmed rather than
guessed**: `services/scenarioDiscovery.ts`'s `registerPublishedScenarios()` has
never called `setActive()` for a published scenario at all — this is a real,
pre-existing, already-documented fact (`CLAUDE.md`'s own `035-scenario-label-color`
entry records finding this during that feature's own testing). Only `observed` is
force-activated at registration (`appState.setActive('observed', true)`,
unconditionally); every other scenario starts `active: false` until a viewer
explicitly activates it (the new Switch) or the page loads with a `?s=` URL
param. On a plain `/` boot with no `?s=` param — the state a first-glance
screenshot naturally captures — 2 of the fixture set's 3 rows are **genuinely,
correctly** inactive. Skimmed quickly, "2 of 3 switches sit in their off
position" reads as "the switches all look off," especially since the ON state's
visual cue (a dark, near-black filled track in light mode) doesn't carry an
obviously distinct hue the way, say, a colored badge does — it can visually
recede rather than pop at a glance in a small screenshot.

**Conclusion: no code fix is needed or proposed for Part A.** The Switch's wiring
is correct in both data flow and rendering. This spec's own FR-001 below exists to
formally lock this already-correct behavior in with a permanent regression test
(covering both an active and an inactive scenario together, so a future change
that silently inverted this would be caught immediately) — not because anything
needs to change.

### Part B/D/E — the row's actual current structure, re-read directly

Confirmed directly (not assumed from `036`'s own prior summaries) that the row,
as it exists today, is: an outer flex row (carrying the `035`/`036`-era border/
background status treatment) containing, in order: (1) a leading `[dot +
conditional "Loading…" text]` cluster; (2) an identity block (`flex-1`) with the
editable name `<input>` on top and the monospace path below; (3) a trailing
actions cluster (`shrink-0`) containing, in this exact order: the active/inactive
`Switch`, `ScenarioColorControl` (the color swatch), a two-button up/down reorder
column, the baseline Star-or-Star+"Baseline" control (fixed-width per this
session's own most recent fix), and a conditional remove button (`source ===
'handle'` only).

This confirms Part B's "move reorder controls to the row's leading edge, before
the status dot" is a real, well-defined relocation (not a redesign of the dot/
identity block themselves), and confirms Part D's baseline control already has a
known-good fixed-width technique (render identical markup, vary only visibility)
that the new single-chip design should reuse rather than reinvent, since it's
already proven to solve the exact "two states must occupy the same layout width"
problem drag reordering's own leading-edge relocation will re-encounter for the
reorder affordance itself.

### Part C — real drag-and-drop library evaluation

Fetched real, current npm registry data directly (not assumed from memory) for
every library actually in consideration:

| Package | Latest version | Deprecated? | React peer range | Last publish |
|---|---|---|---|---|
| `@dnd-kit/core` | `6.3.1` | No | `>=16.8.0` | 2024-12-05 |
| `@dnd-kit/sortable` | `10.0.0` | No | `>=16.8.0` (+ `@dnd-kit/core ^6.3.0`) | 2024-12-04 |
| `react-beautiful-dnd` | `13.1.1` | **Yes** — npm's own registry metadata marks it deprecated, pointing to its own GitHub issue announcing the project's retirement | `>=16.8.0` | (retired) |
| `react-dnd` | `16.0.1` | No | `>=16.14` | 2022-06-25 (2.5+ years stale at time of research) |

`react-beautiful-dnd` is eliminated outright — officially deprecated by its own
maintainer, and (confirmed via this project's own `CLAUDE.md`, `014-graphic-
walker-panel`'s testing notes) already present only as `@kanaries/
graphic-walker`'s own transitive dependency, never something this app should add
a second, direct dependency on for new work. `react-dnd` remains maintained but
is a lower-level toolkit (backend adapters, manual drag-preview wiring) with a
meaningfully staler publish history than `@dnd-kit`'s own actively-maintained
release cadence.

Fetched `@dnd-kit`'s own real, current accessibility documentation
(`dndkit.com/guides/accessibility`) directly, not assumed: it ships a built-in
`KeyboardSensor` (Enter/Space to pick up, arrow keys to move, Escape to cancel —
documented as adhering to W3C guidance), a live-region mechanism for real-time
screen-reader announcements on pick-up/move/drop/cancel (customizable via
`DndContext`'s own `announcements` prop, with the library's own docs
recommending position-based rather than index-based phrasing), and default ARIA
attributes on every draggable (`role="button"`, `aria-roledescription="draggable"`,
`aria-describedby` pointing at real, off-screen usage instructions).

**Recommendation: `@dnd-kit/core` + `@dnd-kit/sortable`.** Not deprecated,
actively maintained, React-18-compatible, and the only option among those
evaluated with real, documented, built-in keyboard/screen-reader support — a
requirement this spec's own FR-006 makes non-negotiable regardless of which
library implements it. Two new npm dependencies, no other packages needed (no
backend/adapter package, unlike `react-dnd`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A viewer reorders scenarios by dragging a row, or by keyboard, from a consistent leading-edge control (Priority: P1)

A viewer with several scenarios loaded wants to change the order they're
compared in. Today, this requires small up/down arrow buttons buried at the
trailing end of a row, after several other controls. This story moves that
capability to the row's leading edge — the first thing scanned, matching how the
status dot already claims that position for state — and adds direct drag
reordering as the primary interaction, with the existing arrow buttons kept as a
fully-functional, equally discoverable keyboard fallback right next to the new
drag handle.

**Why this priority**: Reordering is this tab's single most requested
interaction improvement in this session's own history (the arrows have existed
since `020-settings-modal` with no complaints about their function, only their
location and the lack of a faster, more direct interaction) — and every other
part of this feature (B/D/E) touches the same row without depending on this one
landing first, but this is the part with the most real user-facing value.

**Independent Test**: Load three or more scenarios, drag the second row above
the first via mouse, confirm the visual order and `appState.listByDisplayOrder()`
both reflect the new order immediately with no reload; separately, using only
the keyboard, focus a row's move-up control and press it, confirming the
identical reordering result. Fully testable without any of Parts D/E landing.

**Acceptance Scenarios**:

1. **Given** three scenarios in their default order, **When** a viewer drags the
   third row to the first position using the mouse, **Then** the row list
   re-renders in the new order immediately and `appState.listByDisplayOrder()`
   reflects it, with no page reload.
2. **Given** the same three scenarios, **When** a viewer tabs to a row's
   leading-edge move-up/move-down buttons and activates one with the keyboard,
   **Then** the same reordering occurs, identically to a drag — the arrows are a
   complete, independent path to the same outcome, not a degraded one.
3. **Given** a row is being dragged, **When** a screen reader is active,
   **Then** it announces the pick-up, the position changes while dragging, and
   the drop, using position-based (not index-based) language.
4. **Given** a scenario is already at the top (or bottom) of the list, **Then**
   its move-up (or move-down) control remains visibly present but disabled — the
   existing boundary behavior — and it cannot be dragged past that boundary
   either.
5. **Given** the reorder controls now sit at the row's leading edge, **When**
   any row is inspected in a screenshot, **Then** every other control's
   (status dot, identity block, Switch, swatch, baseline chip) horizontal
   position is unchanged in its own relative order and remains pixel-aligned
   across all rows, in both themes — the relocation must not reintroduce the
   class of column-misalignment bug this same row already had fixed twice this
   session.
6. **Given** a drag gesture is started and then released outside any valid drop
   target (e.g. the pointer leaves the row list entirely), **Then** the list
   returns to its original order with no partial or corrupted state.

---

### User Story 2 - A viewer sees and sets the baseline scenario via one self-explanatory chip (Priority: P2)

Today's baseline indicator is a Star icon that becomes a Star+"Baseline"-text
button on the current baseline row and an outline Star with a hover-only tooltip
on every other row — two different visual forms of the same underlying concept,
requiring a tooltip to explain the non-baseline case at all. This story replaces
both with one chip, in the identity block beside the scenario name, whose own
text always states either what's currently true ("Baseline") or exactly what
clicking it will do ("Set as baseline") — removing the icon-based ambiguity and
the tooltip dependency entirely.

**Why this priority**: A real, direct, self-explanatory label is a bigger
clarity win than this session's own prior two rounds of star/badge iteration
achieved — but it's still a presentational change to an already-functioning
interaction (the click-to-mark action itself is completely unchanged), so it
ranks behind the net-new reordering capability in Story 1.

**Independent Test**: Load three scenarios, confirm the current baseline's row
shows a filled chip reading exactly "Baseline" with no click affordance,
confirm every other row shows an outline chip reading exactly "Set as baseline"
that IS clickable, click one, and confirm the chip's filled/outline state and
text move to the newly-marked row. Fully testable without Stories 1/3.

**Acceptance Scenarios**:

1. **Given** a scenario is the current baseline, **Then** its row shows one
   solid/filled chip reading "Baseline", beside its name, with no hover tooltip
   and no click handler (clicking it is a no-op, matching the current baseline's
   own already-established "re-marking is a harmless no-op" precedent — it
   simply isn't wired to do anything additional, since it's already true).
2. **Given** a scenario is NOT the current baseline, **Then** its row shows one
   outline/muted chip reading "Set as baseline", clickable.
3. **Given** a viewer clicks a non-baseline row's chip, **Then** that scenario
   becomes the baseline (identical underlying `appState.setBaseline()` call the
   Star used to make) and the chip's filled state, text, and position move to
   that row — the previously-baseline row's chip reverts to the outline "Set as
   baseline" state.
4. **Given** the redesigned chip, **When** any row is inspected, **Then** no
   separate Star icon or Badge exists anywhere in the row — the chip is the
   ONLY baseline-related control, replacing both prior forms entirely.

---

### User Story 3 - A viewer discovers what the active/inactive toggle does via a tooltip (Priority: P3)

The active/inactive Switch (`036`'s own Part C) has no explanatory text
anywhere — a viewer must already know, or guess, that toggling it changes which
scenarios are included in comparisons/queries. This story adds a real hover
tooltip stating that effect directly.

**Why this priority**: Discoverability polish on an already-correct, already-
functional control (Part A's own investigation confirms the toggle itself needs
no fix) — valuable, but the lowest-impact of the three real user-facing changes
in this feature.

**Independent Test**: Hover a scenario row's active/inactive Switch and confirm
a tooltip appears explaining its effect on comparisons/queries, in both themes.
Fully testable without Stories 1/2.

**Acceptance Scenarios**:

1. **Given** any scenario row, **When** a viewer hovers the active/inactive
   Switch, **Then** a tooltip appears with text explaining that toggling it
   changes which scenarios are included in comparisons and queries.
2. **Given** the redesigned baseline chip from Story 2, **Then** it carries NO
   tooltip — its own label text is already self-explanatory, and adding one
   would be pure redundancy.

---

### Edge Cases

- **Dragging with exactly one scenario loaded**: no reorder affordance is
  meaningfully actionable (nothing to reorder against) — the drag handle and
  arrows may render but both are effectively no-ops; neither should error.
- **Dragging a scenario whose status is `registering` or `failed`**: reordering
  is a purely display-order concern, independent of status (the existing
  `appState.moveScenario()` already has no status gate) — a still-registering
  or failed scenario must remain fully draggable/reorderable, unchanged from
  today's arrow-button behavior.
- **Reordering never changes the automatic-default baseline** — this is an
  already-shipped, already-tested guarantee (`020-settings-modal`,
  `getBaseline()` never reads display order) and must continue to hold
  unchanged with drag added as a second way to reorder.
- **A local (`source: 'handle'`) scenario's remove button** sits at the
  trailing end, untouched by this feature — Part B relocates only the
  up/down reorder controls, not the remove action.
- **Touch-based dragging** (a tablet/touch-screen viewer): `@dnd-kit`'s own
  pointer sensor supports touch out of the box — the keyboard fallback (Story
  1, Scenario 2) remains the guaranteed-working path regardless of input
  device support, so this is not a blocking risk either way.
- **Rapid successive drags before a re-render settles**: `appState.
  moveScenario()`/the new drag-end handler must each resolve against the
  CURRENT display order at the moment they fire, not a stale snapshot —
  matching the existing arrow buttons' own already-correct behavior (each
  click reads `index`/`allScenarios.length` fresh from that render).

## Requirements *(mandatory)*

### Functional Requirements

**Part A — verification, no behavior change**

- **FR-001**: The active/inactive Switch's checked state MUST continue to
  render as exactly `scenario.active` (already correct, per this spec's own
  Research section) — a permanent regression test MUST assert this for both an
  active and an inactive scenario together, so a future accidental inversion is
  caught immediately.

**Part B — reorder controls relocated**

- **FR-002**: The move-up/move-down buttons MUST render at the row's leading
  edge, before the status indicator, replacing their current position in the
  trailing actions cluster.
- **FR-003**: The move-up/move-down buttons' own existing behavior (disabled at
  either boundary, calling `appState.moveScenario()`, unchanged `aria-label`
  text) MUST be preserved exactly — this is a relocation, not a redesign of the
  control itself.

**Part C — drag-and-drop reordering**

- **FR-004**: Every scenario row MUST be draggable via mouse/touch to reorder
  the list, calling the same underlying `appState.moveScenario()`-equivalent
  reordering mechanism the arrow buttons already use (a single source of truth
  for "what order is this," not two independent reordering code paths that
  could disagree).
- **FR-005**: The relocated move-up/move-down buttons (FR-002) MUST remain
  fully functional as a complete, independent, keyboard-accessible alternative
  to dragging — never degraded to a visual-only or drag-only affordance.
- **FR-006**: Drag interactions MUST provide keyboard support (pick up/move/
  drop/cancel without a pointer) and real-time screen-reader announcements of
  pick-up, position changes, and drop, using position-based phrasing.
- **FR-007**: A drag gesture released outside a valid drop target MUST leave
  the list in its original, unchanged order — never a partial or corrupted
  reorder.

**Part D — consolidated baseline chip**

- **FR-008**: The Star icon and the Star+"Baseline"-text control (both prior
  designs) MUST be removed entirely, replaced by one chip element beside the
  scenario name in the identity block.
- **FR-009**: On the current baseline's row, the chip MUST render filled/solid,
  with the literal text "Baseline", and MUST NOT be clickable (no `onClick`
  wired to it, matching the existing "re-marking the baseline is a no-op"
  precedent by simply not needing the click path at all).
- **FR-010**: On every other row, the chip MUST render outline/muted, with the
  literal text "Set as baseline", and clicking it MUST call the exact same
  `appState.setBaseline()` action the Star control previously called.
- **FR-011**: The chip MUST carry no tooltip — its own text is the complete
  explanation (Story 2, Scenario 1's own "no hover tooltip" requirement).

**Part E — active/inactive toggle discoverability**

- **FR-012**: Hovering the active/inactive Switch MUST show a tooltip
  explaining that it controls which scenarios are included in comparisons and
  queries.
- **FR-013**: The tooltip MUST NOT alter the Switch's existing `aria-label`
  text or its `checked`/`onCheckedChange` wiring — this is an additive
  discoverability affordance, not a functional change (consistent with FR-001's
  own "no behavior change" finding for this control).

**Cross-cutting**

- **FR-014**: Every row's own already-established status border/background
  treatment (`036`'s own Part C), color swatch, and remove-button-when-`source:
  'handle'` behavior MUST remain unchanged by this feature — only the reorder
  controls' position (Part B), the reordering mechanism (Part C), and the
  baseline indicator (Part D) change.
- **FR-015**: Every row's own controls MUST remain pixel-aligned across all
  rows in both themes after the Part B relocation — verified with real
  bounding-box measurements, not visual inspection alone, matching this
  session's own established verification discipline for this exact row.

### Key Entities

No new entity and no new field on the existing `Scenario` entity
(`state/appState.ts`) — `active`/`order`/`label`/`color`/`colorOverride`/
`status`/`source` all already exist and are read/written completely as-is.
This feature is a pure interaction/presentation layer change over already-
existing state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer can reorder a scenario via drag in a single continuous
  gesture, with the new order visible immediately and no page reload.
- **SC-002**: A viewer using only a keyboard can achieve the identical
  reordering outcome as a drag, with no loss of capability.
- **SC-003**: Glancing at any single row, a viewer can state — from the
  baseline chip's text alone, with no hover — either that it IS the baseline,
  or exactly what clicking it would do.
- **SC-004**: A viewer hovering the active/inactive Switch, without consulting
  any documentation, can state what toggling it affects.
- **SC-005**: Every non-reorder control's horizontal position is pixel-
  identical across every row, in both light and dark themes, after the Part B
  relocation — verified by direct measurement, not visual inspection.
- **SC-006**: The active/inactive Switch's checked state matches the real
  underlying `active` value for 100% of scenarios, on every render — a
  permanently regression-tested guarantee (FR-001), not a one-time
  confirmation.

## Assumptions

- Part A required no code change — confirmed via direct, live investigation
  (Research section above) that the Switch was never wired backwards; the
  "every row looks off" impression is explained by only `observed` being
  force-active by default on a plain `/` boot, a real, pre-existing, already-
  documented design decision from `035-scenario-label-color`, not a defect
  introduced by `036`.
- Improving the ON-state Switch's own visual contrast (so it "pops" more
  clearly at a glance) is a reasonable follow-up if real user feedback still
  finds it hard to distinguish, but is NOT requested by this feature and is
  therefore out of scope here.
- `@dnd-kit/core` + `@dnd-kit/sortable` are the two new npm dependencies this
  feature introduces (Research section above) — no backend/adapter package is
  needed, unlike `react-dnd`.
- The reorder mechanism's underlying data operation is unchanged
  (`appState.moveScenario()` or an equivalent single-source-of-truth
  reordering call) — only the trigger (drag, in addition to the existing
  arrows) and the arrows' own position change.
- A `source: 'handle'` (local) scenario's remove button, the color swatch, and
  the row's status border/background treatment are all unaffected by this
  feature — confirmed via the Research section's own current-structure re-read
  that these are independent regions of the row from what Parts B/C/D touch.
- Both themes (light/dark) must be verified for every visual change in this
  feature, matching this session's own already-established non-negotiable for
  this exact component.
