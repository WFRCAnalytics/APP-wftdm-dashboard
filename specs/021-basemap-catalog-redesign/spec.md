# Feature Specification: Basemap Catalog Redesign and Settings Modal Visual Polish

**Feature Branch**: `021-basemap-catalog-redesign`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "Feature: Basemap catalog redesign and Settings modal visual polish — redesign the Basemap tab's preset catalog into organized, named sections with visual previews for vector styles; replace the theme-paired app-default basemap with one static default; fix the Settings modal's height/width stability and switch to vertical left-side tabs." (Full text on file with this session.)

## Pre-Specification Research Findings

The user's description explicitly required several facts to be confirmed
before writing requirements, not assumed. All were confirmed directly
against this codebase's own already-recorded research and/or live sources
before this spec was written:

1. **UGRC endpoints** — confirmed against `tests/fixtures/dashboard-config/
   dashboard-3-basemaps.yaml` (011/016/017's own real, fixture-tested
   compositions, org `99lidPhWCzftIe9K`): "Vector Lite" = `LiteBase` +
   `LiteLabels` (the existing "Flowmap UGRC Composition" panel);
   "Vector Hybrid" = `Esri.WorldImagery` (raster) + `Vector_Overlay`
   (vector) — the real, already-fixture-proven "Utah Vector Hybrid Base
   Map" (the existing "Flowmap UGRC Vector Hybrid" panel). A THIRD real
   composition exists at this same org and was missed in the original
   feature description, not merely un-researched: "Vector Outdoors" =
   `OutdoorsBase` + `Outdoors_Labels` (the existing "Flowmap UGRC
   Outdoors Composition" panel) — the same pair directly involved in
   016-fix-ugrc-dark-mode's investigation and 017-multi-sprite-support's
   fix, confirmed reachable, valid MapLibre-spec style documents at
   `https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/
   OutdoorsBase/VectorTileServer/resources/styles/root.json` and the
   `Outdoors_Labels` sibling endpoint. All three are
   `BasemapComposition` (`{ layers: [...] }`) shapes already exercised in
   this exact codebase — no new endpoints invented.
2. **OpenFreeMap "3D" style** — confirmed absent. `specs/
   011-basemap-style-system/research.md` §5 already directly fetched
   OpenFreeMap's real catalog and found exactly five styles (`liberty`,
   `bright`, `positron`, `dark`, `fiord`) — no "3D" entry exists. Dropped
   per the user's own explicit instruction.
3. **"Open Map Tiles" / MapTiler key requirement** — confirmed required.
   MapTiler's own current API documentation states plainly that a
   MapTiler API key is required for any tile/style request, with no
   anonymous access path (`?key=YOUR_MAPTILER_API_KEY_HERE` is a
   mandatory part of every request URL). This project's own extracted
   `public/basemap/leaflet-providers.json` independently corroborates
   this: `MapTiler`'s URL template contains an unsubstitutable `{key}`
   token. Per the user's hard constraint, this section is **dropped
   entirely** — not included, not included with a caveat.
4. **leaflet-providers keyless raster catalog** — surveyed directly
   against the real, current `public/basemap/leaflet-providers.json` (36
   top-level providers). Three independent disqualifying conditions were
   checked per provider, not just "does the name suggest a key":
   - **Requires an API key/token/subscription key** in its URL template
     (`MapTilesAPI`, `Thunderforest`, `Jawg`, `MapBox`, `MapTiler`,
     `TomTom`, `OpenWeatherMap`, `HERE`, `HEREv3`, `AzureMaps`,
     `GeoportailFrance` — the last ships a public default key
     `"choisirgeoportail"` baked into the catalog, but its WMTS URL
     template also requires `{style}`/`{format}` substitution this
     project's raster-resolution code does not perform, an independent
     disqualifier). All excluded.
   - **HTTP-only tile endpoint** (`OpenFireMap`, `MtbMap`) — would be
     blocked by the browser's mixed-content policy on this app's
     HTTPS-served deployments (GitHub Pages / wfrc.utah.gov). Excluded
     for this reason, unrelated to licensing.
   - **URL template token this project's existing raster-resolution code
     does not substitute** beyond `{s}`/`{r}`/`{variant}`/`{z}`/`{x}`/
     `{y}` (`Stadia` and `OpenAIP`'s `{ext}`; `BasemapAT`'s `{type}`/
     `{format}`; `NASAGIBS`'s `{time}`/`{tilematrixset}`/`{maxZoom}`/
     `{format}`; `JusticeMap`'s `{size}`) — these are genuinely keyless
     but not currently resolvable without further work; excluded from
     *this* feature's curated list as a scoping decision (see
     Assumptions), not a licensing finding.

   The resulting curated, genuinely-keyless, currently-resolvable set:
   `OpenStreetMap`, `OpenSeaMap`, `OPNVKarte`, `OpenTopoMap`,
   `OpenRailwayMap`, `SafeCast`, `CyclOSM`, `Esri` (already used
   elsewhere in this app), `FreeMapSK`, `HikeBike`, `nlmaps`, `NLS`,
   `OneMapSG`, `USGS`, `WaymarkedTrails`, `OpenSnowMap`,
   `SwissFederalGeoportal` — 17 providers, several with multiple named
   variants. `CartoDB`'s own raster variants are deliberately excluded
   from this dropdown even though they are keyless and resolvable: its
   equivalent (and better) vector GL styles are already offered
   prominently in the CARTO Vector Tiles section, and surfacing a second,
   lower-fidelity "Positron"/"Dark Matter"/"Voyager" raster option in the
   same catalog would confuse rather than help (documented as an
   Assumption below, revisitable).
5. **leaflet-providers preview tool URL** — confirmed live and current:
   `https://leaflet-extras.github.io/leaflet-providers/preview/` is a
   real, reachable page titled "Leaflet Provider Demo" ("show mini maps
   for all the layers available in Leaflet-providers"), linking back to
   the `leaflet-extras/leaflet-providers` GitHub repository.
6. **Radix Tabs vertical orientation** — confirmed native support.
   `@radix-ui/react-tabs@1.1.21` (the version already installed and used
   by `components/ui/tabs.tsx`) exposes an `orientation?: 'horizontal' |
   'vertical'` prop on its Root primitive. No new primitive or library is
   needed — this is a markup/CSS layout change to the existing
   `Tabs`/`TabsList`/`TabsTrigger` wrapper, not a rebuild.
7. **Appearance tab's current form** — confirmed it already matches the
   desired "three directly visible buttons" design (`src/layout/settings/
   appearanceTab.tsx`, itself a 020-settings-modal correction per that
   feature's own research.md §9). No change needed for this specific
   point.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse, preview, and apply a basemap from organized, named catalog sections (Priority: P1)

A dashboard viewer opens Settings → Basemap and sees the built-in basemap
catalog grouped into clearly labeled sections — UGRC Vector Tiles, CARTO
Vector Tiles, OpenFreeMap, and Raster Tiles — instead of one flat,
undifferentiated list, so they can find and recognize the kind of basemap
they want (a UGRC composition vs. a generic web-cartography style vs. an
aerial-imagery fallback) without already knowing every preset's internal
name. Clicking a UGRC/CARTO/OpenFreeMap entry stages it as a candidate and
updates a single, persistent live preview area above the sections to show
it — nothing on the actual dashboard changes yet. The viewer compares the
staged candidate against the preview's starting point (the currently-
applied basemap) and clicks an explicit Apply action only when they want
that candidate to become the real, live global basemap every flowmap/
zonemap panel uses. Closing Settings, or switching to a different Settings
tab, without clicking Apply leaves the previously-applied basemap
completely unaffected.

**Why this priority**: This is the core, highest-value change — today's
flat list (already shipped in 020-settings-modal) gives no indication of
what each preset actually looks like or where it comes from, mixes UGRC's
Utah-specific compositions in among generic global styles with no visual
distinction, and applies a selection immediately with no way to compare it
against the current basemap first.

**Independent Test**: Open Settings → Basemap with no other change applied;
confirm every existing built-in preset (plus the three new UGRC entries)
appears exactly once, under exactly one of the four section headings;
confirm clicking any UGRC/CARTO/OpenFreeMap entry updates the shared
preview area live without changing what's actually applied; confirm
clicking Apply — and only clicking Apply — changes the live global
basemap via 020-settings-modal's existing mechanism.

**Acceptance Scenarios**:

1. **Given** the Basemap tab is open, **When** the viewer scrolls the
   catalog, **Then** they see four labeled sections in order: UGRC Vector
   Tiles, CARTO Vector Tiles, OpenFreeMap, Raster Tiles.
2. **Given** the UGRC Vector Tiles section, **When** the viewer clicks any
   of its three entries ("Vector Lite", "Vector Hybrid", "Vector
   Outdoors"), **Then** that entry becomes the tab's staged selection,
   visually marked as such, and the shared preview area updates to render
   the same real UGRC composition already proven in
   `dashboard-3-basemaps.yaml`'s fixture panels — without changing the
   currently-applied basemap.
3. **Given** the Basemap tab has just been opened, **When** the viewer
   looks above the four sections, **Then** a single, persistent live
   preview area is visible and already shows the currently-applied global
   basemap (or the resolved app-default, if no global override is set) —
   never blank.
4. **Given** the Raster Tiles section, **When** the viewer selects a
   provider from its dropdown, **Then** that provider becomes the tab's
   staged selection the same way any other section's entry would, but the
   shared preview area does not render it live — consistent with this
   section's existing no-live-preview treatment — and the dropdown itself
   offers no API-key-requiring entry, plus an "Explore options" control
   that opens `https://leaflet-extras.github.io/leaflet-providers/
   preview/` in a new tab.
5. **Given** the viewer has staged a selection different from what is
   currently applied, **When** they click Apply, **Then** the staged
   selection becomes the live global basemap via the same mechanism
   020-settings-modal already shipped, and every flowmap/zonemap panel
   with no author-configured basemap re-renders with it.
6. **Given** the viewer has staged a selection but has NOT clicked Apply,
   **When** they close the Settings modal (Escape, overlay click, or the
   Close button) or switch to a different Settings tab, **Then** the
   staged selection is discarded and the previously-applied global
   basemap is unaffected.

---

### User Story 2 - A single, predictable app-default basemap (Priority: P2)

A deployer/analyst who never touches the Basemap tab's settings, and a
viewer who never opens Settings at all, always see the same one
app-default basemap — not a light/dark-theme-paired pair that silently
changes which basemap loads whenever the viewer's OS theme or in-app
Appearance setting flips.

**Why this priority**: Second in priority because it is a smaller,
self-contained correction to already-shipped resolution logic
(011-basemap-style-system), independent of the catalog UI redesign in
User Story 1 — it changes what the bottom fallback tier resolves to, not
how the picker looks.

**Independent Test**: With no panel-level, tab-level, or global basemap
configured, toggle the Appearance tab between Light and Dark; confirm the
resolved basemap does not change — it stays the one static app-default
value in both themes. Confirm a deployer changing the exported default
constant in code changes what every such panel resolves to, unaffected by
theme.

**Acceptance Scenarios**:

1. **Given** no panel/tab/global basemap is configured and the viewer is
   in Light mode, **When** the panel resolves its basemap, **Then** it
   resolves to the single static app-default value.
2. **Given** the same unconfigured panel, **When** the viewer switches to
   Dark mode, **Then** the resolved basemap does not change.
3. **Given** the deployer has not changed the app-default constant,
   **When** any unconfigured panel resolves its basemap, **Then** it
   resolves to `carto-voyager`.
4. **Given** a viewer has picked a global basemap via Settings → Basemap,
   **When** any panel with no panel/tab-level `basemap:` resolves,
   **Then** the viewer's global pick still wins over the static
   app-default — this precedence tier is unaffected by this story.

---

### User Story 3 - A settings modal that doesn't resize or rearrange itself (Priority: P3)

A viewer switching between the Settings modal's tabs sees a fixed-size
modal — the same height and width no matter which tab is active — with
the tab list running down the left side instead of across the top, so the
modal reads as stable, predictable UI chrome rather than something that
jumps around, and so a future tab addition has an obvious place to go
without redesigning the header row.

**Why this priority**: Lowest priority — purely visual/UX polish to an
already-functionally-correct, already-shipped modal (020-settings-modal);
no underlying data or resolution logic changes.

**Independent Test**: Open Settings, measure the modal's rendered
height/width, switch through all four tabs, and confirm the measured
height/width never changes. Confirm the tab list renders as a vertical
column on the left with tab content to its right.

**Acceptance Scenarios**:

1. **Given** the Settings modal is open on any tab, **When** the viewer
   switches to any other tab, **Then** the modal's outer height and width
   do not change.
2. **Given** the Settings modal is open, **When** the viewer looks at its
   layout, **Then** the four tab triggers are arranged in a vertical list
   on the left edge of the modal, with the active tab's content to their
   right.
3. **Given** a tab whose content is shorter than the fixed modal height
   (e.g., Documentation), **When** that tab is active, **Then** the modal
   still renders at its full fixed height (extra space inside the content
   area, not a shrunk modal).
4. **Given** a tab whose content exceeds the fixed modal height (e.g., the
   expanded Basemap catalog, or a long Scenarios list), **When** that tab
   is active, **Then** that tab's own content area scrolls internally
   without changing the modal's outer size.

---

### Edge Cases

- What happens if a viewer's chosen UGRC composition preset (Vector Lite /
  Vector Hybrid / Vector Outdoors) becomes unreachable at runtime (network
  failure, service down)? → Unaffected by this feature: the existing
  FR-010-equivalent
  fallback from 011/012-basemap-style-system (uniform blank-style
  fallback, never a partial composite) already covers any composition,
  named or ad hoc.
- What happens if the deployer sets the new static app-default constant to
  a value that is itself unreachable? → Same existing fallback mechanism
  applies; this feature does not add new failure handling beyond what
  011/012 already guarantee for any basemap selection.
- What happens when a raster provider entry has multiple named variants
  (e.g., `Esri` has 10)? → All of that provider's variants appear as
  separate, individually selectable dropdown entries (grouped under the
  provider's own name), matching how `resolveRasterProvider()`'s existing
  dotted `Provider.Variant` addressing already works.
- What happens to an author's own dashboard-*.yaml that already references
  a raster provider excluded from this curated dropdown (e.g.,
  `OpenTopoMap` used directly today in `dashboard-3-basemaps.yaml`)? →
  Unaffected. This feature only curates what the Settings modal's viewer
  picker *offers*; it does not remove or restrict any name a dashboard
  author can still write directly in `basemap:` config, per
  011-basemap-style-system's existing author-facing catalog.
- What happens if a future author manually writes the exact same
  composition as a "Vector Lite"/"Vector Hybrid"/"Vector Outdoors" preset
  in their own dashboard-*.yaml? → Must continue to work identically — the
  UGRC preset names are aliases resolving to the same composition object
  shape, never a new, separate mechanism; removing a UGRC preset from the
  registry in the future must not break an author's own manually-written
  equivalent.
- What happens if a viewer stages a candidate, then closes the Settings
  modal or switches to a different Settings tab without clicking Apply? →
  The staged selection is discarded entirely (FR-014); the previously-
  applied global basemap is completely unaffected. Consistent with
  020-settings-modal's own no-persistence philosophy (constitution
  Principle VI) — a staged-but-unconfirmed choice never even reaches the
  in-memory global-basemap state, let alone anything durable.
- What happens if the curated raster provider list is still loading, or
  fails to load, the moment the viewer opens the Raster Tiles section? →
  The section MUST show an explicit loading or error state — never a
  silent blank gap — matching this project's established panel error/
  empty-state convention (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

**Catalog reorganization (User Story 1)**

- **FR-001**: The Basemap tab MUST present its catalog as four labeled
  sections, in this order: UGRC Vector Tiles, CARTO Vector Tiles,
  OpenFreeMap, Raster Tiles.
- **FR-002**: The UGRC Vector Tiles section MUST contain exactly three
  entries — "Vector Lite" (the `LiteBase` + `LiteLabels` composition),
  "Vector Hybrid" (the `Esri.WorldImagery` + `Vector_Overlay`
  composition), and "Vector Outdoors" (the `OutdoorsBase` +
  `Outdoors_Labels` composition) — all three resolving through the same
  `BasemapComposition` (`{ layers: [...] }`) shape already used by this
  project's existing fixture panels, not a new or separate resolution
  mechanism.
- **FR-003**: The CARTO Vector Tiles section MUST contain the three
  already-shipped CARTO presets (Positron, Dark Matter, Voyager),
  re-grouped visually with no change to their underlying preset
  definitions.
- **FR-004**: The OpenFreeMap section MUST contain the five already-shipped
  OpenFreeMap presets (Liberty, Bright, Positron, Dark, Fiord), re-grouped
  visually with no change to their underlying preset definitions. No "3D"
  entry is included — none exists in OpenFreeMap's real catalog.
- **FR-005**: The system MUST NOT present an "Open Map Tiles"/OpenMapTiles/
  MapTiler-branded section anywhere in the catalog, since meaningful use
  of that catalog requires a viewer-supplied API key.
- **FR-006**: The Raster Tiles section MUST present a dropdown of raster
  provider entries limited to the curated, genuinely-keyless,
  currently-resolvable set identified in Pre-Specification Research
  Finding 4. No entry requiring an API key, subscription key, or
  access token MAY be selectable, even with a warning label.
- **FR-007**: The Raster Tiles section MUST include an "Explore options"
  control that opens `https://leaflet-extras.github.io/leaflet-providers/
  preview/` in a new browser tab.
- **FR-008**: The Basemap tab MUST show a single, persistent live preview
  area above the four catalog sections. Selecting any entry in the UGRC
  Vector Tiles, CARTO Vector Tiles, or OpenFreeMap sections MUST update
  this shared preview to render that entry's basemap live. A selection
  from the Raster Tiles section MUST NOT update the live preview (no live
  preview for raster entries, unchanged from the original design intent).
- **FR-009**: The UGRC preset entries ("Vector Lite", "Vector Hybrid",
  "Vector Outdoors") MUST be implemented as named aliases resolving to
  the same `BasemapComposition` object shape an author can already write
  directly in their own `dashboard-*.yaml` — removing any alias from the
  registry in the future MUST NOT remove an author's ability to write the
  identical composition by hand.
- **FR-010**: Selecting a catalog entry (from any of the four sections)
  MUST mark it as the Basemap tab's staged selection — visually
  distinguished from whatever is currently applied — and MUST NOT, by
  itself, change the live global basemap.
- **FR-011**: The shared live preview area MUST show the currently-applied
  global basemap (or the resolved app-default, if no global override is
  set) the moment the Basemap tab is opened, before the viewer stages
  anything — never blank.
- **FR-012**: The Basemap tab MUST provide an explicit Apply (or Confirm)
  action. Only this action MUST call the same global-basemap mechanism
  020-settings-modal already shipped, applying whatever selection is
  currently staged — no other interaction on this tab may change the live
  global basemap.
- **FR-013**: The Raster Tiles section MUST participate in the same
  stage-then-apply flow as the other three sections (FR-010/FR-012) —
  selecting a provider stages it and requires the same explicit Apply
  action to take effect — differing from them only in that it never
  renders a live preview (FR-008).
- **FR-014**: Closing the Settings modal, or navigating away from the
  Basemap tab to a different Settings tab, while a selection is staged but
  not yet applied, MUST discard that staged selection — the previously-
  applied global basemap MUST remain unaffected.

**Static app-default (User Story 2)**

- **FR-015**: The system MUST resolve an unconfigured panel's basemap
  (no panel-level, tab-level, or viewer global basemap set) to one single,
  named, static app-default value — never a value that depends on the
  active color theme.
- **FR-016**: The app-default value MUST be a single named export in code,
  changeable by a deployer; if unchanged, it MUST resolve to
  `carto-voyager`.
- **FR-017**: The basemap resolution precedence chain MUST remain exactly:
  panel-level → tab-level → viewer global (020-settings-modal, unchanged)
  → static app-default (this feature, replacing the prior theme-paired
  pair). No new tier is introduced and no existing tier's relative
  ordering changes.
- **FR-018**: The basemap resolution function MUST NOT require a theme
  parameter once the theme-paired fallback is removed, since no branch in
  the resulting precedence chain depends on theme.

**Settings modal visual polish (User Story 3)**

- **FR-019**: The Settings modal MUST render at one fixed height and width
  regardless of which tab is active.
- **FR-020**: The Settings modal's tab list MUST be arranged vertically
  along the left edge of the modal, with the selected tab's content
  displayed to its right.
- **FR-021**: A tab whose content is shorter than the modal's fixed height
  MUST leave empty space within the content area rather than shrinking the
  modal; a tab whose content exceeds the fixed height MUST scroll
  internally within its own content area rather than growing the modal.
- **FR-022**: The Appearance tab's existing three-directly-visible-button
  presentation (System/Light/Dark) MUST be preserved unchanged by this
  feature.

### Key Entities

- **Basemap catalog section**: A named grouping (UGRC Vector Tiles, CARTO
  Vector Tiles, OpenFreeMap, Raster Tiles) containing one or more catalog
  entries; purely a presentation/organization concept, not a new data
  entity with its own persisted state.
- **UGRC preset alias**: A named catalog entry ("Vector Lite", "Vector
  Hybrid", "Vector Outdoors") that resolves to a specific, fixed
  `BasemapComposition` value — the same shape and resolution path an
  author's own dashboard-*.yaml `basemap:` composition already uses.
- **Curated raster provider entry**: One provider (or one named variant of
  a provider) from `public/basemap/leaflet-providers.json`, included in
  the Raster Tiles dropdown only if it requires no API key, uses only an
  HTTPS endpoint, and uses only URL-template tokens this project's raster
  resolution already substitutes.
- **App-default basemap**: A single named constant value, resolved only
  when no panel, tab, or viewer global basemap applies; no longer
  theme-dependent.
- **Staged basemap selection**: The Basemap tab's own, temporary,
  not-yet-applied candidate — set by clicking any catalog entry, read by
  the shared live preview area and the Apply action, and discarded
  entirely (never written anywhere durable or shared) the moment the tab
  or modal closes without Apply being clicked. Exists only for the
  duration the Basemap tab itself is open — never a persisted or
  cross-session concept, matching every other piece of this feature's
  own in-memory-only state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the app's existing built-in basemap presets (CARTO ×3,
  OpenFreeMap ×5) plus the three new UGRC presets appear in the redesigned
  catalog, each under exactly one section, with zero presets lost or
  duplicated.
- **SC-002**: 0% of the entries offered in the Basemap tab's picker (across
  all four sections) require a viewer-supplied API key to load
  successfully.
- **SC-003**: Switching the Appearance setting between Light and Dark
  produces no change in which basemap an unconfigured panel resolves to —
  0% of unconfigured panels re-pair on a theme change, down from the prior
  100% (every unconfigured panel previously re-paired every time).
- **SC-004**: The Settings modal's outer rendered height and width are
  identical across all four tabs, measured before and after every tab
  switch, in 100% of manual/automated checks.
- **SC-005**: A viewer can locate, preview, and apply a specific named
  UGRC composition ("Vector Lite", "Vector Hybrid", or "Vector Outdoors")
  without needing to know any composition's underlying service URLs.
- **SC-006**: 100% of catalog-entry clicks in the UGRC Vector Tiles, CARTO
  Vector Tiles, and OpenFreeMap sections update only the shared preview
  area — zero dashboard flowmap/zonemap panels change their rendered
  basemap until the viewer explicitly clicks Apply.
- **SC-007**: Closing the Settings modal or switching Settings tabs with an
  unapplied staged selection changes the live global basemap 0% of the
  time — the previously-applied basemap is unaffected in every case.

## Assumptions

- `CartoDB`'s raster tile variants (from `leaflet-providers.json`) are
  deliberately excluded from the Raster Tiles dropdown even though they
  are keyless and technically resolvable — their vector GL equivalents are
  already offered, more prominently, in the CARTO Vector Tiles section,
  and including both would present two different-fidelity "Positron"-named
  options with no clear reason to prefer either. This can be revisited if
  a real need for the raster variant specifically emerges.
- Providers that are genuinely keyless but use a URL-template token this
  project's raster-resolution code does not yet substitute (`Stadia`,
  `OpenAIP`'s `{ext}`; `BasemapAT`'s `{type}`/`{format}`; `NASAGIBS`'s
  `{time}`/`{tilematrixset}`/`{maxZoom}`/`{format}`; `JusticeMap`'s
  `{size}`) are excluded from this feature's curated list rather than
  extending the resolver to support them — that extension is a reasonable,
  separably-scoped follow-up, not required to satisfy this feature's own
  "no API key required" requirement.
- Each UGRC/CARTO/OpenFreeMap catalog entry is presented as a plain
  selectable option — a name/label plus a small per-section icon — not a
  photographic thumbnail per entry; the single shared live preview area
  (FR-008/FR-011) is what actually shows what a selection looks like, so
  no per-entry image asset is needed at all. This resolves what an
  earlier draft of this spec left open ("thumbnail vs. preview button, an
  implementation detail").
- The async Raster Tiles section (its curated provider list is fetched,
  not synchronous) MUST show an explicit loading state while pending and
  an explicit error state if the fetch fails — reusing this project's
  already-established, generic `PanelErrorState`/`PanelEmptyState`
  components rather than a silent blank gap. The exact loading-state
  visual treatment (an inline skeleton, matching this project's existing
  per-panel-skeleton convention rather than a new shared component) is an
  implementation detail, not a new FR — the requirement is "never
  silently blank," already covered by this project's established panel
  UX convention rather than needing its own new rule here.
- No persistence is added by this feature — the global basemap pick
  remains in-memory-only per 020-settings-modal's own established
  no-persistence convention (constitution Principle VI); reorganizing the
  catalog and fixing the app-default do not change that. The new staged
  selection is a further, even shorter-lived instance of the same
  philosophy — not persisted, not even kept in `state/basemapState.ts`
  until Apply is clicked, and discarded outright the moment the Basemap
  tab itself unmounts (modal close or tab switch).
- This feature does not change 011-basemap-style-system's panel-level or
  tab-level `basemap:` config resolution in any dashboard-*.yaml — those
  two tiers, and every existing preset name an author can already
  reference directly, are unaffected.
- This feature does not touch the `$baseline`/comparison-diff mechanisms
  (018/019/020-baseline-scenario-designation and
  019-baseline-diff-consumption) at all.
- AI/API-token integration remains out of scope, tracked separately per
  `docs/PIPELINE.md`, as stated in the feature description.
