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
| Title, logos, colours, scenario palette | Configurable in `dashboard-config.yaml` (066; reference in `CONFIG-REFERENCE.md`) |
| Tabs, sections, layout mode, panel options | Configurable (`dashboard-*.yaml`; the page list and layout mode in `dashboard-config.yaml`) |
| Page addresses | Configurable: `header.slug` sets a page's `#/<slug>` address (default: the tab name, lower-cased and dash-separated; a repeat gets `-2`, `-3`). A section is `#/<slug>/<section id>`. Settings, the assistant and expanded tiles are not in the address |
| Category names, metric labels and units | Configurable (`vocab`, `metrics`, `units` in `dashboard-config.yaml`) |
| Years, compare defaults, export footer | Configurable (`dashboard-config.yaml`) |
| Basemap and Protomaps | Key or URL configurable; the catalogue is fixed |
| Explore builder | Configurable per panel (limits, features, charts, tables, columns, presets) |
| Viewer preferences (theme, font, text size, colour presets) | Fixed in code |
| Settings tabs, navigation, documentation text | Fixed (only the Assistant tab can be hidden) |
| AI assistant | On or off only; providers, models, URLs, prompt and limits are fixed |
| Chart data layer | Fixed to ActivitySim table and column names (`charts/data/adapt.ts`) |
| Build and deploy path | Fixed: `base: '/APP-wftdm-dashboard/'` at build time (the demo content is a build flag, 070) |
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
2. **Demo content was always mixed in (fixed in 070).** `main.tsx` appended `demo-dashboard-config/` tabs after `dashboard-config/`, and branding falls
   back per field to the WFRC demo values (title, logos, colours, Protomaps key). An unconfigured deployment looked like WFRC. Now the demo is read only in the
   dev server and in a `--mode demo` build; see Phase A step 1.
3. **No schema, no validation.** Keys are parsed with `typeof x === 'string' ? x : undefined`. A new key needs edits in four places
   (type, parser, per-field merge in `main.tsx`, consumer), and `scripts/viteBootSkeletonPlugin.ts` has a second parser.
4. **Docs gap.** `GRAMMAR.md` never mentions `vocab`, `units`, `assistant`, `scenarioPalette`, `brandColor`, `markUrl` or `header.slug`.
5. **The adapters assume ActivitySim.** `adapt.ts` hardcodes source tables (`trip_ends_by_zone_mode`, `land_use_summary`,
   `person_household_profile`, `purpose_mode_flow`, ...) and columns (`TOTPOP`, `zone_id`, `major_trip_mode`, `primary_purpose`,
   `depart_hour`), sex codes 1 and 2, and 5-year age bands to 80+. `vocab` maps values only. **This depends on the data-path decision
   in section 8, so it is not planned yet.**

## 3. The config files

| File | Job | Authored or generated | Read by |
|---|---|---|---|
| `dashboard-config.yaml` **(new)** | Site-wide deployer settings, the ordered page list, and the scenario list with each scenario's label and colour | authored | the browser, at startup |
| `dashboard-*.yaml` | One page: layout, panels, optional overrides of site settings | authored | the browser |
| `summarize.yaml` | Post-processor: sources, mappings, bins, SQL fragments, metrics | authored | Python only, never published |
| `dashboard-manifest.yaml` | One scenario's facts: its provenance, the file tree of its raw output, and (if there is a pre-processing step) the file tree of its summary files. Sits at the root of the scenario folder | **generated, never hand-edited** | the browser, per scenario |

That is four files, as the constitution says. `dashboard-manifest.yaml` takes the place of today's `manifest.yaml`, which is **retired**:
there is no separate `manifest.yaml`, and the display settings it carried (name, colour, and so on) move into `dashboard-config.yaml`.
The constitution names `manifest.yaml`, so Principle VII is updated to the new name when this is built. The generated `index.json`
files go away. The rule: **facts about a run go in the manifest (generated); everything about how the dashboard presents and groups runs
goes in `dashboard-config.yaml` (authored).**

`dashboard-config.yaml` lives beside the pages (`public/dashboard-config/dashboard-config.yaml`) and is authored with them, in the
same place as `dashboard-*.yaml`. The generated `index.json` files go away once the manifests exist.

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
6. **A page's own identity stays in `header:`** (tab name, title, icon, `slug`, `full_page`, `hidden`, `draft`). It does not cascade. `slug` is the
   page's address (`#/<slug>`), unique across the site; the app makes a repeat unique with a numeric suffix, and `check` should report it instead.
7. **Viewers sit above the cascade** for the preferences they may change (theme, font, text size, layout). Theme, font and text size
   are never set by a deployer; the page layout mode is.
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
  - path: scenarios/baseline-2023   # a folder; the app reads its dashboard-manifest.yaml for provenance, year, scenario group and files
    id: baseline-2023               # optional; defaults to the folder name. Panels pin a run by this id (`scenario: baseline-2023`)
    label: Baseline                 # presentation and grouping live here, not in the scenario folder
    color: "#2457D6"
    description: Calibrated base year.
  - path: scenarios/density-variant-2023
    label: Higher density
    scenario_group: density         # optional: overrides the manifest's scenario_group (regrouping)
  - path: scenarios/round-01
    label: Round 1
    kind: round                     # scenario (default) | round | observed
    family: calibration             # rounds: the group they belong to, and their order
    family_index: 1
    hidden: false                   # true: loadable and pinnable by a panel, but not in the picker or the compare set
    # `year`, `model_version` and `run_date` are NOT here: they are facts, so they come from the manifest.
    # Observed data (kind: observed) waits for the observed-data decision (section 8).

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

# Viewer preferences (theme: light, dark or system; font; text size) are NOT deployer settings. Every viewer gets them.
# The default font comes from the brand file's typography. A `defaults:` / `locked:` block, drafted earlier, is dropped for now.

# new: the Settings modal
settings:
  tabs: [appearance, scenarios, basemap, assistant]   # order and visibility (Documentation moves out, see section 7)

# new: link to the deployer's separate documentation site (a Quarto site); shown as an icon at the foot of the left sidebar
docs: { url: "https://example.org/dashboard-docs/", label: Documentation }

# the AI assistant (068: built; the viewer enters the token, never the file)
assistant:
  enabled: true
  providers:                            # REPLACES the built-in providers when it has a valid entry; a listed address is fixed in the form
    - { id: internal, label: Agency gateway, base_url: "https://...", models: [...], needs_key: true, protocol: openai }   # protocol: openai (default) | anthropic
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
1. **Done (070, `specs/070-demo-build-flag/`):** the demo split, an opt-in build flag. A normal build (`npm run build`, which feeds the packages) ships no `demo-*`
   folders and reads no demo root, setting, run or geometry; an unconfigured copy shows a first-run screen ("No site configuration was found", or "The site lists no
   pages") instead of the WFRC demo. The flag is Vite's `demo` mode: on for the dev server and for `vite build --mode demo` (`build:pages`, `build:demo`), off otherwise
   (`services/demoContent.ts#DEMO_CONTENT`). Not a schema setting, so `check` is unaffected. A deployer who relied on a demo value as a fallback now gets the neutral default
   (no backward compatibility, section 7). Profiles (topic 5) may later replace the flag.
2. **Done (branch `config/phase-a-neutral`).** Neutral defaults: the `index.html` title ("Calibration Dashboard"), the export footer
   fallback, no default `vocab.districts` (the demo configs now list theirs; `COUNTIES` was not unused, it is now the districts plus
   External), default geometry `zones.geoparquet` / `rail.geoparquet` (the demo files were renamed), and the colour presets "Blue" and
   "Teal".
3. **Done as a spike.** `WFTDM_BASE=./ npx vite build` produces a bundle that works from a nested folder (checked: charts draw, the
   service worker scopes to that folder, no failed data requests). The one fix needed: `services/duckdb.ts#registerFileURL` resolves its
   URL against the page, because the DuckDB worker resolved relative URLs against `assets/`. The default `base` is unchanged. Still to
   check: the boot skeleton and a Python-served copy.

**Phase B: `dashboard-config.yaml`**
4. **Done (066).** One table-driven definition of every key, `src/config/schema.ts`. The loader, the cascade, the boot-skeleton plugin and
   the generated `CONFIG-REFERENCE.md` read it, so adding a key is one row (plus the code that uses it).
5. **Done (066).** The file loads at runtime and the cascade (site, page, panel) resolves `layout.mode`, `basemap.default`, `export.footer` and
   the `explore.*` keys. Unknown keys and wrong values are reported in one visible note and in the console. Two roots stay: the deployment's
   file wins per setting over the demo's, page lists concatenate (until the demo build flag, step 1, is decided).
6. ~~Migration~~ Dropped: no backward compatibility (section 7, Versioning). The old `index.json` settings keys are removed and not read; a
   leftover one gets a "moved" note.
7. **Done.** `GRAMMAR.md` points at the generated reference. `npm run docs:config` also writes the JSON Schema
   `project-docs/dashboard-config.schema.json` (for an editor: first line `# yaml-language-server: $schema=<path or URL of that file>`; Python
   and R can validate with it before writing). `npm run check -- <site folder> [--explain] [--json]` (`src/config/check.ts`, run by
   `scripts/check-config.ts`) reports what the app would report, before deploying: unknown keys and wrong values, a missing or unparsable
   page file, a page missing `header.tab` or `header.title`, a site-only key on a page, two pages with one address, and a wrong Explore
   option on a panel. `--explain` prints each cascading setting per page and the level it came from. Exit code 1 when anything is
   reported. Not yet: packaging the TypeScript core inside the Python library and the R package (section 7, "What is the core?"), the
   unrestricted-map-key warning and the model-mix warning, which wait for those features.

**Phase C: viewer-facing settings**
8. **Done (067, `specs/067-viewer-settings/`):** `settings.tabs` (order and visibility of the Settings tabs; names `appearance`, `scenarios`, `basemap`,
   `assistant`, `documentation`; the assistant switch still wins), the documentation link (`docs: { url, label }`, an icon at the foot of the sidebar, a
   per-page `header.docs` path appended to the address; `http`/`https` only) and hidden pages (`header.hidden`: out of the sidebar, still reachable at
   `#/<slug>`; the first page that is not hidden is the landing page). **Draft pages are deferred** until the profiles design (topic 5); nothing is
   reserved. (No deployer theme or font defaults, and no custom
   CSS for now; see section 7.)

**Phase D: assistant and network**
9. **Done (068, `specs/068-assistant-config/`):** the `assistant` block: `providers` (replace the built-ins; id, label, `base_url`, `models`, `needs_key`, `protocol`), `default`,
   `prompt_addendum` (at most 2000 characters, added last, not shown to the viewer) and `limits` (`round_trips` 1 to 12, `preview_rows` 100 to 5000, `model_rows` 1 to 200).
   No key or token setting exists: a secret-like field anywhere in the site file is refused unread. The address lock is a client-side guard, not a defence against
   someone who edits the page code in their own browser. 10. **The `network` block: proposal written, not decided** (fonts, a basemap allow-list, a mirrored DuckDB
   extension location; see section 7, "The network block"), so an offline or locked-down site works: its own later spec.

**Phase E: Explore and limits**
11. **Done (069, `specs/069-explore-site-settings/`):** the site-level `explore:` block (the keys already cascaded; `charts.default` now does too) and the
    constants the first pass missed, as `explore.limits` keys: `chart_rows`, `scatter_sample`, `histogram_bins`, `legend_series`, `distinct_values`, `pivot_rows`
    (ranges in `CONFIG-REFERENCE.md`). A separate app-level `limits:` block was not added: the limits are Explore panel keys. Column-summary sizes, label lengths and
    the query time limit stay fixed.

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
- **Theme is the viewer's.** Light, dark and system are available to every user, and the deployer does not set or lock the theme. By the
  same reasoning I have dropped deployer defaults for font and text size, and with them the `locked` setting decided earlier (shown
  disabled, with a reason). It can come back if something really needs locking. (Confirmed for font and text size too.)
- **A one-command local server** (`serve` / `here`, part of the core), in the manner of `simwrapper serve`.
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
- **Customisation:** **no custom CSS for now.** Colours, logos and fonts come through the brand file, which covers most visual needs;
  custom CSS is revisited once the app itself is stable. "Theme" means light, dark and system, chosen by the viewer. **No extensions.**
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
1. **Deployer project folder.** SimWrapper researched (it keeps dashboard YAML beside the data, which we are **not** adopting) and so
   was the vizTool. **Decided:** every scenario has a `dashboard-manifest.yaml` at the root of its folder. It holds the scenario's
   **provenance**, the **list of its raw files**, and, if we keep a pre-processing step after the model run, the **list of the summary
   files** too. File paths are written as a **file tree nested by folder**, relative to the manifest. It is generated and never
   hand-edited. There is no separate `manifest.yaml`. All dashboard setup, including each scenario's label, colour and description, is
   in `dashboard-config.yaml`, which lists the scenario folders; each folder's manifest guides the app to the rest. Paths in the config
   are relative to `dashboard-config.yaml`, so a folder can be moved or served from any URL.

   Sketch of the tree (illustrative, not final):

   ```yaml
   provenance:                    # facts the model run knows; first list, to refine
     model_version: "9.1"         # free text, shown to users as written: "9.1" or "WF-TDM 9.1" (vizTool's `modVersion`)
     scenario_group: baseline     # the dashboard's grouping of runs (today's `alternative`) unless the config overrides it
     year: 2023                   # the model year
     run_date: 2026-09-08
   raw:
     output:
       - trips.csv
       - households.csv
   summary:                       # only if the data path keeps a pre-processing step
     - trip_mode_share.parquet
   ```

   Entries are bare file names for now, and may become small mappings later without breaking the shape. **What the manifest says about
   each file (kind, table name, columns) is deferred until the full WFRC activity-based model run is available.** **Decided: the model
   run itself writes the manifest** (manifest generation is built into the model output), so it exists with or without a post-processor.
   **Decided placement of today's manifest fields:** `year` and `scenario_group` come from the manifest (facts the model run knows), and
   the config may override `scenario_group`; `kind`, `family`, `family_index`, `tag` and `hidden` live in the config (workflow and
   presentation); observed data waits for the observed-data decision. Each run also gets an `id` in the config (default: the folder
   name) that panels, the data views and a future shareable link use. `model_version` and `run_date` are manifest facts. The
   model and version also feed a future "which data am I looking at" display, and `check` can warn when a comparison mixes model
   versions. **Decided: the key is `scenario_group`** (WFRC's own term, vizTool's `scnGroup`), in both the manifest and the config. It is
   today's `alternative`; the old key is still read during migration. **No git commit or checksum in the provenance:** model outputs are not committed, so there is nothing for a hash to point at; the
   `model_version` is the traceable identity of the model that produced the run. **Decided: the provenance is minimal.** `model_version` (one
   free-text field, so a deployment writes "9.1" or "WF-TDM 9.1", whichever it wants users to read), `scenario_group`, `year` and
   `run_date`. There is no separate `model` (a deployment shows one model, and its title names it) and no `engine` (nothing uses it, and
   the statewide model will not use ActivitySim anyway); either can be added later if a real need appears. **Done 2026-10-28:** the code, the interface wording, the demo manifests, the tests and the docs all say "scenario group"; the old key is still read.
3. **Cascade rules.** Rules 3, 4 and 5 are decided (see above). Rules 1, 2, 6, 7 and 8 in section 3 have not been objected to; treat them
   as accepted unless that changes. Remaining: the first list of which keys are marked inheritable, per panel type, when it is built.
5. **Profiles.** Wanted in principle. Needs research on how they would work here and whether they would replace the demo build flag
   completely. Until then the demo flag decision stands.
6. **Variables** (Quarto's `_variables.yml`). Not enough known yet; research, then decide.

**Not yet discussed**
- **Versioning: decided.** `version: 1` stays in the file. There is **no backward compatibility** for now: the app has one user, so keys
  move without a migration and old `index.json` settings are simply dropped (this removes Phase B step 6). Revisit when a second
  deployment exists.
- **Secrets: decided.** The deployer's config never holds a secret. The assistant token and any API key are entered by the viewer for the
  session and kept in memory only, so nothing secret is deployed. The one exception to consider is a **referrer- or CORS-restricted map
  key** (for example a hosted Protomaps/PMTiles key limited to the site's domain): it is public by nature but useless elsewhere, so it
  may stay a config key. `check` should warn about anything that looks like an unrestricted key. The `network` block (self-hosted
  fonts and the like) is still to be designed.
- **Names: decided.** `snake_case` keys and nested `logo: { light, dark }` / `colors: {...}`, as drafted. Brand.yml's own names win where
  the brand file is read.
- **Per-scenario file listing: decided** (see the project-folder topic above). `dashboard-manifest.yaml` at each scenario's root replaces
  both `scenarios/index.json` and `summary/index.json`, and `manifest.yaml` is retired. Its per-file contents wait for the full WFRC
  model run. When it is built, the sentences in constitution Principle VII that mention `manifest.yaml` and `index.json` are updated.
- **A name to watch.** Three kinds of file now start with `dashboard-`: `dashboard-config.yaml`, the pages (`dashboard-*.yaml`) and
  `dashboard-manifest.yaml`. Nothing discovers files by that pattern any more (everything is listed explicitly), but a docs
  sentence, a script or a glob that says "all `dashboard-*.yaml`" would catch all three. The `check` command should recognise a file by
  its role, not by a pattern. If it ever causes confusion, renaming the pages is the cheaper change.
- **Compatibility: decided.** No notice or version bump is needed for Phase A; see Versioning above.

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
- **Docs links: decided.** A site-level `docs:` URL, and a per-page `header.docs` path appended to it, so each page can link to its own
  section of the documentation (`specs/067-viewer-settings/`).
- **Assistant block (Phase D, first half): scoped in `specs/068-assistant-config/`.** The network block waits for its own design. A deployer's `assistant.providers`
  list REPLACES the built-in providers when set (unset keeps today's); a listed provider's address is fixed in the form; no key or token key exists (key-like
  fields are reported, not read); each provider names its message format (`protocol`: `openai`, the default, or `anthropic`).
- **Explore settings (Phase E): built in `specs/069-explore-site-settings/`.** Limits live under `explore.limits` (one schema row each, one shared range table), the
  starting chart is `explore.charts.default`, and a panel's own value wins per key. Mistakes are reported at load and by `check`; a chart name that is not allowed is
  reported under the panel.
- **Hidden versus draft: hidden decided, draft deferred.** `hidden: true` is built in 067; `draft` waits for the profiles design and nothing is reserved for it. Original proposal: `hidden: true` leaves the page out of the sidebar but reachable by its link; `draft: true` leaves
  it out entirely in a production profile and shows it in a development profile (this ties to topic 5).
- **CSS: deferred** until the app is stable. When revisited, the supported surface would be the app's CSS variables (the tokens), not
  its class names.
- **Conditional pages** (SimWrapper's `triggerPattern`: a page appears only if a file exists). Not adopted: a deployer already chooses
  which pages exist, and a panel whose data a run lacks is skipped automatically. Revisit only if a real use case turns up.

### The network block (Phase D step 10): proposal, not decided

Why it exists: an agency behind a firewall, or one that must not send a viewer's browser to outside hosts, needs to know every outside call the app can make and be able to switch each off or move it inside. The audit (2026-10-29) found four kinds:

| Outside call | Where | Today |
|---|---|---|
| Interface fonts | the app's own fonts are bundled (`@fontsource`); the Appearance tab's font picker loads the chosen family from `fonts.googleapis.com` (`layout/settings/appearanceTab.tsx`) | a viewer's pick reaches Google |
| Basemap tiles and styles | the Basemap tab catalogue: UGRC, CARTO, OpenFreeMap, Protomaps and the raster dropdown (`public/basemap/leaflet-providers.json`, dozens of hosts) | any entry the viewer picks reaches its host; the default is blank without a PMTiles source |
| DuckDB extensions | `INSTALL spatial` (and the parquet extension on first use) fetch from `extensions.duckdb.org` (`panels/zoneGeometry.ts`) | one fixed outside fetch; no offline mode |
| Assistant providers | the Settings assistant | already controlled by `assistant.providers` (068), not part of this block |

Proposed keys (all optional, site-only, `snake_case`; unset means today's behaviour):

```yaml
network:
  fonts: bundled                       # bundled | any. bundled: the picker offers only the bundled families and never calls Google. any: today's behaviour (default)
  basemaps:
    allow: ["protomaps-*", "ugrc-*"]   # glob patterns on basemap ids; the Basemap tab lists only these, and `basemap.default` must match one
  duckdb_extensions: "https://mirror.example.org/duckdb"   # an http(s) address used as DuckDB's custom extension repository
```

Decisions needed (my recommendation first):

1. **Font picker when `fonts: bundled`.** Recommended: offer only the families that ship in the bundle, hide the rest, and say nothing else. Alternative: keep the list and let the pick fail silently (confusing).
2. **Basemap allow-list matching.** Recommended: glob patterns on the catalogue ids (`*` only, as for Explore tables), an empty or missing list means all, an id that matches nothing is reported by `check` and the app, and a viewer cannot add one. The raster provider dropdown is filtered the same way. Alternative: allow by host name (more precise for the raster catalogue, but ids are what a deployer sees).
3. **Extension mirror.** Recommended: one address, applied with DuckDB's `custom_extension_repository` before the first `INSTALL`, `http`/`https` only, reported if it is not; no per-extension override. A deployer hosts the files themselves (the follow-up in the project memory about self-hosting the parquet extension).
4. **A fully offline mode.** Recommended: not a key of its own. `fonts: bundled`, an `allow` list of self-hosted basemaps and a mirror together make it; `check` can list any remaining outside call it knows of. Alternative: an `offline: true` switch that implies all three.

What `check` would add: a basemap id in `allow` that is not in the catalogue, an `allow` list that excludes `basemap.default`, a mirror that is not `http`/`https`, and (when `offline` thinking is wanted) a summary of the outside hosts a configuration still reaches.

Out of scope for the first build: a content-security-policy header (that is the host's job, though the list of hosts could be generated), tile proxying, and a per-scenario data host.

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
