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
| `layout.mode` | `scroll` | `tabs` | — | page, panel (scalars replace, maps merge per key) | How pages are shown unless a page or the viewer says otherwise. |
| `export.footer` | boolean|string | — | page, panel (scalars replace, maps merge per key) | Line under exported images: true (source, scenarios, year, date), false (none) or your own text. |
| `assistant.enabled` | boolean | — | site only | Turns the AI assistant (button, panel and Settings tab) on or off. |
| `docs.url` | url | — | site only | Address of the documentation site; sets a link at the foot of the left sidebar (none when unset). |
| `docs.label` | string | — | site only | Text of the documentation link (default: Documentation). |
| `header.docs` | string | — | page `header:` only | A page header key: a path appended to docs.url, so the sidebar link opens the section for that page. |
| `basemap.default` | string | — | page, panel (scalars replace, maps merge per key) | Default basemap id (a tab or panel may choose its own). |
| `basemap.protomaps.pmtiles_url` | url | — | site only | A self-hosted PMTiles file for the Protomaps basemaps. |
| `basemap.protomaps.api_key` | string | — | site only | A hosted Protomaps key restricted to the site domain (never a secret token). |
| `explore.limits` | map | — | page, panel (scalars replace, maps merge per key) | Explore builder limits (csv_rows, page_size, undo_steps, max_joins); maps merge per key. |
| `explore.features` | map | — | page, panel (scalars replace, maps merge per key) | Explore builder features switched on or off; maps merge per key. |
| `explore.charts.allow` | list of string | — | page, panel (a lower level replaces the list) | Chart types the builder offers; a lower level replaces the list. |
| `explore.tables.include` | list of string | — | page, panel (a lower level replaces the list) | Table name globs the builder may use; a lower level replaces the list. |
| `explore.tables.exclude` | list of string | — | page, panel (lower levels add to the list) | Table name globs the builder hides; lower levels add to the list. |
| `explore.columns` | map | — | page, panel (scalars replace, maps merge per key) | Column label, unit and format overrides; maps merge per key. |
| `explore.presets` | list of values | — | page, panel (lower levels add to the list) | Starter charts; lower levels add to the list. |
