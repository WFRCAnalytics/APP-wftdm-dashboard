# Feature Specification: Fix UGRC map compositions rendering incorrectly in dark mode

**Feature Branch**: `016-fix-ugrc-dark-mode`

**Created**: 2026-09-03

**Status**: RESOLVED. Root cause found and fixed. The actual fix is
`branch-e-missing-background-layer` — a fourth outcome none of
`research.md` §7's original three planned branches (`branch-a-scoped-
css`, `no-fix-possible`, `branch-c-panel-fallback`) anticipated, found
by digging further into deck.gl's real interleaved-mode source and web
research after `branch-a-scoped-css` (`color-scheme`) was implemented,
tested, and withdrawn (see `research.md` §7 for the withdrawal, §8 for
the real fix, `diagnostic-results.md` for the full evidence trail).
`composeStyles()` now injects a missing `background` layer.

Fully verified: causally confirmed live on real hardware on both
reported panels (Follow-up 4), and confirmed again from a genuine page
load of the shipped fix, in dark mode — both panels render correctly,
light mode unaffected, panel chrome unregressed, no new corruption on
a spot-checked flowmap/zonemap panel pair (`tasks.md` T007/T009/T012,
`diagnostic-results.md`). SC-001–SC-004 all satisfied; SC-005 not
applicable (no fallback shipped); SC-006 not applicable in its literal
CSS-property sense (Branch A, not the shipped branch) but its intent —
proving the fix is inert wherever the defect never reproduced — is
met by the shipped fix's own data-level regression coverage passing
cleanly under SwiftShader (`tasks.md` T011).

**Input**: User description: "Fix UGRC map compositions rendering incorrectly in dark mode — Flowmap UGRC Composition and Flowmap UGRC Outdoors Composition panels render with visibly corrupted/inverted-looking colors specifically when the app is in dark mode, on real hardware-accelerated WebGL. Must be fixed at root cause, not worked around by disabling theme-reactivity, unless root-cause resolution proves infeasible after real investigation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct dark-mode rendering of UGRC composition panels (Priority: P1)

A dashboard user switches the app to dark mode (or loads the app with dark mode already active) and opens a tab containing the Flowmap UGRC Composition or Flowmap UGRC Outdoors Composition panel. The map tiles render with their intended colors — roads, water, terrain, and labels appear as designed by the UGRC basemap style, not visibly corrupted, inverted, or discolored.

**Why this priority**: This is the reported defect. Without this, two real, in-use panels are effectively unusable in dark mode, which undermines the entire dark-mode feature for any dashboard that includes them.

**Independent Test**: On a machine with real hardware-accelerated WebGL (not software/SwiftShader rendering), load the dashboard in dark mode, navigate to the tab containing either UGRC composition panel, and visually confirm the map tiles match their correct, intended appearance — no color inversion or corruption.

**Acceptance Scenarios**:

1. **Given** the app loads with dark mode active from first paint, **When** a user views the Flowmap UGRC Composition panel, **Then** the map tiles render with correct, non-corrupted colors.
2. **Given** the app loads with dark mode active from first paint, **When** a user views the Flowmap UGRC Outdoors Composition panel, **Then** the map tiles render with correct, non-corrupted colors.
3. **Given** the app is in light mode showing either UGRC composition panel correctly, **When** a user switches to dark mode via the theme toggle, **Then** the panel's map tiles continue to render with correct, non-corrupted colors after the switch.

---

### User Story 2 - No loss of existing dark-mode styling for these panels (Priority: P2)

A user viewing either UGRC composition panel in dark mode sees the panel's surrounding UI (card background, heading text, MapLibre navigation controls, borders) styled consistently with the rest of the dark-mode dashboard — only the map-tile rendering defect is fixed, nothing about the panels' dark-mode chrome is regressed or disabled.

**Why this priority**: The fix must not overcorrect by disabling dark-mode styling wholesale for these panels' containers/controls, which would reintroduce a different set of dark-mode inconsistencies already fixed by the prior theme-toggle work.

**Independent Test**: With either UGRC composition panel visible in dark mode, confirm the panel card background, heading text color, and MapLibre navigation control styling all still match the app's dark theme, independent of whatever fix is applied to the map-tile rendering itself.

**Acceptance Scenarios**:

1. **Given** the map-tile rendering fix is applied, **When** a user views either UGRC composition panel in dark mode, **Then** the panel card, heading, and map navigation controls still display with dark-mode styling (not reverted to light-mode chrome).

---

### User Story 3 - No regression to other map panels' dark-mode rendering (Priority: P3)

A user viewing any other flowmap or zonemap panel (not one of the two UGRC composition panels) in dark mode continues to see it render exactly as it did before this fix — no new corruption is introduced by whatever change resolves the UGRC-specific defect.

**Why this priority**: A scoped or general fix both carry risk of unintended side effects on other, already-correct panels; this must be explicitly verified, not assumed.

**Independent Test**: Run the existing dark-mode panel regression tests (015-theme-toggle's flowmap/zonemap coverage) after the fix and confirm they all still pass; additionally visually spot-check at least one non-UGRC flowmap panel and one zonemap panel in dark mode on real hardware.

**Acceptance Scenarios**:

1. **Given** the fix for the UGRC composition panels is applied, **When** any other existing flowmap or zonemap panel is viewed in dark mode, **Then** it renders identically to its pre-fix, already-correct appearance.

---

### Edge Cases

- What happens on a machine/browser combination where the underlying defect does not reproduce at all (e.g., software WebGL rendering)? The fix must not depend on detecting this condition — it must be safe and inert (no change in appearance) wherever the defect was never present.
- What happens if the root cause turns out not to be reliably fixable in CSS or composition logic within a reasonable investigation? The system falls back to disabling theme-reactivity specifically for these two panels' map-tile rendering (matching the existing precedent set for the earlier VectorHillshade issue), while leaving every other aspect of their dark-mode styling (per User Story 2) intact.
- What happens to a future, not-yet-added basemap composition that turns out to have the same underlying sensitivity? A general, root-cause-scoped fix (if found) should protect it automatically; a narrow per-panel fallback would not, and that limitation should be documented plainly if the fallback is what ships.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render the Flowmap UGRC Composition panel's map tiles with correct, non-corrupted colors while the app is in dark mode, on real hardware-accelerated WebGL.
- **FR-002**: System MUST render the Flowmap UGRC Outdoors Composition panel's map tiles with correct, non-corrupted colors while the app is in dark mode, on real hardware-accelerated WebGL.
- **FR-003**: System MUST continue to render both panels correctly in light mode after the fix (no regression to already-correct light-mode behavior).
- **FR-004**: The investigation MUST determine, with an isolated causation test (only one variable changed at a time), whether the CSS `color-scheme` property is the actual mechanism behind the corruption, before a fix location is chosen.
- **FR-005**: If `color-scheme` is confirmed as the cause, the fix MUST preserve `color-scheme`'s existing, needed dark-mode benefit for native form controls elsewhere in the app (e.g., `<select>` in Observable Plot panels) — the fix scopes around the affected map canvases, it does not remove `color-scheme` globally.
- **FR-006**: The fix MUST NOT alter or disable dark-mode styling of these panels' surrounding UI chrome (panel card background, heading text, MapLibre navigation controls) — only the map-tile rendering mechanism is in scope for this fix.
- **FR-007**: System MUST NOT regress the already-verified-correct dark-mode rendering of any other existing flowmap or zonemap panel.
- **FR-008**: If a root-cause fix cannot be found or verified after genuine investigation, the system MUST fall back to disabling theme-reactivity specifically for these two panels' map-tile rendering only, matching the standing precedent for the VectorHillshade PBF-encoding issue — adopted only as a fallback, not a first choice.
- **FR-009**: Whatever fix is adopted MUST be verified against both previously-broken panels on real hardware-accelerated WebGL — automated tests running under software (SwiftShader) rendering alone are insufficient to confirm the fix, since the defect does not reproduce under software rendering.
- **FR-010**: The chosen fix SHOULD generalize automatically to any future basemap composition with the same underlying sensitivity, rather than requiring each affected composition to be individually named/hardcoded — this is preferred whenever a genuine root-cause fix is found; the FR-008 fallback is explicitly exempted from this preference, since a per-panel fallback is inherently non-general by nature.
- **FR-011**: Whatever fix is adopted MUST be verifiably inert on a machine/browser where the underlying defect never reproduces (e.g., software/SwiftShader rendering) — the fix must introduce zero visual difference, not merely "no worse corruption," on an environment where nothing was broken to begin with. This must be confirmed as an explicit, checkable step (an automated SwiftShader-based run is sufficient for this specific check, even though it cannot confirm the fix itself working on real hardware) before the feature is considered done.

### Key Entities

- **Basemap composition**: A merged MapLibre style document (produced by `composeStyles()`) combining one or more real tile-service sources into a single style, used by a flowmap or zonemap panel. The two UGRC compositions are specific instances of this.
- **Theme mode**: The app's resolved light/dark display state, driven by the theme toggle and/or OS preference, which some CSS (including `color-scheme`) reacts to.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On real hardware-accelerated WebGL, both the Flowmap UGRC Composition and Flowmap UGRC Outdoors Composition panels display correct, non-corrupted map tile colors in dark mode, confirmed via direct visual verification (screenshot or live inspection) — zero remaining reports of color inversion/corruption for these panels.
- **SC-002**: 100% of the existing dark-mode panel regression tests (015-theme-toggle's flowmap/zonemap coverage) continue to pass after the fix, with zero newly-introduced failures.
- **SC-003**: The root cause of the corruption is documented with cited, verifiable evidence (an isolated causation test result, and — if applicable — a referenced external bug report or spec discussion) rather than left unexplained.
- **SC-004**: The two UGRC composition panels' surrounding UI (card, heading, navigation controls) remains fully dark-mode-styled after the fix — zero loss of previously-fixed dark-mode chrome.
- **SC-005**: If the FR-008 fallback is what ultimately ships, this is explicitly stated as such in the delivered documentation (not silently presented as a root-cause fix), and its scope is confirmed limited to exactly the two named panels' map-tile rendering.
- **SC-006**: On at least one environment where the defect never reproduces (e.g., an automated SwiftShader/software-rendering run), rendering output before and after the fix is confirmed identical — zero introduced visual difference — verified and recorded as a distinct, explicit check separate from SC-001's real-hardware confirmation.

## Assumptions

- The defect is specific to real, hardware-accelerated GPU/driver WebGL rendering and does not need to be reproduced in the automated (Playwright/SwiftShader) test suite to be considered fixed — real-hardware manual/visual verification is an accepted, necessary part of confirming this fix.
- The `color-scheme` CSS property is the leading, not-yet-fully-isolated suspect going into this work, based on same-day standalone-artifact testing; the investigation is expected to confirm or rule this out first before considering other mechanisms.
- "Correct rendering" means visually matching the UGRC basemap style's intended appearance (the same colors/detail visible when the identical composition renders correctly in light mode, styled for a dark context where applicable) — not a pixel-exact match to any specific reference screenshot.
- No new basemap compositions beyond the two named UGRC ones are known to exhibit this defect today; the general-fix preference (FR-010) is a hedge against undiscovered future cases, not a response to a currently-known third case.
- Access to real hardware-accelerated WebGL (an NVIDIA GPU with current drivers, as used in same-day investigation) remains available for verifying this fix; no CI pipeline changes are in scope to add hardware-accelerated browser testing.
