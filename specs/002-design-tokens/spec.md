# Feature Specification: Design Token and Component Foundation

**Feature Branch**: `002-design-tokens`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "Design token and component foundation (no dashboard UI consumption yet). Establish the visual foundation before any real panel/layout work: fetch and reconcile WFRC brand values from the canonical wfrc-brand repo against APP-Project-Scoresheet's src/theme/tokens.css and research.md §10 (already WCAG 2.1 AA adjusted) — document any deltas; set up Tailwind CSS + shadcn/ui (CLI-generated component source, not an installed black-box library) + Radix primitives + lucide-react icons, per constitution Principle VI (amended); define CSS custom properties in :root mapping WFRC's brand tokens onto shadcn's semantic role convention (background/foreground/card/primary/secondary/muted/accent/destructive/border/ring/radius), documented as its own artifact — this is also the customization boundary for other agencies: swap the :root values, not the components; wire tailwind.config.js to reference those CSS variables, not hardcoded hex values; verify WCAG 2.1 AA contrast for every semantic pairing in light and dark mode, don't just inherit Scoresheet's numbers blindly; generate 3-4 shadcn components as a first proof (e.g. Button, Card, Tabs, Tooltip) and render them on a minimal, throwaway demo page to visually confirm the token pipeline works end to end — no real dashboard layout, no panel registry, no scenario data, that's the next feature. Document the brand-token-to-shadcn-role mapping and the multi-agency customization approach as a new ARCHITECTURE.md subsection."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer building the next dashboard feature inherits a working, WFRC-branded component foundation (Priority: P1)

Whoever builds the next feature (panel/layout work) can pull in a design
token set and a small set of working UI components that already render in
WFRC's brand colors and typography, instead of inventing color, spacing, or
component decisions from scratch at that point.

**Why this priority**: This is the entire point of the feature — without a
working, verified foundation, every subsequent UI feature either blocks on
these decisions or makes them ad hoc and inconsistently. Nothing else in this
spec matters if this isn't true.

**Independent Test**: Load the throwaway demo page with no scenario data,
panel registry, or dashboard layout present; visually confirm the sampled
components (e.g. Button, Card, Tabs, Tooltip) render using WFRC's brand
colors and typography, not framework defaults.

**Acceptance Scenarios**:

1. **Given** the demo page is loaded, **When** it renders, **Then** every
   sampled component visibly reflects the reconciled WFRC brand tokens
   (color, typography) rather than any library's default styling.
2. **Given** the token pipeline (brand values → CSS custom properties →
   Tailwind config → component styling) is wired end to end, **When** a
   component is rendered, **Then** its styling traces back to a token
   definition, not a hardcoded value in the component itself.

---

### User Story 2 - Accessibility is verified before any dashboard content is built on top of the tokens (Priority: P1)

Every semantic color pairing (foreground/background, primary/primary-
foreground, and so on) meets WCAG 2.1 AA contrast in both light and dark
mode, checked now, before any real panel or layout work depends on these
colors.

**Why this priority**: Retrofitting accessibility after dozens of panels
already consume a token is far more expensive than verifying it once at the
foundation. This has to be true before Story 1's foundation is trustworthy
to build on.

**Independent Test**: For every defined semantic token pairing, in both
light and dark mode, compute the contrast ratio and confirm it meets or
exceeds the WCAG 2.1 AA threshold for its usage (4.5:1 for normal text, 3:1
for large text/UI components).

**Acceptance Scenarios**:

1. **Given** the full set of semantic token pairings, **When** each is
   checked in light mode, **Then** 100% meet WCAG 2.1 AA contrast for their
   usage.
2. **Given** the same set of pairings, **When** each is checked in dark
   mode, **Then** 100% independently meet WCAG 2.1 AA contrast — a pairing
   passing in one mode does not exempt it from passing in the other.
3. **Given** a brand value inherited from an existing reference
   implementation fails contrast for this app's actual usage, **When** it's
   identified, **Then** it is adjusted to pass rather than shipped as a
   known failure.

---

### User Story 3 - Restyling for a different brand or agency touches only token values, never component code (Priority: P2)

A future WFRC brand refresh, or a different agency adopting this codebase,
can be accommodated by editing the root-level token definitions alone — no
component source changes required.

**Why this priority**: This is a stated design goal (the customization
boundary), but the app only ever needs to serve WFRC today — it's real value
depends on Story 1 and 2 already being solid, and no functionality
regresses if this boundary is slightly imperfect on day one.

**Independent Test**: Change one or more root-level token values to
arbitrary substitute values (not a real second agency's actual brand) and
confirm the demo page's rendered components visually reflect the change with
zero edits to any component file.

**Acceptance Scenarios**:

1. **Given** a root-level token value is changed, **When** the demo page is
   reloaded, **Then** every component consuming that token's semantic role
   reflects the new value, with no component source edited.
2. **Given** the full set of semantic roles a component might consume,
   **When** a component is inspected, **Then** it references semantic
   tokens (e.g. `bg-primary`) rather than literal color values.

---

### User Story 4 - Brand-value provenance is documented, not just implied by code (Priority: P3)

Anyone reviewing the design tokens later can tell, from documentation alone,
which values came from the canonical WFRC brand source, which (if any)
still match APP-Project-Scoresheet's existing token set, and why any differ.

**Why this priority**: Useful for future maintainers and for the
multi-agency reuse case, but the app functions correctly today even if this
documentation is thin — it's provenance record-keeping, not runtime
behavior.

**Independent Test**: A reviewer with no prior context can read the
documented brand-token-to-role mapping and correctly state, for any given
token, whether its value came from the canonical brand source as-is or was
adjusted, and why.

**Acceptance Scenarios**:

1. **Given** the canonical WFRC brand source and APP-Project-Scoresheet's
   existing tokens disagree on a value, **When** the mapping is documented,
   **Then** the disagreement and the resolved value are both explicit, not
   silently reconciled.
2. **Given** the documented mapping, **When** a new semantic token is added
   later, **Then** a maintainer has a clear existing pattern to extend
   rather than needing to re-derive the mapping approach.

---

### Edge Cases

- What happens when a brand value from the canonical WFRC source conflicts
  with APP-Project-Scoresheet's existing (already WCAG-adjusted) token?
  The conflict MUST be documented explicitly, not silently overwritten in
  either direction; the resolved value MUST still pass WCAG 2.1 AA for this
  app's actual usage even if that means deviating from both sources.
- What happens when a semantic pairing passes contrast in light mode but
  fails in dark mode (or vice versa)? Both modes MUST independently satisfy
  WCAG 2.1 AA — the pairing is not considered verified until both pass.
- What happens when the canonical WFRC brand source is missing a value this
  feature needs (e.g. no defined dark-mode palette)? A reasonable value MUST
  be derived and the gap documented, rather than left undefined or blocking
  the feature.
- What happens when a shadcn semantic role has no obvious WFRC brand
  equivalent (e.g. `destructive`)? A value MUST still be assigned (a
  sensible, accessible default) and documented as not directly sourced from
  the brand guide, rather than left unmapped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST document reconciled brand values (color,
  typography, logo assets) sourced from the canonical WFRC brand repository,
  including any deltas found against APP-Project-Scoresheet's existing
  token set.
- **FR-002**: System MUST define a complete set of semantic design tokens
  (`background`, `foreground`, `card`, `primary`, `secondary`, `muted`,
  `accent`, `destructive`, `border`, `ring`, `radius`, and their
  `-foreground` counterparts where applicable) as CSS custom properties in a
  single root-level location, with both light and dark mode values defined.
- **FR-003**: System MUST document the mapping from brand-source values to
  each semantic token as a standalone, reviewable artifact — not only
  inferable by reading configuration or component code.
- **FR-004**: The component styling system MUST read color, spacing, and
  radius values from the semantic token definitions rather than literal
  hardcoded values in configuration or component source.
- **FR-005**: Every semantic foreground/background color pairing MUST meet
  WCAG 2.1 AA contrast requirements in both light and dark mode.
- **FR-006**: System MUST provide a small set (3–4) of working UI
  components, owned as editable source in this repository (not consumed as
  an opaque installed dependency), each demonstrating consumption of the
  semantic token set.
- **FR-007**: System MUST provide a way to visually verify the token
  pipeline end-to-end (brand value → token → component rendering) without
  requiring any dashboard-specific scenario data, panel registry, or layout
  code to exist.
- **FR-008**: Changing a semantic token's root-level value MUST be
  sufficient to restyle every component consuming that token, with no
  component-level code changes required.
- **FR-009**: This feature MUST NOT include dashboard panel rendering, panel
  registry wiring, or scenario-data-driven UI — those are out of scope for
  this feature.

### Key Entities

- **Design Token**: A named semantic role (e.g. `primary`, `card`,
  `destructive`) mapped to a concrete value, with independent light-mode and
  dark-mode values. The single point of customization for restyling.
- **Brand Source Value**: A canonical value (color, typography, logo asset)
  originating from the WFRC brand repository, before any reconciliation
  against the existing reference token set.
- **Component**: A UI primitive (e.g. Button, Card, Tabs, Tooltip) whose
  styling is expressed entirely through semantic token references, never
  through literal hardcoded values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of defined semantic color pairings meet or exceed WCAG
  2.1 AA contrast requirements, independently verified in both light and
  dark mode.
- **SC-002**: A reviewer unfamiliar with the implementation can, using only
  the documented brand-token-to-role mapping, correctly identify for any
  given token whether its value matches the canonical WFRC brand source
  as-is or was adjusted, and state why.
- **SC-003**: The demo page renders every sampled component correctly
  styled with zero manual color overrides outside the token definitions.
- **SC-004**: Swapping the root-level token values to arbitrary substitute
  values and reloading the demo page changes every consuming component's
  appearance accordingly, with zero edits to any component file.
- **SC-005**: The demo page loads and is fully inspectable with zero
  dashboard scenario data, panel registry entries, or layout code present.

## Assumptions

- The canonical `wfrc-brand` repository is reachable and contains
  extractable color/typography/logo values; where it's missing a value this
  feature needs (e.g. a dark-mode palette), a reasonable value is derived
  and the gap is documented rather than blocking the feature.
- Dark mode is in scope for token definition and contrast verification in
  this feature, but a user-facing light/dark toggle control is not required
  — the demo page may switch modes by any reasonable mechanism (e.g. a CSS
  class or system-preference media query) sufficient to verify both sets of
  values.
- "3–4 shadcn components" is a representative sample chosen at
  implementation time within that range, not an exhaustive component
  library — the goal is proving the pipeline works, not building out every
  eventual dashboard component.
- The demo/throwaway page is a verification artifact for this feature only;
  it is not part of the production dashboard navigation and may be removed
  or hidden once real panel/layout work (the next feature) begins.
- Multi-agency customization is a design goal verified by swapping token
  values to arbitrary substitutes (Story 3); this feature does not require
  building out a second, real agency's actual brand theme.
- Constitution Principle VI (amended) already fixes the technology choices
  this feature implements (Tailwind CSS, shadcn/ui, Radix UI primitives,
  `lucide-react`) — this spec does not re-derive or reconsider those
  choices, only how they're configured and verified.
