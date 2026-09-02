# CLAUDE.md — WFRC TDM Calibration Dashboard

ActivitySim calibration/validation dashboard. Static web app + Python post-processor.
Read `docs/ARCHITECTURE.md` and `docs/SPEC.md` before writing any code.

---

## Stack

| Layer | Technology |
|---|---|
| Build | Vite, TypeScript (ES2022 target) |
| Query — browser | DuckDB-WASM in a Web Worker |
| Query — offline | Python DuckDB (`uv run`) |
| Charts — default | Plotly.js |
| Charts — reactive inputs | Observable Plot (`@observablehq/plot`) |
| Explore tab | Graphic Walker (`embedGraphicWalker`) |
| Maps | MapLibre GL (NOT Mapbox) |
| O-D flows | `@flowmap.gl/layers` + `@deck.gl/mapbox` (`MapboxOverlay`) |
| Config parsing | js-yaml (runtime, not build-time) |
| File format | Parquet / GeoParquet only — no CSV/GeoJSON/OMX in browser |
| Geometry | DuckDB spatial extension (`ST_Read`, `ST_AsGeoJSON`) |

**TypeScript throughout; React once a UI feature needs it** (constitution
v2.0.0 — the earlier three-phase, branch-per-phase migration plan is
retired):

The app is TypeScript (`.ts`), not plain JavaScript — no branch to merge
from, no gate to clear first, work lands directly on `main`. `services/
duckdb.ts`, `state/appState.ts`, `state/filterState.ts`, panel config
interfaces (`PlotlyPanelConfig`, `FlowMapPanelConfig`) get real types instead
of JSDoc — catches YAML config errors and DuckDB column mismatches at
write-time.

React **is adopted** — `002-design-tokens` brought it in for the design
token/component foundation (Tailwind CSS + shadcn/ui + Radix +
`lucide-react`, constitution v2.1.0/Principle VI), with a working demo page
(`demo.html`) rendering real components. The panel/layout layer is next to
consume it, following the panel pattern (constitution v2.2.0 — function
components + the `useFilterState` hook + `panels/registry.tsx`). The data
layer (`services/`, `state/`) stays plain TypeScript regardless — no JSX
there, no reason to add it. Commute Explorer remains the working reference
(React + DuckDB-WASM + MapLibre + flowmap.gl) for the map panels
specifically.

---

## Non-negotiables

- DuckDB-WASM runs in a **Web Worker** — never the main thread
- One DuckDB instance shared across all panels via `services/duckdb.ts`
- React only — no Vue/Svelte/other frameworks; panel registry is a
  type-to-component map (`panels/registry.tsx`), not factory functions or
  classes
- No eval() — SQL fragments use string replacement only
- YAML parsed at **runtime** — dashboard content is not known at build time
- Browser only reads Parquet — all format conversion is offline
- MapLibre not Mapbox — `@deck.gl/mapbox` `MapboxOverlay` works with MapLibre

---

## Config file set (three files, no more)

```
summarize.yaml        post-processor: sources, mappings, bins, sql_fragments, metrics → Parquet
dashboard-*.yaml      tab layout and panels — first file is the landing page
manifest.yaml         per-scenario metadata
```

- No `topsheet.yaml` — the first `dashboard-*.yaml` serves as the landing page
- No `dashboard-config.yaml` — app settings live in code and CLI args (not to be confused with the `public/dashboard-config/` *directory* below, which holds published copies of the existing `dashboard-*.yaml` tab-layout files, not a new config file type)
- No `summarize-preprocessor.yaml` — join logic lives in `sql_fragments` inside `summarize.yaml`
- Dashboard YAML configs (`dashboard-*.yaml`, `summarize.yaml`) are authored alongside the model scripts in the TDM repo (not in the dashboard repo) — same authored-vs-published split as `manifest.yaml`. A published copy of the `dashboard-*.yaml` files (WFRC's default templates ship seven) is expected in `public/dashboard-config/` in the dashboard repo, discovered at runtime via `public/dashboard-config/index.json` — the same discovery pattern as `public/scenarios/index.json` — and fetched by the browser at startup; `summarize.yaml` is post-processor-only and is never published or read by the browser.
- `public/dashboard-config/index.json` and `public/scenarios/index.json` are discovery metadata (a list of filenames/names to fetch), not one of the three config file types above — same category as each other, not a new type (constitution Principle VII still holds: exactly three *config* file types, no more)
- Parquet outputs live in `{scenario-dir}/summary/` — written by the post-processor
- Published scenarios are manually copied into `public/scenarios/` in the dashboard repo

---

## Navigation model

The set of tabs is **discovered at runtime**, not a fixed app-level constant:
`main.ts` fetches `public/dashboard-config/index.json` — an array of
`dashboard-*.yaml` filenames, in display order — the same discovery pattern
`public/scenarios/index.json` already uses for scenarios. The first filename
in that list is always the landing page, rendered on scenario load. Whatever
WFRC's default templates (`python/wftdm_dashboard/templates/`, see
`docs/ARCHITECTURE.md`) happen to ship is what a freshly-`init`'d project
gets — today that's seven tabs, but the app itself imposes no count or name
on the set; adding, removing, or renaming a tab is purely an `index.json` +
file edit, no code change.

The default seven-tab set WFRC ships:
```
Scenario loaded → dashboard-1-summary.yaml (landing page, always active on load)
  ├── Tab: Summary ★    dashboard-1-summary.yaml   ← value boxes + overview charts
  ├── Tab: Person/HH    dashboard-2-person.yaml
  ├── Tab: Tour         dashboard-3-tour.yaml
  ├── Tab: Mode Choice  dashboard-4-mode.yaml
  ├── Tab: Trip         dashboard-5-trip.yaml
  ├── Tab: Network      dashboard-6-network.yaml
  └── Tab: Explore      dashboard-7-explore.yaml   (Graphic Walker)
```

The Summary tab renders on scenario load. Its value boxes read from `summary_kpis.parquet`
(smallest file, loads first). Charts below load progressively as other Parquet files register.

---

## File structure

```
APP-wftdm-dashboard/
├── CLAUDE.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SPEC.md
│   ├── grammar.md
│   └── CALIBRATION-SUMMARIES.md
├── index.html                  # coi-serviceworker FIRST, then main.ts
├── package.json
├── vite.config.ts
├── public/
│   ├── coi-serviceworker.js
│   ├── observed/               # observed data — deselectable, always pre-loaded
│   │   ├── manifest.yaml       # name: "Observed Data", pinned: true
│   │   └── summary/
│   │       ├── summary_kpis.parquet
│   │       ├── observed_mode_share.parquet
│   │       ├── observed_counts.parquet
│   │       └── observed_tlfd.parquet
│   ├── scenarios/              # published model runs for sharing/web access
│   │   ├── index.json          # ["2027-rtp-baseyear", "2027-rtp-horizonyear"]
│   │   ├── 2027-rtp-baseyear/
│   │   │   ├── manifest.yaml
│   │   │   └── summary/
│   │   │       ├── summary_kpis.parquet
│   │   │       └── ...
│   │   └── 2027-rtp-horizonyear/
│   │       ├── manifest.yaml
│   │       └── summary/
│   └── dashboard-config/       # published tab layout, discovered + fetched at startup
│       ├── index.json          # ["dashboard-1-summary.yaml", "dashboard-2-person.yaml", ...]
│       ├── dashboard-1-summary.yaml
│       └── ...                 # whatever else index.json lists (seven, by default)
├── pyproject.toml
├── Makefile                    # npm run build → copy dist/ → uv build
├── python/
│   └── wftdm_dashboard/        # Python package
│       ├── __init__.py
│       ├── cli.py              # wftdm-dashboard serve / here / init
│       ├── server.py           # Flask/uvicorn file server with CORS headers
│       ├── static/             # built dist/ embedded at package build time
│       └── templates/          # default configs copied by `init` (never overwrites existing files)
│           ├── summarize.yaml          # pre-filled with standard WFRC segmentations
│           ├── dashboard-1-summary.yaml
│           └── ...                     # dashboard-2-person.yaml through dashboard-7-explore.yaml
└── src/                        # Dashboard application source (JS app only) — TypeScript (constitution v2.0.0)
    ├── main.ts                 # boot sequence
    ├── state/
    │   ├── appState.ts         # loaded scenarios registry — gained a
    │   │                       # subscribe()/notify() pub/sub (009,
    │   │                       # mirroring filterState.ts's own shape):
    │   │                       # FR-008 needed panels to react to a
    │   │                       # newly-activated local scenario without
    │   │                       # losing their own local UI state, which
    │   │                       # a naive remount-based fix would have
    │   │                       # broken (research.md §1)
    │   └── filterState.ts      # global filters + pub/sub
    ├── services/
    │   ├── duckdb.ts           # DuckDB-WASM API — owns the sole AsyncDuckDB
    │   │                       # instance + DuckDB-WASM's own bundled worker
    │   │                       # script (self-hosted via Vite `?url` imports,
    │   │                       # not a CDN). No separate duckdb.worker.ts —
    │   │                       # the library provides its own worker; there's
    │   │                       # nothing for the app to author into one
    │   │                       # (constitution Principle II, amended 1.2.0)
    │   ├── yamlLoader.ts       # fetch + parse dashboard-*.yaml files
    │   ├── sqlExpander.ts       # expand $mappings/$bins/$sql/$filters/$scenario
    │   └── scenarioDiscovery.ts # register observed/ + public/scenarios/ at startup
    ├── hooks/
    │   ├── useFilterState.ts   # wraps state/filterState.ts with
    │   │                       # useSyncExternalStore (constitution v2.2.0)
    │   ├── useActiveScenarios.ts # done (009-scenario-manager) — same
    │   │                       # useSyncExternalStore shape, wrapping
    │   │                       # appState.ts's new subscribe() instead;
    │   │                       # every data-bound panel type consumes
    │   │                       # this now, not appState.getActive()
    │   │                       # directly (research.md §1)
    │   └── useColorScheme.ts   # done (011-basemap-style-system) — reads
    │                           # (never sets) the Tailwind `.dark` class
    │                           # on document.documentElement via a
    │                           # MutationObserver + useSyncExternalStore,
    │                           # same shape as the two hooks above. No
    │                           # real theme-toggle UI exists in the app
    │                           # yet — only src/demo/DesignTokenDemo.tsx
    │                           # (an out-of-band demo page) sets the
    │                           # class today; this hook is the read side
    │                           # of a feature (a real toggle) that hasn't
    │                           # been built, same situation
    │                           # registerScenario() was in from 001 until
    │                           # 009 built its own caller.
    │   # layout/ and panels/ below are now real (003-dashboard-shell-
    │   # navigation built the shell/nav/panel-card layer and the first two
    │   # panel types; 004-panel-expand-dialog added the generic expand
    │   # mechanism on top; 005-table-panel, 006-markdown-panel,
    │   # 007-observable-plot-panel, and 008-sankey-panel each added one
    │   # more panel type — table/markdown/observable-plot/sankey are all
    │   # real now, completing the originally-listed six-panel-type set;
    │   # 010-flowmap-panel added the seventh and final one (this
    │   # codebase's first real map — MapLibre + deck.gl + flowmap.gl).
    │   # zonemap/graphic-walker remain the only panel types not yet
    │   # built. scenario/scenarioManager.ts + manifestReader.ts are
    │   # also now real (009-scenario-manager, closing services/duckdb.ts's
    │   # registerScenario() zero-callers gap open since 001) — styles/ is
    │   # the only entry in this tree still not built (out of scope for
    │   # every feature to date). Anything that renders JSX is .tsx;
    │   # pure-logic modules with no JSX (scenarioManager.ts,
    │   # manifestReader.ts, panelQuery.ts, plotlyTraces.ts, tableLogic.ts,
    │   # formatValue.ts, observablePlotEncoding.ts, flowmapData.ts) stay
    │   # .ts, same as
    │   # services/ and state/ (constitution v2.2.0, Development Workflow)
    ├── layout/
    │   ├── shell.tsx             # top-level app shell: NavBar + active tab
    │   ├── navBar.tsx            # shadcn Tabs-based tab navigation
    │   ├── dashboardRenderer.tsx # renders one tab's layout as rows of PanelCards;
    │   │                         # also (011-basemap-style-system) the one place
    │   │                         # that injects each map-rendering panel's
    │   │                         # tab-level default_basemap onto its own config
    │   │                         # as _tabDefaultBasemap — memoized on `tab` alone
    │   │                         # (a real regression, found empirically: an
    │   │                         # earlier version rebuilt this on every render,
    │   │                         # breaking FlowMapPanel's own config-referential-
    │   │                         # stability assumption)
    │   ├── panelCard.tsx         # shadcn Card wrapper: title, expand trigger
    │   │                         # (usePanelExpandHost), hosts one registry-
    │   │                         # resolved panel + its error boundary
    │   ├── panelExpandHost.tsx   # 004: the generic expand-to-dialog hook —
    │   │                         # a persistent portal host node, imperatively
    │   │                         # relocated between an inline card anchor
    │   │                         # and a Dialog anchor, not a createPortal
    │   │                         # target swap (found not to preserve
    │   │                         # mounted state — research.md §1b)
    │   ├── types.ts              # typed DashboardTabConfig/PanelConfig,
    │   │                         # parsed from yamlLoader's DashboardConfig.raw
    │   ├── scenarioLoader.tsx    # done (009-scenario-manager) — the
    │   │                         # "Load Local Scenario" trigger +
    │   │                         # loaded-scenario list, mounted in
    │   │                         # shell.tsx's header alongside NavBar;
    │   │                         # hidden entirely in LOCAL deployment
    │   │                         # mode (hostname === 'localhost')
    │   └── sidebar.tsx           # not built yet — no feature has needed it
    ├── panels/
    │   ├── registry.tsx          # type -> component map: valuebox, plotly
    │   ├── panelQuery.ts         # PanelConfig + filters -> SQL template
    │   ├── ValueBoxPanel.tsx
    │   ├── PlotlyPanel.tsx
    │   ├── plotlyTraces.ts       # pure trace-resolution logic (split out of
    │   │                         # PlotlyPanel.tsx — plotly.js-dist-min
    │   │                         # references `self` at module load, which
    │   │                         # breaks Vitest's Node environment)
    │   ├── PanelEmptyState.tsx   # shared empty-result state
    │   ├── PanelErrorState.tsx   # shared error state
    │   ├── TablePanel.tsx        # done (005-table-panel)
    │   ├── tableLogic.ts         # pure sort/paginate/search/color-scale
    │   │                         # logic, split out of TablePanel.tsx same
    │   │                         # reason as plotlyTraces.ts (005)
    │   ├── formatValue.ts        # pure value-formatting helper (005)
    │   ├── MarkdownPanel.tsx     # done (006-markdown-panel) — marked +
    │   │                         # DOMPurify, sanitized rendering
    │   ├── ObservablePlotPanel.tsx # done (007-observable-plot-panel)
    │   ├── observablePlotEncoding.ts # pure, DOM-free mark/options
    │   │                         # resolution, split out of
    │   │                         # ObservablePlotPanel.tsx same reason as
    │   │                         # plotlyTraces.ts (007)
    │   ├── SankeyPanel.tsx       # done (008-sankey-panel) — the sixth
    │   │                         # panel type (flowmap below is the
    │   │                         # seventh and final one, not this)
    │   ├── sankeyGraph.ts        # pure, DOM-free rows-to-graph transform +
    │   │                         # d3-sankey layout wrapper, split out of
    │   │                         # SankeyPanel.tsx same reason as
    │   │                         # plotlyTraces.ts (008)
    │   ├── sankeyColor.ts        # pure color_scheme name resolution (008)
    │   ├── FlowMapPanel.tsx      # done (010-flowmap-panel) — the seventh
    │   │                         # and final originally-listed panel
    │   │                         # type, and this codebase's first real
    │   │                         # map (MapLibre + MapboxOverlay +
    │   │                         # FlowmapLayer, imperative mount-
    │   │                         # lifetime instance — genuinely
    │   │                         # different rendering model from every
    │   │                         # prior chart panel type)
    │   ├── flowmapData.ts        # pure, DOM-free rows-to-locations/flows
    │   │                         # transform, split out of FlowMapPanel.tsx
    │   │                         # same reason as sankeyGraph.ts (010).
    │   │                         # FlowMapPanel.tsx itself gained a real
    │   │                         # basemap (011-basemap-style-system) —
    │   │                         # a second, independent setStyle()-
    │   │                         # application effect (never folded into
    │   │                         # the mount or data-update effects),
    │   │                         # keyed on panels/basemap/'s own
    │   │                         # basemapKey(), plus a scoped map.on
    │   │                         # ('error', ...) listener that only
    │   │                         # reacts before that call's own
    │   │                         # 'style.load' — a real fix, found
    │   │                         # empirically: a first, lifetime-scoped
    │   │                         # version wrongly reverted an already-
    │   │                         # successfully-loaded style on ordinary,
    │   │                         # expected post-load tile noise
    │   ├── basemap/              # done (011-basemap-style-system) — shared
    │   │   │                     # basemap registry/resolution, consumed by
    │   │   │                     # FlowMapPanel.tsx now, ZoneMapPanel.tsx
    │   │   │                     # once built (designed generically for
    │   │   │                     # exactly that, not flowmap-specific)
    │   │   ├── types.ts          # BasemapSelection/BasemapComposition/
    │   │   │                     # EffectiveBasemap
    │   │   ├── registry.ts       # built-in CARTO/OpenFreeMap style URLs +
    │   │   │                     # resolveRasterProvider() — the real
    │   │   │                     # dotted provider.variant lookup against
    │   │   │                     # public/basemap/leaflet-providers.json
    │   │   │                     # (leaflet-providers' own real catalog
    │   │   │                     # shape, most providers nested under a
    │   │   │                     # parent with a variants map — NOT flat
    │   │   │                     # per-variant keys, a real correction
    │   │   │                     # found only once real data existed)
    │   │   ├── resolveEffectiveBasemap.ts # pure panel > tab > app-default
    │   │   │                     # precedence resolver + basemapKey()
    │   │   │                     # (the content-stable identity
    │   │   │                     # FlowMapPanel.tsx's own basemap effect
    │   │   │                     # keys its dependency array on, so a
    │   │   │                     # pinned basemap's resolved value never
    │   │   │                     # changes across a theme flip)
    │   │   └── loadBasemapStyle.ts # BLANK_STYLE + preset/raster resolution
    │   │                         # + composeStyles() (the generic
    │   │                         # multi-source composition mechanism,
    │   │                         # FR-006/FR-008/FR-012 — proven during
    │   │                         # development against UGRC's real
    │   │                         # 2-layer LiteBase+LiteLabels service,
    │   │                         # never shipped as a named preset here).
    │   │                         # Inlines each vector source's own
    │   │                         # TileJSON `tiles` array at composition
    │   │                         # time rather than leaving a `url`
    │   │                         # reference — MapLibre cannot resolve a
    │   │                         # fetched TileJSON's own relative
    │   │                         # `tiles` template for an in-memory,
    │   │                         # non-setStyle(url)-loaded style (found
    │   │                         # empirically against the real UGRC
    │   │                         # endpoint, not assumed)
    │   ├── ZoneMapPanel.tsx      # not built yet — MapLibre choropleth +
    │   │                         # GeoParquet; will consume panels/basemap/
    │   │                         # unchanged once built (spec.md's own
    │   │                         # requirement for 011)
    │   └── GraphicWalkerPanel.tsx # not built yet
    ├── components/
    │   └── ui/                   # shadcn-pattern primitives (002-design-
    │                              # tokens onward): button.tsx, card.tsx,
    │                              # tabs.tsx, tooltip.tsx, dialog.tsx (004)
    ├── scenario/                # done (009-scenario-manager) — closes
    │   │                        # services/duckdb.ts's registerScenario()
    │   │                        # zero-callers gap, open since 001
    │   ├── scenarioManager.ts  # showDirectoryPicker flow, collision
    │   │                       # handling (FR-006), isLocalDeployment()/
    │   │                       # supportsLocalFolderLoading()
    │   ├── manifestReader.ts   # reads manifest.yaml from a
    │   │                       # FileSystemDirectoryHandle directly (not
    │   │                       # a URL fetch) — yamlLoader.ts's
    │   │                       # loadConfig/loadManifest are fetch-only
    │   └── fileSystemAccess.d.ts # ambient Window.showDirectoryPicker()
    │                           # declaration — TypeScript's bundled DOM
    │                           # lib declares FileSystemDirectoryHandle
    │                           # itself (for OPFS) but not this entry
    │                           # point (confirmed against the installed
    │                           # TS version directly, not assumed)
    └── styles/
        ├── global.css
        ├── layout.css
        └── wfrc-theme.css
```

---

## Python package

```bash
uv tool install git+https://github.com/WFRCAnalytics/APP-wftdm-dashboard

wftdm-dashboard serve   # file server only — use with hosted web app
wftdm-dashboard here    # self-contained: file server + embedded app (intended no-internet;
                        # one known, confirmed exception — see ARCHITECTURE.md's own caveat
                        # on DuckDB-WASM's parquet-extension fetch)
wftdm-dashboard init --scenario-dir <path>   # scaffold default summarize.yaml + dashboard-*.yaml if missing; never overwrites
```

```toml
# Add to model repo
[tool.uv.sources]
wftdm-dashboard = { git = "https://github.com/WFRCAnalytics/APP-wftdm-dashboard" }
```

**Deployment detection:**
```js
const LOCAL = window.location.hostname === 'localhost'
// LOCAL → registerFileURL via http://localhost:8050/
// WEB   → registerFileHandle via showDirectoryPicker()
```

---

## Boot sequence (`main.ts`)

```js
await initDuckDB()                          // Web Worker init
await discoverScenarios()                   // register observed/ + public/scenarios/*
applyURLParams()                            // pre-select ?s= scenarios from URL
const dashboards = await loadDashboards()   // fetch public/dashboard-config/index.json, then each listed dashboard-*.yaml
renderShell(dashboards)                     // nav tabs, sidebar, scenario manager
renderDashboard(dashboards[0])              // first tab (Summary) as landing page
```

---

## DuckDB service API (`services/duckdb.ts`)

```js
initDuckDB()
registerScenario(name, dirHandle)   // summary/*.parquet → name__* views
unregisterScenario(name)
registerFileURL(viewName, url)      // for wftdm-dashboard serve/here mode
query(sql) → Array<Object>
queryArrow(sql) → ArrowTable
distinctValues(view, column) → Array
listViews() → Array<string>
```

Scenario namespacing: `registerScenario('abm_2026', handle)` creates views
`abm_2026__mode_share`, `abm_2026__tlfd`, etc. from `summary/*.parquet` files.

---

## Panel pattern

A React function component receiving a single `config` prop — not a
factory function returning `{ element, destroy }` (constitution v2.2.0;
that shape predates React's adoption in `002-design-tokens`).

```tsx
const ALL_FILTERS: ['*'] = ['*'] // module-level constant — stable identity,
                                  // never an inline `?? ['*']` literal (that
                                  // allocates a new array every render)

export function Panel({ config }: PanelProps) {
  const filters = useFilterState(config.filter_ids ?? ALL_FILTERS)
  const containerRef = useRef<HTMLDivElement>(null)

  // Data fetch + draw. Re-runs on config/filters change. Plotly panels call
  // Plotly.react() here — never newPlot(), never purge() — react() diffs
  // against the existing plot itself.
  useEffect(() => {
    let cancelled = false
    query(buildSQL(config, filters)).then((rows) => {
      if (!cancelled) /* draw rows into containerRef.current */
    })
    return () => { cancelled = true }
  }, [config, filters])

  // Unmount-only teardown — deliberately a second effect with an empty
  // dependency array, not folded into the effect above.
  useEffect(() => {
    return () => { /* e.g. Plotly.purge(containerRef.current) */ }
  }, [])

  return <div ref={containerRef} />
}
```

`query`/`queryArrow` come from a direct `import { query } from
'services/duckdb.ts'` — not an injected `conn`, matching how `main.ts` and
`scenarioDiscovery.ts` already consume that singleton.

`config.filter_ids` needs no defensive `useMemo`: `yamlLoader.ts` parses
each `dashboard-*.yaml` exactly once at boot and returns the parsed object
graph verbatim, so the array reference is stable across re-renders whenever
the field is present. `ALL_FILTERS` exists only to keep the *absent*-field
fallback equally stable.

---

## `useFilterState` hook (`hooks/useFilterState.ts`)

Wraps `state/filterState.ts`'s existing pub/sub store with
`useSyncExternalStore` — the React 18 hook built for exactly this: a
tearing-free subscription to an external mutable store, not React state
itself.

```ts
export function useFilterState(ids: FilterId[] | ['*']): Record<FilterId, FilterValue> {
  const cache = useRef<Record<FilterId, FilterValue>>({})

  const getSnapshot = useCallback(() => {
    const next = ids[0] === '*' ? getAll() : Object.fromEntries(ids.map((id) => [id, get(id)]))
    const prev = cache.current
    const changed =
      Object.keys(next).length !== Object.keys(prev).length ||
      Object.entries(next).some(([k, v]) => prev[k] !== v)
    if (changed) cache.current = next
    return cache.current
  }, [ids])

  return useSyncExternalStore((onChange) => subscribe(ids, onChange), getSnapshot)
}
```

The memoized snapshot is deliberate, not incidental: `filterState.getAll()`
builds a new object every call, and `useSyncExternalStore` compares
snapshots by `Object.is` — an unmemoized snapshot re-renders on every call
(or loops). The cache is only replaced when a subscribed id's value
actually differs.

---

## Panel registry

```tsx
export const registry: Record<string, ComponentType<PanelProps>> = {
  'plotly':           PlotlyPanel,
  'observable-plot':  ObservablePlotPanel,
  'table':            TablePanel,
  'valuebox':         ValueBoxPanel,
  'flowmap':          FlowMapPanel,
  'zonemap':          ZoneMapPanel,
  'sankey':           SankeyPanel,
  'graphic-walker':   GraphicWalkerPanel,
  'markdown':         MarkdownPanel,
}
```

`dashboardRenderer.tsx` looks up `registry[config.type]` and renders
`<PanelComponent config={config} />` directly — no wrapper call, no manual
`.element` DOM append, no manual `.destroy()` on teardown.

---

## SQL expander (`services/sqlExpander.ts`)

- `$mappings.major_trip_mode` → WHEN clauses inside a CASE block
- `$bins.income_category` → CASE expression from manual_breaks / quantiles
- `$sql.trips_merged` → inline FROM clause joining trips + persons + households + zones
- `$filters.purpose` → current filter value (omit WHERE if value is `'all'`)
- `$scenario` → UNION ALL across all loaded scenario views

---

## Filter state (`state/filterState.ts`)

```js
get(id), set(id, value)
subscribe(ids, fn) → unsubFn   // ids: ['purpose'] or ['*'] for all
getAll() → Object
```

---

## Map panels

**FlowMapPanel** — done (`010-flowmap-panel`). Built following this
note's own original plan: the `useFilterState`/`services/duckdb.ts`
query/fetch chain reused directly, React fully in place (no stripping).
Lifecycle as planned: `maplibregl.Map` + `MapboxOverlay` created once, in
a mount-only effect → `overlay.setProps()` on data update → `map.remove()`
in that effect's cleanup, mirroring the Panel pattern's two-effect split
above — never recreated on data change. One real addition this note
didn't anticipate: a `mapReady` React-state gate on the data-update
effect (a bare `overlayRef.current` ref check has no mechanism to
re-trigger a React effect once it becomes non-null late — found during
that feature's own contract review, `specs/010-flowmap-panel/
research.md` §11) — and a base map style that's a minimal, self-contained
`background`-only `StyleSpecification` (no external tile/CDN dependency,
`docs/GRAMMAR.md`'s `type: flowmap` grammar has no `style:`/`basemap:`
key yet — real basemap tiles remain unresolved, deliberately out of that
feature's scope).

**ZoneMapPanel** — not yet built. Load zone GeoParquet once via DuckDB
spatial, cache as module variable. Join metric rows to features in JS →
`map.getSource('zones').setData(geojson)` on update.

**Pinned versions (peer deps must match):**
- `@deck.gl/core` + `@deck.gl/layers` + `@deck.gl/mapbox`: ^9.0.0
- `@flowmap.gl/layers`: ^9.3.0
- `maplibre-gl`: ^4.7.1

---

## Graphic Walker panel

```tsx
import { embedGraphicWalker } from '@kanaries/graphic-walker'

export function GraphicWalkerPanel({ config }: PanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    query(
      `SELECT * FROM ${config.scenario}__${config.dataset} LIMIT ${config.limit ?? 100000}`
    ).then((rows) => {
      if (!cancelled && containerRef.current) {
        containerRef.current.innerHTML = ''
        embedGraphicWalker(containerRef.current, { data: rows, fields: config.fields ?? [] })
      }
    })
    return () => { cancelled = true }
  }, [config])

  return <div ref={containerRef} style={{ height: config.height ?? 700 }} />
}
```

Graphic Walker is a snapshot — does not share DuckDB connection or respond to
global filters. Intentional — Explore tab is an open-ended sandbox.

---

## vite.config.ts

```js
export default defineConfig({
  base: '/APP-wftdm-dashboard/',        // GitHub Pages
  // base: '/wftdm-dashboard/',         // wfrc.utah.gov subdirectory
  worker: { format: 'es' },            // REQUIRED for DuckDB-WASM
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },  // REQUIRED
  build: {
    target: 'esnext',
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('@duckdb/duckdb-wasm')) return 'duckdb'
      if (id.includes('maplibre-gl'))         return 'maplibre'
      if (id.includes('plotly'))              return 'plotly'
      if (id.includes('graphic-walker'))      return 'graphic-walker'
    }}}
  },
  server: { headers: {                 // dev only
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  }}
})
```

---

## index.html

```html
<script src="/APP-wftdm-dashboard/coi-serviceworker.js"></script>  <!-- MUST BE FIRST -->
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

---

## package.json dependencies

```json
{
  "@duckdb/duckdb-wasm": "latest",
  "@deck.gl/core": "^9.0.0",
  "@deck.gl/mapbox": "^9.0.0",
  "@flowmap.gl/layers": "^9.3.0",
  "@kanaries/graphic-walker": "latest",
  "@observablehq/plot": "latest",
  "apache-arrow": "^18.0.0",
  "js-yaml": "latest",
  "maplibre-gl": "^4.7.1",
  "plotly.js-dist-min": "latest"
}
```

---

## Implementation order

Status as of `010-flowmap-panel` (re-audited against real
files/git history — `git log --oneline`, `src/scenario/`, `src/panels/`
and `src/panels/registry.tsx` on disk, `package.json` — not assumed from
the prior list; see also the `004-panel-expand-dialog` session for the
first cross-reference this list was built from). ✅ done,
🟡 partial/started, ❌ not started, ⏸️ explicitly deferred.

1. ✅ `vite.config.ts`, `index.html`, `package.json` + postinstall for
   coi-serviceworker — done (`001-data-state-layer`)
2. ✅ `services/duckdb.ts` — init, query, registerScenario, registerFileURL
   (owns DuckDB-WASM's own bundled worker; no separate duckdb.worker.ts)
   — done (`001-data-state-layer`)
3. ✅ `services/scenarioDiscovery.ts` — register `public/observed/` +
   `public/scenarios/*` + apply `?s=` URL params — done
   (`001-data-state-layer`)
4. ✅ `services/yamlLoader.ts` + `services/sqlExpander.ts` — done
   (`001-data-state-layer`)
5. ✅ `state/appState.ts` + `state/filterState.ts` — done
   (`001-data-state-layer`)
6. ✅ `layout/shell.tsx`, `navBar.tsx`, `panelCard.tsx`,
   `dashboardRenderer.tsx` — done (`003-dashboard-shell-navigation`);
   `panelCard.tsx` later extended, not rebuilt, by `004` (expand trigger)
7. ✅ `scenario/scenarioManager.ts` + `manifestReader.ts` — folder picker
   + view registration — done (`009-scenario-manager`), closing a gap
   carried forward undecided since `001`: `services/duckdb.ts`'s
   `registerScenario()` (item 2) had existed since `001` as a receiving
   API with **zero callers** until this feature built the picker UI that
   calls it (`layout/scenarioLoader.tsx`, mounted in `shell.tsx`'s
   header). Hidden entirely in `LOCAL` deployment mode
   (`hostname === 'localhost'`) — that mode has its own file-serving path
   via `scenarioDiscovery.ts` already (item 3), which remains unchanged
   and continues to handle `public/observed/`/`public/scenarios/*`
   auto-registration. The one real cross-cutting piece this feature
   needed beyond the picker itself: `appState.ts` gained a `subscribe()`
   mechanism (item 5's file, mirroring `filterState.ts`'s own shape) so a
   newly-activated local scenario refreshes already-rendered panels'
   data without discarding any panel's own local UI state — chosen over
   a cheaper remount specifically because remount would have regressed
   `004`'s and `007`'s own state-preservation guarantees (spec.md
   FR-008, research.md §1). Every data-bound panel type (item 8) now
   consumes the active-scenario set via the new `hooks/
   useActiveScenarios.ts` hook instead of reading `appState.getActive()`
   directly.
8. Panels — per-type status, list kept at its original six, not shrunk:
   - ✅ `ValueBoxPanel` — done (`003-dashboard-shell-navigation`)
   - ✅ `PlotlyPanel` — done (`003-dashboard-shell-navigation`)
   - ✅ `TablePanel` — done (`005-table-panel`); split out
     `panels/tableLogic.ts` (sort/paginate/search/color-scale, pure) and
     `panels/formatValue.ts`, same reason `plotlyTraces.ts` was split out
     of `PlotlyPanel.tsx`
   - ✅ `MarkdownPanel` — done (`006-markdown-panel`); `marked` +
     `dompurify` added to `package.json`, XSS-sanitized rendering with an
     `afterSanitizeAttributes` hook forcing `target="_blank"`/
     `rel="noopener noreferrer"` on every link
   - ✅ `ObservablePlotPanel` — done (`007-observable-plot-panel`);
     `@observablehq/plot` added to `package.json`; split out
     `panels/observablePlotEncoding.ts` (pure, DOM-free mark/options
     resolution), same reason as `plotlyTraces.ts`
   - ✅ `SankeyPanel` — done (`008-sankey-panel`); `d3-sankey` +
     `d3-scale-chromatic` added to `package.json` (plus `@types/d3-sankey`/
     `@types/d3-scale-chromatic` devDependencies — neither ships its own
     types); split out `panels/sankeyGraph.ts` (pure, DOM-free
     rows-to-graph transform + `d3-sankey` layout wrapper — a genuinely
     new data-transform problem, not just a split-for-Vitest-testability
     reason like `plotlyTraces.ts`) and `panels/sankeyColor.ts`
     (`color_scheme` name resolution). **This completes the
     originally-listed six-panel-type set** — no panel type in this list
     remains not-started
9. `FlowMapPanel` + `ZoneMapPanel` (map panels — most complex):
   - ✅ `FlowMapPanel` — done (`010-flowmap-panel`); `maplibre-gl` +
     `@deck.gl/core`/`@deck.gl/layers`/`@deck.gl/mapbox` +
     `@flowmap.gl/layers` added to `package.json` (no new
     devDependencies — every package ships its own types, unlike
     `d3-sankey`); split out `panels/flowmapData.ts` (pure, DOM-free
     rows-to-locations/flows transform, same reason `sankeyGraph.ts` was
     split out of `SankeyPanel.tsx`). This codebase's first real map —
     genuinely different rendering model from every prior panel type: the
     `maplibregl.Map`/`MapboxOverlay` instances are imperative,
     mount-lifetime objects (created once, `overlay.setProps()` on data
     change, `map.remove()` on unmount — `docs/SPEC.md`'s own documented
     wiring), not rebuilt per-render the way every chart panel type
     before it works. Also required a `vite.config.ts` `manualChunks`
     addition (a `maps` chunk) — the first panel-type feature since
     `003`'s own Plotly chunk to need a build-config change. **This
     completes the originally-listed seven-panel-type set** — `sankey`
     was mistakenly described as "sixth and final" in `008`'s own
     completion note; flowmap is the actual final one.
   - ❌ `ZoneMapPanel` — not started; needs GeoParquet/DuckDB-spatial
     support `010-flowmap-panel` deliberately did not touch (its own
     `docs/GRAMMAR.md` grammar correction replaced a live spatial-join
     design with plain lat/lon field-mapping columns specifically to
     avoid needing this — see that file's own inline correction note)
10. ❌ `GraphicWalkerPanel` (Explore tab) — not started;
    `@kanaries/graphic-walker` isn't in `package.json` yet either
11. ✅ `src/styles/tokens.css` (Tailwind CSS variables) — done
    (`002-design-tokens`). This **supersedes** the `styles/wfrc-theme.css`
    filename/approach this line originally named — that plan was replaced
    by `002`'s actual Tailwind + shadcn/ui token approach, not merely
    not-yet-built under the old name
12. 🟡 Python package (`python/`) — started but essentially empty:
    `python/wftdm_dashboard/` currently holds only `__init__.py` — no
    `cli.py`, `server.py`, `static/`, or `templates/` yet
13. ✅ Panel error/empty/loading states — done
    (`003-dashboard-shell-navigation`). `PanelErrorState.tsx`/
    `PanelEmptyState.tsx` are shared components; loading states are
    **deliberately** inline per panel (`animate-pulse` skeletons directly
    in `ValueBoxPanel.tsx`/`PlotlyPanel.tsx`) rather than a third shared
    component — `003`'s own research.md documents this as a considered
    choice (no reusable loading pattern existed to port, unlike
    error/empty), not an inconsistency to fix later
14. ✅ Generic panel expand-to-dialog mechanism
    (`layout/panelExpandHost.tsx`, `components/ui/dialog.tsx`) — done
    (`004-panel-expand-dialog`). Not part of this list when originally
    written — a cross-cutting capability at the `panelCard.tsx` level
    (every registry panel type inherits it automatically, current and
    future, no per-type wiring), added here so the list has a record of
    it at all

---

## Reference implementations — copy patterns, don't re-derive

| Repo | What to copy |
|---|---|
| `ar-puuk/omx-viewer` | DuckDB-WASM init, Arrow handoff, Vite config, coi-serviceworker, GH Actions |
| `WFRCAnalytics/APP-Commute-Explorer` | MapboxOverlay + FlowmapLayer + MapLibre wiring, hover/pick pattern |
| `ar-puuk/spatial-sql-explorer` | DuckDB spatial extension lazy-load, MapLibre choropleth, basemap switching |
| `ar-puuk/parquet-viewer` | GeoParquet metadata detection, registerFileBuffer, spatial extension fallback, buffer-pool collision fix |

---

## Do not

- Use Vue, Svelte, or any component framework other than React — React is
  the only framework this project may ever adopt, and it is adopted:
  `002-design-tokens` brought it in for the component foundation; panels
  are the next consumer (constitution v2.2.0)
- Add new plain `.js` files to `src/` — TypeScript (`.ts`) is the standard
- Use Mapbox GL — MapLibre only
- Use Webpack — Vite only
- Read OMX/CSV/GeoJSON in the browser — Parquet only
- Put DuckDB-WASM on the main thread
- Use localStorage/sessionStorage
- Create `topsheet.yaml` — the first dashboard-*.yaml is the landing page
- Create `summarize-preprocessor.yaml` — join logic lives in sql_fragments
- Create `dashboard-config.yaml` — does not exist (the `public/dashboard-config/` directory is unrelated — see Config file set above)
- Create `services/observedRegistry.ts` — replaced by `services/scenarioDiscovery.ts`
