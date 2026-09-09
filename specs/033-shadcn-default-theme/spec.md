# Feature Specification: Full shadcn/ui Default-Theme Adoption

**Feature Branch**: `033-shadcn-default-theme`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Full shadcn/ui default-theme adoption — colors, typography, and complete input-component primitive set. Replace this app's current visual identity (WFRC-blue-anchored token system, Poppins/Inter/Fira Code typography) with shadcn/ui's own real, current default theme in full: the 'new-york' style variant's neutral/zinc color palette and default font stack, applied consistently across every existing component and panel type. Also build out the complete set of shadcn's standard form-input primitives this app doesn't have yet (Input, Select, Checkbox, Switch, RadioGroup, Textarea, Label, and any other standard primitive a real gap-check finds missing), matching their exact current real styling. Explicit, deliberate policy reversal: the design system's own 'never dilute WFRC blue' rule is suspended for this feature, on the user's own explicit instruction, pending a future, separate re-branding feature — the skill itself must state this plainly. Critical technical constraint requiring a decision before component work begins: this repo's components.json is pinned to shadcn's legacy 'default' style + Tailwind v3, while the wanted 'new-york' palette lives on shadcn's newer registry track (Tailwind v4) — investigate whether to migrate the underlying infrastructure or continue the established hand-port-each-component pattern, report the tradeoffs, recommend one, and flag it as a decision requiring confirmation. Required research: fetch shadcn's real current default theme (colors, fonts) directly rather than assuming from memory; audit components/ui/ for which form-input primitives already exist; and for every existing component and panel type, confirm which already-hard-won dark-mode fixes exist and verify empirically that new token values don't silently break them. Out of scope: WFRC-specific branding work (deferred to a separate future feature); any change to panel-internal data rendering logic (query building, chart data encoding)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app's colors match shadcn's own real default theme (Priority: P1)

A developer or reviewer opens the dashboard, in either light or dark mode, and every surface — buttons, cards, dialogs, the sidebar, panel chrome, and every one of the ten panel types' own chart/table/map rendering — uses shadcn/ui's own real, current default neutral/zinc color palette, not this app's existing WFRC-blue-anchored one.

**Why this priority**: This is the feature's entire premise. Nothing else in this feature has value without the underlying color identity actually changing, consistently, everywhere.

**Independent Test**: Inspect the computed color of any UI primitive or panel surface, in both themes, and confirm it matches shadcn's own real, directly-fetched default theme values — not a value carried over from the old WFRC token set.

**Acceptance Scenarios**:

1. **Given** the app is loaded in light mode, **When** any existing UI primitive's (button, card, dialog, tabs, etc.) background/foreground/border/accent colors are inspected, **Then** each matches shadcn's own real, current default light-theme value.
2. **Given** the app is loaded in dark mode, **When** the same primitives are inspected, **Then** each matches shadcn's own real, current default dark-theme value.
3. **Given** any of the ten panel types is rendered, **When** its own chrome and internal chart/table/map colors are inspected in both themes, **Then** none of them still resolve to a WFRC-brand-specific color value.

---

### User Story 2 - The app's typography matches shadcn's own real default font stack (Priority: P1)

The same developer or reviewer inspects heading, body, and code text anywhere in the app and finds shadcn's own real, current default font stack in use — not this app's existing Poppins/Inter/Fira Code selection.

**Why this priority**: Typography is as core to "the app's visual identity" as color, and the user named it explicitly alongside color as a first-class part of this adoption — without it, the retheme is only half-done.

**Independent Test**: Inspect the computed `font-family` of a heading, a body paragraph, and a code/mono element anywhere in the app, in both themes, and confirm each matches shadcn's own real, directly-fetched default font stack for the adopted style variant.

**Acceptance Scenarios**:

1. **Given** a page-level heading, panel title, and body text are rendered, **When** their computed font-family is inspected, **Then** each matches shadcn's own real default stack, not Poppins/Inter.
2. **Given** a monospace/technical text element (e.g. a scenario's file path), **When** its computed font-family is inspected, **Then** it matches shadcn's own real default mono stack, not Fira Code.

---

### User Story 3 - The complete set of standard form-input primitives exists (Priority: P2)

A developer building a future feature that needs a text field, a dropdown, a checkbox, a toggle, a radio group, a multi-line text area, or an accessible form label can reach for an existing, already-correctly-styled primitive in this app's component library instead of building one from scratch.

**Why this priority**: Real, valuable groundwork for future feature work, but secondary to the core visual-identity change (User Stories 1-2) — this is additive breadth, not a correction to something already shipped.

**Independent Test**: Render each of the named primitives (and any additional one a real gap-check finds missing) on a page; confirm each is interactive, accessible, and its computed appearance matches shadcn's own real, current default styling, in both themes.

**Acceptance Scenarios**:

1. **Given** the component library, **When** it is inspected for Input, Select, Checkbox, Switch, RadioGroup, Textarea, and Label, **Then** every one of the seven exists, is usable, and matches shadcn's own current default styling in both themes.
2. **Given** a real, direct audit of shadcn's own current standard primitive set against what this app already has, **When** the audit finds an additional standard form-input primitive missing beyond the seven named above, **Then** it is also built to the same standard.

---

### User Story 4 - Every previously-fixed dark-mode behavior still works (Priority: P2)

A reviewer who already knows this project's own history of hard-won dark-mode fixes (Plotly's transparent chart backgrounds, Observable Plot's tooltip contrast, Sankey's node-label legibility, map controls' icon inversion, native form-control legibility, dialog text-color inheritance) re-checks each one after the retheme and finds every one of them still correct — none silently reintroduced by the new token values.

**Why this priority**: A retheme that quietly reintroduces a bug this project already spent real effort fixing once is a regression, not progress — this verification is what keeps User Stories 1-2 from being a net loss.

**Independent Test**: For each of this project's own documented dark-mode fixes, re-run the specific check that originally confirmed it (a computed-style assertion, a visual comparison, or the existing automated test that covers it) against the retheme and confirm it still passes.

**Acceptance Scenarios**:

1. **Given** a Plotly panel in dark mode, **When** its chart background is inspected, **Then** it remains transparent/token-derived, never the library's own opaque white default.
2. **Given** an Observable Plot panel's tooltip in dark mode, **When** its contrast is inspected, **Then** it remains legible, not silently reverted to a low-contrast default.
3. **Given** a Sankey panel in dark mode, **When** its node labels are inspected, **Then** they remain legible via the existing `currentColor` mechanism, not reverted to black-on-dark.
4. **Given** a map panel's navigation/3D controls in dark mode, **When** their icons are inspected, **Then** the existing icon-inversion/legibility handling still applies correctly.

---

### User Story 5 - The design-system documentation states the policy reversal plainly (Priority: P3)

A future developer or reviewer reads this project's own design-system reference and immediately understands that its brand-consistency rule is not being followed right now, why, and that it is expected to return in a later, dedicated feature — rather than discovering a live contradiction between the documented rule and the shipped app with no explanation.

**Why this priority**: Important for keeping this project's own standing documentation trustworthy going forward, but it's a documentation update, not a user-facing change — lowest priority of the five.

**Independent Test**: Read the design-system reference's brand-identity guidance after this feature ships; confirm it explicitly states the suspension, the reason, and that a future re-branding feature will revisit it — not silently altered or left contradicting reality.

**Acceptance Scenarios**:

1. **Given** the design-system reference document, **When** its brand-identity section is read after this feature ships, **Then** it states plainly that the "never dilute the brand color" rule is suspended for this specific feature, on explicit direction, pending a future separate re-branding feature.

---

### Edge Cases

- What happens to code that references a WFRC-brand-specific color variable *by name* (not through the semantic primary/accent tokens) — e.g. a table's cell-shading anchor or a choropleth map's fill-color anchor? These are in scope and must be updated to derive from the new default theme instead, so no WFRC-brand-specific reference remains live anywhere this feature's scope covers.
- What happens to the categorical chart-series color set already established (and already deliberately NOT brand-derived, per this project's own prior, separate, explicit exception)? It is unaffected by this feature — not a brand-color reference to change, and not something this feature was asked to revisit.
- What happens to the deployer-configurable logo/title mechanism? Untouched — that mechanism is explicitly WFRC-branding-adjacent work deferred to a future feature, not part of this one.
- What happens if a real, direct audit finds a shadcn default theme token this app currently has no equivalent slot for at all? It is added following this project's own established token-addition discipline, not skipped or approximated.
- What happens if the underlying shadcn CLI/registry-track mismatch is left unresolved and a component is hand-ported instead? The resulting component's styling must still be verified to genuinely match shadcn's real current default output — a hand-port that merely looks plausible, unverified against the real source, does not satisfy this feature's own requirements.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app's semantic color tokens (background, foreground, primary, secondary, accent, muted, destructive, border, ring, card, popover, and any other existing semantic token) MUST match shadcn/ui's own real, current default "new-york" style neutral/zinc theme values — confirmed by direct retrieval of shadcn's own real theme source, not assumed from memory — in both light and dark mode.
- **FR-002**: The app's typography (heading, body, and monospace/code font families) MUST match shadcn/ui's own real, current default font stack for the adopted style variant — confirmed by direct retrieval, not assumed.
- **FR-003**: The component library MUST include working, correctly-styled Input, Select, Checkbox, Switch, RadioGroup, Textarea, and Label primitives.
- **FR-004**: The component library MUST include any additional standard shadcn form-input primitive that a direct, real audit of the existing component library against shadcn's own current registry finds missing beyond the set named in FR-003.
- **FR-005**: Every UI primitive component already in the app (button, card, chart, dialog, dropdown menu, separator, sidebar, tabs, tooltip) MUST visually reflect the new default theme's colors and typography consistently, in both light and dark mode.
- **FR-006**: Every one of the app's panel types MUST visually reflect the new default theme wherever its own internal styling currently derives from the app's brand/primary/accent tokens.
- **FR-007**: Every one of this project's own previously-established, dark-mode-specific fixes (including, at minimum, Plotly's transparent chart backgrounds, Observable Plot's tooltip contrast, Sankey's node-label legibility via `currentColor`, map controls' icon-inversion handling, native form-control legibility, and dialog text-color inheritance) MUST continue to work correctly after this feature ships — each verified directly against the retheme, not assumed unaffected.
- **FR-008**: Any code that currently references a WFRC-brand-specific color value by name (not merely through a semantic token) MUST be updated to derive from the new default theme instead, so no such reference remains live within this feature's scope.
- **FR-009**: The project's own design-system reference documentation MUST be updated to state plainly that its brand-consistency rule is deliberately suspended for this feature, on explicit direction, pending a future, separate re-branding feature.
- **FR-010**: The technical approach for reconciling this project's current component-tooling configuration with the adopted theme's real source track MUST be explicitly researched, its real tradeoffs reported, a recommendation made, and the choice confirmed before any component's styling is changed.
- **FR-011**: The deployer-configurable branding mechanism (logo/title) and its existing behavior MUST NOT be altered by this feature.
- **FR-012**: No panel's data-fetching, query-building, or chart-data-encoding logic MUST be altered by this feature — this feature changes visual presentation only.

### Key Entities

- **Design Token**: A named, semantic style value (a color, a font family, a spacing/shadow value) consumed by components and panels; this feature changes the *values* of existing color/typography tokens, not their names/roles.
- **UI Primitive Component**: A reusable, styled building block (e.g. Button, Card, the new Input/Select/etc.) shared across the app.
- **Panel Type**: One of the ten registered dashboard panel types, each with its own internal styling that must reflect the new theme.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every existing UI primitive component and all ten panel types render using the new default theme's real, confirmed color values, in both light and dark mode, verified by direct computed-style inspection.
- **SC-002**: All seven initially-named form-input primitives, plus any others a real gap-check adds, exist, render correctly, and are interactive, matching shadcn's own current default appearance, in both themes.
- **SC-003**: 100% of this project's own previously-documented, hard-won dark-mode-specific fixes are individually re-verified as still correct after the retheme — zero silent regressions found.
- **SC-004**: Zero remaining live reference to a WFRC-brand-specific color value exists anywhere within this feature's scope, outside the explicitly-deferred branding mechanism.
- **SC-005**: A reader of the design-system reference documentation can state, without ambiguity, that brand-consistency is intentionally suspended for this feature and will be revisited in a later, separate feature.

## Assumptions

- The real, current shadcn/ui default theme values (colors and fonts) are fetched directly from shadcn's own live source during planning — not assumed from training-data memory — per the user's own explicit instruction.
- The decision between performing a one-time Tailwind v3→v4/registry-track infrastructure migration versus continuing this project's established hand-port-each-component pattern is resolved during planning, with real tradeoffs researched and reported, and confirmed with the user before any component's styling work begins — this specification deliberately does not pre-decide it, since it is an implementation approach, not a description of the desired outcome.
- This project's existing categorical chart-series palette (`--chart-1`..`--chart-5`) is not WFRC-brand-derived already (a separate, prior, explicit exception on record) and is out of scope for this feature — left unchanged.
- "Build" a missing form-input primitive means adding a reusable, correctly-styled component to the library; wiring it into a brand-new dashboard feature or form is not required by this feature unless an existing consumer already needs one.
- Every direct (non-semantic-token) reference to a WFRC-brand-specific color value elsewhere in the codebase (e.g. a table's cell-shading anchor, a choropleth map's fill-color anchor, a Sankey diagram's categorical fallback sequence) is in scope and updated to derive from the new default theme.
- The `028-dashboard-branding` configurable logo/title mechanism itself (its code and optional fields) is unmodified by this feature — only the surrounding UI's own color and typography change.
