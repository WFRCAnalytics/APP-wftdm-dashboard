# Feature Specification: Appearance Settings Expansion

**Feature Branch**: `061-appearance-controls`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Expanded Appearance settings tab with four additions: (1) a single, consolidated categorical chart-color resolver with a real, ColorBrewer-backed palette catalog, plus a viewer-facing 'prefer colorblind-safe palettes' toggle, kept strictly separate from the existing scenario-color mechanism; (2) two-tier (deployer default + viewer session override) Primary/Secondary/Accent color pickers — no separate 'brand' concept on top of these three named roles; (3) a viewer-facing font picker for body/heading/monospace roles, defaulting to the dashboard's existing self-hosted typefaces but optionally overridable via a Google Fonts catalog, failing soft to the default if the font can't be loaded; (4) a continuous text-size slider scaling interface text app-wide."

## Context

This dashboard's Appearance settings tab (part of the Settings modal) today
offers exactly one control: a System/Light/Dark theme picker. Reached via
discussion with the requester before this spec was written, four additions
were agreed on, each addressing a distinct, real gap:

1. **Chart color duplication.** Category-keyed chart coloring (coloring a
   Sankey diagram's nodes, a treemap/sunburst's segments, a pie chart's
   wedges, or a radar chart's series — none of them a *scenario*) is
   resolved today by three separate, near-duplicate implementations, one
   per feature that introduced it, each with its own small, fixed palette
   catalog. This is unrelated to, and must stay unrelated to, this
   dashboard's *other* categorical coloring system — a scenario's own
   identity color, which already has its own deliberate, two-tier
   deployer-default/viewer-override precedence chain built for it. The
   requester wants the three duplicate implementations unified into one,
   backed by a genuinely richer, real named-palette catalog (drawing on
   well-known catalogs such as ColorBrewer), and a viewer-facing
   accessibility control that prefers colorblind-safe palettes — without
   that control ever bleeding into or conflicting with the separate
   scenario-color system's own precedence.
2. **Primary/Secondary/Accent color personalization.** This dashboard's
   three core visual roles — Primary, Secondary, and Accent — are fixed by
   whatever the currently shipped color tokens say. There is no separate
   fourth "brand" concept sitting above these three: this dashboard's own
   prior notion of a single signature brand color already maps onto the
   Accent role, so naming and controlling Primary/Secondary/Accent
   directly is the complete picture, not a subset of something larger. The
   requester wants both a deployer-level default (configured once,
   applying to every viewer of that deployment) and a viewer-level,
   per-session override on top of it — mirroring the two-tier pattern this
   dashboard already uses elsewhere (e.g. its scenario color system, its
   basemap and map-tile-source settings).
3. **Typeface personalization.** The dashboard's body, heading, and
   monospace text currently render in one fixed, pre-selected typeface
   per role. The requester wants the existing default preserved exactly
   as-is for anyone who doesn't ask for something else, plus an optional,
   viewer-facing way to pick a different font per role from a broad,
   externally hosted catalog (Google Fonts) — understood and accepted as
   introducing an explicit, opt-in second point of internet dependency for
   the dashboard (this dashboard already has one documented internet
   dependency: a one-time DuckDB-WASM extension fetch).
4. **Text size.** The requester wants a continuous control letting a
   viewer scale interface text size to their own preference.

All four are independent, additive, viewer-experience (not data,
query, or panel-authoring) concerns. None of them changes how any panel
type queries data, and none of them requires a `summarize.yaml` or
`dashboard-*.yaml` grammar change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One real, shared category color system with a colorblind-safe option (Priority: P1)

A dashboard viewer opens a tab containing chart panels that color by
category rather than by scenario — a Sankey diagram, a treemap, a pie
chart, a radar chart, or a plain bar/line chart whose series is some
category other than scenario. Today, which exact colors these get depends
on which of three separately maintained pieces of logic that particular
panel type happens to use. The viewer wants those colors to be consistent
and correct in every panel type, and — if they have difficulty
distinguishing certain hues — wants a single, dashboard-wide switch that
makes every one of those charts render with colors that remain
distinguishable to them, without needing to configure each dashboard
author's chart individually.

**Why this priority**: This is the requester's own strongest-stated
concern, addresses a confirmed, real duplication (three separate
implementations of the same idea), and delivers a genuine accessibility
improvement that benefits every category-colored chart across the whole
dashboard at once.

**Independent Test**: With no other part of this feature built, load a
dashboard containing at least one Sankey, one treemap/sunburst, and one
pie or radar panel, none of which specify an explicit color scheme.
Confirm all three render using colors drawn from the same underlying
catalog. Toggle "prefer colorblind-safe palettes" in Appearance settings
and confirm all three panels' default colors change together, live, to a
colorblind-safe set, and that a fourth panel with an explicit
author-chosen color scheme is unaffected by the toggle. Separately,
confirm a chart colored by scenario (e.g. a multi-scenario bar chart with
no color override configured) is unaffected unless colorblind-safe mode
is also on, in which case only its own *default* cycling colors shift,
never a scenario's explicit override or deployer-configured color.

**Acceptance Scenarios**:

1. **Given** two different chart panel types that both color by category
   with no explicit color scheme configured, **When** both are rendered on
   the same dashboard, **Then** they draw from the same underlying named
   palette catalog and produce visually consistent results for the same
   category values.
2. **Given** a panel with an author-configured, explicit color scheme,
   **When** the viewer enables "prefer colorblind-safe palettes," **Then**
   that panel's colors do not change.
3. **Given** a panel with no explicit color scheme, **When** the viewer
   enables "prefer colorblind-safe palettes," **Then** that panel's colors
   change, live, to a documented colorblind-safe set, with no page reload.
4. **Given** the viewer disables "prefer colorblind-safe palettes" again,
   **When** the setting changes, **Then** affected panels revert live to
   the ordinary default palette.
5. **Given** a chart panel colored by scenario (not by category) with no
   scenario color override or deployer palette configured, **When** the
   viewer enables "prefer colorblind-safe palettes," **Then** that panel's
   default color cycling also shifts to a colorblind-safe set, while any
   scenario that already has an explicit color (a viewer override or a
   deployer-configured scenario palette) keeps that exact color unchanged.

---

### User Story 2 - Scale interface text size to personal preference (Priority: P2)

A viewer finds the dashboard's default text size too small (or too large)
for their comfort and wants to adjust it without changing their operating
system or browser-wide settings, and without losing the ability to read
every part of the interface — headings, table contents, panel titles,
form controls.

**Why this priority**: Simple, self-contained, immediately useful
accessibility improvement with no interaction with any other part of this
feature or the app's data layer.

**Independent Test**: With no other part of this feature built, open
Appearance settings, move a text-size slider, and confirm interface text
throughout the app (not limited to the Settings modal itself) visibly
grows or shrinks in real time, remaining legible at both ends of the
supported range, with no layout breakage severe enough to hide a control
or make text unreadable.

**Acceptance Scenarios**:

1. **Given** the Appearance tab is open, **When** the viewer drags the
   text-size slider, **Then** interface text across the currently visible
   dashboard view resizes smoothly and immediately, with no reload.
2. **Given** the slider is set to its smallest or largest supported value,
   **When** the viewer views any part of the dashboard's interface
   chrome, **Then** all standard interface text remains legible and no
   critical control becomes unreachable or overlapped.
3. **Given** the viewer has changed the text size, **When** they reload
   the page, **Then** the text size returns to the dashboard's default —
   consistent with this dashboard's existing rule that no viewer
   preference persists across a reload.

---

### User Story 3 - Personalize the dashboard's Primary/Secondary/Accent colors, with a deployer default (Priority: P3)

A deployer publishing this dashboard for their own organization wants its
Primary, Secondary, and Accent colors to reflect their own visual identity
by default, without every individual viewer needing to configure
anything. Separately, an individual viewer wants the option to further
personalize those same three colors for their own session, without
needing the deployer's permission or involvement, and without
accidentally ending up with illegible text on top of their chosen color.

**Why this priority**: Valuable personalization capability, but more
involved than Story 1 or 2 (a new deployer-facing configuration surface,
a new picker UI, and a real contrast-safety requirement), and not the
requester's most emphasized concern.

**Independent Test**: With no other part of this feature built,
configure a deployer-level default for one of the three color roles,
confirm it renders for a viewer who has not set an override, then have
that viewer set their own override for the same role via the Appearance
tab's picker and confirm their override immediately takes visual
precedence over the deployer default, with legible text throughout.
Clearing the viewer's override reverts the dashboard to the deployer
default (or, if none is configured, the dashboard's own current default)
live.

**Acceptance Scenarios**:

1. **Given** a deployer has configured a default color for the Primary
   role, **When** a viewer with no override loads the dashboard,
   **Then** that deployer-configured color is applied wherever the
   Primary role is used, with an automatically legible paired text color.
2. **Given** a deployer default is configured, **When** a viewer opens
   Appearance settings and picks their own color for that same role,
   **Then** the viewer's own choice is applied instead, immediately, for
   the rest of their session.
3. **Given** a viewer has set an override, **When** they clear it,
   **Then** the role reverts to the deployer's configured default (or the
   dashboard's own current default, if the deployer configured none).
4. **Given** a viewer is choosing a color via the picker, **When** they
   enter a value directly as a hex code or as RGB numbers, **Then** the
   picker accepts it and the swatch, hex field, and RGB fields all stay in
   sync with each other and with the applied color.
5. **Given** any color is applied to any of the three roles (by deployer
   default or viewer override), **When** the dashboard renders text on top
   of that color, **Then** the text remains clearly legible, without the
   deployer or viewer needing to separately choose a text color themselves.
6. **Given** the viewer reloads the page, **When** the dashboard boots
   again, **Then** their own override is gone (reverted to the deployer
   default or dashboard default) while the deployer's own configured
   default, if any, is still applied — consistent with this dashboard's
   existing two-tier precedent (e.g. its scenario color system).

---

### User Story 4 - Personalize the dashboard's typefaces (Priority: P4)

A viewer wants the dashboard's body text, headings, or monospace/code text
to render in a font of their own choosing rather than the dashboard's
built-in default, without breaking the dashboard for themselves or anyone
else if their chosen font can't be loaded (for example, if they are
offline).

**Why this priority**: The most self-contained "nice to have" of the four
— valuable, but least critical, and the one addition that deliberately
introduces a new, optional point of internet dependency, so it is
sequenced last.

**Independent Test**: With no other part of this feature built, open
Appearance settings, pick a font for the body role from the font picker,
and confirm dashboard body text visibly switches to that font, live, with
no reload. Separately, simulate the external font catalog being
unreachable and confirm the dashboard continues to render body text
legibly in its existing default typeface rather than showing broken or
missing text.

**Acceptance Scenarios**:

1. **Given** the viewer has made no font selection, **When** they load the
   dashboard, **Then** it renders in exactly the same typefaces it does
   today, with no new network request for fonts.
2. **Given** the viewer opens the font picker, **When** they select a
   different font for the body, heading, or monospace role independently,
   **Then** only that role's text visibly changes, live, with no reload.
3. **Given** a viewer has selected a font, **When** the external font
   catalog cannot be reached (e.g. the viewer is offline), **Then** the
   dashboard continues rendering that role's text legibly in its existing
   default typeface, with no broken or invisible text anywhere.
4. **Given** the viewer reloads the page, **When** the dashboard boots
   again, **Then** their font selection is gone and the dashboard's
   default typefaces are used — consistent with this dashboard's existing
   rule that no viewer preference persists across a reload.

---

### Edge Cases

- What happens when a viewer enables "prefer colorblind-safe palettes"
  while a chart panel already has an explicit, author-configured color
  scheme? (The explicit configuration wins; the toggle only ever changes a
  *default*, never an explicit choice — matching how every other
  default-vs-override precedent in this dashboard already behaves.)
- What happens when a deployer configures a default for one of the
  Primary/Secondary/Accent roles and a viewer's session override for that
  same role are both present at once?
  (The viewer's override wins for that viewer's session; the deployer
  default still applies to every other viewer who hasn't overridden it.)
- What happens when a viewer picks a Primary/Secondary/Accent color that
  would be nearly identical to the dashboard's own background or card
  color? (The automatically computed paired text color must still resolve
  to something legible against the chosen color itself; this dashboard is
  not required to detect or warn about the chosen color blending into
  surrounding, unrelated interface regions.)
- What happens to a Primary/Secondary/Accent color override or a font
  selection when the viewer switches between light and dark theme
  mid-session? (Both remain
  applied exactly as chosen — neither the color override nor the font
  selection is theme-specific in this iteration.)
- What happens when the chosen Google Font is missing a character actually
  used in the dashboard, or loads only some weights? (Graceful, ordinary
  browser font-fallback behavior is acceptable; the dashboard is not
  required to guarantee full glyph or weight coverage for every possible
  externally chosen font.)
- What happens at the extreme ends of the text-size slider to a
  data-dense view (e.g. a wide table with many columns)? (Text must stay
  legible; some additional scrolling or wrapping at the largest size is
  acceptable, but no control should become completely hidden or
  unusable.)
- What happens to text drawn directly inside a chart's own graphic (e.g.
  Sankey/treemap/sunburst/pie/radar labels) when the text-size slider is
  changed? (It is accepted, documented, out-of-scope behavior for this
  iteration that such labels do not resize — they are not part of the
  standard interface chrome this control targets.)
- What happens if a viewer sets a color override, a font, and a
  non-default text size all at once, then only some of those settings are
  changed later? (Each of the three preferences is independent — changing
  one must never reset or affect either of the other two.)

## Requirements *(mandatory)*

### Functional Requirements

**Category chart color consolidation & colorblind-safe preference**

- **FR-001**: The dashboard MUST resolve category-keyed chart coloring
  (coloring driven by a non-scenario category value — including but not
  limited to Sankey nodes, treemap/sunburst segments, pie wedges, and
  radar series) through one single, shared color-resolution mechanism,
  replacing the separate, duplicated implementations that exist today.
- **FR-002**: The shared category color mechanism MUST offer a materially
  richer catalog of named categorical color schemes than exists today,
  including the standard ColorBrewer qualitative schemes, in addition to
  whatever schemes are already offered.
- **FR-003**: Consolidating the category color mechanism MUST NOT change
  the rendered colors of any existing panel that already specifies an
  explicit color scheme — no visible regression for already-configured
  content.
- **FR-004**: The dashboard's existing scenario-color resolution (a
  scenario's own identity color, including its deployer default and
  viewer override) MUST remain a distinct mechanism, unaffected by the
  category color consolidation, except as explicitly described in
  FR-005–FR-007.
- **FR-005**: The Appearance settings MUST offer a "prefer colorblind-safe
  palettes" control, available to every viewer regardless of deployment.
- **FR-006**: When "prefer colorblind-safe palettes" is enabled, the
  *default* categorical color scheme used by any panel that has not been
  given an explicit color scheme MUST draw from a documented
  colorblind-safe set.
- **FR-007**: When "prefer colorblind-safe palettes" is enabled, the
  *default* color cycling used by scenario-color resolution (for a
  scenario with neither a viewer color override nor a deployer-configured
  scenario color) MUST also draw from a documented colorblind-safe set.
- **FR-008**: "Prefer colorblind-safe palettes" MUST NOT change the
  resolved color for any panel with an explicit author-configured color
  scheme, nor for any scenario with an explicit viewer override or
  deployer-configured color — it changes only each mechanism's own
  default.
- **FR-009**: Enabling or disabling "prefer colorblind-safe palettes" MUST
  visibly apply to every already-rendered, affected panel immediately,
  without a page reload.

**Text size**

- **FR-010**: The Appearance settings MUST offer a continuous slider
  control that scales the size of standard interface text (headings, body
  text, labels, table content, panel titles, form controls) across a
  defined range.
- **FR-011**: Moving the text-size slider MUST visibly resize affected
  interface text immediately, without a page reload.
- **FR-012**: The text-size control's effect MUST NOT be required to
  extend to text drawn directly inside a chart panel's own rendered
  graphic (as opposed to the surrounding interface chrome) in this
  iteration.
- **FR-013**: The text-size preference MUST reset to the dashboard's
  default on a fresh page load — it MUST NOT persist across a reload.

**Primary / Secondary / Accent color personalization**

- **FR-014**: A deployer MUST be able to configure a default color for
  each of the Primary, Secondary, and Accent visual roles as part of this
  dashboard's existing deployer-configurable appearance settings
  (alongside its existing title/logo configuration).
- **FR-015**: A viewer MUST be able to override any of the Primary,
  Secondary, or Accent colors for their own current session via a picker
  in Appearance settings that supports choosing a color visually (a
  swatch) as well as entering a value directly as a hex code or as RGB
  numbers, with all three representations kept in sync.
- **FR-016**: For each of the three visual roles independently, a
  viewer's own session override, when set, MUST take precedence over the
  deployer's configured default for that role; with neither a viewer
  override nor a deployer default present, the role MUST fall back to the
  dashboard's own current, unconfigured color for that role.
- **FR-017**: Whenever a color is applied to the Primary, Secondary, or
  Accent role — by deployer default or viewer override — the dashboard
  MUST automatically compute a legible paired text/foreground color for
  it, without requiring the deployer or viewer to choose one separately.
- **FR-018**: A viewer MUST be able to clear their own override for any of
  the three roles independently, reverting that role to the deployer
  default (or dashboard default, if none is configured).
- **FR-019**: Changing a color override MUST visibly apply everywhere that
  visual role is used in the interface, immediately, without a page
  reload.
- **FR-020**: A viewer's Primary/Secondary/Accent color override(s) MUST
  reset on a fresh page load — they MUST NOT persist across a reload. A deployer's
  configured default MUST persist across every load, for every viewer of
  that deployment, until the deployer changes it.

**Typeface personalization**

- **FR-021**: With no viewer font selection made, the dashboard MUST
  render using exactly its existing default typefaces, with no new
  network request introduced.
- **FR-022**: The Appearance settings MUST offer a font picker with three
  independent selections — one each for the dashboard's body text,
  heading text, and monospace/code text roles.
- **FR-023**: The font picker MUST let a viewer choose from a broad,
  externally hosted font catalog for each of the three roles.
- **FR-024**: If a viewer-selected font cannot be loaded (including, but
  not limited to, the viewer being offline), the dashboard MUST continue
  rendering that role's text legibly using its existing default typeface,
  with no broken, missing, or invisible text.
- **FR-025**: Selecting a font for one role MUST NOT change the typeface
  used by either of the other two roles.
- **FR-026**: A viewer's font selection(s) MUST reset on a fresh page
  load — they MUST NOT persist across a reload.

### Key Entities

- **Category Color Resolver**: the single, shared mechanism (replacing
  three separate implementations) that resolves a color for a
  non-scenario category value, backed by a named palette catalog.
- **Colorblind-Safe Preference**: a single, viewer-session setting that
  changes the *default* palette used by both the Category Color Resolver
  and the existing scenario-color mechanism, without overriding any
  explicit configuration in either.
- **Primary/Secondary/Accent Defaults (deployer)**: up to three
  deployer-configured colors, one per role, applying dashboard-wide for
  every viewer who has not set their own override.
- **Primary/Secondary/Accent Override (viewer session)**: a viewer's own,
  per-role color choice for the current session only, taking precedence
  over the deployer default for that role.
- **Text Size Preference**: a single, viewer-session numeric scale factor
  applied to standard interface text.
- **Font Preference**: a viewer's session choice of typeface for each of
  the body, heading, and monospace roles, sourced from an external font
  catalog.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every existing chart panel that already specifies an
  explicit category color scheme renders with exactly the same colors it
  did before this feature ships — zero visible change.
- **SC-002**: A viewer can enable "prefer colorblind-safe palettes" and,
  within the same interaction (no reload), see both a category-colored
  chart with no explicit scheme and a scenario-colored chart with no
  override shift to a colorblind-safe color set.
- **SC-003**: A viewer can move the text-size slider from one end of its
  range to the other and read every standard interface element clearly at
  every point along the way.
- **SC-004**: A viewer can set a Primary, Secondary, or Accent color and
  see it applied dashboard-wide, with legible text on top of it,
  regardless of which color they pick.
- **SC-005**: A deployer's configured default color for any of the
  Primary/Secondary/Accent roles is visibly applied to a viewer who has
  made no override, and disappears again (back to the deployer default)
  the moment that viewer clears their own override — with no reload
  required for either transition.
- **SC-006**: A viewer can select a font for any of the three roles and
  see the dashboard's corresponding text visibly change; if the viewer is
  offline when making that selection, the dashboard continues to render
  legibly in its existing default typeface instead.
- **SC-007**: A viewer who reloads the page after changing any of the four
  additions' viewer-level settings sees every one of those settings back
  at its default, with no partial or inconsistent reset.
- **SC-008**: None of the four additions changes any existing panel's
  data, query behavior, or rendering when every new setting is left at its
  unconfigured/default state — a dashboard with none of these settings
  touched looks and behaves exactly as it does today.

## Assumptions

- The three duplicated category-coloring implementations being
  consolidated (serving Sankey, treemap/sunburst, and pie/radar panels
  today) are the only real "engines" of category-keyed coloring in this
  dashboard; the existing scenario-color mechanism already has its own,
  separately built two-tier precedence chain and is explicitly out of
  scope for consolidation — only its *default* palette gains a
  colorblind-safe option (FR-007), matching the category resolver's own
  new default behavior, without touching its override/deployer-default
  tiers.
- "Colorblind-safe" means drawing from named color sets with documented
  colorblind-safe status (for example, ColorBrewer's own
  colorblind-safe-flagged qualitative schemes); this feature does not
  require new, original color-perception research.
- There is no separate "brand color" concept sitting above Primary,
  Secondary, and Accent — this dashboard's own prior notion of a single
  signature brand color already corresponds to the Accent role, so these
  three named roles are the complete set; no new, fourth ("tertiary")
  visual role is introduced, and no umbrella "brand palette" entity exists
  independent of the three.
- A Primary/Secondary/Accent color (whether a deployer default or a
  viewer override) applies as a single, flat color used identically in
  both the light and dark theme — it is not a theme-paired pair of values
  the way this dashboard's logo settings are. This matches how this
  dashboard's existing scenario colors already work (one color, not a
  light/dark pair) and keeps the picker interaction simple. Refining this
  to a theme-aware pair is understood to be a possible future
  enhancement, not required here.
- The externally hosted font catalog is Google Fonts; using it is a
  deliberate, viewer-opt-in choice — the dashboard's default, unconfigured
  behavior remains fully self-contained and introduces no new network
  dependency.
- A viewer's Primary/Secondary/Accent color override, font selection, and
  text-size setting are three independent session preferences with no
  persistence beyond the current page load, consistent with this
  dashboard's existing rule that no viewer preference is stored in browser
  storage; a deployer's Primary/Secondary/Accent default, like this
  dashboard's other deployer-configured appearance settings, does persist
  (it lives in the deployer's own published configuration, not in the
  viewer's browser).
- None of the four additions requires any change to `summarize.yaml` or
  `dashboard-*.yaml` panel-authoring grammar, nor to how any panel type
  queries or receives data — all four are presentation-layer only.
- All four additions are independent of one another and may be
  implemented, tested, and shipped in any order without one blocking
  another.
