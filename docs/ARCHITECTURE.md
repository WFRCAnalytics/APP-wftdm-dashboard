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

### TypeScript throughout; React when the UI layer needs it

The earlier three-phase, branch-per-phase migration plan (vanilla JS on
`main` → TypeScript on `feat/typescript` → React on `feat/react`, each fully
verified before the next began) no longer applies — dropped in constitution
v2.0.0. TypeScript and React are both permitted directly on `main`; there's
no gate to clear and no dedicated branch to merge from for either.

**Current stack:** the app is TypeScript (`.ts`), not plain JavaScript.
Vite supports TypeScript natively — no build config beyond a `tsconfig.json`
is required. `services/duckdb.ts` (query result types), `state/appState.ts` /
`state/filterState.ts`, and the eventual panel config interfaces get real
types instead of JSDoc annotations, catching YAML config errors and DuckDB
column mismatches at write-time rather than at runtime.

**React is not adopted yet** — nothing in the data/state layer renders
anything, so there's no UI to benefit from a framework. React arrives with
the layout/panel layer, when there's an actual component tree to justify it.
Commute Explorer remains the working reference for that stack (React +
DuckDB-WASM + MapLibre + flowmap.gl) when that work starts. Data layer
(`services/`, `state/`) is unaffected by whether or when React is adopted —
it's plain TypeScript modules either way, no framework dependency.

### DuckDB throughout

**Why:** Same SQL dialect in Python (post-processor) and WASM (browser). One query language across the entire system. DuckDB reads Parquet with predicate pushdown — only touched columns are read off disk. Joins model output to observed data at query time; no pre-joining in the pipeline.

**WASM threading:** DuckDB-WASM runs single-threaded on GitHub Pages (no COOP/COEP headers), the current deploy target. Acceptable because summary Parquet files are under 100MB — queries complete in milliseconds. See "Deployment model and Python package" below for the full threading note, including the unconfirmed status of COOP/COEP on `wfrc.utah.gov`'s hosting.

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

`summarize.yaml` and `dashboard-*.yaml` are authored alongside the model scripts in
the TDM repo, not in this repository. `summarize.yaml` is post-processor-only and
never published. A published copy of the `dashboard-*.yaml` files is discovered at
runtime via `public/dashboard-config/index.json` and fetched by the browser at
startup — the same discovery pattern `public/scenarios/index.json` already uses for
scenarios, not a fixed filename list; Parquet and `manifest.yaml` are published per
scenario folder under `public/scenarios/{name}/`.

Once authored, `summarize.yaml` and `dashboard-*.yaml` are plain YAML — editing
them requires no package build, no code, and no re-sync step; the post-processor
and the browser simply re-read (or re-fetch) whatever's on disk the next time
they run. Neither this repo's Python package nor its JS app validates or
transforms these files ahead of time; runtime parsing (constitution Principle IV)
is the only thing that ever touches them.

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

**`wftdm-dashboard init --scenario-dir <path>`** — scaffolds a new scenario directory in the TDM repo with a starting `summarize.yaml` and WFRC's default `dashboard-*.yaml` set (seven files today), so a modeler setting up a new model run doesn't start from a blank file. Creates a file only if it doesn't already exist at `<path>` — never overwrites an existing `summarize.yaml` or `dashboard-*.yaml`, so re-running `init` against a directory that's already been customized is always safe (a no-op for every file that already exists). `init` scaffolds the TDM-repo authoring side only — it never touches the dashboard repo's `public/dashboard-config/`, so it has no `index.json` to produce; that file is maintained as part of the separate publish step below.

**Threading note:** GitHub Pages cannot set custom response headers at all, so COOP/COEP (and therefore SharedArrayBuffer / full threaded DuckDB-WASM) are unavailable there — the app runs single-threaded WASM on GitHub Pages, which is the current deploy target while the dashboard is under active development. `wfrc.utah.gov` is hosted on Bluehost (Apache/cPanel), which can typically set custom response headers via `.htaccess` — unlike GitHub Pages, this makes COOP/COEP support *possible* there, but it is not confirmed: whether this specific Bluehost account/plan actually allows the needed headers must be verified empirically against that account when the team is ready to deploy there, not assumed from what Bluehost/Apache can do in general. For summary Parquet under 100MB, single-threaded WASM is fast enough regardless, so this isn't blocking anything now. A second deploy path to `wfrc.utah.gov` (with its own `.htaccess` and a second GitHub Actions job) is deferred until GitHub Pages testing is complete — not something to build yet.

### Config templates are a scaffold, not a managed file

`python/wftdm_dashboard/templates/` bundles the files `init` copies: a default
`summarize.yaml` pre-filled with the standard WFRC segmentations already
documented in `docs/CALIBRATION-SUMMARIES.md` — income group, auto sufficiency,
the four geography levels (TAZ / small / medium / large / super district),
person type, and the rest of that document's Standard Segmentation Definitions
— and the default `dashboard-*.yaml` files (seven today) matching the tab
structure in `docs/SPEC.md`'s Navigation model. This count is not pinned
anywhere in code — it's simply how many files ship in `templates/` today;
`public/dashboard-config/index.json` (the dashboard repo's separate, published
side) is what the running app actually reads to know its tab set.

**These are a one-time starting point, not a synced or managed resource.**
`init` performs a single copy-if-missing operation and is never invoked again
automatically. Once a `summarize.yaml` or `dashboard-*.yaml` exists in a
scenario directory, it has exactly the same editability guarantee as any other
config file in this system (see "YAML-driven configuration" above): editing it
is a plain YAML edit, with zero involvement from the `wftdm-dashboard` package
— no re-copy, no validation, no drift-detection against the bundled template.
If a later version of the package changes its bundled templates, directories
already scaffolded by an earlier `init` are **not** retroactively updated;
`init`'s never-overwrite rule means picking up a template change requires
either a fresh scenario directory or a manual edit, by design.

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
