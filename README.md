# WFRC Travel Demand Model Dashboard

Interactive calibration and validation dashboard for the Wasatch Front
Regional Activity-Based Travel Demand Model (ActivitySim).

**Hosted app:** `wfrc.utah.gov/wftdm-dashboard` · `wfrcanalytics.github.io/APP-wftdm-dashboard`

---

## What it does

Analysts load a scenario folder of pre-computed Parquet summary files directly in the
browser — no upload, no server, data never leaves the machine. The dashboard assembles
charts, maps, and tables from those files using DuckDB-WASM as the in-browser query
engine. Multiple scenarios can be loaded simultaneously for side-by-side or overlaid
comparison. Observed validation data (AADT counts, household travel survey) is always
registered and available to every panel.

The dashboard covers:

- **Summary** — high-level KPIs, mode share, VMT, trips by purpose
- **Person / Household** — auto ownership, work from home, telecommute frequency, CDAP
- **Tour** — mandatory/non-mandatory tour frequency, scheduling, destination, at-work subtours, stop frequency
- **Mode Choice** — tour mode share and trip mode share by purpose, income, person type
- **Trip** — trip purpose, destination distributions, scheduling
- **Network** — screenline volumes vs observed AADT, VMT by facility type, O-D desire lines
- **Explore** — free-form visual analytics sandbox (Graphic Walker)
---

## How it works

```
ActivitySim model run
        │
        ▼  Python post-processor (uv run summarize.py)
        │  Reads CSVs + OMX skims → writes Parquet summary files
        ▼
scenario_folder/
  manifest.yaml
  summary/
    summary_kpis.parquet
    trip_mode_share.parquet
    tlfd.parquet
    ...
        │
        ▼  Browser (DuckDB-WASM)
        │  Analyst loads folder → panels query Parquet → charts render
        ▼
Dashboard panels (Plotly / Observable Plot / MapLibre / flowmap.gl)
```

All computation happens locally. The hosted web app is static HTML/JS/CSS.

---

## Deployment modes

### Web app (primary)
Visit the hosted URL in Chrome or Edge. Click **Load Scenario** to select a local or
network-mounted scenario folder. Uses the browser's File System Access API
(`showDirectoryPicker`) — files never leave the machine.

### Local server (Firefox / Safari / offline)
```bash
# Install once
uv tool install git+https://github.com/WFRCAnalytics/APP-wftdm-dashboard

# Run from any scenario output folder
wftdm-dashboard serve    # starts file server, use with hosted web app
wftdm-dashboard here     # starts file server + local copy of app (no internet needed)
```

### Add to model repo
```toml
# pyproject.toml
[tool.uv.sources]
wftdm-dashboard = { git = "https://github.com/WFRCAnalytics/APP-wftdm-dashboard" }
```

---

## Post-processor

The post-processor converts raw ActivitySim output to Parquet summary files. It is
configured by `summarize.yaml` in the model repo — not in this repository.

```bash
uv run summarize.py --config .wfrc/summarize.yaml --scenario-dir /path/to/run
```

OMX skim matrices are converted using the DuckDB `h5db` community extension
(fallback: Python `openmatrix` library). Zone geometry is converted to GeoParquet
via DuckDB spatial or GeoPandas.

---

## Dashboard configuration

Dashboard layout and panels are configured in YAML files stored in a `.wfrc/` folder
alongside model runs — not in this repository. Three file types:

| File | Purpose |
|---|---|
| `dashboard-*.yaml` | Tab layout, panels, filters. First file = landing page. |
| `manifest.yaml` | Scenario name, engine, run date, display color |
| `summarize.yaml` | Post-processor config (lives in model repo, not here) |

See `docs/grammar.md` for the full YAML grammar reference.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Build | Vite + plain JavaScript | No framework — 10-year maintainability |
| In-browser query | DuckDB-WASM | Columnar SQL, same dialect as Python pipeline |
| Offline pipeline | Python DuckDB | Same SQL, reads CSV/OMX/shapefiles |
| Charts (default) | Plotly.js | Interactive legend, fullscreen, modebar |
| Charts (reactive) | Observable Plot | Grammar-of-graphics, reactive filter inputs |
| Explore tab | Graphic Walker | Tableau-style drag-and-drop sandbox |
| Base maps | MapLibre GL | Open-source, no Mapbox token required |
| O-D flow maps | flowmap.gl + deck.gl | Zoom-adaptive desire line clustering |
| File format | Parquet / GeoParquet | Columnar, DuckDB-native, compact |

---

## Development

```bash
npm install
npm run dev
```

Requires Chrome or Edge for local development (cross-origin isolation headers).

```bash
npm run build       # production build → dist/
npm run preview     # preview built app locally
```

### GitHub Actions deploy
Push to `main` → automatically builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml`.

---

## Repository structure

```
APP-wftdm-dashboard/
├── CLAUDE.md                   ← Claude Code specification (AI coding agent)
├── README.md
├── docs/
│   ├── ARCHITECTURE.md         ← Design decisions and rationale
│   ├── SPEC.md                 ← Implementation specification
│   ├── grammar.md              ← Full YAML grammar reference
│   └── CALIBRATION-SUMMARIES.md ← Metric inventory by submodel
├── public/
│   ├── coi-serviceworker.js    ← Enables SharedArrayBuffer on GitHub Pages
│   └── observed/               ← Permanent observed validation data
│       ├── observed_mode_share.parquet
│       ├── observed_counts.parquet
│       └── observed_tlfd.parquet
├── src/                        ← Dashboard application source
├── python/
│   └── wftdm_dashboard/        ← Python package (CLI + embedded app)
├── package.json
├── vite.config.js
└── pyproject.toml
```

---

## Related repositories

| Repo | Role |
|---|---|
| `WFRCAnalytics/APP-Commute-Explorer` | Production reference: MapLibre + flowmap.gl + DuckDB-WASM |
| `ar-puuk/omx-viewer` | Production reference: DuckDB-WASM + h5wasm + Vite + GH Pages |
| `ar-puuk/spatial-sql-explorer` | Production reference: DuckDB spatial + MapLibre choropleth |
| `ar-puuk/parquet-viewer` | Production reference: GeoParquet reading + spatial extension |

---

## License

MIT — Wasatch Front Regional Council, 2025
