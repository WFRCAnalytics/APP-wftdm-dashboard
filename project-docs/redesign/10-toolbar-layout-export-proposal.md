# 10 — Toolbar, row sizing, page layout modes and export

Status: **implemented on `063-ui-redesign`** (parts B, A, D and C; see "Implementation notes" at the end for where the
built behaviour differs from the first proposal). Written 2026-10-21 after reviewing the code on that branch.
Read `02-layout-and-components.md` (shell, control bar, tile) and `03-state-and-compare.md` first. This file changes
or extends parts of 02; where it conflicts with 02 once approved, this file wins and 02 must be updated in the same PR.

Four parts, each independently shippable:

| Part | Subject | Size | Depends on |
|---|---|---|---|
| A | One-row control bar: Focus, Compare set and Reference merge into one **Scenarios chip** | M | none |
| B | Rows of tiles share one height | S | none |
| C | **Page layout modes** (`scroll` or `tabs`), pinned KPI band, facet tiles in compare mode | L | B |
| D | **Export** menu on every tile (CSV, PNG, SVG) | M | none (C improves the expanded view) |

Suggested order: B, A, D (CSV first, then images), C.

Constraints from `CLAUDE.md` still apply: React only, no new chart library, no `localStorage`/`sessionStorage`
(viewer choices are session-only module state), Parquet-only data in the browser, no hard-coded colours in chart kinds.

---

## 0. What exists today (verified in the code)

| Area | Current behaviour | File |
|---|---|---|
| Control bar | Two stacked rows while the page is not scrolled: row 1 = Year, Focus, Compare toggle; row 2 (Compare on only) = scenario picker button, Reference, Show. When the header is compact (scrolled) both rows flow into one wrapping row (`group-data-[compact=true]/header:contents`). So the bar is two rows exactly when the user is at the top of the page with Compare on, and the header changes height as you scroll. | `layout/controlBar.tsx` |
| Scenario picker | Popover with search, tag chips, a row per scenario (checkbox, dot, name, **Focus** and **Reference** mini buttons), calibration-round strip. It already carries Focus and Reference for scenarios; it lacks the *Observed* and *Same scenario in the base year* reference options, which only the Reference select has. | `layout/scenarioPicker.tsx` |
| Header | Sticky, turns compact after 80px of scroll (hysteresis 24px), subtitle hidden when compact, negative bottom margin keeps the page height stable. Title takes up to 46% of the width at 900px and above. | `layout/pageHeader.tsx` |
| Page rows | `Object.entries(tab.layout)` → one CSS grid per row, `gridTemplateColumns` from each tile's `width` fraction (`NNfr`). Grid cells stretch, but the wrapper `div` and the `Card` inside do **not** fill the cell, so a shorter card leaves a gap under it. Body height is the tile's `height` in px. | `layout/dashboardRenderer.tsx`, `layout/tile.tsx` |
| Compare grids | `CompareHost` lays out facets in `cols = total <= 2 ? total : 2` and divides the tile's *fixed* `height` by the row count. Four facets inside a 7/12-wide, 440px tile are therefore about 190px tall. | `panels/CompareHost.tsx` |
| Sections | `sections:` in the page YAML give the sidebar an accordion sub-list. Clicking one calls `scrollIntoView` on `#section-<id>`. Optional `tile:` anchors on a tile instead of a row. | `layout/floatingNav.tsx`, `layout/dashboardLayout.ts` |
| Hero band | A row whose panels are all `valuebox` with `variant: hero` renders as the raised KPI container. Summary page only. | `layout/dashboardRenderer.tsx` (`isHeroRow`) |
| Expand | Portal host moved between the inline anchor and a dialog (no remount). Dialog is `min(1400px, 94vw)` by `min(88vh, 100%)`; tile controls are repeated inside. | `layout/panelExpandHost.tsx` |
| Export | **Nothing exists.** No download, canvas, or SVG serialisation code anywhere in `src/`. | none |
| Viewer prefs | Session-only module state: `state/*State.ts` (theme, font, text size, colours, tile state). Deployer config: `dashboard-config/index.json` (`DashboardBranding`, `compare`, `vocab`, `metrics`, `units`) and per-page YAML `header:`. | `services/yamlLoader.ts` |

---

## A. One-row control bar

### A.1 Problem

Focus select, "N selected" picker button and Reference select are three controls for one idea: *which scenario am I
looking at, what am I comparing it with, and against what?* Together with Year, Compare and Show the bar needs two
rows at the top of the page and its height changes while scrolling.

### A.2 Design: the Scenarios chip

Replace Focus, the picker button and Reference with **one chip** that opens the existing scenario popover. The **Compare
toggle is the right-most control and is always rendered**, so it never moves when Compare is switched (a viewer who turns
Compare off finds it under the pointer to turn it back on). **Show** stays in the bar between the chip and the toggle and
is greyed out and disabled while Compare is off, so the bar keeps its structure in both states.

```
Compare off:   [ Year ▾ ]  [ ● Density variant ▾ ]  [ Values | Change | % ] (disabled)  [ Compare ○ ]
Compare on:    [ Year ▾ ]  [ ●●● Density variant  +2  ⇄ vs Baseline  ▾ ]  [ Values | Change | % ]  [ Compare ● ]
```

Chip anatomy (height 38px, same pill style as `PillSelect`):

| Part | Content | Shown when |
|---|---|---|
| Focus | colour dot (14px) + focus label, truncated at 18ch with tooltip | always |
| Compared | `+N` pill: N compared scenarios besides the focus (dots stack, up to 4, −4px overlap, 2px `--tile-hi` ring, when width allows) | Compare on |
| Reference | `⇄` glyph + `vs <reference label>`, `--mute` text | Compare on |
| Chevron | `▾`, rotates when open | always |

Everything the three old controls showed is still visible; nothing is hidden behind a hover. The accessible name is a
full sentence: "Scenarios. Focus Density variant, 2 compared, reference Baseline. Press to change."
(`aria-haspopup="dialog"`, `aria-expanded`.)

The Compare toggle stays a separate control (it is the one decision that changes what every tile is). Show stays a
segmented control but gets short labels at medium widths (A.4).

### A.3 Popover content

Reuse `scenarioPicker.tsx` (do not write a second picker). Changes:

1. It opens in both modes. Compare off: a single-select list (a coloured **radio** per scenario sets the focus). Compare
   on: a coloured **checkbox** per scenario (the colour *is* the scenario's identity, so there is no separate dot) plus
   the Focus and Reference buttons.
2. **No Reference dropdown.** The list is the one place to choose the reference: each scenario row has a Reference button,
   and the two non-scenario references are rows of the same list: *Observed* (base year only) and *Same scenario in the
   base year* (other years only). A calibration round used as reference is chosen in the rounds block.
3. Footer keeps "3 of 65 compared" and the link to Settings > Scenarios.
4. Search, tag chips and the rounds strip are unchanged (search is always shown; the 8-row threshold was not built). It would keep
   the three-run real deployment compact.

The trigger keeps `data-testid="scenario-picker-button"` (its focus label is `scenario-chip-focus`). `control-focus`
(a Focus select, shown only when calibration rounds exist) and `control-reference` (the rounds-as-reference select) live in
the popover.

### A.4 Staying on one row

The header gives the bar the width left over after the title (title max 46% at 900px and above). Estimated widths
(to be measured, then written into the acceptance test): Year 130, Compare 100, Scenarios chip 270 to 330, Show 190,
gaps and padding 40, about 730 to 790px in total. At 1280px the bar's share is about 620px, so the ladder below is
needed rather than optional.

| Viewport (main column) | Bar |
|---|---|
| 1400px and up | everything in full |
| 1100 to 1399px | Show uses short labels (`Values · Δ · %`); the reference text leaves the chip below 1500px (it is in the chip's accessible name and the popover); the title may use two lines (`line-clamp-2`) so the bar keeps its width |
| 900 to 1099px | same as above; the chip label truncates first |
| Below 900px | the bar takes the full width under the title, still one row; the chip is the flexible item and truncates (the "Options" popover for Year and Show was not needed and is not built) |

Rules that make it **one row regardless of scroll state**:

- `flex-nowrap` with `min-w-0` on the chip; no `flex-wrap` and no `contents` trick. The compact state only changes
  padding, shadow and title size, never the number of rows.
- The bar's own height is constant (38px control plus padding) in both states, so the header's height difference comes
  only from the title and subtitle, which the existing negative-margin logic already absorbs.
- Overflow never wraps: the lowest-priority items collapse into the Options popover in this order: Show, Year.

### A.5 Acceptance

- At 1100px, 1280px, 1440px and 1920px, with Compare on and off, scrolled and not scrolled, the bar occupies one
  row (assert `getBoundingClientRect().height` equal in all four states for each width).
- Focus, compared set and reference can all be changed from the popover; the chip text updates immediately.
- Keyboard: Enter or Space opens, Tab order is search, Reference block, rows (arrow keys move, Space toggles,
  `f` and `r` shortcuts are not added), Esc closes and returns focus to the chip.
- The reference chip text never says "Observed" outside the base year.

---

## B. Equal height for tiles in a row

### B.1 Decision

Yes: tiles in the same row share one height. It matches how people scan a dashboard (a ragged bottom edge reads as a
meaningful difference when it is not). Exceptions and cautions:

- **Height belongs to the row.** The row's body height is the largest `height` among its tiles unless a row sets
  `row_height`. Mixed authored heights in one row are allowed in YAML but the loader logs a warning ("tiles in row
  X have heights 400 and 450; using 450").
- **Align the plots, not only the cards.** Group-by, compare-as, legend and badge rows change a tile's chrome height.
  Two tiles with equal total heights but different chrome have plot areas that start and end at different heights.
  Use the same card structure with a reserved minimum for the control row (the tile that has none keeps 0, but the
  *body* is `flex: 1` so both plot areas end on the same line, and their starts differ only by their own chrome).
- **Do not equalise** rows of KPI cards, hero cells and `valuebox` metric strips (they size to content), or a tile
  whose body is a long scrolling table. Opt out per tile with `height: auto`.
- **Compare mode.** A facet grid needs more room than one chart. See C.5; the row grows to the tallest tile and its
  neighbours stretch, which is another reason facet tiles are promoted to a full row.

### B.2 Implementation

- `dashboardRenderer.tsx`: grid wrapper gets `align-items: stretch` (default), each cell wrapper `h-full`, and
  `Card` receives `h-full flex flex-col`; `CardContent` gets `flex-1 min-h-0`.
- Resolve `rowHeight = row_height ?? max(height of tiles in the row)` once per row and pass it to tiles as
  `resolvedHeight`. Tiles use `resolvedHeight` wherever they use `config.height` today (`tile.tsx` inline anchor,
  `ChartPanel` root `style.height`, `CompareHost` `bodyHeight`).
- `height_rows` (scorecard) is resolved first, then the row maximum is taken.
- The expand dialog already sizes to the viewport; unaffected.
- `PanelLoadingState` already receives `height`; give it the resolved value so skeletons match.

### B.3 Acceptance

- In every row of every page of the real and synthetic demos, tile cards have identical `offsetHeight` (Playwright
  loops over rows and asserts, excluding hero and metric-strip rows).
- With Compare toggled on and off the row heights stay equal.
- No chart is clipped or shorter than 200px at 1100px viewport width.

---

## C. Page layout modes: scroll or tabs

### C.1 Why

Scrolling long pages hides tiles, separates a tile from its neighbours and makes maps small. A tab per **section**
lets one section fill the screen, which is better for maps, treemaps and compare facets. Scrolling is better for an
overview where the value is seeing everything at once and hover cross-highlighting works across charts. So support
both and let the deployer, the page author and the viewer choose.

### C.2 The two modes

| | `scroll` (today) | `tabs` |
|---|---|---|
| What is shown | all rows, in order | the **pinned rows** plus the **active section's** rows |
| Navigation between sections | sidebar sub-list scrolls to the anchor | sidebar sub-list selects the section; a tab strip under the header does the same |
| Page scroll | the page scrolls | the content area is sized to the viewport and does not scroll when it fits |
| Tile heights | authored px | authored px as a minimum; a tile marked `height: fill` takes the remaining space |
| Compact header | after 80px of scroll | always compact (the page does not scroll, so the header must not eat 120px) |

### C.3 Structure of a tabbed page

```
┌ header (compact): title ............... [control bar, one row] ┐
├ pinned rows (hero KPI band) ───────────────────────────────────┤  ← stays visible in every tab
├ tab strip:  Overview | Mode share | Where transit grows | ...  ┤
├ section content: fills the rest of the viewport ───────────────┤
│   one tile = whole area; two tiles = split by their `width`     │
└─────────────────────────────────────────────────────────────────┘
```

**Pinned rows.** Rows that stay above the tabs, in either mode's order. By default every *hero row* (the KPI band
on Summary) is pinned in tabs mode. A page can name others: `header.pinned_rows: [row_hero, row_notes]`. Rows that
are neither pinned nor in a section render at the end of the first tab (so no tile is ever lost by a missing
section; the loader warns).

**Tab content: stack, pick, and the control rail.** A tab is a small workspace, not necessarily one chart:

- `mode: stack` (default): the tab shows all of its rows, each row dividing the height; tiles in a row share the width by
  their `width` fractions (two charts side by side on one topic, a chart and its table, a map beside a ranking).
- `mode: pick`: the tab shows **one tile at a time**, chosen from a **Chart** dropdown beside the tab strip (same pill
  style as every other control). Use it for alternatives that each need the whole screen (a zone map or the desire
  lines). The chosen tile is kept for the session.
- Faceted tiles (one view per compared scenario) keep working inside either mode: a tile that fills a big tab simply
  gets a big grid (3 maps in 2x2 at about 500px each at 1440x900).
- **Control rail.** In a tab, each tile's controls (Group by, Compare as, Scenario, View) and its Export and Expand
  buttons are not squeezed above the chart: when the tile is at least 760px wide the controls stack in a rail on the
  right of the chart (labels above full-width options); narrower tiles keep them above the chart. The legend stays
  above the chart.
- **Shared controls.** A section may declare `shared_controls: [group, view]`. The tab strip then shows one Group by and/or
  one View control (the union of the option ids the tab's multi-view tiles offer; the first tile decides label, order and
  default), and the tiles hide their own copy. Choosing an option writes it to every tile of the tab that offers that
  option id, so tiles must use matching ids to move together (a tile without the option keeps its default). A kind that
  fewer than two options share is not lifted. `Compare as` and `Scenario` stay per tile.

**Tabs are the existing `sections:`.** No second concept. Everything that makes a section navigable in the sidebar
already exists (`id`, `label`, `rows`, optional `tile`). New optional fields:

```yaml
header:
  layout_mode: tabs          # scroll | tabs     (default: deployment default, else scroll)
  pinned_rows: [row_hero]    # optional; default: hero rows
sections:
  - { id: overview, label: Overview,  rows: [row_share, row_time] }
  - { id: map,      label: "Transit map", rows: [row_map], fill: true }
```

A section with `tile:` and several rows is shown as before (the tile only matters for scroll mode anchors). `fill`
(section) is shorthand for "every tile in this section is `height: fill`".

**Where the tab strip lives.** Both places, bound to one state value:

- the sidebar sub-list (`floatingNav.tsx`): in tabs mode, clicking a section sets the active section instead of
  scrolling; the active section is marked `aria-current="page"`;
- an in-page tab strip under the header (`role="tablist"`): needed on small screens where the nav is a sheet, and
  for discoverability. Keyboard: arrows move, Home and End jump. In scroll mode the strip is not rendered.

Active section is session state (`state/layoutState.ts`, module state keyed by page), initial = first section, and
is mirrored in the URL hash (`#map`) so a link opens a specific tab. Hash use is fine under the no-web-storage rule.

### C.4 Filling the screen

`height: fill` on a tile (also valid on a row) means: flex-grow into the section area.

- Section area height = `100dvh − header − pinned rows − tab strip − page padding`, measured by a `ResizeObserver` on
  the content container and published as the CSS variable `--section-h` (not computed in JS per tile).
- A minimum (default 360px) protects small screens; below it the page scrolls normally.
- Charts already measure their own container (`ChartPanel` reads `clientWidth` and `clientHeight` inside a
  `ResizeObserver`), so the one change needed is that the chart root uses `height: 100%` when the tile is `fill`
  instead of the numeric `style.height`. `CompareHost` must stop deriving `cellHeight` from `panel.height` and instead
  read the measured container height (it uses `bodyHeight - rows*...` today).
- Maps (`zone-map`, flowmap) call `map.resize()` on container change; verify on the tab switch (hidden tabs are not
  mounted, so the first mount measures a real size).

**Unmount or keep alive?** Inactive sections are **unmounted**. Reasons: it keeps the number of WebGL contexts and
DuckDB queries low (maps are the expensive part), and it matches how Settings tabs already behave. Cost: tile
state is kept (`state/tileState.ts` survives), but chart state in `env.state` is lost, so a map recentres when you
return. If that proves annoying, keep the last map tile mounted with `display: none`, behind a flag.

### C.5 Facet tiles in compare mode (both modes)

Tiles that draw one view per scenario (maps, treemap, sunburst, waffle, Sankey, desire-line maps) are **facet kinds**.
Each kind module declares `facets: true` (in `charts/kinds/*` registration; flowmap and zonemap panels via a small
table). A multi-view tile is a facet tile when its active view's kind is a facet kind **and** its resolved strategy is
`multi`, `grid` or `swipe` **and** more than one run is drawn.

Rules:

| Mode | Single scenario | Compare with facets |
|---|---|---|
| `scroll` | tile keeps its authored `width` | the tile is **promoted** to a full-width row (its row-mate drops to the next row); facets lay out in the best grid for N (2 → 1×2, 3 and 4 → 2×2, 5 and 6 → 3×2); height grows by `facet_min_height × rows` |
| `tabs` | tile keeps its authored share of the section | when the section has two tiles side by side, the facet tile takes the full width and the other goes below inside the same tab; with `fill`, the grid divides the remaining height instead |

Author overrides on a tile: `facet: auto | wide | none` (default `auto`). `none` keeps it where it is (for tiles that
stay readable small). Layout shift on toggling Compare is expected and is animated with the existing 260ms easing;
the promoted tile keeps its scroll anchor so the page does not jump.

Pagination (`CompareHost`'s pager) stays for more than six compared runs.

### C.6 Who decides: deployer, page author, viewer

Resolution order, first match wins:

1. **Viewer** (Settings > Appearance > *Page layout*: *Page default*, *Tabs*, *Scrolling*). Session state only
   (`state/layoutState.ts`, resets on reload); `?layout=tabs` or `?layout=scroll` in a shared link sets it.
2. **Page author**: `header.layout_mode` in `dashboard-*.yaml`.
3. **Deployer default**: `layout: { mode: tabs }` in `dashboard-config/index.json` (same file as `compare`, `vocab`,
   `metrics`, `units`; parsed in `services/yamlLoader.ts` and `DashboardBranding`).
4. Built-in default: `scroll`.

Other deployer settings under the same `layout` object: `min_fill_height` (px, default 360), `facet_min_height`
(default 260), `pin_hero` (default true).

Built-in default is `scroll` (so existing deployments and the legacy and synthetic demo sets are unchanged). The real
demo's `index.json` sets `layout: { mode: tabs }`, so every real page opens tabbed: Summary (hero band pinned; tabs
Scenarios, Mode choice, Time of day, Maps = pick), Person and household (one tab, two tiles side by side), Tour models
(Time of day, Desire lines), Mode choice (Mode share, Purpose to mode, Through the day), Network (Where transit is used,
Trip desire lines); Explore is unchanged (full page).

### C.7 Edge cases

- A page with one section or no `sections:` renders in scroll mode (a one-tab strip is noise); log at debug level.
- `show_when` and `needs_compare` can empty a section in one mode: hide that tab and, if it was active, fall back to
  the first remaining one.
- Deep links to an old anchor (`#section-<id>`) are accepted and mapped to the section.
- Print or screenshot: tabs mode renders only the active section; add a "Show all sections" action to the Options
  popover that temporarily switches to `scroll`.
- Mobile (<760px): the tab strip scrolls horizontally with edge fades; `fill` falls back to the minimum height.

### C.8 Implementation outline

1. `layout/types.ts`: `header.layout_mode`, `header.pinned_rows`, section `fill`, tile `facet`, `height: 'fill'`.
2. `state/layoutState.ts` (viewer mode, active section per page), `hooks/useLayoutMode.ts` (resolution order).
3. `layout/dashboardRenderer.tsx`: split into `PinnedRows`, `SectionTabs` and `SectionBody`; `scroll` keeps the
   current path unchanged.
4. `layout/floatingNav.tsx`: section click selects in tabs mode.
5. `layout/pageHeader.tsx`: `forceCompact` prop in tabs mode.
6. `layout/tile.tsx`, `panels/ChartPanel.tsx`, `panels/CompareHost.tsx`: `fill` support (B.2 groundwork).
7. Chart-kind registry gets `facets` metadata; `multiViewTile` computes `isFacetTile`.
8. Settings > Appearance: the viewer control. Documentation: `GRAMMAR.md`, `06-data-and-config.md`, `CLAUDE.md`.

### C.9 Acceptance

- Each demo page opens in its configured mode; switching the viewer setting changes it without a reload.
- In tabs mode no page scrollbar appears at 1440×900 for any section whose tiles fit; the pinned band stays visible.
- Map tiles fill the section area and redraw correctly after window resize and after switching tabs.
- Compare on with three scenarios: the zone-map tile spans the full width, with three facets readable (≥ 260px each).
- Keyboard and screen reader: tablist semantics, one tab stop in the strip, focus moves to the section heading on
  change (`aria-live` polite announcement "Mode share section").
- Existing Playwright specs that scroll to anchors keep passing in `scroll` mode (the default for the legacy project).

---

## D. Export from a tile

### D.1 Is it worth the space?

Yes, as one menu button beside Expand (30px), shown in the tile header and always keyboard-reachable. An analyst
audience expects "the data behind this chart" and a clean image for a report. A row of separate icons would be too
much chrome; a menu costs one icon.

### D.2 Menu

`⋯`-style icon button, `aria-label="Export <tile title>"`, opens a small popover:

| Item | Output | Notes |
|---|---|---|
| Download data (CSV) | `<tile>-<view>-<scenario(s)>-<year>.csv` | rows the active view drew |
| Download image (PNG) | `.png` at 2× | includes title, legend and subtitle |
| Download image (SVG) | `.svg` | vector, for reports |
| Copy data | clipboard, tab-separated | pastes into Excel |

Hidden items: SVG for map views; Data for views without rows (Markdown). Not offered: XLSX and JSON (CSV is the
universal exchange format; Parquet is for pipelines, not for this audience). A page-level "Export page data" could
follow later; out of scope here.

### D.3 Data export

- The source is the data the chart used, not a fresh query: add `ChartKind.exportRows?(env): { name: string; rows: Row[] }[]`
  in `charts/types.ts`. Default implementation in `ChartPanel`: for each compared run, the rows of the kind's `tables()`
  after adapters (`loadRows`), with columns `scenario`, `year`, then the table columns. Display labels from `vocab` are
  added next to raw ids (`mode` and `mode_label`).
- Kinds that transform data before drawing (treemap hierarchy, Sankey links, ridgeline density) implement
  `exportRows` to return the flat table behind the drawing (nodes and values, links, bin and value).
- Legacy panels (`table`, `observable-plot`, `flowmap`, `zonemap`, `sankey`...) export the rows they already hold.
- CSV details: UTF-8 with BOM (Excel opens non-ASCII correctly), comma separator, quote when needed, ISO numbers,
  no thousands separators, no comment lines. Provenance (tile, scenarios, year) goes in the filename only.
- Respects the current filters, group-by and compare set; in Compare with Change, export both values and the
  difference columns.
- The browser never parses CSV; this is output only, built from rows already in memory, so the Parquet-only rule holds.

### D.4 Image export

- **SVG:** Observable Plot and D3 kinds draw `<svg>`. Serialise with `XMLSerializer`, then:
  1. resolve CSS variables (`--ink`, `--mute`, series colours) to computed values (our colours are tokens, so a raw
     copy renders black or wrong outside the app);
  2. inline the font family name and a fallback (do not embed font files);
  3. compose the tile title, subtitle and legend (HTML in the app) as SVG `<text>`/`<rect>` above the plot, using the
     same layout metrics as the tile;
  4. add a footer line: `Source: <deployment title> · <scenario(s)> · <year> · exported <date>`.
- **PNG:** render the composed SVG to a canvas at `devicePixelRatio × 2`, `toBlob`. Background is `--surface` so dark
  mode exports are legible; offer "Transparent background" later if asked.
- **HTML charts** (`scorecard`, `calibration-table`, `mode-table`, `flow-table`): PNG only through the same pipeline
  using `foreignObject`, or hide the image items and keep CSV (decision: hide, because `foreignObject` rendering is
  unreliable across browsers).
- **Maps:** PNG only, from the map canvas. MapLibre needs `preserveDrawingBuffer: true` for `canvas.toBlob`, or a
  one-shot `map.once('render', ...)` capture. Use the render-event capture to avoid the permanent performance cost,
  then draw the legend and attribution on top (basemap attribution is required in any image).
- **Compare facets:** the export includes every facet (the tile as drawn), not one.
- Where code lives: `services/exportTile.ts` (pure helpers: `toCsv`, `serializeSvg`, `svgToPng`), `layout/exportMenu.tsx`
  (the UI), small additions to `ChartKind`. No new dependency.

### D.5 Expand view and export

The menu also appears in the expanded dialog header so users can export the larger rendering. The tile title and
controls are already repeated there.

### D.6 Acceptance

- CSV for every chart kind opens in Excel with correct columns; row count equals what the chart shows;
  unit tests compare `exportRows` output with the kind's draw input.
- SVG opened standalone (outside the app, dark and light) shows the right colours and fonts.
- PNG of a zone map shows the basemap attribution and the legend.
- Keyboard: Enter on the menu button, arrow keys, Esc; focus returns to the button.
- File names are sanitised (no `/`, no trailing dots) and unique per scenario set.

---

## E. Rollout, tests and docs

| Step | Change | Tests |
|---|---|---|
| 1 | B (row sizing) | new `rowHeights.spec.ts` for every page; update snapshots if any |
| 2 | A (Scenarios chip) | update `modelYears.spec.ts` ids; new `controlBar.spec.ts` one-row assertions at four widths |
| 3 | D CSV, then SVG and PNG | unit tests for `toCsv`, `serializeSvg`; Playwright download events |
| 4 | C (layout modes) | unit tests for mode resolution and section selection; Playwright for tabs, pinned band, hash |

Docs to update in the same PRs: `02-layout-and-components.md` (control bar §1.2 and §1.3, tile §2, pages §3),
`03-state-and-compare.md` (layout state), `06-data-and-config.md` (YAML and `index.json` fields), `09-chart-kind-guide.md`
(`facets`, `exportRows`), `project-docs/GRAMMAR.md`, `CLAUDE.md` (063 section).

## Implementation notes (what was built, and where it differs)

- **B** `layout/dashboardLayout.ts#equalizeRowHeights` gives every tile of a row the tallest height (resolving
  `height_rows` first); cards stretch to the grid cell. There is no `row_height` key: the tallest tile decides.
- **A** `layout/scenarioPicker.tsx` is the chip and popover; `layout/controlBar.tsx` is one non-wrapping row. The popover
  is anchored under the chip (left edges aligned, clamped to the viewport, following the header while it resizes).
- **D** `services/exportTile.ts` (CSV, DOM-to-SVG walk, PNG), `layout/tileExport.tsx` (menu and registry),
  `services/mapCapture.ts` (reads a map's pixels inside its `render` event, so no `preserveDrawingBuffer`),
  `charts/exportRows.ts` (default CSV rows; a kind may provide `exportRows`). The image is a faithful walk of the tile as
  drawn (so legacy panels and maps export too); controls and buttons are left out. Deployer setting
  `export: { footer: true | false | "text" }` in `index.json`. Not built: the Export menu inside the expanded dialog.
- **C** `state/layoutState.ts`, `hooks/useTabsPlan.ts`, `layout/tabbedPage.tsx`, `layout/fill.tsx`, `layout/heroBand.tsx`;
  tiles measure their body and report the height to their cell (`useFill`); panels draw at the measured height (the
  panel config is rewritten, `height_rows` dropped). Inactive tabs are unmounted. The page header is always compact in
  tabs mode and the window does not scroll (the content area scrolls only when the screen is shorter than the tab's
  minimum). Not built: automatic promotion of facet tiles to a full row in `scroll` mode (a big tab already gives them room).

## F. Open questions

Resolved (2026-10-21): all real pages are tabbed by default, with scroll available per viewer, page and deployment; inactive
map tabs are unmounted (a mounted hidden map keeps a WebGL context and its memory, and browsers allow only about 16
contexts, so keeping several alive would eventually blank the oldest); Show stays in the bar; the export footer is a
deployer setting.

Still open:

6. ~~Shared tab controls~~ built as `shared_controls` on a section (`layout/sharedControls.ts`, `layout/sharedControlsBar.tsx`);
   see section C. Not built: a shared `Compare as`.
7. **Export from the expanded dialog**, and a page-level "Export all tiles".

### Earlier questions (kept for the record)

1. **Default mode per demo page**: tabs everywhere, or only Network and Mode choice? (Recommendation: Summary, Mode
   choice and Network `tabs`; Person and household and Tour models have only two tiles each and read fine scrolling.)
2. **Keep inactive map tabs mounted** to avoid recentring, at the price of extra WebGL contexts? (Recommendation: no
   for now.)
3. **Show control**: keep in the bar, or move into the Scenarios popover to buy width? (Recommendation: keep; it is
   the one control people toggle repeatedly.)
4. **Export**: is the footer line ("Source ... exported") wanted in images for every deployment, or should it be a
   deployer setting (`export.footer`)?
5. **Viewer layout choice without web storage** resets on reload. Acceptable, or should it also live in the URL by
   default (`?layout=`)? (Recommendation: URL parameter only when the viewer changed it.)
