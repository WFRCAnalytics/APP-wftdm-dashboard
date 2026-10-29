# Contract: dashboard-config.yaml

The authored site file, beside the page files (`public/dashboard-config/dashboard-config.yaml`). Every key is optional; an unset key leaves today's behaviour. Keys are `snake_case`. The generated `project-docs/CONFIG-REFERENCE.md` is the full per-key reference; this contract fixes the shape.

```yaml
version: 1                       # integer; missing = current; higher than the app supports = reported

pages:                           # ordered list of page files; the first is the landing page
  - dashboard-1-summary.yaml
  - dashboard-2-person-household.yaml

title: Calibration Dashboard
logo: { light: logos/full.png, dark: logos/full-white.png }     # URLs; either may be omitted
mark: { light: logos/mark.png, dark: logos/mark-white.png }
colors: { primary: "#2457D6", secondary: "#D98A00", accent: "#7A4FD8", brand: "#1F4E79" }   # CSS colours
scenario_palette: ["#2457D6", "#D98A00"]

vocab:   { modes: [], purposes: [], incomes: [], autos: [], districts: [] }   # entry: { label, ids?, color? } (as charts/vocab.ts)
metrics: {}                                                                    # per-metric label/unit/decimals/scale overrides
units:   { trips: { divisor: 1000, suffix: k }, transit_share_max: 0.4 }
years:   { list: [2023, 2050], base: 2023, default: 2023 }                     # list entries: a year, or { year, label }
compare: { default: auto, scenarios: [], focus: ~, reference: ~ }              # default: auto | on | off
layout:  { mode: tabs }                                                        # scroll | tabs; cascades to pages
export:  { footer: true }                                                      # true | false | "text"; cascades to pages
assistant: { enabled: true }
basemap:
  protomaps: { pmtiles_url: basemap/region.pmtiles, api_key: "" }              # api_key: a domain-restricted hosted key only
```

## Behaviour

- **Unknown key**: reported (`unknown_key`) with its path; ignored.
- **Wrong type or value**: reported (`wrong_type` / `invalid_value`); the key keeps its default.
- **Site-only key on a page or panel**: reported (`not_allowed_here`); the site value is used.
- **Old camelCase keys** (`logoUrl`, `scenarioPalette`, ...): unknown keys, reported.
- **No token keys**: nothing in this file holds a secret; the assistant token is viewer-entered and session-only.

## Cascade (site → page → panel)

| Path | Cascades | List merge |
|---|---|---|
| `layout.mode` | yes | n/a |
| `basemap.default` | yes | n/a |
| `export.footer` | yes | n/a |
| `explore.charts.allow`, `explore.tables.include` | yes | replace |
| `explore.tables.exclude`, `explore.presets` | yes | concat, higher level first |
| `explore.limits.*`, `explore.features.*`, `explore.columns` | yes | maps merge per key |
| everything else | no (site-only) | n/a |

Existing page and panel spellings map onto these paths without new syntax: `header.layout_mode`, a tab's or panel's `default_basemap`, and a panel's Explore option keys.

## Unchanged

`scenarios/index.json` (generated listing), `dashboard-*.yaml` page files and their `header:`, `summarize.yaml`, `manifest.yaml`.
