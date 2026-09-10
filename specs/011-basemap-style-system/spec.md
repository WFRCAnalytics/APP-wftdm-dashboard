# Feature Specification: Basemap Style System

**Feature Branch**: `011-basemap-style-system`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Basemap Style System — a shared basemap-style capability for map-rendering panel types (flowmap now, zonemap later), replacing FlowMapPanel's current BLANK_STYLE-only default. Ships a built-in preset registry (CARTO Positron/Dark Matter/Voyager, OpenFreeMap Liberty/Bright/Positron/Dark/Fiord, leaflet-providers' raster catalog resolved dynamically by name) plus a generic multi-source basemap composition mechanism (not shipped with any named preset), validated during development against UGRC's real Vector Lite Base Map as a proof case without adding it to the shipped registry. Default: CARTO Positron/Dark Matter auto-paired to dashboard theme, falling back to the existing blank style when unreachable. Central technical risk: `setStyle()` + `MapboxOverlay` survival across a light/dark theme switch, given FlowMapPanel's existing non-interleaved overlay usage."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recognizable basemap by default (Priority: P1)

An analyst opens a dashboard tab containing a flowmap (O-D desire line) panel. Today the panel renders desire lines over a blank canvas — no streets, no labels, no geographic context. With this feature, the same panel shows a real, readable basemap (streets, place labels, muted background) behind the flow lines by default, with no author configuration required, and the basemap automatically matches whichever light/dark theme the dashboard is currently in.

**Why this priority**: This is the core value of the feature — every existing and future flowmap/zonemap panel benefits immediately, with zero YAML changes required in already-published dashboard configs. Without this, the feature delivers nothing visible.

**Independent Test**: Load any dashboard tab with a flowmap panel and no `basemap:` key in its config. Confirm a real basemap (not blank) renders behind the flow lines, and confirm it visually matches the dashboard's current light/dark theme.

**Acceptance Scenarios**:

1. **Given** a flowmap panel with no `basemap:` key configured, **When** the dashboard is in light mode, **Then** the panel renders a light, muted basemap behind the flow lines.
2. **Given** the same panel, **When** the dashboard is in dark mode, **Then** the panel renders a dark-themed basemap behind the flow lines.
3. **Given** a flowmap panel already rendered with data, **When** the analyst toggles the dashboard's light/dark theme, **Then** the basemap style switches to match and the flow-line overlay remains visible and correctly positioned throughout the switch.

---

### User Story 2 - Choose a specific named basemap style (Priority: P2)

A dashboard author wants a particular flowmap panel to use a specific look — e.g., a higher-contrast street style, or a muted grayscale style — instead of the app's light/dark default pairing. They set a single config value naming a built-in style, and the panel renders with that style regardless of the dashboard's active theme.

**Why this priority**: Extends the feature from "acceptable default everywhere" to "author has real control," which the built-in preset registry exists to serve. It depends on User Story 1's rendering pipeline already working.

**Independent Test**: Set a flowmap panel's `basemap:` config to a specific built-in preset name from each of the three source categories (a CARTO style, an OpenFreeMap style, and a raster provider name) in three separate panels, and confirm each renders its distinct, correct style. Separately, set a tab's `default_basemap:` and confirm every panel on that tab without its own `basemap:` picks it up, while a panel with its own `basemap:` still overrides it.

**Acceptance Scenarios**:

1. **Given** a flowmap panel configured with a specific built-in vector style name, **When** the panel loads, **Then** it renders that exact style, not the light/dark default pairing.
2. **Given** a flowmap panel configured with a raster tile provider name, **When** the panel loads, **Then** the provider's tiles render correctly as the basemap.
3. **Given** a panel configured with an unrecognized/misspelled preset name, **When** the panel loads, **Then** the panel falls back to the blank style rather than failing to render the panel entirely.
4. **Given** a tab's `default_basemap:` key is set and a map-rendering panel on that tab has no `basemap:` of its own, **When** the panel loads, **Then** it renders the tab's default rather than the app's light/dark pairing.
5. **Given** a tab's `default_basemap:` key is set and one map-rendering panel on that tab also sets its own `basemap:`, **When** the panel loads, **Then** the panel's own `basemap:` wins over the tab default.

---

### User Story 3 - Compose a custom multi-layer basemap (Priority: P3)

A deployment-specific dashboard author (e.g., an organization publishing its own `dashboard-*.yaml` files) wants a basemap made of multiple stacked style layers — for example, a hillshade layer under a base-map layer under a labels layer — that isn't one of the app's built-in named presets. They author a custom composition in the panel config referencing multiple external style resources by URL, and the panel renders the fully composed result.

**Why this priority**: This is the generic escape hatch that makes the feature extensible to any organization's own deployment-specific basemap needs without requiring app code changes or app-level knowledge of that organization's specific services. Lower priority than User Stories 1-2 because it serves a narrower, more advanced authoring case, but the mechanism must exist and be proven to work, not just be planned.

**Independent Test**: Author a panel config that composes multiple real, independently-hosted vector style resources into one basemap (proof case: a real three-layer public vector basemap composed of a hillshade layer, a base layer, and a labels layer, each a separate published style resource). Confirm the panel renders all three layers correctly stacked, with no app code change and no reference to this specific case anywhere in the app's own built-in registry.

**Acceptance Scenarios**:

1. **Given** a panel config listing multiple named external style resources in a composition, **When** the panel loads, **Then** all listed layers render stacked in the specified order.
2. **Given** a composed basemap where one constituent style's internal resources (sprite/glyphs/source data) are referenced by paths relative to that style's own location, **When** the panel loads, **Then** those relative paths resolve correctly and the layer renders with its intended appearance (not broken icons/labels).
3. **Given** a composition where one of the multiple constituent style resources fails to load, **When** the panel loads, **Then** the panel falls back to the blank style for the whole basemap rather than rendering a partially-broken composite.

---

### Edge Cases

- What happens when the configured or default basemap style is unreachable (no internet, blocked request, dead URL)? The panel MUST fall back to the existing blank style and continue rendering its data-driven overlay — never blocking or breaking the panel.
- What happens when the dashboard's light/dark theme changes while a map panel is on screen? The basemap MUST switch to the matching style without the panel's flow-line overlay disappearing, duplicating, or losing correct screen position, even momentarily during the switch.
- What happens when a raster provider name doesn't exist in the leaflet-providers catalog? Same fallback as any other unresolvable basemap reference: blank style, not a broken panel.
- What happens when a custom multi-source composition references a style resource whose own internal paths are relative to its hosted location? Each constituent resource must be loaded in a way that preserves those relative references (not re-hosted as a detached inline object that would break them).
- What happens on a fully offline/local deployment (`wftdm-dashboard here`, no internet) where none of the built-in preset sources are reachable? Every panel MUST still render correctly on the blank-style fallback — this is not a degraded/error state, it's the documented offline behavior.
- What happens if a panel switches between scenarios or filters while a non-default basemap is configured? The chosen basemap MUST persist — basemap selection is independent of data filtering/scenario state.
- What happens when both a tab's `default_basemap:` and one of its panel's own `basemap:` are set? The panel-level value MUST win — same precedence direction as every other panel key that can also be influenced by a broader scope (e.g. a panel's own `filter:` narrowing a tab's `filters:`).
- What happens when a tab's `default_basemap:` is itself a custom multi-source composition (not just a preset name)? It MUST resolve and render the same way a panel-level composition would — the composition mechanism is shared across both scopes, not panel-only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a built-in registry of basemap presets covering three source categories: CARTO vector styles (Positron, Dark Matter, Voyager), OpenFreeMap vector styles (Liberty, Bright, Positron, Dark, Fiord), and raster tile providers drawn from the leaflet-providers catalog.
- **FR-002**: System MUST resolve leaflet-providers raster entries dynamically by provider name against that catalog's own provider-definition data, rather than shipping a hand-picked subset — adding support for a new raster provider already in that catalog MUST NOT require an app code change.
- **FR-003**: System MUST transform a resolved raster provider's tile URL template (including its subdomain and retina-tile placeholder syntax) into a basemap source the map renderer can consume natively, since that placeholder syntax has no native equivalent in the renderer.
- **FR-004**: Map-rendering panel types (flowmap now; zonemap and any future map panel type later) MUST support an optional panel-level basemap-selection config key that accepts either a built-in preset name or a custom multi-source composition.
- **FR-005**: Each dashboard tab (one `dashboard-*.yaml` file) MUST support an optional tab-level default-basemap config key, scoped exactly like that file's existing `header:`/`filters:` keys (i.e. applying to every map-rendering panel on that one tab, not across tabs) — accepting the same two shapes as the panel-level key (a built-in preset name or a custom multi-source composition).
- **FR-006**: System MUST resolve each map-rendering panel's effective basemap using a three-level precedence, evaluated in order: (1) the panel's own basemap-selection key if present, (2) else its tab's default-basemap key if present, (3) else the app's own light/dark theme-paired default (FR-007).
- **FR-007**: When neither a panel's own basemap-selection key nor its tab's default-basemap key is set, System MUST apply a default basemap automatically paired to the dashboard's active light/dark theme (a light-appropriate built-in preset in light mode, a dark-appropriate one in dark mode).
- **FR-008**: System MUST provide a generic mechanism for composing multiple independently-hosted named style resources into a single stacked basemap, usable identically at both the panel level (FR-004) and the tab level (FR-005) — this mechanism MUST NOT be built as bespoke logic for any single specific case or scope.
- **FR-009**: When composing multiple style resources into one basemap, System MUST load each constituent resource in a way that preserves its own internally relative references (e.g., to sprite, glyph, or source data adjacent to its hosted location) rather than detaching it into a standalone object that would break those references.
- **FR-010**: System MUST fall back to the existing blank-style rendering whenever a configured or default basemap — at any precedence level, of any source category, built-in or custom-composed — fails to load, so that a missing/unreachable basemap never prevents a panel's data-driven content from rendering.
- **FR-011**: When a panel's effective basemap came from the app's own theme-paired default (FR-007) — i.e. neither the panel nor its tab pinned an explicit basemap — System MUST switch that basemap style when the dashboard's light/dark theme changes, without disrupting the panel's already-rendered data-driven overlay (flow lines today; future zone-choropleth data). A panel or tab that has explicitly pinned a basemap (FR-004/FR-005) is not re-paired on theme change — an explicit pin means that exact style regardless of theme, matching User Story 2's own intent.
- **FR-012**: System's multi-source composition mechanism (FR-008/FR-009) MUST be validated during development against a real, publicly-hosted multi-layer vector basemap as a proof case, without adding that specific case as a named entry in the built-in preset registry (FR-001) — it remains reachable only through deployment-specific panel- or tab-level configuration.
- **FR-013**: System MUST NOT introduce a new dashboard-wide (cross-tab) configuration concept for basemap defaults — basemap selection is resolved entirely from the panel-level (FR-004) and tab-level (FR-005) config keys already precedented by the existing grammar's own panel-scoped and tab-scoped (`header:`/`filters:`) keys, plus the code-level app default (FR-007); no key or file spans multiple tabs.
- **FR-014**: System's built-in preset registry (FR-001) MUST NOT include any basemap source that requires registration, an account, or a domain-locked license key to load in a publicly-hosted deployment of this dashboard.

### Key Entities

- **Basemap Preset**: A named, built-in basemap style reference from one of the three shipped source categories (CARTO vector style, OpenFreeMap vector style, leaflet-providers raster provider), selectable by name from either a panel-level or tab-level basemap key.
- **Basemap Composition**: An author-defined, ordered list of named external style resources combined into a single stacked basemap, authored at either the panel level or the tab level via the same config shape. Not itself a named preset — always authored per-deployment.
- **Panel Basemap Selection**: The optional config value on a map-rendering panel (flowmap today; zonemap later) that names either a built-in preset or a custom composition; takes precedence over its tab's default and the app's theme-paired default when present.
- **Tab Default Basemap**: The optional config value on a `dashboard-*.yaml` file — scoped identically to that file's existing `header:`/`filters:` keys — that names either a built-in preset or a custom composition applied to every map-rendering panel on that tab which doesn't set its own Panel Basemap Selection. This is the mechanism WFRC's own deployment-specific `dashboard-*.yaml` customization (installed as a package, source untouched) uses to set one UGRC-style basemap for a whole tab instead of repeating it per panel.
- **Theme-Basemap Pairing**: The association between the dashboard's active light/dark UI theme and which basemap preset renders by default when neither a panel nor its tab specifies one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A flowmap panel with no basemap configuration renders a recognizable, labeled basemap (not a blank canvas) on first load, in both light and dark dashboard themes.
- **SC-002**: Toggling the dashboard's light/dark theme while a map panel is visible updates the basemap to the matching style while the panel's flow-line overlay remains continuously visible and correctly positioned — no flash of missing data, no duplicated flow lines, no permanent loss of the overlay.
- **SC-003**: An author can switch a panel to any of the built-in named presets (across all three source categories) by changing a single config value, with each preset rendering its distinct, correct appearance — and can set that same value once at the tab level to apply it to every panel on that tab without repeating it per panel, with a panel-level value still overriding it where set.
- **SC-004**: When a configured or default basemap source is completely unreachable (simulated offline condition), every affected panel still renders its data-driven content correctly on a blank background, with no panel failing to render or throwing a visible error.
- **SC-005**: A real multi-layer, multi-source custom basemap composition (the development proof case) renders correctly end-to-end — all constituent layers visible, correctly stacked, with no missing icons/labels from broken relative references — using only the generic composition mechanism, with zero app-code changes specific to that case.

## Assumptions

- **Panel-level AND tab-level config, no new dashboard-wide (cross-tab) concept**: `project-docs/GRAMMAR.md` confirms two existing scopes within a single `dashboard-*.yaml` file — panel-scoped (every common key in the panel-types-reference table) and tab-scoped (`header:`/`filters:`, explicitly documented as applying to "ALL panels on this tab"). It has no third, cross-tab/dashboard-wide scope (no key or file spans multiple tabs), and none is introduced here. Basemap selection reuses both existing scopes — a panel-level `basemap:` key and a tab-level `default_basemap:` key, precedented directly by `filters:` — with the app's light/dark default pairing applied in code as the final fallback, not a new YAML construct. This directly serves WFRC's real deployment model (customizing `dashboard-*.yaml` files without touching this app's own source) by letting one tab-level setting cover every panel on that tab, instead of per-panel repetition.
- **Basemap keys accept either a scalar or an object, at both scopes**: consistent with the existing grammar's own convention for keys that support a simple case and a richer case (e.g., `zonemap`'s `comparison: side_by_side` vs. `comparison: { type: diff, ... }`), both `basemap:` (panel) and `default_basemap:` (tab) accept a bare preset name (string) for the common case and a composition object for the custom multi-source case, rather than introducing separate keys per shape or per scope.
- **Explicit pins opt out of theme re-pairing**: an explicit `basemap:`/`default_basemap:` value is treated as the author's deliberate choice of one specific look (per User Story 2's own "regardless of the dashboard's active theme" framing) — it is not swapped on a light/dark theme toggle the way the app's own unset-default pairing is (FR-011). Only the no-config, app-default case is theme-reactive.
- **CARTO usage without an API key**: CARTO's own current documentation states an API key is required for basemap usage, but CARTO's real vector style/TileJSON documents were directly confirmed to load successfully without one during this feature's research. This feature proceeds without building any API-key configuration mechanism for v1, on the assumption that the keyless style-load path remains usable for this dashboard's traffic volume; this is a monitored assumption, not a confirmed-permanent guarantee, and licensing/attribution/quota terms generally are explicitly out of scope for this feature (a deliberate prior decision).
- **OpenFreeMap Dark/Fiord are included despite an upstream completeness caveat**: OpenFreeMap's own maintainer documentation flags the Dark and Fiord styles as not yet complete. They are still included in the built-in registry as real, currently-published styles; this feature is responsible for correctly resolving and rendering whatever OpenFreeMap currently publishes under those names, not for the visual completeness of the upstream style content itself.
- **UGRC's Vector Lite Base Map is a proof case only**: it is used to validate the multi-source composition mechanism (FR-012) during development but is deliberately not added to the shipped built-in registry — using it in a real deployment is left to downstream, deployment-specific panel- or tab-level configuration (User Story 3), not built into this shared app.
- **`setStyle()`/overlay survival across theme switches**: real production evidence (a live WFRC-deployed app using the same non-interleaved `MapboxOverlay` pattern this codebase's flowmap panel already uses) shows the overlay surviving a basemap style switch without needing to be removed/re-added, because a non-interleaved overlay's canvas lives outside the base map renderer's own style/layer lifecycle. This substantially de-risks FR-011/SC-002 but is treated as a hypothesis to confirm empirically during implementation against this project's own pinned library versions, not as a guaranteed outcome assumed from another codebase.
- **Zonemap consumption is future, not built here**: this feature builds the shared registry and composition mechanism generically enough for a future zonemap panel type to consume unchanged, but does not build the zonemap panel type itself.
