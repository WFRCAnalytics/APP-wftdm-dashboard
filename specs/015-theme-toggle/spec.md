# Feature Specification: Light/Dark Theme Toggle

**Feature Branch**: `015-theme-toggle`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "Add a real, user-facing control to switch the dashboard's theme,
defaulting to the user's OS/system preference — closing a gap that's existed
since 002-design-tokens first built the full light/dark token system with no
way to actually trigger dark mode anywhere in the app."

## Research findings this spec relies on

Resolved directly from this project's own real, current source and prior
spec history, not assumed:

1. **The token system is real and complete; the trigger is the missing
   piece.** `src/styles/tokens.css` (`002-design-tokens`) defines a full
   `:root` (light) block and a separate `.dark` block, and every semantic
   pairing was independently verified against WCAG 2.1 AA in both modes
   (`specs/002-design-tokens/research.md` §4, `spec.md` SC-001, enforced by
   a Vitest contrast-ratio test). `tailwind.config.js` sets `darkMode:
   ['class']` — every token-driven utility class already resolves correctly
   the instant `.dark` is present on `document.documentElement`. Nothing in
   the token layer needs to change for this feature.
2. **`useColorScheme()` is the anticipated, already-built read side.**
   `src/hooks/useColorScheme.ts` (`011-basemap-style-system`) is a
   `useSyncExternalStore` hook that observes `document.documentElement`'s
   `class` attribute via `MutationObserver` and returns `'light' | 'dark'`.
   Its own header comment already states the finding this feature acts on:
   "does NOT control theme, only reads it, since no real theme-toggle UI
   exists in the app yet ... the only place `.dark` is toggled today is
   `src/demo/DesignTokenDemo.tsx`, a deliberately out-of-band demo page."
   `014-graphic-walker-panel` already consumes this hook (`GraphicWalkerPanel.tsx`'s
   `appearance={colorScheme}` wiring) specifically so it would pick up a
   real toggle with zero further change once one existed — confirmed still
   true by inspection of both files today.
3. **The hook needs no change to compose with an external toggle.**
   `MutationObserver` fires on any mutation of the watched attribute
   regardless of what code performed it — confirmed by reading the
   implementation directly (`attributeFilter: ['class']`, no dependency on
   *how* the class changes). A toggle that simply adds/removes `.dark` on
   `document.documentElement` is therefore the correct, minimal write-side
   counterpart; it is not a parallel or competing mechanism.
4. **Tailwind's `class` strategy means the app currently has zero automatic
   OS-preference behavior.** Confirmed by reading `tokens.css` end to end:
   there is no `@media (prefers-color-scheme: dark)` block anywhere in it,
   and a project-wide search for `prefers-color-scheme` in `src/` returns no
   matches outside one explanatory code comment. Under `darkMode: ['class']`,
   Tailwind never applies dark-mode utility classes from the OS preference
   on its own — that only happens if something in application code reads
   `window.matchMedia('(prefers-color-scheme: dark)')` and applies the
   `.dark` class itself. Today nothing does. This is the real, confirmed gap
   this feature closes — the app renders light unconditionally today, even
   on a system set to dark, with the sole exception of the out-of-band demo
   page.
5. **Constitution Principle VI is an absolute, not a soft default.**
   `.specify/memory/constitution.md`: "The app MUST NOT use `localStorage`
   or `sessionStorage` for any state." — no carve-out for user preferences.
   A viewer's manual theme choice therefore cannot survive a page reload
   under this project's current architecture; this is stated as an accepted,
   documented limitation below (Assumptions), not something this feature
   works around.
6. **Placement precedent.** `src/layout/shell.tsx`'s header already lays out
   `NavBar` (tabs, left) and `ScenarioLoader` (right) in a single
   `justify-between` row (`009-scenario-manager` established this
   right-side-of-header placement for its own top-level, dashboard-wide
   control). A theme toggle — also dashboard-wide, not panel-specific — fits
   the same right-hand group, matching the user's own stated top-right
   preference.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dashboard opens matching the viewer's system theme (Priority: P1)

A viewer with their OS set to dark mode opens the dashboard for the first
time (or after a reload) and sees it rendered in dark mode immediately, with
no manual action — the reverse is equally true for a viewer on a light-mode
system.

**Why this priority**: This is the actual gap named in the feature request:
today the app is always light regardless of the OS. Closing this alone
already delivers the feature's primary value even before any manual control
exists.

**Independent Test**: With the OS/browser's `prefers-color-scheme` set to
`dark`, load the app fresh and confirm every already-built dark-mode token
pairing is in effect (background, text, card, borders) with no manual
interaction. Repeat with `prefers-color-scheme: light` and confirm the light
tokens apply.

**Acceptance Scenarios**:

1. **Given** a browser reporting `prefers-color-scheme: dark`, **When** the
   dashboard is loaded, **Then** `document.documentElement` carries the
   `dark` class and every panel/chrome element renders using the existing
   `.dark` token values.
2. **Given** a browser reporting `prefers-color-scheme: light` (or no
   preference), **When** the dashboard is loaded, **Then** `document
   .documentElement` does not carry the `dark` class and the existing
   `:root` (light) token values apply.
3. **Given** the dashboard is already open and following the system
   preference, **When** the OS-level preference changes (e.g., the
   viewer's system switches to dark at sunset), **Then** the dashboard's
   appearance updates live, with no reload required.

---

### User Story 2 - Viewer manually overrides the theme (Priority: P2)

A viewer whose system is set to one appearance wants to view the dashboard
in the other — for example, a light-mode-system viewer working in a dark
room switches the dashboard to dark manually, independent of their OS
setting.

**Why this priority**: Valuable, real control that closes the second half
of the gap (an OS-following default alone still leaves someone stuck if
their own OS setting doesn't match what they want to see right now) — but
subordinate to P1, since a correct OS-following default already fixes the
worse of the two problems (always-wrong-for-half-of-viewers) on its own.

**Independent Test**: With any OS preference active, open the visible
toggle control, select the opposite explicit mode, and confirm the whole
app (chrome and every open panel, including a `graphic-walker` panel) 
restyles immediately and stays on that choice even if the OS preference
changes afterward.

**Acceptance Scenarios**:

1. **Given** the dashboard is showing the system-matched theme, **When**
   the viewer selects "Light" (or "Dark") from the toggle, **Then** the
   dashboard immediately switches to that exact appearance regardless of
   the current OS preference.
2. **Given** the viewer has manually selected "Dark", **When** the OS-level
   preference subsequently changes, **Then** the dashboard's appearance
   does NOT change — the manual choice keeps priority until the viewer
   picks "System" again.
3. **Given** any already-mounted panel that consumes `useColorScheme()`
   (e.g., a `graphic-walker` panel), **When** the viewer manually switches
   modes, **Then** that panel restyles in lockstep with the rest of the
   app, with no code change needed in the panel itself and no loss of its
   in-progress local state (e.g., an in-progress chart being built).

---

### User Story 3 - Viewer returns to following the system automatically (Priority: P3)

A viewer who previously forced a specific appearance decides to go back to
"whatever my system says" instead of continuing to manage it by hand.

**Why this priority**: Completes the three-state model — without it, a
viewer who overrides once has no way back to auto-following except
reloading the page (which happens to work today only because overrides
aren't persisted, an implementation detail a viewer shouldn't have to know
or rely on).

**Independent Test**: After manually selecting "Light" or "Dark", select
"System" again and confirm the dashboard's appearance immediately reflects
the current OS preference and resumes tracking it live.

**Acceptance Scenarios**:

1. **Given** the viewer has manually selected "Dark" on a light-preference
   system, **When** the viewer selects "System", **Then** the dashboard
   immediately switches back to light (matching the OS) and resumes
   tracking further OS-level changes live.
2. **Given** the toggle control, **When** the viewer inspects it at any
   time, **Then** it visibly indicates which of the three modes (System /
   Light / Dark) is currently active — not just the resulting light/dark
   appearance.

---

### Edge Cases

- What happens on page reload after a manual override? → The override does
  not survive (Principle VI forbids persisting it); the toggle resets to
  "System" and the dashboard shows whatever the OS preference resolves to
  at that moment. This is a real, accepted, documented limitation of this
  feature under this project's current architecture — not a bug to be
  silently worked around later.
- What happens if the viewer has the dashboard open in two browser tabs and
  manually overrides the theme in one? → Each tab holds its own independent,
  in-memory mode; the other tab is unaffected (matches the no-persistence,
  no cross-tab-sync-channel constraint above).
- What happens in a browser/environment where `window.matchMedia` is
  unavailable? → The app fails soft to the existing light `:root` token
  defaults (the same behavior as today, before this feature exists) rather
  than throwing or leaving the appearance undefined.
- What happens to a panel with unsaved local UI state (an in-progress
  `graphic-walker` chart, a table's current sort/page/search) when the
  theme mode changes? → Purely a visual restyle via the existing
  `useColorScheme()`/token mechanism; no panel remounts and no in-progress
  state is lost.
- What happens to panels that do not consume `useColorScheme()` at all
  (every panel type except `graphic-walker` today)? → They already inherit
  the light/dark token values through ordinary CSS custom-property
  resolution (background, borders, card chrome, text) with no code of their
  own required; this feature does not need to touch them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a visible theme control in the app
  shell's header, in the top-right region alongside the existing scenario
  controls (`ScenarioLoader`).
- **FR-002**: The control MUST offer three modes: System, Light, and Dark.
- **FR-003**: On load, the system MUST default to System mode, which MUST
  resolve to the browser-reported `prefers-color-scheme: dark` value at
  that moment (dark if the OS reports dark, light otherwise).
- **FR-004**: While in System mode, if the OS-level `prefers-color-scheme`
  changes while the dashboard remains open, the system MUST update the
  applied appearance live, without requiring a reload.
- **FR-005**: When the viewer selects Light or Dark explicitly, the system
  MUST apply that appearance immediately by adding/removing the existing
  `dark` class on `document.documentElement` (the same class
  `useColorScheme()` already observes), and MUST stop following OS-level
  preference changes until System mode is re-selected.
- **FR-006**: The system MUST implement this entirely through in-memory
  state and DOM class mutation — MUST NOT introduce `localStorage`,
  `sessionStorage`, cookies, or any other persistence mechanism to remember
  a viewer's manual choice (constitution Principle VI).
- **FR-007**: A manual override MUST NOT survive a page reload; on reload,
  the control MUST reset to System mode and the dashboard MUST reflect the
  current OS preference.
- **FR-008**: The control MUST visibly indicate which of the three modes is
  currently active, not just the resulting light/dark appearance.
- **FR-009**: Every existing and future consumer of `useColorScheme()`
  (e.g., `GraphicWalkerPanel`) MUST reflect a manual toggle change exactly
  as it already reflects an OS-preference-driven change today, with no
  change required to `useColorScheme()` itself or to those consumers.
- **FR-010**: The system MUST NOT modify `tokens.css` or any existing
  light/dark color value — this feature adds only the missing trigger
  mechanism for an already-complete, already-WCAG-AA-verified token system.
- **FR-011**: Switching theme mode MUST NOT remount, reset, or otherwise
  discard any panel's own in-progress local UI state (e.g., an in-progress
  `graphic-walker` chart, a table's current sort/page/search) — the effect
  MUST be a pure visual restyle.

### Key Entities

- **Theme Mode**: One of System, Light, or Dark — the viewer's currently
  selected control state. Held in memory only, scoped to the current page
  session/tab; not persisted.
- **Effective Theme**: The resolved `light`/`dark` appearance actually
  applied to the DOM at any moment — equal to the live OS preference when
  Theme Mode is System, or equal to the explicit choice when Theme Mode is
  Light or Dark. This is the same value `useColorScheme()` already reports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a fresh load with no prior interaction, the dashboard's
  appearance matches the OS-level light/dark preference 100% of the time
  (today: 0% — the app is always light regardless of OS).
- **SC-002**: A viewer can switch between System, Light, and Dark in a
  single interaction each time, with the entire visible app (chrome and
  every open panel) restyled with no perceptible flash of incorrect-theme
  content.
- **SC-003**: A viewer who has not manually overridden the theme sees the
  dashboard follow a live OS-level preference change within the same
  session, with no reload required, 100% of the time.
- **SC-004**: Switching theme mode never discards a viewer's in-progress
  work in any panel — 0% state loss across any manual theme switch,
  verified across all panel types that hold local UI state.
- **SC-005**: Every previously-shipped panel type, plus the existing demo
  page, continues to render correctly in both light and dark after this
  feature ships — zero visual regressions to the already-verified WCAG-AA
  token pairings.

## Assumptions

- **Three-state control (System/Light/Dark), not a plain two-state toggle**
  — a deliberate choice, not an arbitrary one. A two-state light/dark
  toggle cannot represent "follow the system" as a distinct state at all;
  combined with Principle VI's no-persistence constraint, a plain two-state
  toggle would silently revert to whatever the OS says on every reload with
  no way for the viewer to tell "I'm following the system" from "I
  overrode it and it happens to match right now." A three-state control
  makes that reversion legible and expected instead of surprising, and
  matches real precedent for exactly this pattern (e.g., GitHub's own
  System/Light/Dark appearance setting).
- **Manual overrides cannot survive a reload — stated plainly as a real,
  accepted limitation**, not a defect to route around. Constitution
  Principle VI forbids `localStorage`/`sessionStorage` outright with no
  exception carved out for user preferences; per-tab sessionStorage would
  have been the obvious loophole and is explicitly rejected as exactly
  that — a loophole around the constitution's own explicit prohibition,
  not a legitimate implementation path. Encoding the choice in the URL
  (a query parameter) was also considered and rejected as out of scope for
  this feature: it would need its own design (shareable-link implications,
  interaction with the existing `?s=` scenario param) disproportionate to
  what was actually requested.
- **`useColorScheme()` needs no code changes.** Confirmed by reading its
  implementation directly: its `MutationObserver` reacts to any mutation of
  `document.documentElement`'s `class` attribute regardless of what changed
  it. This feature is purely the write-side counterpart already anticipated
  by that hook's own design and header comment.
- **Exact placement inside the header's right-hand group** (immediately
  next to `ScenarioLoader`, both wrapped by the same right-aligned group, or
  as a sibling immediately after it) is left to the planning/implementation
  phase; this spec fixes only the top-right region, matching the user's
  stated preference and `009-scenario-manager`'s own precedent for
  dashboard-wide (not panel-specific) header controls.
- **No cross-tab synchronization.** Each browser tab holds its own
  independent in-memory Theme Mode; opening a second tab does not inherit
  the first tab's manual override. This follows directly from the
  no-persistence constraint — there is no permitted shared channel (Web
  Storage, cookies, etc.) to synchronize through, and building one (e.g.,
  `BroadcastChannel`) is disproportionate to what was requested and is
  called out as explicitly out of scope.
- **Icon set**: `lucide-react` (already the constitution-mandated icon set,
  confirmed present in `package.json`) ships icons suitable for a
  three-state System/Light/Dark control; no new icon dependency is needed.
- **`matchMedia` listener lifecycle — decided now, not left to whatever the
  first implementation attempt happens to do.** FR-004/FR-005 require the
  app to live-follow OS preference changes in System mode and to stop doing
  so in manual mode. Two ways to satisfy that are possible: (a) keep one
  `MediaQueryList` `'change'` listener attached for the toggle control's
  entire lifetime, with its callback checking current Theme Mode and
  becoming a no-op when it isn't System, or (b) attach the listener only
  while Theme Mode is System and tear it down on every transition away from
  System, re-attaching on any transition back. This spec commits to **(b)**:
  scope the listener's attach/detach to Theme Mode itself (e.g., a
  dependency-array-driven effect keyed on the mode, cleaning up its own
  listener), not a long-lived listener gated by a no-op check. Reasoning:
  (b) matches this project's own established effect-cleanup convention —
  scope a subscription's lifetime to the condition that makes it valid
  rather than leaving it attached and short-circuiting inside the callback
  (the same shape `panels/FlowMapPanel.tsx`'s basemap-application effect and
  `panels/basemap`'s own resolution already follow, keyed on a value that
  changes rather than an always-on listener with an internal guard) — and it
  avoids a stale-closure hazard (b) doesn't have: a listener callback that
  captures Theme Mode by closure at attach time would read a stale value on
  every subsequent toggle unless routed through a ref purely to work around
  that, which (b) has no need for since each mode transition gets its own
  fresh closure. `research.md` MUST record this as an explicit Decision
  entry (with this same Rationale/Alternatives-considered shape used
  elsewhere in that file) when `/speckit-plan` runs, not leave it implicit.
- **Does not include** the viewer-picks-tables Explore mode redesign — a
  separate, later feature, out of scope here.
