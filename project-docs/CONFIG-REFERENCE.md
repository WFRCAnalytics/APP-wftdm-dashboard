# dashboard-config.yaml reference

<!-- Generated from src/config/schema.ts by `npm run docs:config`. Do not edit by hand. -->

File version: 1. Every key is optional; an unset key leaves the app's own behaviour. Keys are `snake_case`.
A wrong value is reported (in a note on the page and in the browser console) and the key keeps its default.

| Key | Type | Default | Cascade | Description |
|---|---|---|---|---|
| `version` | integer | `1` | site only | File version; a newer one than the app reads is reported. |
| `pages` | list of string | — | site only | Page files in display order; the first is the landing page. |
| `title` | string | — | site only | Dashboard title: the header text and the browser tab title. |
| `logo.light` | url | — | site only | Full logo shown when the navigation is expanded (light theme). |
| `logo.dark` | url | — | site only | Full logo for the dark theme. |
| `mark.light` | url | — | site only | Abbreviated logo shown when the navigation is collapsed (light theme). |
| `mark.dark` | url | — | site only | Abbreviated logo for the dark theme. |
| `colors.primary` | color | — | site only | Primary data colour (transit and the chart palette). |
| `colors.secondary` | color | — | site only | Secondary data colour (walking). |
| `colors.accent` | color | — | site only | Accent data colour (biking). |
| `colors.brand` | color | — | site only | Interface colour: selected pills, titles, tags and focus rings. |
| `scenario_palette` | list of color | — | site only | Default scenario colours, in order. |
| `vocab.modes` | list of values | — | site only | Travel modes: label, raw data ids and a mode colour token. |
| `vocab.purposes` | list of values | — | site only | Trip purposes: label and raw data ids. |
| `vocab.incomes` | list of values | — | site only | Income groups: label and raw data ids. |
| `vocab.autos` | list of values | — | site only | Auto-ownership groups: label and raw data ids. |
| `vocab.districts` | list of values | — | site only | District names for flow charts and the VMT hierarchy. |
| `metrics` | map | — | site only | Per-metric label, unit, decimals, scale and hidden overrides. |
| `units.trips.divisor` | number | — | site only | Divisor for trip counts in the time-of-day charts. |
| `units.trips.suffix` | string | — | site only | Suffix shown after a divided trip count. |
| `units.transit_share_max` | number | — | site only | Top of the transit-share map ramp. |
| `years.list` | list of values | — | site only | Model years in display order: a year, or { year, label }. |
| `years.base` | integer | — | site only | The base year. |
| `years.default` | integer | — | site only | The year shown first. |
| `compare.default` | `auto` | `on` | `off` | — | site only | Whether Compare starts on: auto turns it on with two or more independent scenarios. |
| `compare.scenarios` | list of string | — | site only | Scenario groups compared at first load (default: every loaded one). |
| `compare.focus` | string | — | site only | The focus scenario group. |
| `compare.reference` | string | — | site only | The reference: a scenario group id or `observed`. |
| `scenarios.warn_at` | integer | — | site only | Scenarios on at once above which the viewer sees a warning (default 8). |
| `scenarios.max_active` | integer | — | site only | The most scenarios that can be on at once, at startup and when a viewer turns one on (default 16). Browsers allow about 16 WebGL views, one per side-by-side map, so a larger value is accepted but reported with a warning. |
| `layout.mode` | `scroll` | `tabs` | — | page, panel (scalars replace, maps merge per key) | How pages are shown unless a page or the viewer says otherwise. |
| `export.footer` | boolean|string | — | page, panel (scalars replace, maps merge per key) | Line under exported images: true (source, scenarios, year, date), false (none) or your own text. |
| `assistant.enabled` | boolean | — | site only | Turns the AI assistant (button, panel and Settings tab) on or off. |
| `assistant.providers` | list of values | — | site only | The AI providers the assistant tab offers, replacing the built-in ones: id, label, base_url, models, needs_key, protocol (openai or anthropic). The address of a listed provider is fixed. |
| `assistant.default.provider` | string | — | site only | The provider the assistant tab starts on (an id from the offered providers). |
| `assistant.default.model` | string | — | site only | The model the assistant tab starts with (any model name). |
| `assistant.prompt_addendum` | string | — | site only | A short plain-text note added after the assistant’s instructions (for example: Our zones are called TAZs). At most 2000 characters; the viewer does not see it. |
| `assistant.limits.round_trips` | integer | — | site only | Steps the assistant may take to answer one question: 1 to 12 (default 6). |
| `assistant.limits.preview_rows` | integer | — | site only | Rows of a query result shown to the viewer: 100 to 5000 (default 1000). |
| `assistant.limits.model_rows` | integer | — | site only | Rows of a result shared with the model when the viewer shares results: 1 to 200 (default 50). |
| `docs.url` | url | — | site only | Address of the documentation site; sets a link at the foot of the left sidebar (none when unset). |
| `docs.label` | string | — | site only | Text of the documentation link (default: Documentation). |
| `header.docs` | string | — | page `header:` only | A page header key: a path appended to docs.url, so the sidebar link opens the section for that page. |
| `header.hidden` | boolean | — | page `header:` only | A page header key: true keeps the page out of the sidebar; it still opens at its address. The first page that is not hidden is the landing page. |
| `settings.tabs` | list of string | — | site only | Settings window tabs, in order: appearance, scenarios, basemap, assistant, documentation (default: all five). |
| `network.fonts` | `bundled` | `any` | — | site only | bundled: the Appearance tab offers only the fonts that ship with the app (the default and System UI) and no font is loaded from an outside host. any: today’s behaviour (default). |
| `network.basemaps.allow` | list of string | — | site only | Patterns (* is the only wildcard, letter case ignored) on basemap ids such as carto-positron, openfreemap-*, ugrc-vector-lite, protomaps-light or OpenStreetMap.Mapnik. The Basemap tab offers only matching entries and a default that does not match is replaced by the first allowed one. Empty or absent: every basemap is allowed. |
| `network.duckdb_extensions` | url | — | site only | One http or https address the database downloads its extensions (spatial, parquet) from, instead of DuckDB’s own host. The deployer hosts the files. |
| `basemap.default` | string | — | page, panel (scalars replace, maps merge per key) | Default basemap id (a tab or panel may choose its own). |
| `basemap.protomaps.pmtiles_url` | url | — | site only | A self-hosted PMTiles file for the Protomaps basemaps. |
| `basemap.protomaps.api_key` | string | — | site only | A hosted Protomaps key restricted to the site domain (never a secret token). |
| `explore.limits.csv_rows` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Rows a CSV export may hold. 1 to 5,000,000 (default 100,000). A panel or page may set its own; the lower level wins per key. |
| `explore.limits.page_size` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Rows per page in the Data tab (unset: as many as the tile is tall). 5 to 200. A panel or page may set its own; the lower level wins per key. |
| `explore.limits.undo_steps` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. How many changes can be undone. 1 to 500 (default 60). A panel or page may set its own; the lower level wins per key. |
| `explore.limits.max_joins` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Joins the query builder allows. 1 to 8 (default 4). A panel or page may set its own; the lower level wins per key. |
| `explore.limits.chart_rows` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Groups a chart may draw before it says it is cut. 100 to 1,000,000 (default 50,000). A panel or page may set its own; the lower level wins per key. |
| `explore.limits.scatter_sample` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Points a scatter plot samples. 100 to 100,000 (default 5,000). A panel or page may set its own; the lower level wins per key. |
| `explore.limits.histogram_bins` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Bins of the histogram chart. 2 to 100 (default 12). A panel or page may set its own; the lower level wins per key. |
| `explore.limits.legend_series` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Legend values drawn before the rest are cut. 2 to 50 (default 15). A panel or page may set its own; the lower level wins per key. |
| `explore.limits.distinct_values` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Values a filter list offers. 10 to 5,000 (default 200). A panel or page may set its own; the lower level wins per key. |
| `explore.limits.pivot_rows` | integer | — | page, panel (scalars replace, maps merge per key) | Explore builder limit. Rows a pivot table draws. 20 to 5,000 (default 500). A panel or page may set its own; the lower level wins per key. |
| `explore.features` | map | — | page, panel (scalars replace, maps merge per key) | Explore builder features switched on or off; maps merge per key. |
| `explore.charts.default` | string | — | page, panel (scalars replace, maps merge per key) | The chart type a new Explore chart tab starts with; it must be one of the allowed charts (otherwise the first allowed chart is used). A lower level replaces it. |
| `explore.charts.allow` | list of string | — | page, panel (a lower level replaces the list) | Chart types the builder offers; a lower level replaces the list. |
| `explore.tables.include` | list of string | — | page, panel (a lower level replaces the list) | Table name globs the builder may use; a lower level replaces the list. |
| `explore.tables.exclude` | list of string | — | page, panel (lower levels add to the list) | Table name globs the builder hides; lower levels add to the list. |
| `explore.columns` | map | — | page, panel (scalars replace, maps merge per key) | Column label, unit and format overrides; maps merge per key. |
| `explore.presets` | list of values | — | page, panel (lower levels add to the list) | Starter charts; lower levels add to the list. |
