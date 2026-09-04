# Feature Specification: Multi-sprite support in composeStyles()

**Feature Branch**: `017-multi-sprite-support`

**Created**: 2026-09-04

**Status**: RESOLVED. `composeStyles()` now collects every composed layer's own sprite (`research.md` §2, `contracts/compose-styles-multi-sprite.md`) and rewrites every symbol layer's `icon-image` to its own originating layer's sprite id. FR-005's open question resolved exhaustively (`research.md` §1): zero of 39 real symbol layers across every currently-composed service use a style expression — only the literal-string case exists today; a synthetic test covers the expression case anyway. Verified fully automated (no real-hardware step, unlike `016`): 13/13 unit tests and both new `map.hasImage()` integration tests pass against the real UGRC endpoints; full regression suite 212/212 unit + 60/61 integration (the one failure a confirmed pre-existing, unrelated timing flake); `npx tsc --noEmit` and `npm run build` both clean. SC-001–SC-005 all satisfied.

**Input**: User description: "Fix a real, confirmed bug: composeStyles()'s 'first sprite wins' logic (loadBasemapStyle.ts) silently discards every composed layer's sprite sheet except the first one that declares one. For both UGRC compositions, this discards the EXACT sprite sheet containing highway/route-shield icons (LiteLabels/Outdoors_Labels), keeping only the base layer's sprite (LiteBase/OutdoorsBase), which has none. maplibre-gl@^4.7.1 genuinely supports a multi-sprite array (`sprite: string | {id, url}[]`, confirmed against the installed package). Replace 'first sprite wins' with an array of {id, url} entries, one per composed layer that declares a sprite, and rewrite every symbol layer's icon-image to reference its own originating layer's sprite id. Unlike 016's own GPU-specific dark-mode defect, this is a structural rendering difference (icon loads or doesn't) expected to reproduce under Playwright/SwiftShader — confirm this so the feature's own test suite can be genuinely automated."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Highway/route-shield icons render on UGRC composition panels (Priority: P1)

A dashboard user viewing the Flowmap UGRC Composition or Flowmap UGRC Outdoors Composition panel sees highway and route-shield icons (Interstate, US Highway, State Highway markers) on the map's road labels, matching what the underlying UGRC label service intends — not missing/blank icon slots.

**Why this priority**: This is the reported defect. The icons are currently silently dropped for both real, in-use panels because only one composed layer's sprite sheet survives composition, and it happens to be the wrong one in both cases.

**Independent Test**: Load the dashboard (any theme), navigate to the tab with either UGRC composition panel, and confirm the road-label icons for interstates/highways are visually present — not blank — and confirm zero `styleimagemissing`/"Image ... could not be loaded" console messages for icon names known to belong to these compositions.

**Acceptance Scenarios**:

1. **Given** the Flowmap UGRC Composition panel is loaded, **When** the map renders its `LiteLabels`-sourced road-label layers, **Then** Interstate/US Highway/State Highway icons are visible, not missing.
2. **Given** the Flowmap UGRC Outdoors Composition panel is loaded, **When** the map renders its `Outdoors_Labels`-sourced road-label layers, **Then** the same three icon types are visible.
3. **Given** either panel is loaded, **When** the browser console is inspected, **Then** no "Image ... could not be loaded" message appears for an icon name known to belong to that composition's own declared sprites.

---

### User Story 2 - No regression to existing single-sprite compositions (Priority: P2)

A dashboard user viewing any other existing basemap composition — one where only a single composed layer declares a sprite (or none do) — sees it continue to render exactly as it did before this fix.

**Why this priority**: The fix changes a general, shared function (`composeStyles()`) used by every composition-type basemap in the app; a regression here would be worse than the original bug, since it would spread breakage beyond the two currently-known-broken panels.

**Independent Test**: Load a composition with exactly one sprite-declaring layer (e.g., the existing UGRC Vector Hybrid composition, which mixes a raster provider layer with one vector overlay layer) and confirm its icons/sprite-dependent rendering is pixel-for-pixel unchanged from before this fix.

**Acceptance Scenarios**:

1. **Given** a composition where only one composed layer declares a sprite, **When** the style is resolved, **Then** every icon that rendered correctly before this fix still renders correctly, with no new console errors — even though the composed style's own icon-image reference strings are expected to change (namespaced with that layer's own prefix, per FR-004), since "pixel-for-pixel unchanged" is a statement about the rendered icon, not the underlying reference value.

---

### User Story 3 - The fix generalizes to any future multi-sprite composition (Priority: P3)

A model-team author composing a brand-new basemap from two or more real services, where more than one of those services declares its own sprite sheet, gets icons from every declared sprite available — not just the first — without needing to know about or work around this limitation.

**Why this priority**: The two UGRC panels are the currently-known trigger, but the underlying mechanism (`composeStyles()`) is general-purpose; a fix scoped only to those two panels would leave the same defect waiting for the next multi-sprite composition an author creates.

**Independent Test**: Compose two arbitrary layers, each declaring a different sprite sheet with non-overlapping icon names, and confirm icons from BOTH sprites resolve and render correctly in the composed result — not just the first layer's.

**Acceptance Scenarios**:

1. **Given** a composition of two layers that each declare their own sprite, **When** the composed style is resolved, **Then** both layers' own icons render correctly, each looked up from its own originating sprite.

---

### Edge Cases

- What happens when a composed layer declares no sprite at all? It must not break composition — sprites are only collected from layers that actually declare one, same as today.
- What happens when a composition has exactly one layer that declares a sprite (the common case today, outside the two UGRC panels)? Must behave identically to current behavior — a single-entry multi-sprite array (or equivalent) is not a visible or functional change.
- What happens when an icon-image value is a style *expression* rather than a literal string (e.g., a data-driven `match`/`case` construct), if any real, currently-composed layer turns out to use one? This must be explicitly resolved by this feature's own research, not silently skipped — see Assumptions for the default position pending that research.
- What happens when two composed layers' own sprite sheets happen to define an icon with the identical name? Each icon must remain resolvable to its own originating layer's sprite specifically (via per-layer namespacing) — a name collision across two different composed layers' sprites must not cause one to silently shadow the other.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST preserve every composed layer's own declared sprite sheet, not only the first one encountered, when building a composed basemap style.
- **FR-002**: System MUST make every declared sprite's own icons resolvable for the symbol layers that originate from that same composed layer, so those icons actually render.
- **FR-003**: System MUST NOT change the *rendered* output of any existing composition where only one composed layer declares a sprite (or none do) — this is a pure regression bar, not a new capability for that case. This bar is on the resolved, rendered icon specifically, not on the literal icon-image reference string stored in the composed style — see FR-004 for why the reference value itself is expected to change even in the single-sprite case.
- **FR-004**: System MUST rewrite every symbol layer's icon-image reference that is a literal string so it resolves against its own originating layer's sprite specifically, not an arbitrary/first one. This rewrite MUST apply uniformly regardless of how many composed layers declare a sprite — one or several — with no special-cased "skip the rewrite when only one sprite exists" path; a composition with a single sprite-declaring layer is not exempt from the same namespaced-prefix mechanism every other composition uses, it simply has only one prefix to apply. The rewritten *reference value* is expected and allowed to change as a result (e.g. `"highway-shield"` becomes `"layer0:highway-shield"`) — what FR-003's no-regression bar actually constrains is the *resolved, rendered icon*, not the literal string stored in the style. A future implementer optimizing away this rewrite for the single-sprite case, on the reasoning that "the reference value used to match and still would," would create two divergent code paths doing the same job — this is explicitly out of bounds.
- **FR-005**: System MUST explicitly handle any icon-image value that is not a literal string (a style expression) — either by resolving it correctly or by making a deliberate, documented decision about the case, never by silently leaving it unresolved without acknowledgment.
- **FR-006**: System MUST implement this as a general mechanism that applies to any current or future composition with more than one sprite-declaring layer — not a special case naming the two UGRC panels specifically.
- **FR-007**: System's own automated test suite MUST verify this fix without requiring real-hardware human verification, once confirmed (per this feature's own research) that the defect and its fix both reproduce under the project's existing Playwright/software-rendering test environment.

### Key Entities

- **Composed sprite**: One composed layer's own sprite sheet (an icon atlas plus its index), now preserved and individually addressable within a composed style, keyed by that layer's own identity — previously collapsed to at most one per composition.
- **Icon reference**: A symbol layer's own `icon-image` value, now resolved against its specific originating composed layer's sprite rather than whichever sprite happened to "win."

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Both UGRC composition panels display their intended highway/route-shield icons in the running app, confirmed with zero "Image ... could not be loaded" console messages for icon names known to belong to either composition.
- **SC-002**: 100% of this project's existing basemap/composition regression tests continue to pass after the fix, with zero newly introduced failures.
- **SC-003**: A composition with only a single sprite-declaring layer is confirmed, via automated test, to render identically to its pre-fix behavior.
- **SC-004**: This feature's own fix is validated by an automated test asserting the previously-missing icons are now present — no real-hardware human verification step is required for this feature, distinguishing it from the 016 investigation's own constraint.
- **SC-005**: A dedicated test with two composed layers, each declaring a distinct sprite with non-overlapping icon names, confirms icons from both resolve correctly — demonstrating the mechanism is general, not hardcoded to the two named UGRC panels.

## Assumptions

- Every real, currently-composed layer's `icon-image` value is a literal string, not a style expression — this feature's own research must confirm this directly against all real layers in every composition this app currently supports before treating it as settled; if a real expression case is found, FR-005 governs how it gets resolved instead of this assumption.
- No new icon assets or visual redesign are in scope — this is a resolution/wiring fix making already-published icons resolvable, not new artwork.
- The real UGRC endpoints (and any other currently-composed real service) remain reachable at their existing URLs; no change to this app's network dependency posture is introduced.
- Every composed layer's own sprite gets a uniform, layer-scoped namespaced id (e.g., matching the existing `layer0`/`layer1`/... source/layer ID convention) rather than designating any one sprite as MapLibre's special unprefixed `"default"` id — simpler and more consistent with `composeStyles()`'s own existing namespacing convention; confirmed/refined during planning, not treated as final without verification.
- This feature does not include any other basemap/composition capability, and does not reopen or modify the now-closed 016 UGRC dark-mode background-layer fix already shipped.
