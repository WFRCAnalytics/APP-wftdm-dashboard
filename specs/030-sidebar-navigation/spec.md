# Feature Specification: Left Sidebar Navigation, Accordion Sub-Sections, and a Chromeless Full-Page Panel Mode

**Feature Branch**: `030-sidebar-navigation`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Replace the current horizontal top-nav-with-tabs shell with a left sidebar (shadcn/ui's real Sidebar component, collapsible=\"icon\" mode) — Option B from project-docs/UX-REDESIGN-PROPOSAL.md, following its reconciliation-ledger findings exactly. Six primary items follow the ActivitySim submodel sequence from project-docs/CALIBRATION-SUMMARIES.md (Summary, Person/Household Models, Tour Models, Mode Choice, Trip Models, Network); a seventh, 'Explore Data', is a dedicated full-page destination for GraphicWalkerPanel rather than a panel competing for space in a multi-panel tab — this requires a new chromeless full-page panel rendering mode (dashboardRenderer.tsx + panelCard.tsx) and a real height-resolution fix in GraphicWalkerPanel.tsx, both confirmed this session as genuine gaps, not config tweaks. Each of the six ActivitySim-outline tabs shows its own sections as expandable sidebar accordion items, but only while that tab is active. Hide-on-Scroll nav mode is dropped entirely (not adapted). DashboardBrand relocates into the sidebar header; Settings relocates into the sidebar footer. The proposal's §4 content-grid/Metric-Strip conventions are in scope. Brand color is untouched."

## Research Findings (grounding this spec)

Confirmed directly against this codebase, `project-docs/CALIBRATION-SUMMARIES.md`,
`project-docs/GRAMMAR.md`, and the installed `lucide-react` package before writing
any requirement below — nothing here is re-derived speculation:

- **The six-tab count is confirmed correct against `project-docs/CALIBRATION-SUMMARIES.md`
  directly, re-read in full for this spec.** Its own section headings are,
  in order: "Level 1 — High-Level Summary (Summary Tab — Landing Page)",
  "Person / Household Models Tab", "Tour Models Tab", "Mode Choice Tab",
  "Trip Models Tab", "Network Tab" — exactly six, matching the requested
  primary-item list one-for-one. Nothing in the document suggests a
  different count or a different order.
- **Per-tab sub-section counts, confirmed by direct enumeration of that
  document's own `###` headings** (the real content the accordion
  sub-navigation in this feature needs to support): Summary — none (a
  flat KPI table, no `###` subdivisions at all); Person/Household Models
  — 8 (Auto Ownership, Work from Home, School Location, Workplace
  Location, Transit Pass Subsidy, Transit Pass Ownership, Telecommute
  Frequency, CDAP); Tour Models — 13 (Mandatory Tour Frequency through
  Stop Frequency); Mode Choice — 3 (Tour Mode Choice, At-Work Subtour
  Mode Choice, Trip Mode Choice); Trip Models — 4 (Trip Purpose, Trip
  Destination, Trip Scheduling, Zone Trip Ends by Mode); Network — mixed
  format (a 5-row metrics table for assignment/flows, plus two further
  `###` subsections, Land Use/Socioeconomics and Accessibility) — the one
  tab whose section boundaries are NOT already expressed as clean,
  parallel `###` headings the way the other five are. This unevenness is
  addressed in Assumptions below, not glossed over.
- **No existing named-grouping/heading concept exists on a dashboard row
  today — confirmed by direct read, not assumed.** `dashboardRenderer.tsx`
  does `Object.entries(tab.layout).map(([rowName, panels]) => ...)` — the
  JS object key a YAML author writes (e.g. `row_kpis`) is used ONLY as a
  React list `key` prop; it is never rendered as visible text anywhere.
  `project-docs/GRAMMAR.md`'s own row grammar (`layout: { <row_name>: [panels...] }`)
  has no `heading:`/`label:` field of any kind. This confirms the required
  research finding plainly: the accordion sub-navigation this feature
  needs cannot be built by reusing anything that already exists — a real,
  new, additive grammar concept is required (see Key Entities and FR-013
  below for the specific, minimal shape chosen).
- **The chromeless full-page panel gap is not a guess — it was measured
  live this session**, against the real dev server, with a dedicated tab
  authored to contain exactly one `graphic-walker` panel at `width: 1.0`
  and no `height:` set. At a 1440×900 viewport: 238px of chrome
  (redundant page-title block + `Card` border/shadow/`CardHeader` title
  bar + `CardContent` padding) sits above the panel's own content, 49px
  sits on each side, and the panel's own real rendered height settled at
  a fixed **635px** — a library-intrinsic default with no relationship to
  available viewport space, confirmed to be the exact same number already
  independently documented in `graphicWalkerPanel.css`'s own prior
  bug-fix comment. The page needed to scroll (922px of content in a
  900px viewport) while simultaneously leaving dead space below the
  panel — the worst of both outcomes, not a close call. See
  `project-docs/UX-REDESIGN-PROPOSAL.md` (this session, same date) for the full
  proposal this measurement grounds, and its own §7 reconciliation
  ledger for the Hide-on-Scroll and `DashboardBrand` findings this spec
  carries forward without re-deriving.
- **Every candidate `lucide-react` icon name was verified against the
  actually-installed package** (`^0.460.0`) before being written into
  this spec: `LayoutDashboard`, `Users`, `Route`, `Shuffle`, `TramFront`,
  `Navigation`, `Network`, `Telescope`, `Sparkles`, `Settings`,
  `PanelLeft`, `ChevronRight`, `ChevronDown`, `BookOpen`, `FileText`,
  `Compass` — all exist. One additional, real finding beyond simply
  verifying the candidates: `Compass` is **already** this app's own
  established icon for the graphic-walker/explore concept specifically —
  `GraphicWalkerPanel.tsx`'s own empty-result state already renders
  `icon={Compass}`. FR-012 below chooses `Compass` for "Explore Data"
  over both proposed alternatives (`Telescope`, `Sparkles`) on exactly
  this basis: reusing an icon this app has already chosen for the same
  concept is stronger consistency than picking a fresh one.
- **`Documentation` has no icon to "keep" — confirmed by direct read**:
  `layout/settings/documentationTab.tsx` is a bare `<p>` placeholder
  inside `SettingsModal`'s own `TabsList`, which renders no per-tab icons
  at all today. FR-005 and Assumptions below correct the input's own
  framing plainly rather than inventing an icon that was never real:
  `Documentation` stays exactly where it is today (a tab inside the
  Settings modal), not promoted to its own sidebar-footer entry — only
  `Settings` (which already has a real, current icon) relocates to the
  sidebar footer.
- **`navBar.tsx`'s own current tab-list rendering, confirmed by direct
  read, is what FR-003's discovery-driven requirement is required to
  match exactly**: `{tabs.map((tab) => (<TabsTrigger key={tab.header.tab}
  value={tab.header.tab}>{tab.header.tab}</TabsTrigger>))}` — a plain map
  over whatever `DashboardTabConfig[]` array `shell.tsx` passes in (the
  full result of `loadDashboards()`, itself driven entirely by
  `dashboard-config/index.json`). Zero tab name, count, or order is
  written anywhere in that component. The sidebar item list this feature
  builds MUST be provably the same: a map over the identical discovered
  array, never a hardcoded six-or-seven-item list anywhere in the
  sidebar's own code.
- **The Hide-on-Scroll nav-bar-mode removal touches exactly four files,
  confirmed by a full-codebase reference search, not assumed**:
  `hooks/useNavBarVisibilityMode.ts`, `state/navBarVisibilityState.ts`,
  `layout/shell.tsx` (its wiring), and `layout/settings/appearanceTab.tsx`
  (the "Top Bar Behavior" control surfacing it to the viewer). A fifth
  file, `hooks/useScrollDirection.ts`, has exactly one caller
  (`shell.tsx`) and becomes dead code the moment that wiring is removed
  — named here so it isn't left as an orphaned, undiscovered zero-consumer
  file the way earlier features in this project's history have
  occasionally left one behind.
- **No accessible expand/collapse (accordion) primitive exists in this
  codebase today, and neither does shadcn's `Sidebar` primitive itself**
  — confirmed via direct `package.json`/`components/ui/` inspection:
  the installed `@radix-ui/react-*` set covers `dialog`/`dropdown-menu`/
  `tabs`/`tooltip` only, and `components/ui/` has no `sidebar.tsx`. Both
  are real, new additions this feature introduces — named here as a
  scope-relevant finding; the exact underlying package/primitive choice
  is a planning-phase decision, not fixed by this spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate the dashboard via a left sidebar instead of top tabs (Priority: P1)

A calibration analyst opens the dashboard and finds every dashboard tab
listed in a left-hand sidebar instead of a horizontal tab strip at the
top of the page. They can collapse the sidebar to an icon-only rail to
reclaim horizontal space for a wide chart or table, and expand it back
to see full tab labels, entirely by their own manual action — nothing
about the sidebar's visibility reacts to scrolling.

**Why this priority**: This is the foundational structural change every
other story in this feature depends on or is delivered through. It
directly and structurally resolves the two concrete navigation problems
already identified this session: a horizontal tab strip with no defined
behavior once tab labels overflow the header's width, and dashboard-wide
settings visually flattened into the same row as primary navigation.

**Independent Test**: Load the dashboard with the existing (or an
expanded) set of dashboard tabs; confirm every tab is reachable from the
sidebar with no horizontal overflow regardless of tab count, confirm the
sidebar collapses/expands only on a manual trigger (never on scroll), and
confirm the app's brand/logo and the Settings entry point are visually
distinct from the tab list itself. Delivers real value — solved
navigation — even with no accordion sub-sections and no chromeless
full-page mode yet built.

**Acceptance Scenarios**:

1. **Given** a scenario is loaded with the default six-tab-plus-Explore-Data
   set, **When** the dashboard finishes loading, **Then** all seven items
   are visible in the sidebar with no horizontal scrolling or
   text-wrapping collision.
2. **Given** the sidebar is expanded, **When** the analyst clicks the
   collapse control, **Then** the sidebar reduces to an icon-only rail and
   the main content area's available width increases correspondingly.
3. **Given** the sidebar is in its default (expanded) state, **When** the
   analyst scrolls down a long tab's content, **Then** the sidebar's own
   visibility and width are completely unaffected by the scroll position
   (no hide/show transition of any kind tied to scrolling).
4. **Given** a deployer's `dashboard-config/index.json` lists more tabs
   than the default set (e.g., nine instead of seven), **When** the
   dashboard loads, **Then** every listed tab still renders as a reachable
   sidebar item with no code change required — the sidebar's item list is
   driven entirely by what is discovered at runtime, matching this
   project's existing non-negotiable that tab count/names are never
   hardcoded.

---

### User Story 2 - Explore data on a dedicated, edge-to-edge page (Priority: P2)

An analyst wants to freely explore a dataset with the Graphic Walker
tool. They select "Explore Data" from the sidebar and land on a
workspace that fills essentially the entire available viewport below the
header — no redundant page title repeating the panel's own heading, no
card border/shadow/padding shrinking the usable area, and no fixed,
viewport-independent height leaving dead space below the tool or forcing
the page to scroll to see its bottom edge.

**Why this priority**: This is the concrete, measured gap this session's
own live investigation confirmed — not a hypothetical. A viewer's actual
working area for open-ended data exploration is a core piece of what
makes the redesign's stated goal ("how the plot panels are appropriately
sized") tangible, not just structural navigation. Ranked P2 rather than
P1 because the sidebar itself (User Story 1) is the more foundational,
lower-risk piece to land first — this story's own new full-page
rendering mechanism is more novel and benefits from the sidebar already
existing as its real delivery vehicle.

**Independent Test**: Navigate to a tab configured for the new chromeless
full-page mode with exactly one panel; measure the panel's own rendered
content area against the viewport, confirming near-zero unused chrome
above/beside it and a height that tracks real available viewport space
rather than a fixed library default.

**Acceptance Scenarios**:

1. **Given** the analyst selects "Explore Data" from the sidebar,
   **When** the page renders, **Then** no page-title heading duplicating
   the panel's own title appears, and no `Card` border/shadow/rounded-corner
   chrome wraps the panel's content.
2. **Given** the Explore Data workspace is open, **When** the analyst
   resizes the browser window taller or shorter, **Then** the workspace's
   own rendered height changes to track the new available space (never
   staying fixed at a constant pixel value regardless of viewport size).
3. **Given** the analyst is on the Explore Data page, **When** they look
   for a way to "expand" the panel further (the existing generic
   expand-to-dialog control other panel types offer), **Then** no such
   control is shown — the panel is already rendered at its maximum
   useful size, so an expand trigger would be redundant.
4. **Given** a different dashboard author configures some OTHER panel
   type (not `graphic-walker`) as a tab's sole full-page panel, **When**
   that tab renders, **Then** it receives the same chromeless, edge-to-edge
   treatment — the full-page rendering mechanism itself is generic across
   panel types, even though `graphic-walker` is this feature's only
   required, validated consumer of it.

---

### User Story 3 - Jump directly to a submodel section within a long tab (Priority: P2)

While reviewing the Person/Household Models tab — a long page covering
eight distinct submodels in ActivitySim sequence — an analyst wants to
jump straight to "Workplace Location" without scrolling past everything
before it. Because Person/Household Models is the currently active
sidebar item, its own sub-sections appear as an expandable list directly
beneath it; clicking "Workplace Location" scrolls the page straight to
that section. Switching to a different tab collapses this sub-list away
— only the active tab shows its own sections.

**Why this priority**: A direct, real consequence of the six-tab
ActivitySim-outline structure itself: several of the six tabs are long
enough (up to 13 real sub-sections on Tour Models) that reaching a
specific submodel by scrolling alone is a genuine, named usability cost.
Ranked P2, alongside Explore Data — it depends on User Story 1's sidebar
existing as the surface this sub-navigation renders inside, but is
otherwise independently valuable and testable.

**Independent Test**: Author a tab with the new, optional section-grouping
grammar naming two or more sections; confirm the sidebar shows that
tab's sections only while it is the active tab, confirm each section
entry scrolls the page to the right content, and confirm switching to a
different tab hides the first tab's sections without needing to
re-collapse them manually.

**Acceptance Scenarios**:

1. **Given** the Person/Household Models tab is active and its eight
   sections are authored using this feature's new section grammar,
   **When** the analyst views the sidebar, **Then** all eight section
   names appear as sub-items beneath that tab's own primary item.
2. **Given** the analyst clicks a section sub-item, **When** the page
   responds, **Then** the corresponding content scrolls into view without
   a full page navigation/reload.
3. **Given** the Person/Household Models tab's sub-items are expanded,
   **When** the analyst switches to the Tour Models tab, **Then** the
   Person/Household Models sub-items are no longer shown, and Tour
   Models' own sections appear in their place.
4. **Given** a tab has no sections authored at all (e.g., Summary, whose
   own real content has no natural sub-division), **When** that tab is
   active, **Then** its sidebar item shows no expand affordance and no
   empty/placeholder sub-list.
5. **Given** the sidebar is collapsed to its icon-only rail, **When** a
   tab with sections becomes active, **Then** no sub-items are shown in
   that collapsed state (consistent with every primary item also losing
   its text label in that state) — expanding the sidebar is required to
   see or use section sub-navigation.

---

### User Story 4 - See KPI values and chart/table rows as a coherent, aligned grid (Priority: P3)

An analyst viewing the Summary tab sees its value-box KPIs presented as a
visually distinct, evenly-sized strip of cards, and sees chart/table rows
elsewhere in the dashboard align to consistent column boundaries across
different rows on the same tab, rather than each row's own column widths
being an independent coincidence of authored fractions.

**Why this priority**: A real, named piece of the redesign's own stated
goal but the smallest, most self-contained of the four stories — it
changes only `dashboardRenderer.tsx`'s row-layout math and touches
nothing about navigation, sections, or the full-page mode. Fully
independently testable and shippable on its own, including before or
after any of the other three stories.

**Independent Test**: Render a tab whose one row is composed entirely of
`valuebox` panels; confirm the row lays out as an evenly-sized card grid
distinct from a generic fraction-based row. Render a tab with multiple
rows whose panel `width` values are authored as simple fractions (e.g.
0.5, 0.25); confirm column boundaries are consistent across those rows.

**Acceptance Scenarios**:

1. **Given** a tab row contains only `valuebox` panels, **When** it
   renders, **Then** the cards lay out using a minimum-card-width,
   auto-fill arrangement rather than the plain equal-fraction division
   used for other panel types.
2. **Given** two different rows on the same tab each author panel
   `width` values that are simple twelfths (e.g., 0.5 = 6/12, 0.25 =
   3/12), **When** both rows render, **Then** their column boundaries
   align vertically down the page.
3. **Given** an existing, already-authored `dashboard-*.yaml` file with
   no changes of its own, **When** it renders under this feature,
   **Then** its existing panel-width behavior is visually unchanged
   (this story changes how new/adjusted authoring aligns, not how every
   existing `width` value is silently reinterpreted).

---

### Edge Cases

- A `sections:` entry (User Story 3's new grammar) names a row that does
  not exist anywhere in that tab's own `layout:` — treated as a
  config-authoring error: a console warning naming the missing row, and
  that one section is simply omitted from the sidebar (never a blank
  sidebar or a crashed tab), matching this project's established
  fail-soft convention for a similar class of authoring mismatch
  (`FlowMapPanel.tsx`'s/`SankeyPanel.tsx`'s own excluded-row warnings).
- A tab is authored with `full_page: true` but has zero panels, or more
  than one panel across its `layout:` — full-page mode requires exactly
  one panel; a misconfigured tab falls back to the ordinary multi-row,
  `Card`-chromed rendering (with a console warning), never a blank or
  broken page.
- A `full_page: true` tab also authors `header.description` — since
  full-page mode's whole purpose is eliminating the redundant page-title
  block this session measured, neither `header.title` nor
  `header.description` renders anywhere on a full-page tab. This is
  deliberate, not an oversight — flagged explicitly here so it is not
  mistaken for a bug later.
- The browser viewport narrows below whatever breakpoint the adopted
  Sidebar primitive defines as "mobile" — the sidebar's own built-in
  responsive behavior (collapsing to an off-canvas/sheet overlay) applies
  unmodified; this feature does not invent a separate, custom breakpoint.
- A dashboard tab's title/icon is long enough to visually strain the
  collapsed icon-only rail's fixed width — the icon-only rail shows the
  icon alone (no truncated label text) in collapsed state, matching
  every reference Sidebar implementation researched this session.
- An author omits the new optional `icon:` field on a tab's `header:` —
  the sidebar renders that item with no icon (a plain text label at
  expanded width; effectively invisible/skipped at collapsed
  icon-only width, since there is no icon to show) rather than a
  default/placeholder icon, matching this project's own established
  "an unconfigured optional field renders nothing, never a guessed
  substitute" convention (`028-dashboard-branding`'s own logo/title
  handling is the direct precedent).

## Explicit scope boundary: dashboard content vs. built-in app chrome

Added on direct request, before planning proceeds — each of the four
points below was checked against the actual requirements above, not
assumed correct by default. This section is the single place a future
reader (or a future feature touching this same code) can confirm the
boundary without having to infer it from scattered FR wording.

1. **The sidebar's primary item list has no tab name, count, or order
   baked into it anywhere.** FR-003 requires it to be driven entirely by
   runtime discovery (`dashboard-config/index.json`), and the Research
   Findings bullet above confirms this is required to work exactly the
   way `navBar.tsx`'s own current tab list already does — a plain map
   over the discovered array, nothing more. User Story 1's Acceptance
   Scenario 4 exists specifically to make this testable: swap the
   discovered set to nine tabs instead of seven and the sidebar MUST
   follow with zero code change. A deployer who replaces every one of
   this repo's own fixture/demo tabs with an entirely different set of
   dashboard files gets a correspondingly different sidebar — the
   ActivitySim six-tab-plus-Explore-Data structure is this repo's own
   **content choice** (fixture/demo `dashboard-*.yaml` files), not
   anything the sidebar component itself knows or enforces.
2. **Icon assignment is a per-tab YAML field, never a hardcoded
   name-to-icon table.** FR-007's new `icon:` field resolves through the
   same generic kebab-case-to-PascalCase `lucide-react` lookup
   `ValueBoxPanelConfig.icon`/`iconComponentFor()` already uses today —
   a string-to-component resolution function with no per-tab-name
   branching of any kind, not a switch/map keyed on tab title. The six
   icon choices this session proposed (`LayoutDashboard` for Summary,
   `Users` for Person/Household Models, and so on) are this repo's own
   fixture-content authoring decision, written into each fixture tab's
   own `header.icon:` field — not a rule enforced by, or even
   referenced from, any application code. A deployer authoring their own
   tab titled anything else picks whatever icon they want, or none.
3. **The `sections:` accordion grammar (FR-013–FR-017) is fully generic
   across any tab's own author-defined sections.** Nothing in those five
   requirements references an ActivitySim submodel name, a specific tab,
   or a specific section count. The Research Findings section's own
   enumeration of the real Person/Household Models (8), Tour Models
   (13), Mode Choice (3), Trip Models (4), and Network sub-sections
   exists there only as **grounding evidence** — proof this grammar
   needs to support double-digit section counts on a real tab, not a
   vocabulary or schema constraint written into the grammar itself. Any
   dashboard author on any tab (whether or not it resembles the
   ActivitySim outline at all) authors whatever `sections:` entries and
   labels they want.
4. **Exactly one legitimate, deliberately hardcoded, app-level
   exception exists: the `Settings` entry point (FR-005), footer-anchored,
   never dashboard-content-driven.** It is not a `dashboard-*.yaml` tab at
   all — it is built-in application chrome that exists regardless of what
   a deployer publishes, exactly as true today (as `SettingsModal`) as it
   will be after this feature. `Documentation` is not a second exception
   with its own sidebar position — per the Research Findings correction
   above, it stays nested inside the `Settings` modal's own tab strip,
   unchanged, never promoted to a separate sidebar item. **"Explore
   Data" is explicitly NOT part of this exception.** It is ordinary,
   fully author-configurable `dashboard-*.yaml` content — mechanically
   identical to Summary/Person-Household/Tour/Mode-Choice/Trip/Network,
   just authored (in this repo's own fixtures, per FR-012) using the new
   `full_page:`/`icon:` fields every other tab could equally use. FR-012
   requires this repo's own **fixture/demo content** to include such a
   tab — it does not require the sidebar or full-page mechanism
   (FR-008–FR-011) to know that tab's name, and neither of those FRs
   references "Explore Data" anywhere in their own wording. Nothing in
   this feature extends the `Settings`-style hardcoded-exception pattern
   to any other item — it remains a set of exactly one.

## Requirements *(mandatory)*

### Functional Requirements

**Sidebar shell (User Story 1)**

- **FR-001**: The app MUST replace the existing horizontal top-nav tab
  strip with a left-hand sidebar as the primary means of switching
  between dashboard tabs.
- **FR-002**: The sidebar MUST support a manually-triggered
  expanded/collapsed-to-icon-only state; nothing about this state MUST
  react to page scroll position.
- **FR-003**: The sidebar's list of primary navigable items MUST be
  driven entirely by whatever dashboard tabs are discovered at runtime
  (the existing `dashboard-config/index.json` discovery mechanism) — no
  tab count or name MUST be hardcoded anywhere in the sidebar's own
  rendering logic. This MUST be provably the same mechanism
  `navBar.tsx`'s own current tab list already uses today (a plain map
  over the discovered `DashboardTabConfig[]` array) — not a
  reimplementation that happens to look similar.
- **FR-004**: The app-wide brand/logo control (`DashboardBrand`) MUST
  relocate into the sidebar's own header region; its existing
  conditional rendering behavior (no logo configured → no image; no
  title configured → no text) MUST be unchanged.
- **FR-005**: The Settings entry point MUST relocate into the sidebar's
  own footer region, visually distinct from the primary tab-item list
  above it.
- **FR-006**: The existing Hide-on-Scroll / Always-Visible nav-bar
  visibility mode MUST be removed entirely — including its own control
  inside the Appearance settings tab — not adapted or reinterpreted for
  the sidebar.
- **FR-007**: A dashboard tab's `header:` grammar MUST gain a new,
  optional `icon:` field (a `lucide-react` icon name, following the same
  kebab-case-to-PascalCase resolution convention `type: valuebox`'s
  existing `icon:` field already uses); omitting it MUST render that
  sidebar item with no icon, never a default/placeholder one.

**Chromeless full-page panel mode (User Story 2)**

- **FR-008**: A dashboard tab's `header:` grammar MUST gain a new,
  optional `full_page: true` flag. When set and the tab's `layout:`
  contains exactly one panel, that panel MUST render edge-to-edge below
  the app header — with no page-title block, no panel `Card`
  border/shadow/rounded corners, and no panel-title header bar.
- **FR-009**: The full-page panel's own available height MUST track real,
  current viewport space (the space remaining below the app's own
  header), not a fixed pixel value and not a library-intrinsic default
  height. This MUST be verified specifically for `graphic-walker`, whose
  height-resolution chain was confirmed this session to currently settle
  at a fixed, viewport-independent 635px.
- **FR-010**: The chromeless full-page rendering mode MUST be generic
  across panel types at the mechanism level (`dashboardRenderer.tsx`/
  `panelCard.tsx`) — `graphic-walker` is this feature's only required,
  validated consumer, but no other panel type MUST be structurally
  prevented from being configured this way.
- **FR-011**: A panel rendered in chromeless full-page mode MUST NOT
  offer the existing generic expand-to-dialog control (`Maximize2`
  trigger) — already rendered at its maximum useful size, that control
  would be redundant.
- **FR-012**: This repository's own default demo/fixture
  `dashboard-*.yaml` content MUST include a tab using `full_page: true`
  with a `graphic-walker` panel and the `Compass` icon (this app's own
  already-established icon for the graphic-walker/explore concept —
  reused, not independently re-chosen). **Correction, made after real
  content landed on this branch post-dating this FR's original wording
  (see FR-012a immediately below)**: this tab is the real, already-
  published `public/demo-dashboard-config/dashboard-5-explore.yaml`,
  titled "Explore" (`header.tab: Explore`) — not the illustrative
  "Explore Data" name this FR originally invented before that content
  existed. This is a fixture/demo-**content** requirement only — it
  constrains what this repo's own sample `dashboard-*.yaml` files
  contain, never the sidebar or full-page mechanism itself
  (FR-001–FR-011), neither of which MUST reference this tab's name,
  title, or presence anywhere in their own logic.
- **FR-012a**: The real, already-published `dashboard-5-explore.yaml`
  currently contains TWO panels — a `markdown` "About This Demo" panel
  (real, accurate prose about the three real ActivitySim scenarios) plus
  the `graphic-walker` panel — and therefore does NOT currently satisfy
  FR-008's exactly-one-panel condition for `full_page: true`. This
  feature's implementation MUST resolve this by relocating the existing
  "About This Demo" markdown panel's content into
  `public/demo-dashboard-config/dashboard-1-overview.yaml` (the Overview
  tab, which already introduces the same three real scenarios this
  markdown content describes — a coherent, natural home for it, not an
  arbitrary dumping ground), leaving `dashboard-5-explore.yaml` with
  exactly one panel (`graphic-walker`) so it can be configured
  `full_page: true` and genuinely validate FR-009/FR-010/FR-012 against
  REAL, already-published content — not a fixture stand-in built only to
  satisfy this FR's letter. **This MUST be resolved as its own explicit,
  reviewable task during implementation — never silently folded into a
  different task or left for whoever implements FR-008/FR-009 to
  improvise.**

**Accordion sub-navigation (User Story 3)**

- **FR-013**: `dashboard-*.yaml`'s tab-level grammar MUST gain a new,
  optional `sections:` list, each entry naming a stable `id`, a
  viewer-facing `label`, and the one or more existing `layout:` row
  names it groups together. This MUST be purely additive: a tab with no
  `sections:` key MUST render exactly as it does today, with no
  sidebar sub-navigation.
- **FR-014**: While a tab with one or more `sections:` entries is the
  active sidebar item, the sidebar MUST show each section as an
  expandable sub-item beneath that tab's own primary item.
- **FR-015**: A tab's section sub-items MUST only be shown while that
  tab is the currently active one — switching the active tab MUST hide
  the previously-active tab's own sections and, if the newly-active tab
  has its own `sections:`, show those instead.
- **FR-016**: Selecting a section sub-item MUST scroll the current page
  to that section's own content without a full page reload/navigation.
- **FR-017**: When the sidebar is collapsed to its icon-only state, no
  tab's section sub-items MUST be shown, regardless of which tab is
  active.

**Content grid / Metric Strip conventions (User Story 4)**

- **FR-018**: A tab row composed entirely of `valuebox` panels MUST lay
  out as an auto-filling grid of minimum-width cards (a "Metric Strip"),
  distinct from the plain equal-fraction column division every other
  row composition uses.
- **FR-019**: `project-docs/GRAMMAR.md` MUST document a named twelfths-based
  convention for the existing `width:` field, so panel-width fractions
  authored as twelfths align consistently across different rows on the
  same tab. This MUST require no change to `dashboardRenderer.tsx`'s
  existing fraction-to-`fr`-unit grid math — any fraction already works
  today; this is an authoring-guidance formalization, not a new runtime
  behavior.
- **FR-020**: An existing, unmodified `dashboard-*.yaml` file's rendered
  layout MUST be visually unchanged by this feature, except for a row
  composed entirely of `valuebox` panels (FR-018).

**Cross-cutting**

- **FR-021**: Every new or changed surface introduced by this feature
  MUST be verified correct in both light and dark theme, per this
  project's existing non-negotiable dual-theme verification requirement.
- **FR-022**: No change in this feature MUST touch WebGL/map lifecycle
  code in `FlowMapPanel.tsx`/`ZoneMapPanel.tsx`, nor any panel type's own
  internal data-fetch/rendering logic beyond what FR-008–FR-011
  specifically require for the chromeless full-page mode.
- **FR-023**: The WFRC brand color tokens (`--primary`/`--accent`) MUST
  NOT change as part of this feature — this is a structural/layout
  feature only, per `wftdm-design-system`'s existing Brand Identity rule.

### Key Entities

- **Sidebar Item**: A primary, top-level navigable entry in the sidebar —
  one per discovered dashboard tab, in discovery order. Carries the
  tab's own `header.tab` label, its new optional `icon:`, and (while
  active) its own `sections:` sub-items if any.
- **Section**: A new, named, optional grouping of one or more existing
  `layout:` rows within one tab — the unit the accordion sub-navigation
  (User Story 3) and its scroll-to-target behavior operate on. Has a
  stable `id` (an anchor target), a viewer-facing `label`, and an
  ordered list of the row names it groups.
- **Full-Page Tab**: A dashboard tab flagged `full_page: true`, whose
  single panel renders without the ordinary page-title block or panel
  `Card` chrome, and whose available height is driven by real viewport
  space rather than a fixed value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer can add additional dashboard tabs beyond the
  default set with zero code change, and every tab remains reachable
  from the sidebar with no horizontal overflow, regardless of count.
- **SC-002**: On a standard desktop-class viewport, the Explore Data
  workspace's own rendered content area occupies at least 90% of the
  vertical space available below the app header — a direct, measurable
  improvement over this session's own recorded baseline (a fixed 635px
  panel inside 238px of vertical chrome on a 900px-tall viewport, ~70%
  overhead).
- **SC-003**: On any of the six ActivitySim-outline tabs with two or
  more authored sections, an analyst can reach any section's content in
  a single interaction from the sidebar, with zero manual scrolling
  required first.
- **SC-004**: Switching the active sidebar tab hides the previously
  active tab's own section sub-items with no residual/duplicate
  sub-items visible for any tab other than the currently active one.
- **SC-005**: A tab row composed entirely of value-box panels visually
  reads as a distinct, evenly-sized group of cards, independently
  verifiable via real rendered card widths/positions.
- **SC-006**: Every new or materially changed surface (sidebar shell,
  full-page mode, accordion sub-nav, metric strip) passes a real,
  computed-style-based verification in both light and dark theme —
  matching this project's existing dual-theme testing discipline, not a
  visual spot-check alone.
- **SC-007**: The full existing automated test suite (unit + integration)
  passes at its pre-feature rate, with any newly-failing test traced to
  a real regression from this feature specifically, not accepted as
  incidental.

## Assumptions

- **Content-authoring scope boundary**: this feature builds the sidebar/
  full-page/accordion-sections *mechanism* and updates this repo's own
  fixture/demo dashboard content (`tests/fixtures/dashboard-config/`
  and/or `public/demo-dashboard-config/`) enough to exercise all four
  user stories end-to-end with real, representative panels per section.
  It does **not** author WFRC's actual production `dashboard-*.yaml`
  templates covering every one of `project-docs/CALIBRATION-SUMMARIES.md`'s 36
  named Parquet files/metrics — per `CLAUDE.md`'s own already-established
  authored-vs-published split, those files are authored alongside model
  scripts in the separate TDM repo, outside this repo's control.
- **Network tab's section boundaries are an authoring decision, not a
  mechanism decision**: because that tab's own content in
  `project-docs/CALIBRATION-SUMMARIES.md` is a mixed table-plus-prose format
  (unlike the other five tabs' clean, parallel `###` headings), this
  feature does not prescribe its exact section split — the `sections:`
  grammar (FR-013) is general enough for whoever authors that tab's real
  content to group its rows sensibly (e.g., "Highway Assignment,"
  "O-D Flows," "Land Use," "Accessibility") when that authoring happens.
- **`Documentation` is not promoted to a sidebar-footer item.** The
  original request's phrasing ("Settings and Documentation keep their
  existing icons... anchored at the sidebar's own footer") assumed
  Documentation already had an icon to keep; it does not (confirmed by
  direct read — see Research Findings). Documentation stays exactly
  where it is today, inside the Settings modal's own tab strip,
  unchanged by this feature. Only Settings (which does have a real,
  current icon) relocates to the sidebar footer.
- **Mobile/narrow-viewport behavior** adopts whatever responsive
  collapse-to-overlay behavior the adopted Sidebar primitive provides
  natively — this feature does not define a new, custom breakpoint or
  mobile-specific interaction of its own.
- **A new, real dependency is required** for both the sidebar primitive
  itself and an accessible expand/collapse mechanism for section
  sub-items — neither exists in this codebase today. The exact
  package(s) are a planning-phase decision.
- **Existing scenario-reactivity/panel-data hooks are unaffected.** Per
  this session's own confirmed reconciliation-ledger finding,
  `useActiveScenarios`/`useBaseline`/scenario-activation logic has no
  dependency on where in the shell a panel is rendered — this feature
  changes presentation/layout only.
