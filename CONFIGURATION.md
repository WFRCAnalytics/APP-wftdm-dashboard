# Configuration plan (draft for refinement)

Status: **draft, nothing here is built yet** except the Explore panel options (`specs/065-chart-builder/contracts/deployer-options.md`).
Started 2026-10-28 from an audit of the code. Constitution 2.8.0 (same day) adopted the direction below. Edit freely; open questions
are in section 7.

## 1. Goal

A deployer should be able to run this dashboard for their own agency, with their own data, name, look and rules, **without editing or
rebuilding `src/`**. The same bundle ships inside a **Python library and an R package** (constitution Principle X), and neither package
holds application logic.

Principles:

1. **Config, not constants.** A value a deployer could reasonably want to choose lives in config, with today's value as the default.
2. **Unset means unchanged.** Adding a key never changes an existing deployment.
3. **Neutral by default.** An unconfigured deployment shows no organisation's name, logo, colours or place names.
4. **Wrong values are reported, never fatal.** The key keeps its default and the problem is listed (page and console).
5. **YAML throughout, one file per job.** Four config files (constitution Principle VII); one documented schema each.
6. **A cascade, as in Quarto.** Site settings apply everywhere; a page may override them; a panel may override the page.
7. **Language neutral.** Plain YAML, so the Python library, the R package or a hand edit can all write it.

## 2. Where things stand

| Area | State |
|---|---|
| Title, logos, colours, scenario palette | Configurable, but in `index.json` (JSON, undocumented) |
| Tabs, sections, layout mode, panel options | Configurable (`dashboard-*.yaml`; the page list and `layout` in `index.json`) |
| Category names, metric labels and units | Configurable (`vocab`, `metrics`, `units` in `index.json`) |
| Years, compare defaults, export footer | Configurable (`index.json`) |
| Basemap and Protomaps | Key or URL configurable; the catalogue is fixed |
| Explore builder | Configurable per panel (limits, features, charts, tables, columns, presets) |
| Viewer preferences (theme, font, text size, colour presets) | Fixed in code |
| Settings tabs, navigation, documentation text | Fixed (only the Assistant tab can be hidden) |
| AI assistant | On or off only; providers, models, URLs, prompt and limits are fixed |
| Chart data layer | Fixed to ActivitySim table and column names (`charts/data/adapt.ts`) |
| Build and deploy path | Fixed: `base: '/APP-wftdm-dashboard/'` at build time |
| External network calls (fonts, basemaps, DuckDB spatial extension) | Fixed |

### What `index.json` is, and why it has to change

It started as a file listing: a browser cannot list a folder on a static host, so `public/scenarios/index.json` and
`public/dashboard-config/index.json` named the folders and `dashboard-*.yaml` files to fetch. Over time the second one became the site
settings file (title, logos, colours, vocab, metrics, units, years, compare, layout, export, assistant), one feature at a time. It is
now a fourth config file in practice, in JSON, with no schema, which the constitution did not allow for. The scenario listing stays a
generated file. The site settings move to `dashboard-config.yaml`.

### Structural problems found

1. **Base path is baked in.** `make build` embeds a `dist/` built for `/APP-wftdm-dashboard/`, so a wheel or R package cannot serve it
   from another URL. Runtime fetches already use `import.meta.env.BASE_URL`; a relative base is untested.
2. **Demo content is always mixed in.** `main.tsx` appends `demo-dashboard-config/` tabs after `dashboard-config/`, and branding falls
   back per field to the WFRC demo values (title, logos, colours, Protomaps key). An unconfigured deployment looks like WFRC.
3. **No schema, no validation.** Keys are parsed with `typeof x === 'string' ? x : undefined`. A new key needs edits in four places
   (type, parser, per-field merge in `main.tsx`, consumer), and `scripts/viteBootSkeletonPlugin.ts` has a second parser.
4. **Docs gap.** `GRAMMAR.md` never mentions `vocab`, `units`, `assistant`, `scenarioPalette`, `brandColor` or `markUrl`.
5. **The adapters assume ActivitySim.** `adapt.ts` hardcodes source tables (`trip_ends_by_zone_mode`, `land_use_summary`,
   `person_household_profile`, `purpose_mode_flow`, ...) and columns (`TOTPOP`, `zone_id`, `major_trip_mode`, `primary_purpose`,
   `depart_hour`), sex codes 1 and 2, and 5-year age bands to 80+. `vocab` maps values only. **This depends on the data-path decision
   in section 8, so it is not planned yet.**

## 3. The four config files

| File | Job | Read by |
|---|---|---|
| `dashboard-config.yaml` **(new)** | Site-wide deployer settings and the ordered page list | the browser, at startup |
| `dashboard-*.yaml` | One page: layout, panels, optional overrides of site settings | the browser |
| `summarize.yaml` | Post-processor: sources, mappings, bins, SQL fragments, metrics | Python only, never published |
| `manifest.yaml` | Per-scenario metadata | the browser, per scenario |

`dashboard-config.yaml` lives beside the pages (`public/dashboard-config/dashboard-config.yaml`) and is authored with them, in the
same place as `dashboard-*.yaml`. The generated `index.json` files stay as folder listings only.

### The cascade

```
dashboard-config.yaml      site: applies everywhere
  dashboard-3-tour.yaml    page: header.* and any overridable key, for this page only
    - type: explore-builder    panel: its own keys, for this panel only
```

The most specific wins. Not every key cascades: identity (title, logos), colours, vocab and the Settings tabs are site-only. Keys that
cascade: layout mode, default basemap, export, and the Explore options. The list is part of the schema.

## 4. Draft shape of `dashboard-config.yaml`

Every key optional. Keys are `snake_case`, like the keys in `dashboard-*.yaml`. Existing `index.json` keys keep their meaning.
New keys are marked **new**.

```yaml
version: 1                          # new: lets a later change migrate old files

pages:                              # replaces `dashboards` in index.json; the first is the landing page
  - dashboard-1-summary.yaml
  - dashboard-2-person-household.yaml

# identity and colour (today in index.json)
title: Calibration Dashboard
logo:      { light: logos/full.png,  dark: logos/full-white.png }
mark:      { light: logos/mark.png,  dark: logos/mark-white.png }
colors:    { primary: "#2457D6", secondary: "#D98A00", accent: "#7A4FD8", brand: "#1F4E79" }
scenario_palette: ["#2457D6", "#D98A00"]

# what the data means (today in index.json)
vocab:   { modes: [], purposes: [], incomes: [], autos: [], districts: [] }
metrics: {}
units:   {}
years:   { list: [2023, 2050], base: 2023, default: 2023 }
compare: { default: auto }
layout:  { mode: tabs }                # cascades to pages
export:  { footer: true }              # cascades to pages

# new: what each viewer starts with, and whether they may change it
defaults:
  theme: system                        # system | light | dark
  font: Schibsted Grotesk
  text_size: 100                       # 85 to 125
  locked: [theme]                      # shown disabled with a reason: "Set by your administrator"

# new: the Settings modal
settings:
  tabs: [appearance, scenarios, basemap, assistant, documentation]   # order and visibility
  documentation:
    pages: [{ title: Our method, url: docs/method.md }]

# new: the AI assistant (today only `assistant.enabled`)
assistant:
  enabled: true
  providers:
    - { id: internal, label: Agency gateway, base_url: "https://...", models: [...], needs_key: true }
  default: { provider: internal, model: "..." }
  prompt_addendum: Our zones are called TAZs.
  limits: { round_trips: 6, preview_rows: 1000, model_rows: 50 }

# new: outside services
network:
  fonts: self-hosted                   # self-hosted | google
  basemaps: { allow: ["protomaps-*"], default: protomaps-light }
  duckdb_extensions: "https://mirror.example.org/duckdb"

# new: app-wide defaults inherited by every Explore panel (the panel's own keys win)
explore: { limits: {}, features: {}, charts: {}, tables: {}, columns: {}, presets: [] }
limits:  { chart_rows: 50000, scatter_sample: 5000, histogram_bins: 12, legend_series: 15 }
```

Not drafted here, on purpose: how the charts find the deployer's tables and columns (section 8).

## 5. Plan, in order

**Phase A: neutral and clean (small; unblocks the rest)**
1. Demo split, **decided: an opt-in build flag.** A normal build ships no demo roots and no WFRC fallbacks. `build:pages` sets the demo
   flag and copies `public/demo-*` in, with its own `dashboard-config.yaml`, so GitHub Pages keeps working.
2. Replace WFRC and Utah leftovers with neutral defaults: the `index.html` title, the export footer fallback, `vocab` default districts,
   the `wasatch-*` default geometry names, the "WFRC blue" and "Wasatch" colour presets. Remove the unused `COUNTIES`.
3. Try a relative Vite `base` and check the DuckDB worker, the service worker scope and the boot skeleton (constitution Principle X).

**Phase B: `dashboard-config.yaml`**
4. One table-driven definition of every key (name, type, default, whether it cascades, description). The loader, the cascade, the
   boot-skeleton plugin and the docs read it, so adding a key is one edit.
5. Load the file at runtime, then the cascade. Report unknown keys and wrong values the way the Explore options do (a visible note for the
   deployer, console detail).
6. Migration: still read the old `index.json` keys for one version and warn that they moved; then drop them.
7. Document it in `GRAMMAR.md` and publish a JSON Schema file for editors (Python and R can validate with it before writing).

**Phase C: viewer-facing settings**
8. `defaults` and `locked` (disabled, with a reason). `settings.tabs` and extra documentation pages.

**Phase D: assistant and network**
9. The `assistant` block. 10. The `network` block, so an offline or locked-down site works.

**Phase E: Explore and limits**
11. App-level `explore:` and `limits:` blocks inherited by every Explore panel. Add the constants the first pass missed (chart rows,
    scatter sample, histogram bins, legend series, distinct-values list, list sizes).

**Phase F: the data layer. Blocked on the data-path decision (section 8).** Nothing is built here until it is made.

**Phase G: packaging**
12. The Python library: `init`, `serve` and `here` place the bundle and write a starter `dashboard-config.yaml` from the schema.
13. The R package wraps the same files. Nothing language-specific goes into the app.

## 6. Out of scope for now

- Translating interface text.
- Per-user settings stored on a server (the app keeps everything in memory by design).
- Access control. Config hides controls, it is not a security boundary; the SQL guard stays the one gate for queries.

## 7. Decisions and open questions

**Decided**
- Demo split: opt-in build flag.
- Locked preferences: shown disabled, with a reason.
- Site settings move to YAML, in a new `dashboard-config.yaml` (constitution 2.8.0, Principle VII); a cascade site → page → panel.
- The target is a Python library and an R package (Principle X).
- The data path and observed data are open and recorded as such (section 8; constitution "Open Decisions").

**Open**
1. **Schema home.** With YAML, is the single source a TS key table that generates the JSON Schema file and the `GRAMMAR.md` section, a
   hand-written JSON Schema, or `GRAMMAR.md` alone? (My lean: the TS key table, no new runtime dependency.)
2. **Names.** `snake_case` keys to match `dashboard-*.yaml`, as drafted? Nested `logo: { light, dark }` instead of `logoUrl`/`logoUrlDark`?
3. **The page list.** Must `pages:` be in `dashboard-config.yaml`, or may a deployment with no site file fall back to the generated
   `index.json` listing? (A static host cannot list a folder, so one of the two has to exist.)
4. **What cascades.** The list in section 3 is a first guess. Which keys should a page be able to override?
5. **Assistant keys.** May a deployer ship a key in config (it would be public), or only a gateway URL that handles auth?
6. **Fonts.** Self-hosting fonts means shipping them in the bundle. Is the size acceptable?
7. **Compatibility.** Do any existing deployments rely on the demo fallback, so Phase A needs a notice or a version bump?
8. **Authoring.** `dashboard-config.yaml` is authored beside the pages in the TDM repo and copied to `public/dashboard-config/`, like
   `dashboard-*.yaml`? Or generated by the Python and R packages from a smaller input?

## 8. Not decided: the data path, and observed data

Recorded in the constitution under "Open Decisions". Summary:

**Data path.** Today the Python post-processor reads the model's output, writes summary Parquet, and the dashboard reads only that.
The alternative is for the dashboard to read the model's raw output directly. The current design **stays as it is**. The leaning is
toward direct reading, which may be given up if it costs enough to make the dashboard unusable. Once real WFRC activity-based model
output is available, both approaches are built on two branches, tested, and one is chosen.

What this means for this plan:
- Phase F (how the charts find the deployer's tables and columns, today `charts/data/adapt.ts`) is the part that changes most, so it
  waits. With direct reading, that mapping is the data layer; with pre-processing, it could be written by the post-processor.
- `summarize.yaml` and Principle V (the browser reads only Parquet) are untouched until the decision.
- A test branch may break Principle V; that is what it tests. Nothing merges to `main` without amending the constitution.
- Phases A to E do not depend on this and can go ahead.

**Observed data.** Not worked on. The format, the source and how it relates to model runs are unknown. `public/observed/` and the
"observed" run kind are placeholders. Considered separately, when the time comes.
