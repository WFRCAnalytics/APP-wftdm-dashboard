# Feature Specification: Protomaps PMTiles Basemap Support

**Feature Branch**: `041-protomaps-basemap`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Protomaps PMTiles basemap support — via the real @protomaps/basemaps package, deployer-configurable default, viewer-overridable, validated. Add all five official Protomaps flavors (light, dark, white, grayscale, black) to the Basemap tab catalog, generated programmatically from Protomaps' own real @protomaps/basemaps package — never a hardcoded region-specific PMTiles URL in source, so it works identically for WFRC's Wasatch Front deployment and any other deployer's region. Confirmed facts (Protomaps' own docs): a 'Flavor' is a plain color/property object, not a hand-authored style.json — `layers(sourceName, namedFlavor(name), {lang:'en'})` generates the real MapLibre layers array from one of 5 named flavors, all sharing ONE underlying PMTiles vector source (styling differs, source doesn't). Requires the `pmtiles` client library registered as a custom MapLibre protocol before any PMTiles-backed style loads. Protomaps' own docs explicitly forbid hotlinking their demo bucket/daily-build/hosted-API — this app must never ship one of those as a default; a viewer typing a demo URL into their own session-only override is fine. Sprite/glyph assets are stable at protomaps.github.io/basemaps-assets. Real attribution string confirmed. A deployer's real regional extract (e.g. Wasatch Front) is tens of MB via `pmtiles extract`, not the ~120GB planet file. The deployer-level default source must accept either a relative public/-bundled path or a full external URL, identically. Design decisions: a new 'Protomaps' section in the Basemap tab catalog, positioned directly above the existing Raster Tiles section (last among the vector-style sections); ONE shared source-URL configuration serves the whole section (a deployer-level default plus a viewer session-only override), not five independent ones."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select a Protomaps flavor as the active basemap (Priority: P1)

A dashboard viewer opens the Settings modal's Basemap tab, scrolls to the new "Protomaps" section (positioned above Raster Tiles, after OpenFreeMap/CARTO/UGRC), and picks one of the five real flavors (Light, Dark, White, Grayscale, Black) for a flowmap or zonemap panel to use. The chosen flavor renders a complete, correctly-styled basemap — roads, land cover, labels, water — using whichever PMTiles data source this deployment has configured.

**Why this priority**: This is the entire visible point of the feature — without a viewer being able to pick and see a working Protomaps flavor, nothing else in this feature has value. Every other story exists to make this one possible or better.

**Independent Test**: With a deployer default PMTiles source already configured (a small bundled regional extract), open the Basemap tab, select each of the 5 flavors in turn, and confirm each renders a visually distinct, fully-styled map with no missing icons/labels and the correct attribution shown.

**Acceptance Scenarios**:

1. **Given** a deployer-configured PMTiles source is available, **When** a viewer opens the Basemap tab, **Then** a "Protomaps" section appears above the Raster Tiles section, listing Light, Dark, White, Grayscale, and Black as five separate, selectable entries.
2. **Given** the viewer selects the "Dark" flavor, **When** it becomes the active basemap on a map panel, **Then** the map renders with dark-flavor colors/labels, real road/place labels are legible, and the Protomaps + OpenStreetMap attribution is visible.
3. **Given** the viewer switches from "Light" to "Grayscale" and back, **When** each switch completes, **Then** no new download of the underlying vector tile data occurs — only the rendered styling changes.

---

### User Story 2 - Deployer configures their own regional PMTiles source (Priority: P1)

A deployer (e.g. WFRC preparing a Wasatch Front deployment, or any other agency running this same app for a different region) has already produced their own regional PMTiles extract via Protomaps' own `pmtiles extract` tooling. They place that file either directly in this app's own bundled `public/` assets or upload it to their own cloud storage, then set ONE configuration value pointing at it. No source-code change, rebuild-time constant, or per-flavor configuration is required — all five flavors immediately read from that single source.

**Why this priority**: Without this, the feature only works for whichever region a hardcoded URL happens to point at — violating this project's core "generic engine, deployer-specific config" requirement, and making the feature unusable for any deployer other than whoever hardcoded it. This has to ship alongside User Story 1, not after it.

**Independent Test**: Set the deployer-level configuration to point at a small test PMTiles file bundled under `public/`, confirm all five flavors render using it; then repeat pointing at a full external HTTPS URL instead, with no other change, and confirm identical rendering.

**Acceptance Scenarios**:

1. **Given** a deployer sets the shared PMTiles source configuration to a relative path under this app's own bundled assets, **When** the app loads, **Then** every one of the five Protomaps flavors renders correctly from that file.
2. **Given** a deployer instead sets that same configuration to a full external HTTPS URL (their own cloud storage), **When** the app loads, **Then** the five flavors render identically, with no behavior difference between the two configuration forms.
3. **Given** a deployer changes the configured region (e.g. from one extract to another covering a different area), **When** the app is redeployed with the new value, **Then** the new region's data appears with no code change anywhere in this app's own source.
4. **Given** a deployment ships with no PMTiles source configured at all, **When** a viewer opens the Basemap tab, **Then** the Protomaps section clearly indicates it is not configured, rather than presenting five entries that fail when clicked.

---

### User Story 3 - Viewer supplies their own PMTiles source for the current session (Priority: P2)

A viewer whose deployment has no configured default (or who wants to preview a different region/extract than the deployer's default) enters their own PMTiles URL into a viewer-facing override field. This override applies only for their current session — it is never written back as the deployment's default and is not visible to other viewers.

**Why this priority**: Useful and explicitly requested, but the feature is already functional and valuable for the primary path (deployer-configured default) without it — this extends flexibility rather than being required for the core capability.

**Independent Test**: With no deployer default configured, open the Basemap tab, enter a reachable PMTiles URL into the override field, confirm the five flavors become selectable and render from it; reload the app and confirm the override did not persist.

**Acceptance Scenarios**:

1. **Given** no deployer default is configured, **When** a viewer enters a valid, reachable PMTiles URL into the override field, **Then** the Protomaps section's five flavors become usable against that source for the remainder of the session.
2. **Given** a viewer enters a URL that is unreachable or is not a valid PMTiles archive, **When** they attempt to use it, **Then** the system shows a clear, specific error and does not crash or silently fall back to an unrelated basemap.
3. **Given** a viewer sets a session override, **When** they reload or close and reopen the app, **Then** the override is gone and the deployer's configured default (or the "not configured" state) is what's shown again.

---

### Edge Cases

- What happens when neither a deployer default nor a viewer override is set? → The Protomaps section must present an unmistakable "not configured" state (FR-010), never five clickable-but-broken flavor entries.
- What happens when the configured/entered PMTiles source is unreachable, corrupted, or not a real PMTiles archive? → A clear, specific error state; other basemap sections and any already-rendered panel data on the same map remain unaffected (FR-011).
- What happens if a viewer switches to a Protomaps flavor, then to a completely different basemap (e.g. a raster provider), then back to Protomaps? → The map must recover correctly without leftover fetch errors or a stuck loading state, and without re-registering the PMTiles protocol handler in a way that breaks the second activation.
- What happens on a deployment that never configures Protomaps at all (the common case for a deployer who doesn't need it)? → Zero visible impact: the Protomaps section still appears (in its "not configured" state, per above) but no other basemap section, panel, or app behavior changes.
- What happens when the app's light/dark theme changes while a Protomaps flavor (e.g. "Light") is active? → Flavor selection is an explicit, manual viewer choice independent of the app's own light/dark theme — switching the app theme must not automatically swap the active flavor (consistent with how every other basemap choice in this app already works).
- What happens when a deployer's configured extract only covers part of the world and a viewer pans outside it? → Out of scope for this feature to solve specially; behaves the same as panning outside the coverage of any other regional basemap source already supported by this app.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Basemap tab's catalog MUST present a "Protomaps" section listing all five official flavors (Light, Dark, White, Grayscale, Black) as separate, individually selectable entries, positioned directly above the existing Raster Tiles section and after the existing vector-style sections (OpenFreeMap, CARTO, UGRC).
- **FR-002**: All five flavor entries MUST read from exactly one configured PMTiles source per deployment — the system MUST NOT require or expose five independent source configurations for the one section.
- **FR-003**: The system MUST generate each flavor's map styling programmatically from Protomaps' own official flavor definitions, rather than maintaining separately hand-authored style documents per flavor — so a future addition or change to Protomaps' own flavor definitions requires no rewritten styling in this app.
- **FR-004**: The system MUST support a deployer-level default PMTiles source expressed as either (a) a path to a file bundled within this app's own deployed assets, or (b) a full external URL — both forms MUST behave identically once configured, with no separate code path or feature gap for either.
- **FR-005**: The system MUST NOT ship any hardcoded reference to Protomaps' own publicly downloadable demo/daily-build data or their hosted tile API as a default source in this app's own source code.
- **FR-006**: The system MUST let a viewer supply their own PMTiles source as a session-only override that never persists beyond their current session and is never shared with, or visible to, other viewers.
- **FR-007**: The system MUST validate a PMTiles source (deployer-configured or viewer-entered) and present a clear, specific, non-crashing error state when it is unreachable or not a valid PMTiles archive — distinguishable from the "no source configured at all" state.
- **FR-008**: Each selected Protomaps flavor MUST render complete map styling — roads, land cover, water, and legible text labels — using the stable, shared Protomaps sprite/glyph assets.
- **FR-009**: Whenever a Protomaps-flavored basemap is the active one, the system MUST display the confirmed real Protomaps + OpenStreetMap attribution, using the same attribution mechanism already applied to every other basemap source in this app.
- **FR-010**: When no PMTiles source is available (no deployer default and no viewer override), the Protomaps section MUST clearly communicate that it is not yet configured/usable, rather than offering five selectable entries that fail when chosen.
- **FR-011**: A failed or unreachable PMTiles source MUST fail gracefully — it must not prevent other basemap sections from working, and must not block or corrupt any already-rendering data content (flow lines, choropleth fill, etc.) on the same map panel.
- **FR-012**: Switching between the five Protomaps flavors on an already-active Protomaps basemap MUST NOT re-open (re-fetch and re-parse the header/directory of) the underlying PMTiles archive — only the generated styling may change. (Confirmed during implementation: the map engine's own style-switching mechanism recreates the on-screen tile layer on every switch, so the specific tiles currently in view are re-requested each time regardless of flavor, the same as switching between any two basemaps in this app already works — that per-tile cost is not what this requirement is about. What must not repeat is re-opening the archive itself: its header and directory — the expensive part for a real, large regional extract — are read once and reused across every flavor switch referencing the same source.)
- **FR-013**: The deployer-level default source configuration MUST be settable without modifying this app's own source code or requiring a rebuild beyond redeploying updated configuration content — consistent with every other deployer-configurable value in this app.

### Key Entities

- **Protomaps Flavor**: One of the five official named styling definitions (light, dark, white, grayscale, black). Carries no data of its own — purely a set of generated color/paint rules applied over the shared PMTiles source.
- **PMTiles Source Configuration**: The one shared reference (a bundled relative path or an external URL) that all five flavors render from. Has two layers: a deployer-level default (persists across sessions, visible to every viewer) and an optional viewer-level session override (temporary, private to that viewer's current session, takes precedence over the deployer default while set).
- **Basemap Catalog Section**: The existing grouping concept the Basemap tab already uses (OpenFreeMap / CARTO / UGRC / Raster Tiles); this feature adds "Protomaps" as one more section in that same catalog, positioned per FR-001.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer with a valid regional PMTiles extract can make all five Protomaps flavors available to viewers by setting a single configuration value — zero source-code changes and zero per-flavor setup steps.
- **SC-002**: All five flavors render as visually distinct, fully-labeled, fully-styled basemaps when a valid PMTiles source is configured — verified for each of the five independently.
- **SC-003**: 100% of viewers on a deployment with no configured PMTiles source see an unmistakable "not configured" indicator in the Protomaps section rather than a broken or blank map after selecting a flavor.
- **SC-004**: 100% of the time a Protomaps flavor is the active basemap, the correct Protomaps + OpenStreetMap attribution is visible on the map.
- **SC-005**: Switching between flavors on an already-loaded Protomaps basemap completes with no perceptible reload delay and no repeated large data transfer, since only styling — never the underlying tile data — changes.
- **SC-006**: A regional deployment (a real-world area comparable in size to the Wasatch Front) loads and renders a Protomaps basemap using an extract in the tens-of-megabytes range, with no dependency on downloading a global, planet-scale dataset.

## Assumptions

- **Validation mechanism**: "Validated" is interpreted as: on first use of a configured or entered PMTiles source, the system attempts to open/read it and surfaces a clear error if that fails, rather than silently rendering a blank map — mirroring this app's existing pattern for an unreachable raster provider or unreachable vector composition layer (a bounded reachability check with a fail-soft, clearly-communicated outcome).
- **Viewer override UI shape**: The viewer-facing session override is a plain text-entry field for a PMTiles URL, staged and previewed before becoming the active source — consistent with this app's existing Basemap tab pattern of staging a selection against a live preview before it takes effect, rather than applying on every keystroke.
- **Deployer configuration location**: The deployer-level default PMTiles source is configured through this app's existing deployer-configurable discovery mechanism (the same file already used for the app's title/logo and default scenario color palette), extended with one additional optional field — not a new, separate configuration file, consistent with this project's fixed, minimal set of config file types.
- **Theme independence**: Selecting a Protomaps flavor is a fully independent, manual viewer choice from the app's own light/dark UI theme — the app never automatically swaps flavors (e.g. to "dark") when the viewer toggles UI theme.
- **Out of scope**: Automatically generating or hosting a PMTiles extract for a deployer; validating or previewing the deployer's chosen region's geographic coverage; any change to how existing OpenFreeMap/CARTO/UGRC/raster basemap sections behave or are configured.
