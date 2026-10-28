# Changelog

All notable changes to the WFRC TDM Calibration Dashboard, rebuilt from the git history (341 commits, 2026-07-16 to
2026-10-27). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Notes on how to read it:

- **Versions come from the git tags.** `v0.0.1` to `v0.0.4` are the only tags; each section is dated by the
  commit the tag points at. New work goes under **Unreleased** until it is tagged.
- **This file was written afterwards.** The project was not versioned before `v0.0.1`, so that section covers the whole
  of the early history. It is split into dated stages so it stays readable. The stages are not releases.
- Numbers in brackets such as `(030)` are the feature spec numbers under `specs/` and `project-docs/`. Short hashes point
  at the main commit for an item.
- Routine "rebuild docs/ to ship ..." commits are left out. Each one only refreshed the committed GitHub Pages build.
- The full per-feature design history, with root causes and verification numbers, is in
  `project-docs/IMPLEMENTATION-HISTORY.md`.

## [Unreleased]

### Added

- **Sort for bar and line charts.** A "Sort categories" setting in the Axes tab: Natural, Largest first, Smallest first
  or Reversed. Bars sort by height (the stack total, or the tallest bar when they sit side by side); a line sorts when
  its X axis is an ordered category or a date. The choice is saved in the exported configuration as `axes.sort`, and
  files without it still import.
- **Undo and redo for chart tabs.** Buttons beside Import, plus Ctrl or Cmd+Z and Ctrl+Shift+Z or Ctrl+Y (not while a
  text field has focus). Covers fields, settings, renames, and adding or closing a tab, for up to 60 steps; repeated
  edits to one setting, such as typing a title, undo as one step. Session only, nothing is stored in the browser.
- **Copy SQL and Download CSV** on the Data tab's table. The CSV holds every page of the result, up to 100,000 rows.
- **Loading state for charts.** A placeholder on the first load and a dimmed chart while new data arrives.
- **Deployer options for the Explore builder.** The `explore-builder` panel takes optional YAML keys, so none of this is fixed
  in code any more: `limits` (CSV row cap, fixed page size, undo depth, joins), `features` (turn off the SQL tab, CSV, Copy
  SQL, import and export, saving tables, undo), `charts` (which chart types, and the one a new tab starts with), `tables`
  (include and exclude patterns), `columns` (label, unit and number format) and `presets` (starter charts, from the Export
  JSON). Unset keys behave as before; a wrong value is reported under the title and the default stays. See
  `specs/065-chart-builder/contracts/deployer-options.md`.

### Changed

- **"Alternative" is now "scenario group".** The manifest key is `scenario_group` (WFRC's own term), and the code, the interface
  wording, the demo manifests, the tests and the docs follow. A manifest that still says `alternative` is read as before, and
  `scenario_group` wins when both are present.
- **The Data tab loads faster.** The row counts after each query step now run together instead of one after another, and
  the total row count no longer needs a second query when the result fits on one page.
- The package version is now `0.0.4` in `package.json`, `package-lock.json`, `pyproject.toml` and `uv.lock`; it still
  said `0.1.0`.

## [0.0.4] - 2026-10-27

The Explore chart builder, merged to `main` on 2026-10-27 as `38c9f1e`.

### Added

- **Explore chart builder** (`065-chart-builder`) replaces Graphic Walker as the Explore tab. It lives in `src/explore/`,
  with a pure core in `src/charts/builder/` and a query model in `src/explore/sql/`.
  - **Data tab**: column summaries with type filters, a paged preview table, a query builder (joins, filters, sort, limit,
    summarise) with step row counts, a SQL tab with a highlighter, and "My tables" saved as `xb_` temp views. Every
    statement goes through `sqlGuard.authorize` and the one shared DuckDB connection (`f37c84f`, `c7de98e`, `7a1a29a`).
  - **Table browsing**: sort and filter from the table (header menu, cell shortcut, filter chips), filters by column type
    with value suggestions and multi-select, a column picker synced with the builder, type-coloured headers, an
    expand-to-dialog button with paging, and an edge fade (`032abeb`, `f3eba1d`, `4991568`, `e4ca8de`, `e7eedf1`).
  - **Chart tabs**: Fields panel, one-row shelves, suggestions, and a Style, Axes and Filter rail. Charts export to and
    import from a portable configuration (`22cde37`, `efe17d3`).
  - **Chart compiler** that draws its own SVG, with series, dash, hatch, facets and legends (`e3a3e1c`). DuckDB computes
    the groups, bins, box statistics and samples (`a6d914c`).
  - **Nineteen chart types**: bar, line, area, scatter, heatmap, histogram, box and pie first; then tick strip, text table
    and waffle (`6bf476e`); density, rule, treemap and radar (`73db007`); sunburst, sankey, chord and trail
    (`2efbcf6`). Map is shown dimmed as "coming soon".
  - **Thirteen channels**: x, y, color, pattern, dash, shape, size, column and row, plus opacity, detail, label and order.
  - Lucide icons for the chart types (`253072c`).
  - Rename a chart tab by double-click or F2 (`5873900`).
  - The y axis starts at zero only when asked (`f915a28`).
- `type: chart, kind: custom` draws a dashboard tile from the same spec the builder exports (`af0f802`).
- The Explore page gets a page title, and a toolbar styled like the other pages with the Assistant button beside it
  (`24418c0`).
- Tests that the demo opens the builder, never requests Graphic Walker, and that other tabs never load the builder
  (`290b028`).

### Changed

- Constitution amended to **2.7.0**: the Explore tab row now names the chart builder, a new "Charts: Explore builder" row
  records that it draws its own SVG with no new dependency, and Graphic Walker is recorded as retired from navigation
  (`7194210`).
- Graphic Walker is **hidden from the demo, not removed**. The `graphic-walker` panel type, its code and the `0.4.82`
  pin stay in the repository. `v0.0.3` still contains it if it is ever restored.
- The builder uses the app's own Select, Button and Segmented controls (`bc0efeb`). The table is picked in the Columns
  panel instead of the toolbar (`15c5d0a`). The Columns panel is as wide as Fields (`c9cdad9`).
- Pills keep an even 4px gap between the track and the selected pill (`1a78faa`).

### Fixed

- Turning a page in the Data tab no longer makes the column summary, the total row count or the step counts flicker or
  reset (`decb970`).
- Sort by and Limit each get their own row in the query builder, so the label never parts from its input (`0165828`).
- Chart axis labels carry the decimals a narrow range needs, so ticks no longer repeat (`ba795aa`).
- Scrolled columns no longer show through or take clicks beside the pinned first column (`85c7889`).
- Smaller layout fixes in the builder: an opaque line-number gutter in the SQL editor, an even right margin in the table
  panel, filter rows filling the width, chart rail rows lining up, type-filter counts shown as a muted figure, the
  toolbar scenario chip and Import using the control bar's pill styles, chart type labels at 11px, and an even 3px gap
  around the tab rename field.

## [0.0.3] - 2026-10-26

Interface polish after the redesign, an AI chat assistant and a more complete demo. 57 commits since `0.0.2`.

### Added

- **AI chat assistant** (`064-ai-chat-assistant`): a Settings Assistant tab (provider, token, model, read-only or modify,
  privacy level), a header button, a side panel and a scripted demo. Its SQL runs on the shared connection and is
  authorized by `sqlGuard` first. A deployer can turn the whole feature off with `assistant.enabled: false` (`17ad530`).
- **Charts**: share dials in the Summary hero, mode and purpose radars, and a purpose-to-mode chord (`3af0053`).
  Dials pick their own maximum (`5a415d5`).
- **Tab layouts**: `shared_controls` lifts Group by and View into the tab strip (`5fbb9ed`). A shared Compare as control,
  Export in the expanded dialog and an Export all button (`22db9f6`).
- Side-by-side compare picks its columns from the available width, with a manual Layout toggle (`49a29c9`).
- A separate **brand colour** for the interface, apart from the three data colours (`c26c669`). Deployer-configurable
  nav logos and a large page title (`30c05bc`).
- **Explore**: Graphic Walker restyled to match the app, with a searchable table picker (`09afa31`).
- `--pill-*` and `--tag-*` tokens shared by every pill and tag (`25f808d`, `cd9791c`). Slim themed scrollbars (`86bb7f5`).
- Demo and docs: the first scenario is the default reference and the second the focus (`30283a5`, `3f52581`); README,
  ARCHITECTURE, SPEC and GRAMMAR rewritten for the real chart system (`69e2de9`); a proposal for zero-step
  summarization (`624eadb`).

### Changed

- Selected pills are filled with the brand colour. Titles, tags and the KPI "vs reference" text use brand-tinted styles
  in light and dark mode (`521f7b9`, `692bbea`, `48ed390`, `98eb5dc`, `e475290`, `02bbcfd`).
- Hover highlight fades the rest of the chart instead of outlining, and the waffle behaves the same with Compare on and
  off (`10b4e4d`, `9e0f758`).
- The Test tab no longer ships in the app; specs that need it inject it at run time (`30c05bc`).
- Every mention of the retired chart libraries was removed from comments, docs, specs and test names (`b5c3766`).
- Playwright runs with two workers, because the default crowded DuckDB-WASM enough to time out specs that pass alone
  (`b8aa5d6`).
- Data adapters: departure hours are kept under district aliases, a mode table without a share gets one, people with no
  usable age or sex are skipped, and raw values a configured vocabulary does not list fold into Other (`01d84e4`,
  `712284e`).

### Fixed

- The control bar no longer white-screens the app when scenarios come and go (a hook sat after an early return)
  (`9eb204a`).
- Maps no longer strobe when the sidebar expands or collapses (`1ada417`). The zone map settles opacity and theme after a
  basemap swap (`ea40a28`).
- Expanded tiles fill the dialog, including side-by-side ones (`d392c70`). Heatmap row labels are clipped to fit, the map
  legend clears the attribution and the phone toolbar wraps (`29a6e8e`).
- The boot skeleton matches the Summary page and shows the Assistant circle (`39c17f3`, `9af1e7e`).
- The mode-share table gap is a pill like the calibration table's, and its header stays put (`42259dc`).
- The hero dial draws its arcs and reference tick with d3-shape, with a thicker band (`2f873f5`, `08eebb4`).
- A failed scenario row no longer shifts its content 3px right (`9aeabb9`).

## [0.0.2] - 2026-10-21

The **Corridor Pro redesign** (`063-ui-redesign`), merged as `d6d4307`. 49 commits since `0.0.1`.

### Added

- New design system: Corridor Pro tokens, Schibsted Grotesk and DM Mono, an accent engine (`services/theme.ts`), 15-colour
  scenario palettes and semantic chart colours (`78fff3e`, `86ddec0`, `6027a2f`).
- **Shell**: floating nav with a bottom group and a mobile sheet, a sticky page header, and a one-row control bar with a
  Scenarios chip. The chip sets focus, the compared set and the reference, and Compare stays right-most (`29ba784`,
  `75675cf`).
- **Compare model**: `compareState`, a pure view context, model years, and Year and Focus selects (`27fa0da`). Compare
  strategies overlay, diff, multi, grid, switch and swipe, through a `CompareHost` (`086bf09`).
- **Tiles**: tile chrome, a `multi-view` wrapper, shared controls, an expand overlay and Group by (`1e00fa5`).
- **Chart framework**: `type: chart, kind: <name>`, with one module per kind, a shared tooltip service, plot interaction
  helpers and data adapters (`e8478c4`). Kinds added: waffle, ridgeline, pyramid, dumbbell, trips through the day, speed,
  treemap, sunburst, sankey, chord, flow table, mode share bars, gap, 100% bars, slope, donut and table (`a4bcad0`,
  `a721510`, `68b22c7`, `c75bc4e`).
- **Zone map**: values, difference and swipe views, a linked grid camera and synced hover (`07d7cf0`).
- **Across model years**: ranked bars, scorecard, radar and calibration table (`987b4e9`). **Calibration rounds** with a
  roll-up loader, a round colour ramp, a picker round strip and progress charts (`0c1a31c`).
- A **Settings modal** redesign: 210px rail, system theme, type cards, scenario cards and a two-column basemap tab
  (`58cbc1d`). A UGRC Vector Dark basemap preset (`f374d40`).
- **Tabbed pages**: sections as tabs, `mode: pick` tabs, fill-the-screen tiles with a control rail, and a page layout
  setting for the deployer, the page and the viewer (`39682b3`).
- **Tile Export** menu (CSV, PNG, SVG, copy data) and a deployer-set image footer (`2ed241c`). Equal row heights (`40e88ac`).
- `wftdm-dashboard validate-observed <folder>` checks provenance, columns, suppression and registry consistency
  (`4cdb603`).
- **Demo content**: the three real ActivitySim example runs on the redesigned pages are the default demo, with config for
  vocabulary, metrics and units and table adapters (`d2bb1f4`). A synthetic dataset (15 alternatives, 6 years, observed,
  50 rounds, Wasatch zones and rail) and its generator serve the redesign specs (`23e4de9`).
- A boot skeleton that mirrors the floating nav, page header, KPI band and tiles (`0152e6c`).

### Changed

- Primary colour is navy and pale blue (`4c0ae52`, pinned by contrast tests in `db48ed5`).
- The header keeps the control bar at the right, and the theme button cycles System, Light and Dark (`e5aa1e0`).
- Pages are rebuilt as multi-view chart tiles with `show_when` layouts and a hero calibration cell (`ce5e509`).
- Specs run in two projects: the older ones against the original demo content (a legacy fixture server) and the
  redesign ones against Corridor Pro (`de96ed7`).

### Removed

- Plotly and Recharts, along with the panel types that used them (`b90e525`). The commit before it has them if they are
  ever needed.

### Fixed

- Palette slots ignore manifest observed runs, and a failed legacy observed dataset takes no slot (`733cef9`, `9bc5f26`).
- Basemap raster picker pinned under the scrolling vector styles, and select and dropdown lifted above the settings modal
  (`48041e5`). The colour picker inputs fit their box (`244876d`).
- Contrast of the thumb and logo on the navy primary (`4c0ae52`).

## [0.0.1] - 2026-10-20

The first tagged state: everything built before the redesign, on `4aa4127`. The project was not versioned before this, so
the history is grouped into stages by date.

### Stage 6 · Research (2026-09-20)

- Comparison-framework research for cross-scenario charts and maps, then corrected to Observable Plot (`013d10a`,
  `75c02e8`). The UI redesign specification and reference prototype followed on 2026-10-20 (`4aa4127`).

### Stage 5 · Charts, tables, appearance and performance (2026-09-11 to 2026-09-17)

#### Added

- **Treemap and sunburst** panel types on a shared `HierarchicalChartHost` (`058`, `556928b`). **Pie and radar** panel types
  (`060`, `359a2ea`), then donut mode, scatter, box plot, heatmap, a combo chart and a radial gauge for value boxes
  (`4032e8f`, `cb73ed1`, `c014b9e`, `bf4f5d3`).
- **Server-side table pagination** in DuckDB for 100k+ rows, with sort, filter and format-aware search (`b943cc5`).
  Column visibility toggling, icon sort indicators and pagination polish (`02737de`).
- **Appearance controls** (`061`): colourblind-safe palettes, text size, brand colours and fonts (`bc40479`).
- Protomaps PMTiles basemaps through `@protomaps/basemaps`, with a deployer default and a viewer session override (`041`,
  `8930b13`), and a deployer-set Protomaps hosted-API key (`7effd11`).
- Dismissable boot-progress notifications through sonner (`3f1e705`).

#### Changed

- **Performance** (`042`, `050` to `056`): parallel scenario file registration and code-splitting by panel type; a
  loader-instance pool that was later retired because it measured slower; a boot skeleton generated at build time;
  `coi-serviceworker` removed; **lazy, tab-scoped data loading** (`8edd2a0`); HTTP range-request reads for Parquet; and a
  small caching service worker for DuckDB-WASM binaries and Parquet files with ETag revalidation.
- All real demo charts converted to **Observable Plot**, with Sankey kept on D3 (`057`, `2e95252`). Observable Plot gets
  theming parity (font, legend, tooltip, swatches) (`9787c53`).
- Comparison-diff resolution consolidated across five panel types, and the colour-scale formula extracted into
  `colorScale.ts` (`36d9491`, `6f905e1`).
- A global `castBigIntToDouble` DuckDB setting replaces three ad hoc workarounds and fixes a fourth case (`ab1a0ed`).
- Many Playwright specs moved from synthetic fixtures to real demo content (`040`).
- Hover and active highlights unified across Sidebar, Settings nav and Tabs, with a shadcn-style raised-chip active tab.
  The raster-provider native `<select>` was replaced by the app's own Select.
- CLAUDE.md's per-feature history moved into `project-docs/IMPLEMENTATION-HISTORY.md` (`e604b75`).

#### Fixed

- Scenario-comparison bar charts use faceted grouping instead of stacking, with facet-axis label suppression (`9dbc96d`).
- Concurrent Parquet registration is capped, retried once, and panel fetch errors are no longer swallowed (`4302e6c`).
- Protomaps override errors say whether the URL is unreachable or CORS-blocked (`38a0616`).
- A chunk leak that pulled Recharts into the Summary tab (`9eb7bb6`).
- Radar hover targets, heatmap and box plot left-margin clipping, and dark-mode tooltip background (`01873ae`). Missing
  bars and categorical colours found in a cross-panel audit (`95c779e`).
- Observable Plot x-axis and facet-axis titles get breathing room (`1ec9f21`, `c501e67`).
- Primary, Secondary and Accent swatches react live to theme changes (`bc82880`).
- Light-mode hover and active highlights softened to neutral-200 (`24fc616`, `b021c1f`).
- The colourblind toggle's click target is scoped to the switch only, and a selected basemap tile differs from a hovered
  one (`fbd08ae`, `b9dedf1`).
- Boot toast wording ("Connecting to DuckDB", "Scenarios loaded") (`c20b8f5`, `53afced`).

### Stage 4 · Sidebar, scenarios and the shadcn theme (2026-09-06 to 2026-09-10)

#### Added

- **Left sidebar navigation** with chromeless full-page mode, accordion sub-navigation and a Metric Strip layout (`030`,
  `d348953`).
- Redesigned **value-box metric panels**: configurable expand-ability, sparkline and baseline-trend indicators (`034`).
- Configurable **dashboard title and logo** (`028-dashboard-branding`) and a viewer-selectable dataset picker for Graphic
  Walker (`732f60a`, `2d7341c`).
- **Scenario label and colour override** across every display surface, a deployer scenario palette and a hex, RGB and
  swatch colour picker (`035`, `3e6830e`, `4d3e8af`). Drag-and-drop scenario reordering with a baseline chip (`037`).
- **All loaded scenarios auto-activate** and take part in charts and tables by default, with a per-scenario Switch
  (`038`, `715cc8e`).
- A shadcn and Recharts chart panel type (bar, line and area), later upgraded to Recharts 3 (`761011c`, `976c098`).
- The `wftdm-design-system` skill and Phase 2 and 3 application of it to the shell and every panel (`a2b1884`,
  `138c75d`, `68a31f8`).
- A six-tab ActivitySim calibration demo with real data across all ten panel types (`031`, `032`, `a97a1cc`).
- **GitHub Pages** deployment from a committed `docs/` build, with internal docs moved to `project-docs/` (`039`,
  `a280849`). A permanent, minimally visible Test tab for error-state coverage (`040`, `6d2bcce`).

#### Changed

- Full **shadcn/ui default-theme** adoption: Tailwind v4, the Nova retheme and seven new form-input primitives
  (`033`, `37be6bf`).
- The default basemap is OpenFreeMap Positron, with OpenFreeMap listed first and CARTO risk framing corrected (`a08576a`).

#### Fixed

- `.gitignore` stopped silently dropping demo data under `docs/`, which had made every panel 404 on the live Pages
  deploy (`50847d5`).

### Stage 3 · Panels, maps, settings and the post-processor (2026-08-31 to 2026-09-05)

#### Added

- **Dashboard shell and navigation** with the first two panel types (`003`, `0b1a1b4`), then panel expand-to-dialog
  (`004`), **table** with sort, pagination, search and colour-scale cells (`005`), **markdown** with sanitized
  rendering (`006`), **Observable Plot** with reactive inputs, tooltip and legend (`007`) and **Sankey** (`008`).
- **Local scenario folder loading** through the File System Access API (`009`).
- **Map panels**: flowmap (`010`), a basemap style system with theme-aware defaults and tab and panel precedence (`011`),
  WebGL context management through interleaved overlay mode (`012`), zone map (`013`), a compact attribution toggle,
  navigation controls, a 3D fill-extrusion toggle and unified hover tooltips (`014`, `015`).
- **Graphic Walker** exploration panel, rendered as ordinary JSX instead of `embedGraphicWalker`, which leaks a second
  React root (`f933c42`).
- **Light and dark theme toggle** with system-default detection (`8662961`).
- **Baseline scenario** designation and baseline-vs-scenario diff and percent-diff rendering across panel types
  (`020`, `021`).
- **Unified Settings modal** (theme, scenarios, basemap, documentation), a sectioned basemap catalog with
  stage-then-apply preview, and a visual redesign of the tabs (`022`, `024`).
- **Python post-processor**: a generic ActivitySim CSV-to-Parquet pipeline (`025`, `2b7bab4`) and real demo content with a
  `summarize.yaml` and three post-processed scenarios (`026`, `24e5905`).
- Map auto-fit to the data extent and a reset-view control (`027`). Nav bar visibility mode (hide on scroll or always
  visible) (`c894b02`).

#### Fixed

- The UGRC composition rendered corrupted in dark mode until `composeStyles()` injected a missing background layer
  (`016`, `912b4b5`). Multi-sprite support restored highway and route-shield icons (`017`, `e583006`).
- Layout row grid, resize behaviour and max-width container (`3bea412`); full-width dashboard (`2616e8a`); expanded-dialog
  padding (`39839d3`); zone map fills the expanded dialog (`39f2e14`).
- Dark-mode fixes for dialogs and native form controls (`8662961`). Observable Plot legend overflow, font size and
  dark-mode tooltip contrast (`c6fffbd`). Sankey tooltip appears instantly (`56b6cfe`).
- A real nav-bar header-height measurement bug that caused panel overlap in fixed mode (`c894b02`).
- Theme mode now survives Settings tab switches (`b4a7f37`).
- `.gitignore` no longer swallows `public/demo-scenarios/` (`11543de`).

#### Removed

- The WebGL context-loss recovery UI on the flowmap, a deliberate removal because MapLibre already recovers on its own
  (`011933a`).

### Stage 2 · Foundations (2026-08-19 to 2026-08-30)

#### Added

- spec-kit adopted for spec-driven development, with the project constitution ratified at 1.1.0 and amended through
  2.0.0 (TypeScript, React), 2.1.0 (Tailwind, shadcn, lucide-react) and 2.2.0 (React panel pattern, hook-based
  filter state) (`e92462a`, `f466fb6`, `a06c4b0`, `caef63d`, `35c0d9b`).
- The data and state layer (`001-data-state-layer`), later converted to TypeScript (`0a2cd55`, `a06c4b0`).
- Design tokens and the component foundation (`002-design-tokens`) (`58a629e`).
- Docs for land use and socioeconomics, accessibility, and zone trip ends by mode (`9388f9b`).
- `vizTool` added as a submodule under `_references/` for study (`cdb3f20`).

#### Changed

- The Python package consolidated under `python/`, keeping `src/` JavaScript and TypeScript only (`8b0e96c`).
- Architecture docs reconciled with the constitution (`cb36daf`, `b10c33b`, `7c62c5a`).

### Stage 1 · Project start (2026-07-16)

#### Added

- Initial commit, project scaffolding (`CLAUDE.md`, docs, `pyproject.toml`, Makefile), an expanded `.gitignore`, shared
  editor configs, and a reworked scenario publishing model with the JS, TS and React migration phases (`d1f9bd9`,
  `34032b4`, `c0de8a2`, `c7ae67d`).

[Unreleased]: https://github.com/WFRCAnalytics/APP-wftdm-dashboard/compare/v0.0.4...HEAD
[0.0.4]: https://github.com/WFRCAnalytics/APP-wftdm-dashboard/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/WFRCAnalytics/APP-wftdm-dashboard/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/WFRCAnalytics/APP-wftdm-dashboard/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/WFRCAnalytics/APP-wftdm-dashboard/commits/v0.0.1
