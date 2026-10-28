# CLAUDE.md — WFRC TDM Calibration Dashboard

ActivitySim calibration/validation dashboard. Static web app + Python post-processor.
Read `project-docs/ARCHITECTURE.md` and `project-docs/SPEC.md` before writing any code.

**This file is a current-state reference only.** The full, detailed
implementation history — every feature's design decisions, bugs found and
fixed (with root causes), and verification numbers — lives in
`project-docs/IMPLEMENTATION-HISTORY.md` (an archive of this file's own
much longer prior version, split out because it exceeded the 150k-char
project-instructions limit). Read that file when you need the "why" behind
existing code or a past bug's history; read this file for what's true now.

---

## Deployment & the `docs/` vs `project-docs/` split (read this if `docs/` confuses you)

**`project-docs/`** holds internal reference docs — `ARCHITECTURE.md`,
`SPEC.md`, `GRAMMAR.md`, `PIPELINE.md`, `CALIBRATION-SUMMARIES.md`,
`IMPLEMENTATION-HISTORY.md`, and research/UX proposal docs. These were in
`docs/` until `039-github-pages-restructure` moved them out.

**`docs/` now contains a *built copy of the demo dashboard*, not
documentation** — it is the committed GitHub Pages output. Deliberate,
temporary arrangement (local build, commit the output, no CI/Actions):

- `npm run build:pages` → `tsc --noEmit && vite build --outDir docs --emptyOutDir`.
  Produces the production demo app in `docs/`, base path `/APP-wftdm-dashboard/`.
- GitHub Pages serves it via **"Deploy from a branch → `/docs` folder"** at
  `https://wfrcanalytics.github.io/APP-wftdm-dashboard/`. **No
  `.github/workflows/` file exists or should be added** — the built output
  is committed by hand after running `build:pages`.
- `docs/.nojekyll` (from `public/.nojekyll`) disables Jekyll processing.
- `npm run build` is UNCHANGED — still outputs to `dist/` for the Python
  package embed (`make build` → `cp -r dist python/wftdm_dashboard/static`).
  Only `build:pages` targets `docs/`.

**Future:** once the real dashboard deploys from WFRC's own server, `docs/`
reverts to a normal source tree and the built demo output is removed.

---

## Stack

| Layer | Technology |
|---|---|
| Build | Vite, TypeScript (ES2022 target) |
| Query — browser | DuckDB-WASM in a Web Worker |
| Query — offline | Python DuckDB (`uv run`) |
| Charts — bar/line/area/dot/cell and most others | Observable Plot (`@observablehq/plot`) |
| Charts — Sankey | D3 (`d3-sankey`) — no Observable Plot support exists |
| Charts — Hierarchical (treemap/sunburst) | D3 (`d3-hierarchy`/`d3-shape`) |
| Charts — Pie/Radar | D3 (`d3-shape` for pie); radar is hand-rolled polar trig, no D3 layout pkg |
| Explore tab | In-house chart builder (`src/explore/`, core in `src/charts/builder/`, draws its own SVG); Graphic Walker is kept in the code but no longer in the demo |
| Maps | MapLibre GL (NOT Mapbox) |
| O-D flows | `@flowmap.gl/layers` + `@deck.gl/mapbox` (`MapboxOverlay`, `interleaved: true`) |
| Config parsing | js-yaml (runtime, not build-time) |
| File format | Parquet / GeoParquet only — no CSV/GeoJSON/OMX in browser |
| Geometry | DuckDB spatial extension (`ST_Read`, `ST_AsGeoJSON`) |

TypeScript throughout; React for all UI (constitution v2.0.0+). No branch-
per-phase migration — work lands directly on `main`. `services/`/`state/`
stay plain `.ts` (no JSX); anything rendering JSX is `.tsx`.

The two earlier chart engines (the old default `type:` panels) were removed in the 063 redesign; recover them from git
history, from the commit before `b90e525` (`redesign: remove Plotly and Recharts`), if ever needed. Chart-engine consolidation
(`057-observable-plot-conversion`), and every panel-type's own build
story are in `project-docs/IMPLEMENTATION-HISTORY.md` (items 16, 21, 28–31).

---

## Non-negotiables

- DuckDB-WASM runs in a **Web Worker** — never the main thread
- One DuckDB instance shared across all panels via `services/duckdb.ts`
  (the old multi-instance loader pool, `duckdbLoaderPool.ts`, was removed
  in `056-lazy-tab-scoped-loading` — measured slower at every batch size)
- React only — no Vue/Svelte/other frameworks; panel registry is a
  type-to-component map (`panels/registry.tsx`), not factory functions
- No eval() — SQL fragments use string replacement only
- YAML parsed at **runtime** — dashboard content is not known at build time
- Browser only reads Parquet — all format conversion is offline
- MapLibre not Mapbox — `@deck.gl/mapbox` `MapboxOverlay` works with MapLibre
- Never `localStorage`/`sessionStorage` — session-only state uses plain
  in-memory module state (e.g. `state/basemapState.ts`, `protomapsSourceState.ts`)

---

## Config file set (four files, no more; constitution 2.8.0)

```
dashboard-config.yaml site-level deployer settings + the ordered page list (Quarto `_quarto.yml` style); settings cascade site → page → panel
summarize.yaml        post-processor: sources, mappings, bins, sql_fragments, metrics → Parquet
dashboard-*.yaml      tab layout and panels — first page listed is the landing page
manifest.yaml         per-scenario metadata
```

- **`dashboard-config.yaml` is specified (`project-docs/CONFIGURATION.md`) but NOT built yet.** Until it is, the site settings below still live in
  `public/dashboard-config/index.json`. New deployer settings go in `dashboard-config.yaml` (or a panel's own keys), never in `index.json`.
- No `topsheet.yaml` or `summarize-preprocessor.yaml`.
- **Delivery targets:** a Python library and an R package (constitution Principle X); neither holds app logic.
- **Undecided (constitution "Open Decisions"):** whether data is pre-processed to Parquet (as now) or read directly from the model's raw
  output; to be tested on two branches with real WFRC model output. Keep the current design on `main` until then. The observed-data
  stream is not designed yet.
- Dashboard YAML configs are authored alongside model scripts in the TDM
  repo, not this one — same authored-vs-published split as `manifest.yaml`.
  A published copy lives in `public/dashboard-config/` here, discovered at
  runtime via `public/dashboard-config/index.json` (same pattern as
  `public/scenarios/index.json`).
- `public/dashboard-config/index.json`/`public/scenarios/index.json` are
  discovery metadata, not a 4th config type. `dashboard-config/index.json`
  (and `demo-dashboard-config/index.json`) may additionally carry
  deployer-configurable app-wide fields — see `services/yamlLoader.ts`'s
  `DashboardBranding`: `title`, `logoUrl`/`logoUrlDark` (full logo, shown when the nav
  is expanded), `markUrl`/`markUrlDark` (abbreviated logo, shown on the collapsed rail;
  the generic mark when unset), `scenarioPalette`,
  `protomapsPmtilesUrl`/`protomapsApiKey` (a self-hosted PMTiles file, or a Protomaps hosted-API key), `primaryColor`/`secondaryColor`/`accentColor` (the three DATA colours: transit, walking, biking and the chart palette) and `brandColor` (the
  interface colour for selected pills, titles, tags and focus rings; separate so a data colour never recolours the chrome). All
  optional; an unconfigured deployment renders exactly as it always did.
- Parquet outputs live in `{scenario-dir}/summary/` — written by the post-processor.
- `public/scenarios/`, `public/dashboard-config/`, `public/observed/` are
  ALL gitignored (`npm run dev:fixtures` copies `tests/fixtures/{...}`
  into them for local/CI checks). Real, git-tracked demo content lives at
  a separate, non-gitignored root: `public/demo-scenarios/`,
  `public/demo-dashboard-config/`, `public/demo-geometry/` — discovered
  the same way, additively, never instead of the fixture-copy paths.

---

## Navigation model

Tabs are **discovered at runtime**: `main.ts` fetches
`public/dashboard-config/index.json` (array of `dashboard-*.yaml`
filenames, display order) — same pattern `scenarios/index.json` uses. The
first filename is always the landing page.

The default set WFRC ships (`public/demo-dashboard-config/`, the real tabs only):
```
Summary ★ → Person/Household Models → Tour Models → Mode Choice
→ Network → Explore (chart builder, full-page)
```

There is **no Test tab in the shipped app**. `dashboard-8-test.yaml` (deliberately-
broken/edge-case panels only: missing metric per panel type, unreachable basemap, XSS
markdown, etc.) lives in `tests/fixtures/test-tab/`. Playwright specs that need it import
`test` from `tests/integration/_testTab.ts`, which appends it to the dashboard index at run
time through a `page.route` (it stays unobtrusive via `header.tab: " "` + omitted
`header.icon` + `header.aria_label: "Test"`). Never list it in `index.json`.

Sidebar navigation (`030-sidebar-navigation`) replaced the old top
`navBar.tsx` tab strip — a persistent, collapsible left `Sidebar`
(`components/ui/sidebar.tsx`) with accordion sub-navigation
(`sections:` per tab) and chromeless full-page mode
(`header.full_page: true`, exactly one panel). See
`project-docs/IMPLEMENTATION-HISTORY.md` item 18 for the full design.

---

## File structure

```
APP-wftdm-dashboard/
├── CLAUDE.md
├── project-docs/                    # internal reference docs
│   ├── ARCHITECTURE.md
│   ├── SPEC.md
│   ├── GRAMMAR.md
│   ├── PIPELINE.md
│   ├── CALIBRATION-SUMMARIES.md
│   ├── IMPLEMENTATION-HISTORY.md    # full per-feature history (see top of this file)
│   ├── TABLE-PANEL-PROPOSAL.md
│   ├── UX-REDESIGN-PROPOSAL.md
│   ├── BASEMAP-PICKER-PROPOSAL.md
│   ├── ZERO-STEP-SUMMARIZATION-PROPOSAL.md  # deferred: `here` summarizes on launch, Parquet hand-off
│   └── OBSERVABLE-PLOT-THEMING-PROPOSAL.md
├── docs/                        # ⚠ NOT docs — committed GitHub Pages build output
├── index.html                   # <script type="module" src="/src/main.tsx">
├── package.json
├── vite.config.ts
├── public/
│   ├── observed/                # observed data — deselectable, always pre-loaded (gitignored)
│   ├── scenarios/                # published model runs (gitignored)
│   ├── dashboard-config/         # published tab layout (gitignored)
│   ├── demo-scenarios/           # real, git-tracked demo data (NOT gitignored)
│   ├── demo-dashboard-config/    # real, git-tracked demo tabs (NOT gitignored)
│   └── demo-geometry/            # real TAZ boundary GeoParquet for demo zonemap/flowmap
├── pyproject.toml
├── Makefile
├── python/
│   ├── wftdm_dashboard/
│   │   ├── cli.py               # `summarize` subcommand (done); serve/here/init are NOT built yet
│   │   ├── server.py            # ❌ not started
│   │   ├── static/               # ❌ not started
│   │   ├── templates/            # ❌ not started (init's scaffolding)
│   │   └── postprocessor/        # done — CSV→Parquet pipeline (errors.py/config.py/expand.py/
│   │                              # sources.py/pipeline.py/manifest.py)
│   └── tests/                    # pytest suite, separate from repo-root tests/ (Vitest/Playwright)
└── src/
    ├── main.tsx                  # boot sequence
    ├── state/                    # appState.ts, compareState.ts (year/focus/compare/reference/display),
    │                              # filterState.ts, basemapState.ts,
    │                              # protomapsSourceState.ts, colorPreferenceState.ts,
    │                              # interfaceColorState.ts, fontPreferenceState.ts, textSizeState.ts
    ├── services/
    │   ├── duckdb.ts              # single shared AsyncDuckDB instance + query/queryArrow/registerFileURL
    │   ├── scenarioDiscovery.ts   # registers observed/ + scenarios/* + demo-scenarios/*;
    │   │                          # fetches each scenario's metric catalog only (lazy loading, see below)
    │   ├── tabDataLoader.ts       # computeTabDataRequirement()/ensureRegistered() — lazy,
    │   │                          # per-active-tab Parquet file registration
    │   ├── viewContext.ts         # pure resolveViewContext(): compare state + run catalog -> what every tile shows
    │   ├── runResolution.ts       # stores -> viewContext; getBaselineForYear(), bootCompareState()
    │   ├── yamlLoader.ts          # fetch + parse dashboard-*.yaml, DashboardBranding
    │   └── sqlExpander.ts         # expand $mappings/$bins/$sql/$filters/$scenario/$inputs/$baseline
    ├── hooks/                     # useFilterState, useActiveScenarios, useColorScheme, useBaseline,
    │                              # useGlobalBasemap, useScenarioList, useProtomapsSource,
    │                              # useScenarioDisplay, useInterfaceColors, useFontPreference,
    │                              # useColorblindSafePreference, useViewContext (useActiveScenarios and
    │                              # useBaseline both read it: runs resolved for the current model year)
    ├── layout/
    │   ├── shell.tsx              # SidebarProvider > Sidebar + SidebarInset[DashboardRenderer]
    │   ├── sidebarNav.tsx         # sidebar tab list + accordion sub-nav (role="tablist"/"tab")
    │   ├── dashboardLayout.ts     # pure: isMetricStripRow()/findFullPagePanel()/resolveSections()
    │   ├── dashboardRenderer.tsx  # renders one tab's layout; injects tab-level default_basemap
    │   ├── panelCard.tsx          # PanelCard: error boundary + Suspense; plain panels and multi-view tiles
    │   ├── tile.tsx               # tile chrome: header, badges, control row, legend slot, body
    │   ├── multiViewTile.tsx      # chrome for `type: multi-view` (view switcher, Group by, badges, hide rules)
    │   ├── panelExpandHost.tsx    # generic expand-to-dialog mechanism
    │   ├── types.ts               # DashboardTabConfig/PanelConfig types
    │   └── settings/              # settingsModal.tsx tabs: appearanceTab, scenariosTab,
    │                              # basemapTab, documentationTab
    ├── panels/
    │   ├── registry.tsx           # type → lazy-loaded component map (14 registry keys, see below)
    │   ├── expandablePanelTypes.ts # EXPANDABLE_PANEL_TYPES — default expand-scope per panel type
    │   ├── panelQuery.ts          # PanelConfig + filters → SQL; buildComparisonDiffQuery(),
    │   │                          # buildTableDrivenPageQuery() (server-side pagination ≥100k rows)
    │   ├── PanelLoadingState.tsx  # shared React.lazy() Suspense fallback
    │   ├── chartColor.ts          # consolidated named-color-scheme + category-fallback resolver
    │   │                          # (replaces the old sankeyColor/hierarchyColor/polarChartColor)
    │   ├── scenarioDisplay.ts     # label/color resolution (viewer override → deployer palette → default)
    │   ├── {ValueBox,Table,Markdown,ObservablePlot,Sankey,FlowMap,ZoneMap,
    │   │    GraphicWalker,Treemap,Sunburst,Pie,Radar}Panel.tsx
    │   ├── basemap/               # basemap registry/resolution shared by FlowMap/ZoneMap panels
    │   └── (pure per-panel-type helper modules: tableLogic, formatValue,
    │        observablePlotEncoding, sankeyGraph, flowmapData, zonemapColor, zoneGeometry,
    │        hierarchyData/hierarchyColor→chartColor, pieData, radarData)
    ├── scenario/                  # scenarioManager.ts (local folder picker), manifestReader.ts
    ├── components/ui/             # shadcn-pattern primitives: button, card, tabs, tooltip, dialog,
    │                              # dropdown-menu, sidebar, chart, badge, color-picker, slider,
    │                              # label, input, textarea, checkbox, switch, radio-group, select
    └── styles/                    # global.css, layout.css, tokens.css
```

Full historical detail for every file above (why it was built, every real
bug found in it and how it was fixed) is in
`project-docs/IMPLEMENTATION-HISTORY.md`.

---

## Panel types (12, plus `chart` and the `multi-view` wrapper, in `panels/registry.tsx`)

```tsx
export const registry: Record<string, ComponentType<PanelProps>> = {
  'observable-plot': ObservablePlotPanel,
  'table': TablePanel, 'valuebox': ValueBoxPanel,
  'flowmap': FlowMapPanel, 'zonemap': ZoneMapPanel,
  'sankey': SankeyPanel, 'graphic-walker': GraphicWalkerPanel,
  'markdown': MarkdownPanel,
  'treemap': TreemapPanel, 'sunburst': SunburstPanel,
  'pie': PieChartPanel, 'radar': RadarChartPanel,
  'chart': ChartPanel,            // 063: `type: chart, kind: <name>` — the catalogue kinds in src/charts/kinds/
  'multi-view': MultiViewPanel,   // 063: wrapper holding several views of one dataset (panels/multiView.ts)
}
```

All ten "chart/table/map" types plus `markdown`/`valuebox`/`graphic-walker`
are lazy-loaded (`React.lazy()`, `042-boot-performance-fix`) — wrapped in
`<Suspense fallback={<PanelLoadingState />}>` inside `PanelErrorBoundary`
at each of `panelCard.tsx`'s and `dashboardRenderer.tsx`'s two call sites.

`observable-plot` is the engine for bar/line/area/dot/cell charts and everything else that
doesn't need Sankey/hierarchical/polar-specific rendering. Real demo content today uses 8
of the 12 types across the six primary tabs; `table` and the other edge cases are exercised
for real via the injected Test tab fixture (`tests/fixtures/test-tab/`).

**Expand-ability is scoped per type** (`034-metric-panel-redesign`):
`EXPANDABLE_PANEL_TYPES` in `panels/expandablePanelTypes.ts` lists the
default-expandable types (table/markdown/observable-plot/sankey/
flowmap/zonemap — NOT valuebox or ordinary graphic-walker). A
per-panel `expandable?: boolean` field on `PanelConfigBase` overrides the
default: `config.expandable ?? EXPANDABLE_PANEL_TYPES.has(config.type)`.

`dashboardRenderer.tsx` looks up `registry[config.type]` and renders
`<PanelComponent config={config} />` directly.

---

## Panel pattern

A React function component receiving a single `config` prop:

```tsx
const ALL_FILTERS: ['*'] = ['*'] // module-level constant — stable identity

export function Panel({ config }: PanelProps) {
  const filters = useFilterState(config.filter_ids ?? ALL_FILTERS)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    query(buildSQL(config, filters)).then((rows) => {
      if (!cancelled) /* draw rows into containerRef.current */
    })
    return () => { cancelled = true }
  }, [config, filters])

  // Unmount-only teardown — a second effect, empty deps
  useEffect(() => () => { /* e.g. map.remove() */ }, [])

  return <div ref={containerRef} />
}
```

`query`/`queryArrow` come from a direct `import { query } from
'services/duckdb.ts'`. `config.filter_ids` needs no defensive `useMemo` —
`yamlLoader.ts` parses each `dashboard-*.yaml` once at boot and returns a
stable object graph.

**Lazy, tab-scoped data loading** (`056-lazy-tab-scoped-loading`): every
data-bound panel's fetch effect calls `await ensureRegistered(pairs)`
(`services/tabDataLoader.ts`) immediately before its `query()`/
`queryArrow()` call — registers only the `{scenario, metric}` Parquet
files that panel actually needs, memoized so redundant calls are free.
`scenarioDiscovery.ts` no longer eagerly registers every file at boot;
`dashboardRenderer.tsx` proactively kicks off a newly-active tab's whole
batch in parallel as a performance optimization on the same primitive.

---

## `useFilterState` hook (`hooks/useFilterState.ts`)

Wraps `state/filterState.ts`'s pub/sub store with `useSyncExternalStore`,
with a memoized snapshot cache (`filterState.getAll()` builds a new object
every call; `useSyncExternalStore` compares by `Object.is`, so an
unmemoized snapshot would loop):

```ts
export function useFilterState(ids: FilterId[] | ['*']): Record<FilterId, FilterValue> {
  const cache = useRef<Record<FilterId, FilterValue>>({})
  const getSnapshot = useCallback(() => {
    const next = ids[0] === '*' ? getAll() : Object.fromEntries(ids.map((id) => [id, get(id)]))
    const prev = cache.current
    const changed = Object.keys(next).length !== Object.keys(prev).length ||
      Object.entries(next).some(([k, v]) => prev[k] !== v)
    if (changed) cache.current = next
    return cache.current
  }, [ids])
  return useSyncExternalStore((onChange) => subscribe(ids, onChange), getSnapshot)
}
```

---

## SQL expander (`services/sqlExpander.ts`)

- `$mappings.major_trip_mode` → WHEN clauses inside a CASE block
- `$bins.income_category` → CASE expression from manual_breaks / quantiles
- `$sql.trips_merged` → inline FROM clause joining trips + persons + households + zones
- `$filters.purpose` → current filter value (omit WHERE if value is `'all'`)
- `$scenario` → UNION ALL across all *active* loaded scenario views
- `$baseline.x` → a single bare quoted view reference to the resolved baseline scenario

`config.scenario` (singular)/`config.scenarios` (list) on a panel bypass
`$scenario`'s active-set union entirely — see "All scenarios active by
default" below.

---

## Filter state (`state/filterState.ts`)

```js
get(id), set(id, value)
subscribe(ids, fn) → unsubFn   // ids: ['purpose'] or ['*'] for all
getAll() → Object
```

---

## Scenario activation — all loaded scenarios participate by default

Every scenario whose registration reaches `status === 'ready'` is
auto-activated (`services/scenarioDiscovery.ts`, `038-all-loaded-scenarios`)
— uniformly for observed/published/demo, no fixture-vs-demo branching.
`?s=` URL params only widen this set. A panel with an explicit
`scenario:`/`scenarios:` key is independent of the active set by design;
only a panel with neither key consults it via `$scenario`.

A viewer's Scenarios-tab `Switch` (`037-scenarios-tab-redesign`) toggles
`appState.active` directly — reactively affects only unpinned `$scenario`
panels. Drag-and-drop reorder (`@dnd-kit`) + arrow-button fallback both
funnel through one `appState.reorderScenario(name, targetIndex)`. Baseline
designation is a single non-interactive "Baseline" chip on the current
baseline row + a "Set as baseline" chip button on every other row (not a
Star icon). A viewer can override a scenario's display `label` and
`colorOverride` (swatch + kibo-based `color-picker.tsx`); resolution order
is `colorOverride ?? scenarioPalette (deployer) ?? --chart-N default`.

---

## Map panels

**FlowMapPanel** — `maplibregl.Map` + `MapboxOverlay` (`interleaved: true`),
created once in a mount-only effect, `overlay.setProps()` on data update,
`map.remove()` on unmount. Real basemap tiles resolve via
`panels/basemap/` (panel/tab/app-default precedence). No WebGL
context-loss recovery UI (removed — see history item — MapLibre already
recovers its own painter internally; `interleaved: true` alone is what
keeps context count sustainable).

**ZoneMapPanel** — pure MapLibre, **no** deck.gl/`MapboxOverlay` (a
data-driven `fill-color` paint expression + native mouse events cover the
choropleth need). Zone GeoParquet loads once via DuckDB spatial
(`ST_GeomFromWKB()`/`ST_AsGeoJSON()`, never `ST_Read()`/
`registerFileBuffer()` — confirmed upstream incompatibility). DuckDB-WASM's
`spatial` extension is NOT bundled — needs explicit `INSTALL`/`LOAD`,
fetched lazily on first zonemap use.

Both panel types auto-fit their initial view to real data bounds when the
author configures neither `center` nor `zoom` (once per mount,
`027-map-auto-fit-and-reset`), and share a `ResetViewControl`.

**Pinned versions (peer deps must match):**
- `@deck.gl/core` + `@deck.gl/layers` + `@deck.gl/mapbox`: ^9.0.0
- `@flowmap.gl/layers`: ^9.3.0
- `maplibre-gl`: ^4.7.1

Full bug history (WebGL context management, UGRC dark-mode background
layer, multi-sprite support, basemap-switch style-merge rejection, camera
landing-spot drift on fitBounds) is in
`project-docs/IMPLEMENTATION-HISTORY.md` under the "Map panels" section
and Implementation-order items 9, 27, 29.

### Basemap catalog

Curated sections in the Settings modal's Basemap tab: UGRC Vector Tiles,
CARTO Vector Tiles, OpenFreeMap, Protomaps (`protomaps-light/-dark/-white/
-grayscale/-black`, generated programmatically via
`@protomaps/basemaps`'s `layers()`, never a hand-authored style.json), and
a curated Raster Tiles dropdown (leaflet-providers catalog). A single
shared preview `maplibregl.Map` + stage-then-Apply flow; nothing is
applied live until the author clicks Apply.

Protomaps needs a real PMTiles source configured (`protomapsPmtilesUrl` on
`dashboard-config/index.json`, two-tier deployer-default/viewer-session-
override precedence, `state/protomapsSourceState.ts`) — with none
configured (the real demo's own state today), the flavors fall back to
`freshBlankStyle()` like any other unreachable basemap. Full design in
`project-docs/IMPLEMENTATION-HISTORY.md`.

---

## Graphic Walker panel

> **Retired from the demo (`065-chart-builder`, constitution 2.7.0).** The `graphic-walker` panel type is still registered and
> everything below still works, but no shipped navigation opens it; the Explore tab is the chart builder. The code stays until
> the maintainers decide to delete it; restore it from git history (tag `v0.0.3` contains it).

Renders `<GraphicWalker>` as ordinary JSX in this app's own React tree —
**not** `embedGraphicWalker` (that creates an undisposable second React
root, confirmed via direct source read — a real leak on every tab-switch
mount/unmount cycle). Uses `queryArrow()` (not `query()`) for Arrow-schema
field inference (`panels/graphicWalkerFields.ts`). Snapshot-only — does
not share the DuckDB connection state or respond to global filters
(intentional; the Explore tab is an open-ended sandbox).

`dataset_picker: true` (opt-in, `028-graphic-walker-dataset-picker`) shows
a control listing every dataset queryable against active scenarios
(`panels/graphicWalkerDatasets.ts#listSelectableDatasets()`, intersected —
never unioned — across scenarios in scope, schema-consistency checked).

`@kanaries/graphic-walker` is pinned to the **exact** version `"0.4.82"`
(no `^` range) — its peer dependency requires React ≥19 starting at
0.4.83; a caret range was confirmed, live, to still resolve past it.

---

## vite.config.ts

```js
export default defineConfig({
  base: '/APP-wftdm-dashboard/',        // GitHub Pages
  worker: { format: 'es' },             // REQUIRED for DuckDB-WASM
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },  // REQUIRED
  build: {
    target: 'esnext',
    rollupOptions: { output: { manualChunks(id) {
      // 'react-vendor' MUST be checked first — react/react-dom/scheduler
      // get pulled transitively into whichever chunk imports them first
      // otherwise (042-boot-performance-fix's own confirmed leak finding)
      if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler'))
        return 'react-vendor'
      if (id.includes('@duckdb/duckdb-wasm')) return 'duckdb'
      if (id.includes('maplibre-gl') || id.includes('pmtiles') || id.includes('@protomaps/basemaps'))
        return 'maps'                    // eager — needed by the always-mounted Basemap tab preview
      if (id.includes('@deck.gl') || id.includes('@flowmap.gl') || id.includes('@luma.gl') ||
          id.includes('@math.gl') || id.includes('@loaders.gl') || id.includes('@probe.gl'))
        return 'flowmap-deck'            // lazy — only FlowMapPanel needs this
      if (id.includes('graphic-walker'))      return 'graphic-walker'
    }}}
  },
  server: { headers: {                 // dev only
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  }}
})
```

Every panel-type component is lazy-loaded (`React.lazy()`,
`panels/registry.tsx`) — the `manualChunks` map above exists to keep
heavy per-chart-library code out of the eager entry graph. See
`project-docs/IMPLEMENTATION-HISTORY.md` item 26 for the three real
leak-sources found and fixed (a static import in `basemapTab.tsx`, a
merged maps/deck.gl chunk, and React itself getting bundled into
a chart-library chunk transitively).

---

## index.html

```html
<div id="app"></div>
<script type="module" src="/src/main.tsx"></script>
```

(There is no `coi-serviceworker.js`: the production app runs with no cross-origin isolation and
`@duckdb/duckdb-wasm` picks its non-threaded bundle. `public/asset-cache-serviceworker.js` is a different thing — it
caches the DuckDB/Parquet assets. The dev server alone sets COOP/COEP, see `vite.config.ts`.)

---

## package.json — key dependencies

```json
{
  "@duckdb/duckdb-wasm": "latest",
  "@deck.gl/core": "^9.0.0", "@deck.gl/mapbox": "^9.0.0",
  "@flowmap.gl/layers": "^9.3.0",
  "@kanaries/graphic-walker": "0.4.82",
  "@observablehq/plot": "latest",
  "@protomaps/basemaps": "^5.7.2", "pmtiles": "^4.5.0",
  "apache-arrow": "^18.0.0",
  "d3-hierarchy": "^3.1.2", "d3-shape": "^3.2.0", "d3-sankey": "latest",
  "d3-scale-chromatic": "latest",
  "@dnd-kit/core": "latest", "@dnd-kit/sortable": "latest",
  "@dnd-kit/utilities": "latest", "@dnd-kit/modifiers": "latest",
  "color": "latest",
  "@radix-ui/react-slider": "latest", "@radix-ui/react-popover": "latest",
  "@radix-ui/react-label": "latest", "@radix-ui/react-checkbox": "latest",
  "@radix-ui/react-switch": "latest", "@radix-ui/react-radio-group": "latest",
  "@radix-ui/react-select": "latest",
  "js-yaml": "latest",
  "maplibre-gl": "^4.7.1",
  "tw-animate-css": "latest",
  "@fontsource-variable/schibsted-grotesk": "^5.3.0", "@fontsource/dm-mono": "^5.3.0"
}
```

Tailwind v4 via the `@config` bridge (`033-shadcn-default-theme`) —
`tailwind.config.js` stays plain JS, `@tailwindcss/vite` replaces
`postcss.config.js`/`autoprefixer`. `components.json` `style` is
`"new-york-v4"`.

Full dependency-history detail (the old chart engines' major-version upgrades, why each pin is exact vs.
a range, every version-compatibility bug found) is in
`project-docs/IMPLEMENTATION-HISTORY.md`.

---

## 063 redesign: compare model, chart kinds, demo content

The app implements the Corridor Pro design in `project-docs/redesign/` (read `00-README.md`, then `09-chart-kind-guide.md`
before touching charts).

- **View context**: `state/compareState.ts` (year, focus, compare, reference, display) plus appState's active flags feed
  the pure `services/viewContext.ts#resolveViewContext`; read it through `hooks/useViewContext.ts`. Runs are identified by
  manifest `scenario_group` + `year` (`scenario_group` was called `alternative` until 2026-10-28; the old key is still read); `kind: scenario | round | observed`, and `hidden: true` keeps a run loadable/pinnable
  but out of the picker, Scenarios tab and compare set (the legacy ActivitySim runs the Test tab pins).
- **Default selection**: unless `compare.focus`/`compare.reference` are set in index.json, the first scenario is the reference and the second the focus.
- **Tiles**: `type: multi-view` wraps views, a Group by control and compare strategies (`panels/multiView.ts`,
  `layout/multiViewTile.tsx`, `panels/CompareHost.tsx` + `compareStrategy.ts` for overlay/diff/multi/grid/switch/swipe).
  Tile keys: panel `id` (else `row-index`), session state in `state/tileState.ts`. `show_when: compare|single`,
  `needs_compare`, `family: calibration`, `height_rows` and `default_view` shape what is rendered.
- **Charts**: `type: chart, kind: <name>` is drawn by `panels/ChartPanel.tsx`; each kind is one module in
  `src/charts/kinds/` (named from its file name, auto-registered via `import.meta.glob`), shared logic in `src/charts/lib/`.
  Kinds receive a `ChartEnv` and never read stores or DuckDB. One tooltip (`services/tooltip.ts`), crosshair/armPlot
  (`panels/plotInteraction.ts`), mode cross-highlight (`panels/crossHighlight.ts`), grid-synced hover (`panels/gridSync.ts`).
  Legacy panel types (`observable-plot`, `treemap`, ... ) are unchanged and still render old-style configs.
- **Demo content sets**: the default demo (`public/demo-scenarios`, `public/demo-dashboard-config`) is the three real
  ActivitySim example runs on the redesigned pages (single year, no observed or rounds; tiles without data are simply not
  on the pages). The synthetic Corridor Pro dataset (15 scenario groups x 6 years, `observed-2023`, 50 `round-NN`, family
  roll-up, Wasatch zone/rail geometry; generated by `scripts/build-demo-redesign-data.py`) lives in `public/demo-synthetic`
  and is served in place of the default only for the redesign Playwright project (`WFTDM_DEMO=synthetic`,
  `scripts/viteLegacyDemoPlugin.ts`); the older specs run against `tests/fixtures/legacy-demo` (`WFTDM_DEMO=legacy`).
- **Data adapters**: charts read logical tables (`trip_mode_share_by_purpose`, `trips_by_hour_purpose`, `zone_transit_share`,
  `population_age_sex`, ...); `charts/data/adapt.ts` derives them from the tables a deployment really publishes and maps raw
  category values onto the deployment's vocabulary. `dashboard-config/index.json` describes it: `vocab` (modes, purposes,
  incomes, autos: label, raw `ids`, mode colour token), `metrics` (label/unit/decimals/scale/hidden for scorecard, ranking and
  trend metrics) and `units` (`trips` divisor/suffix for time-of-day charts, `transit_share_max` for the map ramp). `panels/panelQuery.ts#resolveActiveScenarios` skips runs whose metric catalog
  lacks a panel's metric. `wftdm-dashboard validate-observed <folder>` checks a published observed folder.
- **Layout, toolbar and export** (`project-docs/redesign/10-toolbar-layout-export-proposal.md`): the control bar is one row (a
  Scenarios chip for focus, compared set and reference; Show greyed out when Compare is off; Compare right-most). Tiles in a
  row share the tallest height. Pages are `scroll` or `tabs` (`state/layoutState.ts`: viewer setting or `?layout=` >
  `header.layout_mode` > `layout.mode` in index.json > scroll); in tabs mode `sections:` are the tabs (`mode: pick` shows one
  tile at a time), hero rows stay above them, tiles fill the screen (`layout/fill.tsx`) and their controls move to a rail; a section's `shared_controls: [group, view, strategy]` lifts those
  controls into the tab strip, one value driving every tile that offers the option id.
  Every tile has an Export menu (`layout/tileExport.tsx`, `services/exportTile.ts`: CSV, PNG, SVG), also inside the expanded dialog, and
  an Export all button zips the tiles on screen (`layout/pageExport.tsx`); `export.footer` in
  index.json sets the image footer. The real demo is tabbed; the synthetic and legacy sets stay scrolling.
- **Facets and single-scenario views**: a zoom in one facet of a side-by-side tile is made in all of them (`env.sync(name)` in a kind, backed by `charts/lib/facetSync.ts`, keyed by tile + kind + group; treemap and sunburst use it for their scope, and a kind subscribes in `draw` and returns the unsubscribe as `dispose`). A view that shows one scenario (`switch`, `swipe`, a plain-panel `diff`, and the kinds in `SINGLE_SCENARIO_KINDS` in Values mode) gets the tile's Scenario dropdown (`offersScenarioPick`). `ChartPanel` claims the tile's legend row in a layout effect, never in render (a discarded render used to leave a stale owner and the legend never showed). Radar markers are concentric per scenario so near-identical scenarios stay visible. The tile's Layout (Auto/Row/Grid) is an icon Select in the header beside Export (`components/ui/layout-menu.tsx`, reusing `select.tsx`). Compare as offers arrangements only: a difference is the Show control's job (`effectiveStrategy` draws it), so `diff` is never an option and the control is hidden while Show is not Values. A tile's description sits behind an info button beside its title (click-to-open popover; inline in the expanded dialog). **Loading skeletons**: every panel's placeholder is `panels/PanelSkeleton.tsx`, a silhouette of the chart chosen by the pure `panels/skeleton.ts#skeletonShape` (a `KIND_SHAPE` entry per chart kind: a unit test fails when a new kind has none; legacy types by `TYPE_SHAPE`, plot panels by `mark`); keep `animate-pulse` on it (specs assert it is gone once ready) and use it for any new panel's loading state. A one-scenario chart grouped by Scenario that already draws every scenario (`drawsAllScenarios`, the Time of day heatmap) is not pinned, and its Scenario dropdown shows "All scenarios", disabled.
- Dial KPIs: a hero `valuebox` with `ring: {}` draws its value (a `max` is picked automatically unless given) on a half-circle dial with a tick at the reference. Mode share has a `mode-radar` view, trips by purpose a `purpose-radar` view and purpose to mode a `purpose-chord` view; all three read tables the real demo publishes.
- New D3 submodules (no new chart library): d3-selection/scale/array/chord/zoom/format/interpolate/transition.

## AI assistant (`064-ai-chat-assistant`)

Settings → **AI** tab (provider OpenAI/Anthropic/Deepseek/Ollama, token, model, Check and Save, Read-Only/Modify,
privacy schema-only vs schema+results, Reset session data) and a floating button (`layout/chat/chatLauncher.tsx`, in
`layout/shell.tsx`) opening a lazy side panel (`chatPanel.tsx`). Code: `services/ai/` (`providers`, `sqlGuard`,
`catalog`, `sqlRunner`, `toolSchema`/`tools`, `agentLoop`, `assistant`, `chatSession`), `state/aiState.ts`,
`state/chatState.ts`. Session-only: the token and chat are in-memory, never in Web Storage. The assistant's SQL runs
through `services/duckdb.ts` and is authorized by `sqlGuard.authorize()` first: never bypass it, and never add a
second connection. No new dependency (plain `fetch`). Design and history: `specs/064-ai-chat-assistant/` and
`project-docs/IMPLEMENTATION-HISTORY.md` ("064 AI chat assistant").
The Assistant button is a glass circle in the page header beside the control bar (`AssistantButton` in `chatLauncher.tsx`;
fixed top right on chromeless pages). A deployer turns the whole feature off with `"assistant": { "enabled": false }` in
`dashboard-config/index.json` (`DashboardBranding.assistantEnabled`, read once at boot into
`state/assistantAvailability.ts`): no button, no panel, no Settings tab. Enabled by default. The Model field is a
searchable combobox (`components/ui/combobox-input.tsx`) over per-provider presets in `state/aiState.ts`; any other model
name can be typed.

---

## Explore builder (`065-chart-builder`)

The Explore tab opens the `explore-builder` panel (`src/explore/`): a Data tab (column summaries, paged preview, query
builder with joins, SQL tab, "My tables" saved as `xb_` temp views) and chart tabs (fields, one-row shelves, nineteen chart
types, suggestions, Style/Axes/Filter rail, export and import). Graphic Walker is still registered but no longer in the demo
navigation (constitution 2.7.0 records this); deleting its code is a later, separate decision. Pure core in `src/charts/builder/` (column types,
spec and channel rules, suggestions, `specToSql` which makes DuckDB do the grouping, binning and box statistics, and the
compiler `compile.ts`, which draws its own SVG because Plot has no dash/hatch/pie) and `src/explore/sql/` (query model and
joins, highlighter, guarded runner). User SQL always goes through `sqlGuard.authorize` and the one shared connection.
Session-only state in `state/exploreState.ts`. Specs and tasks: `specs/065-chart-builder/`.

Ordered shelves (treemap/sunburst levels, a table's groups and measures) are lists packed with no gaps (`charts/builder/chainOps.ts`):
removing promotes the rest, a drop in a gap or on a shelf's outer quarter inserts, on its middle replaces. **Drag rule (a hard-won
lesson, with a spec that guards it):** nothing may reflow, rewrite text or write to the global store while a field is in flight, and
a drop target is read from the shelves' own fixed boxes, never from enter/leave on elements the preview moves. The insertion bar and hint
are absolutely positioned overlays; `selectedField` is never set by a drag (that runs profiling queries).

A deployer shapes the builder from the panel's YAML, every key optional (`explore/options.ts`, contract
`specs/065-chart-builder/contracts/deployer-options.md`): `limits` (csv_rows, page_size, undo_steps, max_joins), `features` (sql_tab, csv,
copy_sql, import_export, my_tables, undo), `charts` (allow, default), `tables` (include/exclude globs), `columns` (label, unit, format)
and `presets` (starter charts). A new Explore control that has a sensible deployer choice gets a key there, not a constant; a wrong
value is reported under the panel title and the default stays.

`type: chart, kind: custom, spec: {...}` (`charts/kinds/custom.ts`) draws a chart in a dashboard tile from the same spec the
builder exports; `spec.data.table` names a metric table and the scenarios are the tile's compared runs.

## Implementation status

All 12 panel types (plus `chart` and the `multi-view` wrapper) are built; the two earlier chart engines were removed in the 063 redesign. Sidebar navigation, lazy
tab-scoped data loading, server-side table pagination (≥100k rows),
scenario label/color overrides, deployer-configurable branding/palette/
basemap defaults, and a full shadcn/ui default-theme adoption (Tailwind
v4, WFRC branding suspended pending a future re-branding
feature) are all shipped. Appearance settings (colorblind-safe palette
toggle, primary/secondary/accent overrides, font picker, text-size
slider) are shipped (`061-appearance-controls`).

**Not yet started:** `python/wftdm_dashboard/server.py`/`static/`/
`templates/` (the `serve`/`here`/`init` CLI subcommands) — only
`summarize` is real today.

**Known, deliberately-deferred gaps** (see `project-docs/PIPELINE.md` and
`project-docs/IMPLEMENTATION-HISTORY.md` items 26/28 for full detail):
- Playwright suite health: the old "~8 specs depend on the retired `tests/fixtures/dashboard-config/`" gap is closed
  (`settingsModal`, `scenarioManager`, `scenarioAutoActivation` and the rest now run on real demo content; the Test tab
  specs use `tests/integration/_testTab.ts`'s 20s `expect`). `playwright.config.js` runs 2 workers: on a full run a
  handful of specs that crowd the ~80-panel Test tab or draw several maps can still time out (6 of 529 on the last
  run) and pass when re-run alone. `chartMaps` "Compare switched to one at a time" can also fail right after another
  map spec (hover timing). Re-run a failure with `--workers=1` before treating it as real.
- `coi-serviceworker.js` no longer exists; the deployed app runs without
  cross-origin isolation.
- DuckDB-WASM's parquet extension still requires one real network fetch
  on first use (no true offline mode yet).

For the full numbered feature history (38 items) with complete
bug-by-bug/decision-by-decision detail and verification numbers for every
shipped feature, read `project-docs/IMPLEMENTATION-HISTORY.md`.

---

## Reference implementations — copy patterns, don't re-derive

| Repo | What to copy |
|---|---|
| `ar-puuk/omx-viewer` | DuckDB-WASM init, Arrow handoff, Vite config (its coi-serviceworker and GH Actions parts are NOT used here) |
| `WFRCAnalytics/APP-Commute-Explorer` | MapboxOverlay + FlowmapLayer + MapLibre wiring, hover/pick pattern |
| `ar-puuk/spatial-sql-explorer` | DuckDB spatial extension lazy-load, MapLibre choropleth, basemap switching |
| `ar-puuk/parquet-viewer` | GeoParquet metadata detection, registerFileBuffer, spatial extension fallback, buffer-pool collision fix |
| `gropaul/dash-ui` | Settings-modal row/list visual patterns (Scenarios-tab row layout, Basemap-tab tile grid) |

---

## Do not

- Use Vue, Svelte, or any component framework other than React
- Add new plain `.js` files to `src/` — TypeScript (`.ts`/`.tsx`) is the standard
- Use Mapbox GL — MapLibre only
- Use Webpack — Vite only
- Read OMX/CSV/GeoJSON in the browser — Parquet only
- Put DuckDB-WASM on the main thread
- Use localStorage/sessionStorage
- Create `topsheet.yaml` — the first dashboard-*.yaml is the landing page
- Create `summarize-preprocessor.yaml` — join logic lives in sql_fragments
- Put new deployer settings in `index.json` — they belong in `dashboard-config.yaml` (the `public/dashboard-config/` directory is a different thing)
- Create `services/observedRegistry.ts` — replaced by `services/scenarioDiscovery.ts`
- Recreate the `duckdbLoaderPool.ts` multi-instance pattern — removed, measured slower
- Add a chart library, a per-chart tooltip element, a native `title`/`tip: true` tooltip, or hard-coded colours in a chart kind
- Colour a difference green/red, or use status colours for series
- Re-add per-panel-type `sankeyColor.ts`/`hierarchyColor.ts`/`polarChartColor.ts`
  duplicates — consolidated into `panels/chartColor.ts`
