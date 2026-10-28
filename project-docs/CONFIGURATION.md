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

**PROPOSED rules (for discussion, not decided).** Today the cascade already half exists: a panel's basemap beats its tab's, which beats the
app default, and a page's `layout_mode` beats the site's `layout.mode`. These rules make that general.

1. **Three levels only: site, page, panel.** `sections:` group rows on a page; they are not a level.
2. **Only keys marked as cascading in the schema inherit.** Identity, pages, brand, vocab, metrics, units, years, compare, the assistant,
   `network`, viewer `defaults` and the docs link are site-only. A site-only key set on a page or panel is reported ("not allowed here"),
   never silently ignored.
3. **Merge rules (decided: per key).** Scalars replace and maps merge key by key, so a panel can set `limits.csv_rows` without
   restating `limits.page_size`. Lists follow a rule the schema states for each key. Quarto concatenates lists (its docs: "objects and
   arrays are merged rather than simply overwriting each other"), with `format` as its one documented exception; we make that choice
   explicit per key. **Selection lists** such as `charts.allow` and `tables.include` replace, because concatenating can only widen
   them, never narrow. **Accumulating lists** such as `tables.exclude` and `presets` concatenate. The docs and `check --explain` show
   which rule a key uses.
4. **No `null` reset (decided).** Quarto's project docs say nothing about `null`, so we do not invent it. To switch off something an
   inherited level turned on, set the explicit empty value: `false` for a switch, `[]` for a list. (A replacing list set to `[]` empties
   it; a concatenating list cannot be emptied from below, so a key that needs that is made a replacing one in the schema.)
5. **Defaults per panel type (decided; built when a second repeated use appears).** Instead of an `explore:` block and a `limits:`
   block, the site and each page may carry `panel_defaults`, keyed by panel type. Only keys the schema marks as inheritable (settings
   such as `pagination`, `limits`, `features`; not content keys such as `scenario`, `metric`, `dataset`) can be defaulted. Until a
   setting repeats across panels, it is set on the panel itself. Explore is one instance of the general mechanism:

   ```yaml
   # dashboard-config.yaml (site)
   panel_defaults:
     explore-builder: { limits: { csv_rows: 50000 }, features: { sql_tab: false } }
     table:           { pagination: 50 }

   # dashboard-4-mode.yaml (page): only this page's tables differ
   panel_defaults:
     table: { pagination: 10 }

   # a panel
   - type: table
     pagination: 25          # wins over both
   ```

   A site usually has one Explore panel, so for Explore alone this saves little; it pays off for panel types that appear many times
   (tables, charts, value boxes).
6. **A page's own identity stays in `header:`** (tab name, title, icon, `full_page`, `hidden`, `draft`). It does not cascade.
7. **Viewers sit above the cascade** for the preferences they may change (theme, font, text size, layout). A locked preference ignores
   the viewer.
8. **One pure function resolves it** (site, page, panel, schema in; resolved settings and where each came from out), used by the app
   and by the `check` command. `check --explain` can print, for example, `limits.csv_rows = 500 (page: dashboard-4-mode.yaml)`.

## 4. Draft shape of `dashboard-config.yaml`

Every key optional. Keys are `snake_case`, like the keys in `dashboard-*.yaml`. Existing `index.json` keys keep their meaning.
New keys are marked **new**.

```yaml
version: 1                          # new: lets a later change migrate old files

pages:                              # replaces `dashboards` in index.json; the first is the landing page
  - dashboard-1-summary.yaml
  - dashboard-2-person-household.yaml

scenarios:                          # new: listed by the deployer, replaces the generated scenarios/index.json
  - activitysim-baseline            # (folder under the scenarios root; the exact shape is still to be drafted)
  - activitysim-density-variant

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
  tabs: [appearance, scenarios, basemap, assistant]   # order and visibility (Documentation moves out, see section 7)

# new: link to the deployer's separate documentation site (a Quarto site); shown as an icon at the foot of the left sidebar
docs: { url: "https://example.org/dashboard-docs/", label: Documentation }

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

# new: defaults inherited by every panel of a type (the page's, then the panel's own keys win), see the cascade proposal
panel_defaults:
  explore-builder: { limits: {}, features: {}, charts: {}, tables: {}, columns: {}, presets: [] }
  # chart row cap, scatter sample, histogram bins and legend series also become panel keys, not a separate `limits:` block
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
8. `defaults` and `locked` (disabled, with a reason). `settings.tabs`, the documentation link and sidebar icon, hidden and draft pages, and a CSS file.

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

## 7. Decisions and agenda

Reference model: Quarto (project file, cascade, brand file, profiles, schema and `check`), and for the project folder, SimWrapper.
Nothing below changes code. Each topic is settled before anything is built.

**Decided**
- Demo split: opt-in build flag (but see profiles, topic 5, which may replace it).
- Locked preferences: shown disabled, with a reason.
- Site settings move to YAML, in a new `dashboard-config.yaml` (constitution 2.8.0, Principle VII); a cascade site → page → panel.
- The target is a Python library and an R package (Principle X). **One core and two thin wrappers**, as quarto-r and quarto-py wrap Quarto.
  The wrappers hold no logic of their own.
- **Brand: thin brand.yml support.** Logos, colours and fonts follow the open brand.yml spec (the one Quarto reads), so an agency's
  existing brand file works. Only a small part of the spec is read; how much is detailed later.
- **Validation: all three.** A published JSON Schema for editors, errors that name the file and the key path (and the line where the
  YAML parser gives one), and a `check` command in the core, run before deploying.
- **Navigation stays as it is.** One fixed left sidebar. Deployers set page names and icons, and we add hidden and draft pages. No
  groups. External links are not wanted now, and may be considered later.
- **Documentation moves out of the app.** When the app is ready for first use, this repository's GitHub Pages hosts a separate
  Quarto-based documentation site. Dashboards link to it instead of showing documentation on screen, and the documentation icon sits at
  the foot of the left sidebar, not in Settings. (The in-app Documentation tab stays until then.)
- **Customisation:** deployers may add CSS. "Theme" means light and dark only, for now; named themes may come later. **No extensions.**
  The detailed design is deferred.
- **Hosting during and after development.** While the app is in development the demo is hosted on GitHub Pages. When the app is ready,
  the demo moves to `wfrc.utah.gov/<path>` and `wfrcanalytics.github.io/APP-wftdm-dashboard` hosts the documentation. The demo
  therefore ends up at a sub-path of another site, so the build must not depend on its URL (Principle X; Phase A, relative base).
- **File discovery is by listing.** The deployer lists the file paths in `dashboard-config.yaml` (`pages:`). There is no fallback to a
  generated `index.json` for pages. (Scenarios: to confirm, see below.)
- **Scenarios are listed too.** The deployer lists the scenarios in `dashboard-config.yaml`, like the pages, instead of the generated
  `scenarios/index.json`. (Each scenario's own metric listing is a separate question, below.)
- **The core is TypeScript for now.** Whether to move the core to Rust is revisited later (section 7, "Rust: revisit later"), after the
  data-path test.
- **Cascade rules 3, 4 and 5:** lists merge per key (selection lists replace, accumulating lists concatenate); no `null`, use `false` or
  `[]`; `panel_defaults` per panel type is the design, built when a second repeated use appears.
- The data path and observed data are open and recorded as such (section 8; constitution "Open Decisions").

**Direction set, details to research or decide**
1. **Deployer project folder.** Take SimWrapper's model as the starting point, keep what works there, and correct what does not.
   Needs a look at how SimWrapper lays out and discovers a project before we copy anything.
3. **Cascade rules.** Rules 3, 4 and 5 are decided (see above). Rules 1, 2, 6, 7 and 8 in section 3 have not been objected to; treat them
   as accepted unless that changes. Remaining: the first list of which keys are marked inheritable, per panel type, when it is built.
5. **Profiles.** Wanted in principle. Needs research on how they would work here and whether they would replace the demo build flag
   completely. Until then the demo flag decision stands.
6. **Variables** (Quarto's `_variables.yml`). Not enough known yet; research, then decide.

**Not yet discussed**
- **Versioning:** a `version:` key and how long old keys keep working.
- **Secrets:** what must never go in config (assistant and map keys end up public in a static site). Open questions 5 and 6 of the
  earlier list (assistant keys, self-hosted fonts) belong here and with the `network` block.
- **Names:** `snake_case` keys as drafted? Nested `logo: { light, dark }`? (Brand.yml's own names may settle this.)
- **Per-scenario file listing.** Pages and scenarios are listed in `dashboard-config.yaml` (decided). Each scenario also has its own
  `summary/index.json`, written by the post-processor, naming its Parquet files so the app can load them lazily. **Direction decided:
  if the post-processor is kept, it writes YAML, not JSON.** Where that listing lives (most likely the scenario's own `manifest.yaml`)
  and its shape are still to be drafted. What a scenario's files are depends on the data-path test, so the shape waits for it. Once
  built, no generated `index.json` is left, and the sentence in constitution Principle VII that describes `index.json` files as
  generated listings is updated then.
- **Compatibility:** do existing deployments rely on the demo fallback, so Phase A needs a notice or a version bump?

**Questions raised by the decisions above**
- **What is the core?** (Language decided for now: TypeScript.) The `check` command, schema validation and the cascade resolver need one
  implementation. A TypeScript core, shipped as a standalone program, lets the app and `check` share one schema and one resolver, and
  R users need no Python, which is how Quarto is built. The data steps (`summarize`) stay in Python either way. Still to settle: how
  the TypeScript core is packaged inside the Python library and the R package.
- **Rust: revisit later.** Not now: the core does not exist yet, the app's interface stays TypeScript regardless, and the work is
  config validation and file placement, not heavy computation. The case for Rust is packaging: one native core that both Python
  (maturin) and R (extendr) can load, with no separate program or runtime. It would need a second toolchain, and the browser could only
  share it through WebAssembly. To keep the door open, write the schema as data and the resolver as a small pure function with no
  browser dependencies. Reassess after the data-path test and once the core's scope is clear.
- **Docs links.** A site-level `docs:` URL, and a per-page `header.docs` path appended to it, so each page can link to its own
  section of the documentation. Wanted?
- **Hidden versus draft.** Proposed: `hidden: true` leaves the page out of the sidebar but reachable by its link; `draft: true` leaves
  it out entirely in a production profile and shows it in a development profile (this ties to topic 5).
- **CSS.** Proposed: the supported surface is the app's CSS variables (the tokens), documented and kept stable; class names are not
  promised. A site key names a CSS file loaded after the app's styles.

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
