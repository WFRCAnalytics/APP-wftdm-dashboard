# WFRC Travel Demand Model Dashboard

Interactive calibration and validation dashboard for the Wasatch Front Regional Council
(WFRC) Activity-Based Travel Demand Model (ActivitySim).

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
ActivitySim model run (TDM repo)
        │
        ▼  Python post-processor (uv run summarize.py)
        │  Reads CSVs + OMX skims → writes Parquet summary files
        ▼
Scenarios/{run-name}/
  manifest.yaml
  summary/
    summary_kpis.parquet
    trip_mode_share.parquet
    ...
        │
        ├──► Local use: wftdm-dashboard serve/here
        │    Analyst loads folder via folder picker or local server
        │
        └──► Publish to web app: copy to public/scenarios/{name}/
             Add name to public/scenarios/index.json → push → deploy
        │
        ▼  Browser (DuckDB-WASM)
        │  observed/ always pre-loaded · public/scenarios/* auto-discovered
        │  ?s=observed&s=2027-rtp-baseyear for shareable deep links
        ▼
Dashboard panels (Plotly / Observable Plot / MapLibre / flowmap.gl)
```

All computation happens locally. The hosted web app is static HTML/JS/CSS.

---

## Deployment modes

### Web app (primary)
Visit the hosted URL in Chrome or Edge. Published scenarios from `public/scenarios/` load
automatically — no folder picker needed. Share any scenario combination as a URL:
`?s=observed&s=2027-rtp-baseyear`. Analysts can also load local folders via
**Load Local Scenario** using the browser's File System Access API (`showDirectoryPicker`) —
local files never leave the machine.

### Local server (Firefox / Safari / offline)
```bash
# Install once
uv tool install git+https://github.com/WFRCAnalytics/APP-wftdm-dashboard

# Run from any scenario output folder
wftdm-dashboard serve    # starts file server, use with hosted web app
wftdm-dashboard here     # starts file server + local copy of app (no internet needed)
wftdm-dashboard init --scenario-dir <path>   # scaffold default configs for a new scenario
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
configured by `summarize.yaml` alongside the model scripts in the TDM repo — not in
this repository. Output is written to `Scenarios/{run-name}/summary/`.

**Setting up a new scenario directory for the first time?** Scaffold default configs
before hand-writing anything:
```bash
wftdm-dashboard init --scenario-dir Scenarios/2027-RTP-BaseYear
# creates summarize.yaml + dashboard-1-summary.yaml ... dashboard-7-explore.yaml,
# only for files that don't already exist — never overwrites your edits
```
`init` copies from the package's bundled `templates/`: a default `summarize.yaml`
pre-filled with the standard WFRC segmentations (income group, auto sufficiency, the
four geography levels, person type, etc. — see `docs/CALIBRATION-SUMMARIES.md`) and
the seven default `dashboard-*.yaml` files matching the Navigation model in
`docs/SPEC.md`. It's a one-time scaffold, not a synced resource — once these files
exist, editing them is a plain YAML edit with zero package involvement (see
`docs/ARCHITECTURE.md`).

```bash
uv run summarize.py --config summarize.yaml --scenario-dir Scenarios/2027-RTP-BaseYear
# writes to Scenarios/2027-RTP-BaseYear/summary/
```

**To publish a scenario to the web app:**
1. Using any file manager (FileZilla, Windows Explorer, etc.), copy from the TDM repo:
   - `Scenarios/2027-RTP-BaseYear/summary/` → `APP-wftdm-dashboard/public/scenarios/2027-rtp-baseyear/summary/`
   - `Scenarios/2027-RTP-BaseYear/manifest.yaml` → `APP-wftdm-dashboard/public/scenarios/2027-rtp-baseyear/manifest.yaml`
2. Add `"2027-rtp-baseyear"` to `public/scenarios/index.json` in the dashboard repo
3. Commit and push → GitHub Actions deploys automatically

**To publish dashboard layout changes to the web app:** `dashboard-*.yaml` files are
authored alongside the model scripts in the TDM repo, not per-scenario — publish them
once, not per scenario run:
1. Copy the `dashboard-*.yaml` files from wherever they're authored in the TDM repo →
   `APP-wftdm-dashboard/public/dashboard-config/` in the dashboard repo (overwriting
   the existing copies)
2. Update `public/dashboard-config/index.json` in the dashboard repo to list exactly
   the filenames now present, in display order — same step as
   `public/scenarios/index.json`, just for tabs instead of scenarios
3. Commit and push → GitHub Actions deploys automatically

The tab set is discovered from `index.json` at runtime, not hardcoded in the app —
adding, removing, or reordering a tab is purely an `index.json` + file edit.

OMX skim matrices are converted using the DuckDB `h5db` community extension
(fallback: Python `openmatrix` library). Zone geometry is converted to GeoParquet
via DuckDB spatial or GeoPandas.

---

## Dashboard configuration

Dashboard layout and panels are authored in YAML files kept alongside the model
scripts in the TDM repo — not authored in this repository. Three file types:

| File | Purpose | Published to this repo at |
|---|---|---|
| `dashboard-*.yaml` | Tab layout, panels, filters. First file = landing page. | `public/dashboard-config/` |
| `manifest.yaml` | Scenario name, engine, run date, display color | `public/scenarios/{name}/` (per scenario) |
| `summarize.yaml` | Post-processor config | never published — post-processor-only, not read by the browser |

See `docs/grammar.md` for the full YAML grammar reference.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Build | Vite + TypeScript | TypeScript throughout `src/`; React arrives with whichever feature first needs it, not before (constitution v2.1.1 — no phase gate, no dedicated branch for either) |
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
│   ├── observed/               ← Observed validation data (always pre-loaded, deselectable)
│   │   ├── manifest.yaml
│   │   └── summary/
│   │       ├── observed_mode_share.parquet
│   │       └── observed_counts.parquet
│   ├── scenarios/              ← Published model runs (auto-discovered on load)
│   │   ├── index.json          ← ["2027-rtp-baseyear", ...]
│   │   └── 2027-rtp-baseyear/
│   │       ├── manifest.yaml
│   │       └── summary/
│   └── dashboard-config/       ← Published tab layout (discovered + fetched at startup)
│       ├── index.json          ← ["dashboard-1-summary.yaml", "dashboard-2-person.yaml", ...]
│       ├── dashboard-1-summary.yaml
│       └── ...                 ← whatever else index.json lists (seven, by default)
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
