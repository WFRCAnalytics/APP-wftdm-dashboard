# **TDM Calibration Summary Dashboard**

## Architecture & Technology Overview

> **Status — read first.** This is the *original pre-implementation architecture brief* (early 2026), written before feature `001-data-state-layer`. It is kept as the design-rationale record — the "why" behind the stack, and the alternatives that were rejected (Quarto, a SimWrapper fork, HoloViz Panel). Several specifics have since evolved and are **not** updated here: the TypeScript + React adoption is complete, not a three-phase branch-per-phase migration (constitution v2.0.0 retired that plan); the Explore tab renders `<GraphicWalker>` directly, not via `embedGraphicWalker`, and the app does own React as a dependency (feature `014`); and the GitHub Pages demo deploys from a hand-committed `docs/` build with no GitHub Actions (feature `039`). Where this document and the current code disagree, **`CLAUDE.md` and `project-docs/ARCHITECTURE.md` are authoritative.**

# **Purpose**

Wasatch Front is transitioning from a trip-based model (Cube Voyager / TBM) to an activity-based model ([ActivitySim](https://zephyrtransport.org/ActivitySim/)). The [existing calibration and validation workflow](https://wfrc.utah.gov/wftdm-docs/) produces a static [Quarto](https://quarto.org/) report — adequate for public-facing documentation but unsuitable for active calibration work, which requires immediate feedback, multi-scenario comparison, and integration with independent observed data.

This document describes the architecture of a new interactive calibration dashboard that fills that gap. The static Quarto report is retained for public-facing documentation and sign-off; the dashboard is an internal tool for modelers actively tuning model parameters and comparing planning scenarios.

The two products share the same observed data files and can link to one another, but serve different audiences and are maintained separately.

# **Design Goals**

The dashboard is inspired by [SimWrapper](https://simwrapper.app/) — an open-source travel-demand model visualization tool developed by TU Berlin. What SimWrapper gets right is worth naming explicitly, because those same properties are non-negotiable requirements for the WFRC dashboard:

* **YAML-configured panels:** analysts add or rearrange charts by editing a config file, without touching code.

* **Summaries computed during the model run:** the dashboard reads pre-computed files rather than re-processing raw output on every load.

* **Runtime chart generation:** charts are assembled in the browser from those summary files, not pre-rendered images.

* **Local or web deployment:** the same tool runs on a modeler's workstation or on a website with no code change.

* **Multiple scenarios simultaneously:** load two or more model runs and compare them side by side or overlaid in a single chart.

SimWrapper itself is not adopted directly. Its data model (HTTP-fetched CSV → JavaScript arrays) does not support the WFRC requirement for [**DuckDB**](https://duckdb.org/) **as the query engine** throughout the pipeline, and its Vue / TypeScript / Pug codebase might impose a long-term maintenance burden on a team whose primary languages are R and Python. The WFRC dashboard is a clean-room reimplementation of SimWrapper's user-facing concepts using a stack chosen for 10-year maintainability by a small technical team.

# **Why not Quarto**

Quarto dashboard format was the preferred starting point. Quarto is already used for the static validation report and is familiar to the team. However, it has three specific limitations that are incompatible with the dashboard requirements:

* **FileAttachment** (Quarto's mechanism for referencing data files) resolves at render time, not runtime. A user cannot point the dashboard at a new scenario folder without re-running quarto render — which contradicts the "load a scenario and immediately see results" workflow.  
* **Observable JS (OJS)** cells in Quarto are scoped to a single page's cell graph. Sharing a DuckDB-WASM connection across tabs requires manual workarounds (stashing on window), and cross-tab reactivity is not a first-class feature.  
* **MapLibre GL and flowmap.gl** are imperative, lifecycle-managed DOM components. OJS cells re-execute fully on reactive invalidation, which destroys and recreates the map on every data update — losing zoom state and causing visible flicker.

| Result:  The dashboard is built as a Vite-compiled static web application in plain JavaScript — not as a Quarto document. Quarto remains the right tool for the static validation report. |
| :---- |

# **System Architecture**

The system has two layers. DuckDB is the connective tissue between them — running in Python for offline post-processing, and in the browser (via WebAssembly) for runtime querying.

## **Post-Processing Pipeline (Python DuckDB)**

After each ActivitySim model run, a Python post-processor reads raw model output (CSV files and OMX skim matrices) and produces a set of named Parquet summary files — one per metric — in the scenario folder. The post-processor is configured entirely by `summarize.yaml`, which defines data sources, column re-coding rules (e.g. `DRIVEALONEFREE → SOV`), income bins, and SQL expressions for each metric.

The pipeline handles all format conversions offline so the browser never encounters a raw or non-columnar file:

* **ActivitySim CSVs → Parquet** via DuckDB's `read_csv_auto()` and `COPY TO ... (FORMAT PARQUET)`  
* **OMX skim matrices → `skims.parquet`** via the DuckDB `h5db` community extension (`INSTALL h5db FROM community; LOAD h5db`). If `h5db` is unavailable or fails, the fallback is Python's `openmatrix` library, which reads the HDF5 file and writes a joinable Parquet table with columns `(orig, dest, period, SOV_DIST, HOV2_TIME, ...)`.  
* **Zone geometry / network links → GeoParquet** via GeoPandas or DuckDB's spatial extension (`ST_Read()` for shapefiles, `ST_AsWKB()` for geometry columns)

Running the post-processor is optional (controlled by a flag in the model run script) and takes seconds, not minutes — DuckDB's columnar engine handles the joins and aggregations far faster than equivalent pandas code. The same SQL expressions used in the post-processor run unchanged in the browser via DuckDB-WASM.

| Example:  A mode share metric is defined in `summarize.yaml` as a SQL `GROUP BY` with a `CASE` expression for mode recoding. The post-processor runs this query against `trips.csv`, writes `mode_share.parquet`. The dashboard browser session reads that same Parquet file and can further filter it (by purpose, income group, time period) without re-reading the raw CSV. |
| :---- |

## **Browser Query Layer (DuckDB-WASM)**

DuckDB-WASM runs in a Web Worker in the browser. When the analyst selects a scenario folder (via the browser's `showDirectoryPicker()` API), the dashboard registers each Parquet summary file as a named DuckDB view — for example, `abm_2026__mode_share`. Observed validation data (AADT counts, household travel survey mode shares, screenline volumes) lives in `public/observed/summary/` alongside the web app and is pre-loaded at startup as `observed__*` views. It behaves like any other scenario — analysts can include or exclude it from comparisons — but it is pre-selected by default on every selection.

Each dashboard panel runs its own SQL query when mounted and when filter inputs change. A mode share panel comparing two scenarios and observed data runs a single `UNION ALL` query and receives one result set — no pre-joining required in the pipeline.

| Example:  `SELECT 'abm_2026' AS scenario, mode, share   FROM abm_2026__mode_share WHERE purpose = 'HBW' UNION ALL SELECT 'base_tbm', mode, share   FROM base_tbm__mode_share WHERE purpose = 'HBW' UNION ALL SELECT 'Observed', mode, share   FROM observed_mode_share WHERE purpose = 'HBW'`  |
| :---- |

## **YAML-Driven Configuration**

Following SimWrapper's pattern, the dashboard content is defined entirely in YAML files. Analysts configure panels without writing JavaScript. There are three config file types:

### Navigation Model

When a scenario is loaded, the app renders the dashboard-1-summary.yaml as the landing page automatically. The summary tab is always the first view — no separate topsheet file is needed.

```
Scenario loaded → dashboard-1-summary.yaml (landing page, always active on load)
  ├── Tab: Summary ★    dashboard-1-summary.yaml   ← value boxes + overview charts
  ├── Tab: Person/HH    dashboard-2-person.yaml
  ├── Tab: Tour         dashboard-3-tour.yaml
  ├── Tab: Mode Choice  dashboard-4-mode.yaml
  ├── Tab: Trip         dashboard-5-trip.yaml
  ├── Tab: Network      dashboard-6-network.yaml
  └── Tab: Explore      dashboard-7-explore.yaml   (Graphic Walker sandbox)
```

The Summary tab renders immediately on scenario load. Its value boxes read from `summary_kpis.parquet` (smallest file, loads first). Charts below load progressively as other Parquet files are registered.

Dashboard YAML configs live alongside the model scripts in the TDM repo — not inside individual scenario folders. This means a single set of YAML configs applies to all runs without being copied into every scenario folder. Only the Parquet summary files need to be present in each scenario’s `summary/` subfolder.

topsheet is not a tab — it is the landing page the analyst sees immediately after loading, before choosing any tab. Dashboard tabs are navigated to from there.

### dashboard-1-summary.yaml (Landing Page)

The first dashboard file serves as the landing page — rendered automatically when a scenario is loaded. The top portion displays scalar KPIs as value boxes with color-coded thresholds against observed reference values. Charts below (mode share overview, trips by purpose, VMT) load progressively as other Parquet files register.

When multiple scenarios are loaded simultaneously, value box panels automatically render one column per scenario plus the observed column — the fastest way to answer "did this run move in the right direction?"

| Example:  `- type: valuebox   title: Auto Mode Share   metric: summary_kpis   column: auto_share   format: "{:,.1%}"   observed: 0.847   threshold_warn: 0.02   threshold_fail: 0.05`  |
| :---- |

### summarize.yaml

Defines the post-processing pipeline: data sources (CSV, OMX, geometry), column mappings, bins, reusable SQL fragments, and named metric outputs. Each named metric produces one Parquet file. OMX sources declare the skim file path and which matrices to extract; the post-processor handles the conversion automatically.

| Example:  A mode mapping entry reads: `DRIVEALONEFREE: SOV`. This expands to a SQL `CASE` expression applied consistently across every metric that references `$mappings.major_trip_mode` — no copy-paste, no inconsistency between metrics. |
| :---- |

### dashboard-\*.yaml

One file per dashboard tab. Defines the tab title, global sidebar filters, and a row-by-row layout of panels. Each panel entry declares its type, data source, filter bindings, and chart-specific options. Files are discovered automatically by the dashboard app at runtime — adding a new tab means adding a new file, no code change required.

| Example snippet: `type: plotly title: Mode Share by Purpose metric: mode_share filter: $filters.purpose observed:   source: observed_mode_share   style: dot`   |
| :---- |

### manifest.yaml

Lives in each scenario folder. Records scenario name, model engine, run date, and display color. The dashboard reads this when a folder is loaded to label the scenario in charts and the scenario manager sidebar.

# **Technology Stack**

Each technology in the stack was chosen for a specific reason. The table below records both the choice and the rationale.

| Component / Decision | Rationale |
| :---- | :---- |
| [Vite](https://vite.dev/guide/) (plain JavaScript) | Build tool for the static web app. The dashboard follows a three-phase migration plan: **Phase 1** — plain JavaScript (current); **Phase 2** — TypeScript added incrementally on a separate branch (rename `.js` → `.ts`, highest value: DuckDB query types and panel config interfaces); **Phase 3** — React UI layer migrated if state management complexity warrants it. Each phase is verified on its own branch before merging. Vite supports both TypeScript and React natively with no additional tooling.  |
| [DuckDB-WASM](https://duckdb.org/docs/current/clients/wasm/overview) | In-browser columnar SQL engine. Reads Parquet with predicate pushdown, joins model output to observed data at query time, and runs the same SQL dialect as Python DuckDB — one query language throughout the system. Runs in a Web Worker to keep the UI thread responsive. |
| [Python DuckDB](https://duckdb.org/docs/current/clients/python/overview) (post-processor) | Offline pipeline: reads ActivitySim CSV output, converts OMX skims via `h5db` (fallback: `openmatrix`), converts geometry to GeoParquet, applies mode recoding and binning, writes named Parquet files. Configured by `summarize.yaml`. Run via `uv` — reproducible environment, no conda/venv setup.  |
| [Parquet / GeoParquet](https://parquet.apache.org/docs/file-format/) | Universal file format across both pipeline layers. All format conversions (CSV, OMX, shapefile) happen offline in the post-processor; the browser only ever sees Parquet. Columnar storage means DuckDB-WASM reads only the columns a given query touches. GeoParquet used for zone geometry and network links. |
| [DuckDB `h5db` extension](https://duckdb.org/community_extensions/extensions/h5db) | Community extension for reading HDF5/OMX skim matrices directly in Python DuckDB (`INSTALL h5db FROM community`). Preferred over `openmatrix` because it keeps the pipeline pure DuckDB SQL. Falls back to `openmatrix` if the extension is unavailable. |
| [Plotly.js](https://plotly.com/javascript/) (default charts) | Default charting library for calibration panels. Chosen for: interactive legend (click to hide/show a scenario series), modebar (fullscreen, PNG export, zoom/pan), and rich formatted hover tooltips. Best fit for volume scatter plots (model vs observed AADT with log axes and error bands), screenline comparison, and any panel the analyst will explore in depth. |
| [Observable Plot](https://observablehq.com/plot/) (reactive panels) | Charting library for panels with user-controlled filter inputs. Grammar-of-graphics syntax (mark composition) produces complex faceted charts in fewer lines than Plotly. The team already uses Observable Plot in existing Quarto validation documents. Used specifically where a sidebar dropdown or slider should update the chart reactively — mode share by income group, Trip Length Frequency Distribution by mode, time-of-day by purpose. |
| [MapLibre GL](https://maplibre.org/projects/gl-js/) | Open-source map rendering library (no Mapbox token required). Used for TAZ-level choropleth maps (VMT per capita, mode share deviation by zone) and as the base map for O-D flow overlays. Already in use at WFRC. |
| [flowmap.g](https://flowmap.gl/)l \+ deck.gl | O-D desire line visualization layer on top of MapLibre. Uses `MapboxOverlay` from `@deck.gl/mapbox` to render `FlowmapLayer` in non-interleaved mode over the MapLibre canvas. Supports zoom-adaptive clustering, pickable flows with hover tooltips, and animation. The O-D flow data (`od_flows.parquet`) is produced by the post-processor as a pre-aggregated `(orig_taz, dest_taz, purpose, mode, trips)` table — no skim data needed at runtime.  |
| js-yaml | Runtime YAML parser. All config files (`dashboard-*.yaml`, `manifest.yaml`) are fetched and parsed in the browser at load time — the app does not know dashboard content at build time. This is the mechanism that makes the dashboard config-driven rather than code-driven. |
| GitHub Pages / internal server | The dashboard app is hosted as a public or internal web application — analogous to `simwrapper.app` — at a stable URL such as `wfrc.utah.gov/wftdm-dashboard`. The built `dist/` folder is deployed to either GitHub Pages or WFRC's own web server. Model output data is never uploaded; analysts load scenario folders from their local machine or network drive via the browser's `showDirectoryPicker()` API. The same `dist/` folder deploys to either host unchanged.  |

# **Charting Library Decision Detail**

Both Plotly and Observable Plot are used — not as alternatives, but as complementary tools assigned to different panel types. The decision rule is:

| Use Plotly when… | Use Observable Plot when… |
| :---- | :---- |
| The analyst needs to toggle individual series on/off (interactive legend) | The panel has a filter control (purpose dropdown, mode selector, income group) that updates the chart |
| The panel should be expandable to full screen or exportable as PNG (modebar) | Multiple charts on the same tab should respond to one shared input |
| Hover tooltip needs formatted custom text (link ID, % error) | Grammar-of-graphics composition produces the chart more concisely (faceted small multiples, layered marks) |
| Log-scale axes are needed (volume scatter) | The chart is one of several on a row and should be lightweight |

In practice: volume scatter (model vs observed AADT), screenline comparison bars, and VMT by facility type use **Plotly**. Mode share filtered by purpose, TLFD filtered by mode, and time-of-day filtered by purpose use **Observable Plot**. Both libraries are imported as standard ES modules — the panel registry routes to one or the other based on the `type:` key in the YAML config.

### Library Extensibility

The panel registry pattern makes adding further charting libraries a two-step change with zero impact on the rest of the system: write one new `XxxPanel.js` file and add one line to `panels/registry.js`. Any JS charting library that renders into a DOM element — ECharts, D3, Vega-Lite — can be added this way without touching the renderer, YAML loader, or filter state. ECharts is the most likely future addition for its production-quality Sankey and heatmap support.

# **The Explore Tab** 

The last dashboard tab is a [free-form visual analytics sandbox](https://graphic-walker.kanaries.net/) powered by [**Graphic Walker**](https://kanaries.net/graphic-walker) (`@kanaries/graphic-walker`). Analysts drag fields onto shelves, pick chart types, apply filters, and build cross-filtered views without writing SQL or code — a Tableau-style interface running entirely in the browser. The data source is a DuckDB-WASM query against the loaded scenario views, passed to Graphic Walker as a row array at tab load time.

The embedding path for a no-framework app is `embedGraphicWalker(el, { data: rows, fields })`, which bundles React internally so the dashboard does not need to own React as a dependency. The tradeoff is bundle size (\~2MB) and a snapshot data model — Graphic Walker holds its own copy of the query result rather than a live DuckDB connection, and does not participate in the global sidebar filters that drive the other tabs. This is intentional: the Explore tab is a deliberate context switch into open-ended exploration, not a reactive calibration panel.

The decision on exactly which dataset(s) to expose in the Explore tab (full trips table, pre-aggregated summaries, or an analyst-selectable dropdown) is deferred to implementation.

# **Deployment Modes**

The dashboard is a publicly hosted web application — analogous to `simwrapper.app` — that analysts visit in their browser. The app itself is static (HTML, JS, CSS) and hosted on either GitHub Pages or WFRC's own web server. Model output data never leaves the analyst's machine.

## **Web app mode (Primary)**

The built `dist/` folder is deployed to a public or internal web host — for example, `wfrc.utah.gov/wftdm-dashboard` or `wfrcanalytics.github.io/wftdm-dashboard`. At startup, the app automatically loads observed validation data and any published scenarios stored in `public/scenarios/` — no folder picker required. Analysts can share a direct URL to any scenario combination: `wfrc.utah.gov/wftdm-dashboard?s=observed&s=2027-rtp-baseyear`

Analysts can additionally load local scenario folders by clicking **"Load Scenario"**, which triggers `showDirectoryPicker()` — the browser's native folder picker pointing at a local or network-mounted folder.

This is the same model as `simwrapper.app`: one publicly accessible URL, zero server-side data handling, works with files anywhere on the analyst's machine or a mounted network drive.

## **Local mode (companion Python server)**

A minimal Python file server (`wftdm-dashboard serve`) serves model output files over HTTP from a local or network path. The dashboard detects it is running against a local server and switches data loading mode accordingly — no `showDirectoryPicker()` required, which means Firefox and Safari also work in this mode. For fully offline use (no internet, behind a firewall), `wftdm-dashboard here` starts both the file server and a local copy of the embedded app.

# **Explicit Scope Boundaries**

The following are outside scope for the dashboard, by design:

* **Server-side computation** — all querying happens in the browser or in the offline post-processor. No application server.  
* **Real-time collaboration** — each browser session is independent. Two analysts cannot share a session.  
* **SimWrapper fork** — SimWrapper's Vue/TypeScript/Pug codebase would impose a long-term maintenance burden and its CSV-based data model conflicts with the DuckDB-throughout principle. Its YAML grammar concepts and topsheet/dashboard file-type pattern are borrowed; its implementation is not.  
* **Quarto as the dashboard container** — retained for the static validation report only.  
* **In-browser OMX reading** — all format conversion (CSV/OMX → Parquet, shapefile/sqlite → GeoParquet) happens offline in the Python post-processor. The browser only reads Parquet.  
* **DuckDB DASH extension in the browser** — DASH requires a native DuckDB process and cannot run in DuckDB-WASM. It remains a local power-user tool for modelers who want full native DuckDB access on their own machine. The browser-native substitute for free-form exploration is the Explore tab, powered by Graphic Walker.  
* **HoloViz Panel as the UI container** — requires a Python server; incompatible with the static hosting requirement.

# **Reference Implementations**

Two existing WFRC tools provide proven implementations of the dashboard's hardest components. These are proofs of concepts that run in production on GitHub Pages.

| Component / Decision | Rationale |
| :---- | :---- |
| omx-viewer ([github.com/ar-puuk/omx-viewer](http://github.com/ar-puuk/omx-viewer)) | DuckDB-WASM aggregations in the browser, Apache Arrow data handoff, Vite build config for DuckDB-WASM (`optimizeDeps` exclusion, `coi-serviceworker` for GitHub Pages), GitHub Actions deploy workflow. |
| Commute Explorer ([github.com/WFRCAnalytics/APP-Commute-Explorer](http://github.com/WFRCAnalytics/APP-Commute-Explorer)) ([github.com/WFRCAnalytics/APP-WFRC-Commute-Patterns](http://github.com/WFRCAnalytics/APP-WFRC-Commute-Patterns)) | `MapboxOverlay` \+ `FlowmapLayer` \+ MapLibre integration in non-interleaved mode, pickable O-D flows with hover tooltips and clustering, DuckDB-WASM reading Parquet from GitHub Pages static hosting, deck.gl v9 \+ flowmap.gl v9.3 version compatibility. |
| Spatial SQL Explorer ([github.com/ar-puuk/spatial-sql-explorer](https://github.com/ar-puuk/spatial-sql-explorer))  | DuckDB-WASM as a full in-browser SQL engine with no build framework (plain JS ES modules via import map, no Vite), multi-format file registration (`registerFileText`, `registerFileBuffer`) for GeoJSON/CSV/Parquet, DuckDB spatial extension (`ST_Read`, `ST_AsGeoJSON`) for geometry handling, MapLibre choropleth with attribute-driven styling (graduated, categorical, single). |
| Parquet Viewer ([github.com/ar-puuk/parquet-viewer](http://github.com/ar-puuk/parquet-viewer)) | DuckDB-WASM with Vite \+ TypeScript \+ React (relevant if TypeScript is adopted later), `registerFileBuffer` for local Parquet file loading and `registerFileURL` with `DuckDBDataProtocol.HTTP` for remote URLs, GeoParquet spec metadata detection (`parquet_kv_metadata` \+ `geo` key), automatic geometry encoding detection across WKB/WKT/WKT/GeoArrow struct/Esri JSON/native GEOMETRY types, DuckDB spatial extension lazy-load pattern (`LOAD spatial` → fallback to `INSTALL spatial; LOAD spatial`), client-side CRS reprojection using proj4js when `ST_Transform` is unavailable in WASM, unique file sequence naming to avoid DuckDB buffer-pool cache collisions across multiple file loads, `parquet_file_metadata()` for inspecting row groups and format version, MapLibre geometry rendering from DuckDB query results with WKB→GeoJSON conversion. |

The dashboard Claude Code spec (`CLAUDE.md`) explicitly references these repositories and instructs the implementation to copy proven patterns rather than re-derive them. The three specification documents — `CLAUDE.md`, `project-docs/GRAMMAR.md`, and `project-docs/ARCHITECTURE.md` — together form the complete handoff package to the AI coding agent.