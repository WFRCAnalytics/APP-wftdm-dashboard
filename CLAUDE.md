# CLAUDE.md — WFRC TDM Calibration Dashboard

ActivitySim calibration/validation dashboard. Static web app + Python post-processor.
Read `docs/ARCHITECTURE.md` and `docs/SPEC.md` before writing any code.

---

## Stack

| Layer | Technology |
|---|---|
| Build | Vite, plain JavaScript (ES2022), no framework |
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

**Three-phase migration plan — each phase on its own branch, merged when confirmed working:**

**Phase 1 — Vanilla JS (`main`):**
Build and verify the full working dashboard in plain JavaScript. No framework, no TypeScript. Complete and working before moving to Phase 2.

**Phase 2 — TypeScript (`feat/typescript`):**
Add types incrementally on top of working vanilla JS. Rename `.js` → `.ts` file by file. Vite supports TypeScript natively — no config change needed. Highest value files first: `services/duckdb.ts` (query result types), `state/filterState.ts`, panel config interfaces (`PlotlyPanelConfig`, `FlowMapPanelConfig`). This phase catches YAML config errors and DuckDB column mismatches at write-time. Merge into `main` when confirmed working.

**Phase 3 — React (`feat/react`, branches from post-Phase-2 `main`):**
Migrate UI layer to React if/when state management complexity justifies it. Data layer (`services/`, `state/`) is completely untouched — React only changes how panels and layout are structured. Use Commute Explorer as the working reference — it is already the same stack (React + DuckDB-WASM + MapLibre + flowmap.gl). Merge into `main` when confirmed working.

Do not introduce TypeScript or React in Phase 1. Do not introduce React in Phase 2.

---

## Non-negotiables

- DuckDB-WASM runs in a **Web Worker** — never the main thread
- One DuckDB instance shared across all panels via `services/duckdb.js`
- No framework (React/Vue/Svelte) — panel registry is plain JS classes
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
- No `dashboard-config.yaml` — app settings live in code and CLI args
- No `summarize-preprocessor.yaml` — join logic lives in `sql_fragments` inside `summarize.yaml`
- Dashboard YAML configs (`dashboard-*.yaml`, `summarize.yaml`) live alongside the model scripts — not in the dashboard repo
- Parquet outputs live in `{scenario-dir}/summary/` — written by the post-processor
- Published scenarios are manually copied into `public/scenarios/` in the dashboard repo

---

## Navigation model

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
├── index.html                  # coi-serviceworker FIRST, then main.js
├── package.json
├── vite.config.js
├── public/
│   ├── coi-serviceworker.js
│   ├── observed/               # observed data — deselectable, always pre-loaded
│   │   ├── manifest.yaml       # name: "Observed Data", pinned: true
│   │   └── summary/
│   │       ├── summary_kpis.parquet
│   │       ├── observed_mode_share.parquet
│   │       ├── observed_counts.parquet
│   │       └── observed_tlfd.parquet
│   └── scenarios/              # published model runs for sharing/web access
│       ├── index.json          # ["2027-rtp-baseyear", "2027-rtp-horizonyear"]
│       ├── 2027-rtp-baseyear/
│       │   ├── manifest.yaml
│       │   └── summary/
│       │       ├── summary_kpis.parquet
│       │       └── ...
│       └── 2027-rtp-horizonyear/
│           ├── manifest.yaml
│           └── summary/
├── pyproject.toml
├── Makefile                    # npm run build → copy dist/ → uv build
├── python/
│   └── wftdm_dashboard/        # Python package
│       ├── __init__.py
│       ├── cli.py              # wftdm-dashboard serve / here
│       ├── server.py           # Flask/uvicorn file server with CORS headers
│       └── static/             # built dist/ embedded at package build time
└── src/                        # Dashboard application source (JS app only)
    ├── main.js                 # boot sequence
    ├── state/
    │   ├── appState.js         # loaded scenarios registry
    │   └── filterState.js      # global filters + pub/sub
    ├── services/
    │   ├── duckdb.js           # DuckDB-WASM API
    │   ├── duckdb.worker.js    # Web Worker (separate file for Vite)
    │   ├── yamlLoader.js       # fetch + parse dashboard-*.yaml files
    │   ├── sqlExpander.js       # expand $mappings/$bins/$sql/$filters/$scenario
    │   └── scenarioDiscovery.js # register observed/ + public/scenarios/ at startup
    ├── layout/
    │   ├── shell.js
    │   ├── navBar.js
    │   ├── sidebar.js
    │   ├── dashboardRenderer.js
    │   └── panelCard.js
    ├── panels/
    │   ├── registry.js
    │   ├── PlotlyPanel.js
    │   ├── PlotPanel.js
    │   ├── TablePanel.js
    │   ├── ValueBoxPanel.js
    │   ├── FlowMapPanel.js     # MapLibre + MapboxOverlay + FlowmapLayer
    │   ├── ZoneMapPanel.js     # MapLibre choropleth + GeoParquet
    │   ├── SankeyPanel.js
    │   ├── GraphicWalkerPanel.js
    │   └── MarkdownPanel.js
    ├── scenario/
    │   ├── scenarioManager.js  # showDirectoryPicker + view registration
    │   └── manifestReader.js
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

## Boot sequence (`main.js`)

```js
await initDuckDB()                          // Web Worker init
await discoverScenarios()                   // register observed/ + public/scenarios/*
applyURLParams()                            // pre-select ?s= scenarios from URL
const dashboards = await loadDashboards()   // fetch + parse dashboard-*.yaml
renderShell(dashboards)                     // nav tabs, sidebar, scenario manager
renderDashboard(dashboards[0])              // first tab (Summary) as landing page
```

---

## DuckDB service API (`services/duckdb.js`)

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

```js
export function create(config, conn, filterState) {
  const el = document.createElement('div')

  async function render() {
    const rows = await conn.query(buildSQL(config, filterState))
    // render into el
  }

  const unsub = filterState.subscribe(config.filter_ids ?? ['*'], render)
  render()
  return { element: el, destroy: () => { unsub(); /* cleanup */ } }
}
```

---

## Panel registry

```js
export const registry = {
  'plotly':         createPlotly,
  'plot':           createPlot,
  'table':          createTable,
  'valuebox':       createValueBox,
  'flowmap':        createFlowMap,
  'zonemap':        createZoneMap,
  'sankey':         createSankey,
  'graphic-walker': createGraphicWalker,
  'markdown':       createMarkdown,
}
```

---

## SQL expander (`services/sqlExpander.js`)

- `$mappings.major_trip_mode` → WHEN clauses inside a CASE block
- `$bins.income_category` → CASE expression from manual_breaks / quantiles
- `$sql.trips_merged` → inline FROM clause joining trips + persons + households + zones
- `$filters.purpose` → current filter value (omit WHERE if value is `'all'`)
- `$scenario` → UNION ALL across all loaded scenario views

---

## Filter state (`state/filterState.js`)

```js
get(id), set(id, value)
subscribe(ids, fn) → unsubFn   // ids: ['purpose'] or ['*'] for all
getAll() → Object
```

---

## Map panels

**FlowMapPanel** — copy `FlowLayer.jsx` from Commute Explorer, remove React hooks.
Lifecycle: create overlay once → `overlay.setProps()` on update → `map.remove()` on destroy.
Never recreate the MapLibre instance on data change.

**ZoneMapPanel** — load zone GeoParquet once via DuckDB spatial, cache as module variable.
Join metric rows to features in JS → `map.getSource('zones').setData(geojson)` on update.

**Pinned versions (peer deps must match):**
- `@deck.gl/core` + `@deck.gl/mapbox`: ^9.0.0
- `@flowmap.gl/layers`: ^9.3.0
- `maplibre-gl`: ^4.7.1

---

## Graphic Walker panel

```js
import { embedGraphicWalker } from '@kanaries/graphic-walker'

export function create(config, conn, filterState) {
  const el = document.createElement('div')
  el.style.height = `${config.height ?? 700}px`

  async function render() {
    const rows = await conn.query(
      `SELECT * FROM ${config.scenario}__${config.dataset} LIMIT ${config.limit ?? 100000}`
    )
    el.innerHTML = ''
    embedGraphicWalker(el, { data: rows, fields: config.fields ?? [] })
  }

  render()
  return { element: el, destroy: () => { el.innerHTML = '' } }
}
```

Graphic Walker is a snapshot — does not share DuckDB connection or respond to
global filters. Intentional — Explore tab is an open-ended sandbox.

---

## vite.config.js

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
<script type="module" src="/src/main.js"></script>
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

1. `vite.config.js`, `index.html`, `package.json` + postinstall for coi-serviceworker
2. `services/duckdb.js` + worker — init, query, registerScenario, registerFileURL
3. `services/scenarioDiscovery.js` — register `public/observed/` + `public/scenarios/*` + apply `?s=` URL params
4. `services/yamlLoader.js` + `services/sqlExpander.js`
5. `state/appState.js` + `state/filterState.js`
6. `layout/shell.js`, `navBar.js`, `panelCard.js`, `dashboardRenderer.js`
7. `scenario/scenarioManager.js` — folder picker + view registration
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

- Use React, Vue, Svelte, or any component framework
- Use TypeScript initially (migrate later if needed)
- Use Mapbox GL — MapLibre only
- Use Webpack — Vite only
- Read OMX/CSV/GeoJSON in the browser — Parquet only
- Put DuckDB-WASM on the main thread
- Use localStorage/sessionStorage
- Create `topsheet.yaml` — the first dashboard-*.yaml is the landing page
- Create `summarize-preprocessor.yaml` — join logic lives in sql_fragments
- Create `dashboard-config.yaml` — does not exist
- Create `services/observedRegistry.js` — replaced by `services/scenarioDiscovery.js`
- Use TypeScript in Phase 1 — vanilla JS only until dashboard is verified working
- Use React in Phase 1 or 2 — React comes after TypeScript is stable (Phase 3)
