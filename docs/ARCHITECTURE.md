# ARCHITECTURE.md — WFRC TDM Calibration Dashboard

Decision log. Explains *why*, not *how*. Read before changing anything.

---

## System overview

Two-layer system. DuckDB is the connective tissue between layers.

```
ActivitySim output (CSV, OMX, shapefiles)
        │
        ▼  Python DuckDB post-processor (offline, per model run)
        │  summarize.yaml drives all SQL transforms
        ▼
Parquet / GeoParquet summary files  (scenario folder)
        │
        ▼  DuckDB-WASM (browser, runtime)
        │  reads Parquet, joins observed data, passes to panels
        ▼
Dashboard panels (Plotly / Observable Plot / MapLibre / Graphic Walker)
```

All format conversion (CSV→Parquet, OMX→Parquet, shapefile→GeoParquet) happens **offline**. The browser only ever reads Parquet.

---

## Key decisions

### Plain JavaScript first, React/TypeScript later on separate branches

**Three-phase migration plan — each phase on a separate branch, merged when confirmed working:**

**Phase 1 — Vanilla JS (`main`):** Build and verify the full working dashboard in plain JavaScript. The panel registry pattern and pub/sub filter state don't need a framework. Complete and proven before moving on.

**Phase 2 — TypeScript (`feat/typescript`):** Add types incrementally on top of working vanilla JS. Vite supports TypeScript natively — rename `.js` → `.ts` file by file, no config change. Highest value: `services/duckdb.ts` (query result types), panel config interfaces, filter state types. Catches YAML config errors and DuckDB column mismatches at write-time. Near-zero migration cost — no architectural change.

**Phase 3 — React (`feat/react`):** Migrate UI layer to React after TypeScript is stable. Data layer (`services/`, `state/`) is completely untouched. Commute Explorer is the working reference — same stack already in React. Justified if state management complexity grows; not required if configured panels remain the primary use pattern.

**Why this order:** TypeScript adds the most value soonest (type safety on DuckDB queries and YAML config parsing) with the least disruption. React adds UI ergonomics and unlocks Graphic Walker's full DuckDB computation adapter, but those gains only matter after the core dashboard is working well. AI (including local LLMs) handles framework migrations — the "no framework forever" constraint is not permanent.

### DuckDB throughout

**Why:** Same SQL dialect in Python (post-processor) and WASM (browser). One query language across the entire system. DuckDB reads Parquet with predicate pushdown — only touched columns are read off disk. Joins model output to observed data at query time; no pre-joining in the pipeline.

**WASM threading:** DuckDB-WASM runs single-threaded on GitHub Pages (no COOP/COEP headers). Acceptable because summary Parquet files are under 100MB — queries complete in milliseconds. `wfrc.utah.gov/wftdm-dashboard` (own domain) can set COOP/COEP headers for full threading.

**Future upgrade path:** `services/duckdb.js` exposes a clean `query(sql)` interface. A native Python DuckDB server (`serve.py` with `/query` endpoint) can replace the WASM backend transparently for local use — zero panel code changes. Design the interface now, implement when needed.

### Parquet / GeoParquet as the universal format

**Why:** Columnar storage, predicate pushdown, DuckDB-native. A 200MB CSV becomes ~30MB Parquet. GeoParquet replaces GeoJSON for zone geometry and network links — geometry stored as WKB, decoded by DuckDB spatial, rendered by MapLibre.

### YAML-driven configuration

**Why:** Analysts (not developers) configure panels. Five file types, no more:
- `summarize.yaml` — single post-processor config: sources, mappings, bins, sql_fragments, metrics → Parquet
- `dashboard-*.yaml` — tab layout and panel definitions; the first file is the landing page
- `manifest.yaml` — per-scenario metadata

No `topsheet.yaml` — `dashboard-1-summary.yaml` serves as the landing page, rendering value boxes from `summary_kpis.parquet` on load and charts below from other Parquet files progressively. This eliminates a redundant file type with no loss of capability.

`sql_fragments` in `summarize.yaml` defines reusable join bases (e.g. `trips_merged` joining trips + persons + households + zones) referenced as `$sql.x` in metric queries. This replaces any separate preprocessor file — the join and the aggregation are one SQL statement in DuckDB, no intermediate step or file needed.

Config files live in a shared `.wfrc/` parent folder; Parquet files live per scenario folder.

### Plotly + Observable Plot (not one or the other)

**Plotly:** interactive legend (toggle scenarios), modebar (fullscreen/export), rich hover. Use for: volume scatter, screenline comparison, VMT by facility type.

**Observable Plot:** grammar-of-graphics, reactive filter inputs. Use for: mode share filtered by purpose, TLFD by mode, time-of-day by purpose.

**Extensibility:** adding a charting library = one new `XxxPanel.js` + one registry line. Nothing else changes.

### MapLibre + flowmap.gl

MapLibre (not Mapbox — no token required). `MapboxOverlay` from `@deck.gl/mapbox` renders `FlowmapLayer` in non-interleaved mode over MapLibre canvas. Proven in production in Commute Explorer. Imperative lifecycle: create overlay once, `setProps()` on update, `map.remove()` on destroy. Never recreate the map instance on data change.

### Graphic Walker for the Explore tab

Last tab is a free-form Tableau-style sandbox. `embedGraphicWalker(el, { data, fields })` — no React ownership required (React is bundled inside GW). Snapshot model: GW holds its own data copy, does not respond to global sidebar filters. Intentional — Explore is an open-ended context, not a reactive calibration panel.

### OMX handling (offline only)

DuckDB `h5db` community extension reads OMX/HDF5 in the Python post-processor. Fallback: `openmatrix` Python library. Browser never touches OMX. Hard constraint.

### Deployment model and Python package

The JS app (`APP-wftdm-dashboard`) is deployed in three modes from the same codebase:

**Hosted web app** — static files at `wfrcanalytics.github.io/APP-wftdm-dashboard` or `wfrc.utah.gov/wftdm-dashboard`. At startup the app registers `public/observed/` (always pre-loaded, deselectable) and all entries in `public/scenarios/index.json` (published model runs). Analysts can additionally load local scenario folders via `showDirectoryPicker()` (Chrome/Edge). URL params (`?s=observed&s=2027-rtp-baseyear`) enable shareable deep links into any scenario combination.

**`wftdm-dashboard serve`** — thin Python file server on `localhost:8050`. Analyst runs from any folder containing model output; visits the hosted web app which detects `localhost` and switches from folder picker to HTTP loading. Firefox/Safari compatible. Analogous to `simwrapper serve`.

**`wftdm-dashboard here`** — serves both the file server and a local copy of the embedded app. No internet required; works behind a firewall. Analogous to `simwrapper here`.

The Python package (`wftdm-dashboard`) bundles the built `dist/` as `static/` at publish time via a Makefile. Added to the TDM repo as a `uv` dependency — analysts install once and use from any scenario folder.

**TDM repo structure:** the post-processor writes `summary/` into each existing scenario folder (`Scenarios/{run-name}/summary/`). No new top-level folders; the existing TDM repo structure is unchanged. When ready to publish, the analyst uses any file manager (FileZilla, Windows Explorer, etc.) to copy `Scenarios/{run-name}/summary/` and `manifest.yaml` from the TDM repo into `public/scenarios/{run-name}/` in the dashboard repo — the two repos are separate project folders on disk. The analyst then adds the scenario name to `public/scenarios/index.json`, commits, and pushes the dashboard repo.

**Threading note:** `wfrc.utah.gov/wftdm-dashboard` (own domain) can set COOP/COEP headers → DuckDB-WASM gets full SharedArrayBuffer threading. GitHub Pages cannot set headers → single-threaded WASM. For summary Parquet under 100MB either is fast enough; own domain is preferred for future-proofing.

---

## What was rejected and why

| Option | Rejected because |
|---|---|
| SimWrapper fork | Vue/TS/Pug maintenance burden; CSV data model incompatible with DuckDB-throughout |
| Quarto dashboard | FileAttachment is render-time; OJS tab isolation; MapLibre lifecycle breaks in OJS cells |
| HoloViz Panel | Requires Python server; incompatible with static hosting |
| h5wasm in browser | OMX conversion is offline; adds WASM complexity for no gain |
| DuckDB DASH in browser | Requires native DuckDB process; cannot run in WASM |
| React/Vue as container | Framework migration debt; panel registry doesn't need it |

---

## Reference implementations (production, not prototypes)

| Repo | Proves |
|---|---|
| `ar-puuk/omx-viewer` | DuckDB-WASM + Arrow + Vite config + coi-serviceworker + GH Actions |
| `WFRCAnalytics/APP-Commute-Explorer` | MapboxOverlay + FlowmapLayer + MapLibre + deck.gl v9 compat |
| `ar-puuk/spatial-sql-explorer` | DuckDB spatial + MapLibre choropleth + basemap switching (plain JS) |
| `ar-puuk/parquet-viewer` | GeoParquet metadata detection + spatial extension lazy-load + buffer-pool fix |
