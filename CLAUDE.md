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
    │   ├── appState.ts         # loaded scenarios registry
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
    │   └── useFilterState.ts   # wraps state/filterState.ts with
    │                           # useSyncExternalStore (constitution v2.2.0)
    │   # layout/, panels/, scenario/scenarioManager.ts, styles/ below: not
    │   # built yet (001-data-state-layer explicitly excludes them) — left as
    │   # originally sketched. React has now landed (002-design-tokens,
    │   # before any of these), so anything below that actually renders JSX
    │   # is .tsx; pure-logic modules with no JSX (scenarioManager.ts,
    │   # manifestReader.ts) stay .ts, same as services/ and state/
    │   # (constitution v2.2.0, Development Workflow)
    ├── layout/
    │   ├── shell.tsx
    │   ├── navBar.tsx
    │   ├── sidebar.tsx
    │   ├── dashboardRenderer.tsx
    │   └── panelCard.tsx
    ├── panels/
    │   ├── registry.tsx
    │   ├── PlotlyPanel.tsx
    │   ├── PlotPanel.tsx
    │   ├── TablePanel.tsx
    │   ├── ValueBoxPanel.tsx
    │   ├── FlowMapPanel.tsx    # MapLibre + MapboxOverlay + FlowmapLayer
    │   ├── ZoneMapPanel.tsx    # MapLibre choropleth + GeoParquet
    │   ├── SankeyPanel.tsx
    │   ├── GraphicWalkerPanel.tsx
    │   └── MarkdownPanel.tsx
    ├── scenario/
    │   ├── scenarioManager.ts  # showDirectoryPicker + view registration
    │   └── manifestReader.ts
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
wftdm-dashboard here    # self-contained: file server + embedded app (no internet)
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
  'plotly':         PlotlyPanel,
  'plot':           PlotPanel,
  'table':          TablePanel,
  'valuebox':       ValueBoxPanel,
  'flowmap':        FlowMapPanel,
  'zonemap':        ZoneMapPanel,
  'sankey':         SankeyPanel,
  'graphic-walker': GraphicWalkerPanel,
  'markdown':       MarkdownPanel,
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

**FlowMapPanel** — copy `FlowLayer.jsx` from Commute Explorer and adapt its
hooks to this app's `useFilterState`/`services/duckdb.ts` — do NOT strip
React out; React is adopted (constitution v2.2.0), unlike when this note
was first written. Lifecycle: create the overlay once, in a mount-only
effect → `overlay.setProps()` on data update → `map.remove()` in that
effect's cleanup, mirroring the Panel pattern's two-effect split above.
Never recreate the MapLibre instance on data change.

**ZoneMapPanel** — load zone GeoParquet once via DuckDB spatial, cache as module variable.
Join metric rows to features in JS → `map.getSource('zones').setData(geojson)` on update.

**Pinned versions (peer deps must match):**
- `@deck.gl/core` + `@deck.gl/mapbox`: ^9.0.0
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

1. `vite.config.ts`, `index.html`, `package.json` + postinstall for coi-serviceworker
2. `services/duckdb.ts` — init, query, registerScenario, registerFileURL (owns DuckDB-WASM's own bundled worker; no separate duckdb.worker.ts)
3. `services/scenarioDiscovery.ts` — register `public/observed/` + `public/scenarios/*` + apply `?s=` URL params
4. `services/yamlLoader.ts` + `services/sqlExpander.ts`
5. `state/appState.ts` + `state/filterState.ts`
6. `layout/shell.tsx`, `navBar.tsx`, `panelCard.tsx`, `dashboardRenderer.tsx`
7. `scenario/scenarioManager.ts` — folder picker + view registration
8. Panels: `ValueBoxPanel` → `TablePanel` → `PlotlyPanel` → `PlotPanel` → `MarkdownPanel` → `SankeyPanel`
9. `FlowMapPanel` + `ZoneMapPanel` (map panels — most complex)
10. `GraphicWalkerPanel` (Explore tab)
11. `styles/wfrc-theme.css`, Python package (`python/`), error/loading states

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
