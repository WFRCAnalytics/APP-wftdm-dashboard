# Chart Builder (Explore v2) — research and proposal

Status: proposal / input to the speckit cycle (`specs/065-chart-builder/`). Branch `065-chart-builder`.
Replaces the Graphic Walker (GW) Explore tab with a built-in, grammar-of-graphics chart builder rendered by Observable
Plot and styled exactly like every other chart in the app. No code changes are part of this document.

Verification key: **[V]** verified from a primary source or the repo in the research session; **[U]** unverified, from
memory or inferred — each [U] is listed in section 12 as a spike to run before the plan relies on it.

---

## 1. Why replace Graphic Walker

- The panel needs heavy scaffolding to live in this app: a shadow-DOM style injector (`graphicWalkerShadowStyle.ts`), a
  theme-flip remount that exports and re-imports charts (`GraphicWalkerPanel.tsx`), an exact version pin (0.4.82, React
  peer-dep), and its own lazy chunk. [V]
- It sees one `$scenario`-unioned dataset at a time, chosen from a picker. There is no way to see what tables and columns
  exist, or to join them. This is the "I never get the data I want to check" complaint.
- Its look is its own, not the app's chart language (tooltip, palette, tile chrome, export).

Goal: a builder where the user (1) browses raw tables and columns, (2) defines the data they want with SQL or a UI query
builder, (3) drags columns onto encoding channels, and (4) gets a chart indistinguishable from the curated ones.

## 2. Product shape (decisions made with the user)

**Top bar:** `Scenario selector` → `Table selector` → tabs.
- The scenario and table selectors are a **raw-data browser**: they choose what the Data tab previews and what the
  "Use in query" action inserts. They do not define the charted data.
- Tabs: first is always **Data**, then **visualization tabs** and a **+** to add more (one viz tab exists initially).
  Tab state is session-only in memory (no localStorage — repo rule).

**Data tab**
- Paginated preview sized to the available height. Schema strip: column name + inferred type (nominal / ordinal /
  quantitative / temporal / geo / complex) next to the preview.
- A **SQL editor** and a **UI query builder** with two-way sync (section 6). Supports select columns, filter rows, join
  (keys + join type), union across scenarios (auto `scenario` column), group by + aggregates, sort, limit.
- Running a query previews it; **Save as…** makes a named temp relation (`TEMP VIEW` default, `TEMP TABLE` optional)
  listed under "My tables" (rename / delete).
- Selecting several scenarios and choosing "Use in query" inserts a `UNION ALL` with a `scenario` column so any encoding
  can compare scenarios.

**Visualization tabs**
- Each tab holds its own data source (a raw table or a "My table") and its own chart spec, so one tab can chart a join
  while another charts a raw table.
- Layout: left = field list of the tab's relation (name, type chip, draggable); centre = shelves (channels) + live chart;
  right/rail = Chart type, Style (text), Scales/Axes, Filters. Suggestion strip (section 7).
- Drag and drop via the already-installed `@dnd-kit`, with a keyboard/click "assign to channel" fallback (a11y).

**Export:** chart configuration as JSON (importable, recreates the chart *including its data source*), PNG, SVG, and CSV
of the charted data — the same Export menu the tiles use. **Import JSON** is supported.

**Text styling:** title, subtitle, source, note — **size and weight/italic only**. Font family and colours always come
from the app theme.

**Colour / shape / pattern:** palette from app tokens (colourblind-safe toggle respected). Hatch patterns are the
colour-independent alternative. Dash styles for lines, symbols for points, hatch for bars/areas/polygons.

**Chart types:** first list implemented now: bar (grouped, stacked, 100%), line, area (stacked), scatter, heatmap/cell,
histogram, box, pie/donut. Everything else is shown in the picker **disabled with "Coming soon" on hover** (density,
tick, text, rule, waffle, treemap, sunburst, radar, sankey, chord, maps, trail, errorbar…).

**Process:** speckit cycle (specify → clarify → plan → tasks) on this branch. Whether the old Explore tab is replaced or a
second Explore tab is added is decided at merge time.

## 3. Findings: existing tools

### Graphic Walker [V from primary source, WebFetch-summarised]
- Marks (`GEOM_TYPES`): auto, bar, line, area, trail, point, circle, tick, rect, arc, text, boxplot, table; geo: poi,
  choropleth. Pie = `arc` with theta/radius; heatmap = `rect`. Has an `observable-plot` renderer option as well as
  Vega-Lite.
- Channels (`DraggableFieldState`): rows, columns (axes **and** facets), color, opacity, size, shape, theta, radius,
  details, text, longitude, latitude, geoId, filters. Single-field limits on color/opacity/size/shape/theta/radius/text.
- Field model: `analyticType` dimension|measure; `semanticType` quantitative|nominal|ordinal|temporal; aggregators sum,
  count, max, min, mean, median, variance, stdev, distinctCount; per-field sort, timeUnit, computed (bin, log, dateDrill…).
- Filters: range, temporal range, one-of, not-in, regexp. Stack: none|stack|normalize|zero|center. Scale per channel
  (linear/log/pow/sqrt/symlog, domain, scheme).
- Suggestion: a **scored rule table** (`lib/autoViz/rules.ts`): dimension/measure count ranges + required type → score;
  ties by fixed order; pie deliberately low (35), line 92 with a temporal dim, scatter 93, bar 85.
- Spec: verbose `IChart` with generated field ids; a terse name-based spec + `normalize()` exists. **Pitfalls to avoid:**
  verbose ids, rows/columns mixing axes and facets, no dimension/measure enforcement per channel, `defaultAggregated`
  confusion.

### gropaul/dash-ui [V partial — column-selector, pie/radar views not read]
- 6 plot types: Line, Bar, Area, Scatter, Pie, Radar (ECharts). Searchable chart-type popover with icons.
- Model: x column, list of y columns, one group-by (disabled with >1 y), per-axis label/range/rotation/type, stacked flag.
  No size/shape/facet channels. Separates **re-query** changes (columns) from **view-only** changes (labels, range).
  Brushing a chart writes a filter back. **Copy:** that re-query vs view-only split, brush→filter, disabled-with-reason
  options. **Avoid:** thin model, single group-by.

### Superset / Metabase / Tableau [U — from memory]
Superset: Data vs Customize tabs, drop zones, Run query toggle, results pane under chart. Metabase: stacked "notebook"
steps with per-step preview, greyed-out incompatible visualizations, auto-visualization from result shape. Tableau:
shelves + Marks card, type-coloured pills with discrete↔continuous toggle, mark-type change keeps encodings, Show Me
greys out non-viable charts with a reason, swap axes, undo.

## 4. Spec format (Vega-Lite-shaped, terse, name-based)

Adopt Vega-Lite's shape [V channels/field props; K mark details], trimmed. One schema for the builder, JSON export/import
and dashboard YAML (`type: chart, kind: custom, spec: …`).

```json
{
  "version": 1,
  "data": { "relation": "trip_mode_share",
            "source": { "scenarios": ["a","b"], "sql": "SELECT … UNION ALL …" } },
  "mark": "bar",
  "encoding": {
    "x":     { "field": "purpose", "type": "nominal", "sort": "-y" },
    "y":     { "field": "trips", "type": "quantitative", "aggregate": "sum", "stack": "normalize" },
    "color": { "field": "mode", "type": "nominal" },
    "strokeDash": { "field": "scenario", "type": "nominal" },
    "shape": { "field": "scenario", "type": "nominal" },
    "pattern": { "field": "scenario", "type": "nominal" },
    "row": { "field": "income", "type": "ordinal" },
    "column": null, "size": null, "opacity": null, "order": null, "detail": null, "text": null
  },
  "filter": [{ "field": "year", "op": "=", "value": 2023 }],
  "scales": { "y": { "type": "linear", "zero": true, "domain": null }, "x": { "type": "band" } },
  "axes":   { "x": { "title": null, "labelAngle": -30 }, "y": { "format": "~s" } },
  "text": {
    "title":    { "text": "…", "size": "lg", "weight": "bold",   "italic": false },
    "subtitle": { "text": "…", "size": "md", "weight": "normal", "italic": false },
    "source":   { "text": "…", "size": "xs", "weight": "normal", "italic": true },
    "note":     { "text": "…", "size": "xs", "weight": "normal", "italic": false }
  }
}
```

Rules: field references by **column name**, never generated ids. `size` values are a small named scale (`xs|sm|md|lg|xl`)
mapped to theme font sizes — no free px, no families, no colours. `type` is one of nominal/ordinal/quantitative/temporal.
`aggregate`: sum, mean, median, min, max, count, distinct (+ percentile later). `bin`, `timeUnit` are per-channel. The
`data.source` block makes an exported file self-contained; import re-runs it. A JSON Schema ships with the spec and is
the validation source for import and YAML.

Dropped from Vega-Lite for v1: href, key, geo, polar channels (separate kinds), error channels, repeat/concat,
params/selections, `datum`.

## 5. Architecture fit

- **One new generic chart kind** (`src/charts/kinds/custom.ts`, name `custom`) taking the spec as config. Everything
  tile-level then works unchanged: tile chrome, Export menu (CSV/PNG/SVG, `exportTile.ts`), expand-to-dialog, tooltip
  (`services/tooltip.ts` via `armPlot`), `ChartTheme` tokens, legend slot, light/dark.
- **Gap to design:** `ChartKind` assumes per-run logical tables loaded through `ChartPanel`/`dataCache`/`adapt.ts` and
  compare/reference state. A builder chart's data is an **arbitrary relation** (SQL result). Two options for the plan:
  (A) a `relation` data path beside `loadChartData` (rows fetched by the builder's query, handed to the kind through
  `env.extra`); (B) a small `ChartPanel` variant. Recommend (A): the kind stays pure and never touches DuckDB (repo rule).
- **Compute in DuckDB.** Aggregation, binning, time units and filters are compiled to SQL against the relation; the
  browser only maps rows to marks. Row cap for raw points (e.g. 50k) with a visible notice. Plot transforms only for the
  tiny client-side remainder.
- **Where it lives:** `src/explore/` (builder shell, Data tab, viz tabs, shelves, field list), `src/charts/builder/`
  (spec types, validation, spec→SQL, spec→Plot compiler, suggestion rules, legends/patterns), a new panel type
  `explore-builder` in `panels/registry.tsx` (lazy), `state/exploreState.ts` (in-memory tabs, temp relations).
- **State:** tabs, specs, temp-relation catalog are plain in-memory module state (`state/*` pattern, no Web Storage).
  Temp relations die with the page; the JSON export is the persistence story.
- **Lazy loading:** the whole builder is one lazy chunk; no GW assets remain once it replaces Explore.
- **Dependencies:** none new for v1. Textarea behind a `<SqlEditor>` seam; CodeMirror 6 + `@codemirror/lang-sql` is a
  later lazy chunk (~50–80 KB gzip [U], measure) — a new dependency to flag at that time.

## 6. SQL layer (Data tab)

- **Execution:** only through `services/duckdb.ts` (one shared connection, Worker). Never a second connection.
- **Guard:** reuse `services/ai/sqlGuard.ts#authorize` [V]. It already refuses INSTALL/LOAD/ATTACH/COPY/SET/PRAGMA and
  remote URLs and, in `modify` mode, protects scenario/metric views. Add: `CREATE` targets must match a reserved prefix
  (e.g. `user_`), and `DROP` only of that prefix. A TEMP object of the same name would shadow an app view (temp schema is
  searched first) — the prefix rule prevents it.
- **Concurrency:** all queries share one connection; a long user query blocks panels. Serialize Data-tab runs behind a
  mutex, show a Cancel button wired to the existing `cancelRunning()` [V], and a client timeout (30–60 s). Tell the user
  when other work is in flight.
- **Preview/pagination:** wrap, never append: `SELECT * FROM (<sql>) AS q LIMIT n OFFSET m`. Total count is a second full
  execution, so compute on request. Warn when there is no `ORDER BY` (unstable paging). Reuse the
  `buildTableDrivenPageQuery` idea.
- **Types:** `DESCRIBE <query>` → column types; map DuckDB types to N/O/Q/T/geo/complex. Ordinal has no native type:
  default low-cardinality VARCHAR to nominal and let the user override (type chip). Integer ID-like columns
  (`*_id`, `*_code`, `taz`) default to nominal. Geometry detected by name/GeoParquet metadata. Nested types are excluded.
  Check `services/ai/catalog.ts` first — it may already carry per-column types.
- **Two-way sync:** builder → SQL by generating canonical text from a small query model. SQL → builder by
  `json_serialize_sql(sql)` (DuckDB's AST) and a pure `astToModel()` that returns `null` for anything outside the
  builder's grammar (CTE, window, subquery, UNION, CASE, complex expressions) → the builder greys out with "edited as
  SQL". Estimated 300–500 lines. The AST is internal and versioned with DuckDB: pin the version and unit-test fixture
  queries so an upgrade breaks a test, not the UI. **Fallback** if `json_serialize_sql` is unusable in WASM: one-way sync
  with a model-in-comment marker (`-- builder:v1 {…}`), re-imported only while the body equals the regenerated SQL.
  `json_serialize_sql` returns `{error:true,…}` for non-SELECT, which also gives free syntax errors with positions.
- **Temp relations:** `CREATE OR REPLACE TEMP VIEW "user_<name>"` default (lazy, re-reads Parquet); `TEMP TABLE`
  materializes into WASM memory — show size, warn above ~1M rows [U].

## 7. Chart-type suggestion

Both directions come from one **rule table shipped as data** (`charts/builder/rules.ts`), scored like GW's.

**Data → charts** (ranked; Q quantitative, N nominal, O ordinal, T temporal; lo ≤ ~12 values):

| Selection | Ranked |
|---|---|
| 1 Q | histogram, box, (density, tick — later) |
| 1 N/O | bar of counts (sorted); pie/donut only if lo |
| 1 T | line of counts, bar/area by time unit |
| N + Q | bar, (dot), pie/donut if lo and parts-of-whole, box if distribution |
| T + Q | line, area, bar if few periods |
| 2 Q | scatter, (density) |
| 2 N | heatmap cell of count, stacked/grouped bar |
| 2 N + Q | grouped bar, stacked (normalize if parts-of-whole), heatmap cell if hi×hi |
| N + T + Q | multi-line (colour N), stacked area, small multiples if > ~6 series |
| N + 2 Q | scatter coloured by N |
| 3 Q | scatter with size or colour on Q |
| 2 T/O + Q | heatmap cell (e.g. hour × day) |
| ≥ 4 columns | best 3 channels, extra N/O → facets, then shape/size |

Tie-breaks: position for the most important Q; avoid colour for > 8 categories (facet or sorted bar); pie only ≤ 6 slices
summing to 100%; stack only when the sum is meaningful, else group; log scale only above ~100× range.

**Chart → slots** (the inverse, used by "pick a chart first" and to grey out non-viable charts with a reason):

| Chart | Required | Optional |
|---|---|---|
| bar | N/O/T axis (or binned Q) + Q (or count) | colour (stack/group), facet, sort |
| line | x T/O/Q, y Q | colour, strokeDash, detail, shape, facet |
| area | x T/O/Q, y Q | colour (stack), normalize, facet |
| scatter | x Q, y Q | colour, size, shape, facet, text |
| histogram | x Q (binned) | colour, facet |
| box | Q + N/O | colour, facet |
| heatmap | x, y (N/O/T/binned Q) + colour Q | text |
| pie/donut | N + Q | — (≤ ~6 slices) |

UX: the chart picker greys out non-viable charts with a tooltip saying what they need ("needs 1 category and 1 number").
Changing the mark keeps the encodings (Tableau Marks-card behaviour). Not-yet-built charts are disabled with "Coming soon".

## 8. Observable Plot mapping and gaps

Plot 0.6.17 is installed [V package.json]. Mapping:

| Spec | Plot |
|---|---|
| bar | `barY/barX` (+ implicit stack; `stackY` offset normalize/center) |
| histogram | `rectY` with `binX` (or SQL-binned rows) |
| line / area | `line` / `areaY` (`z` or `stroke` for series) |
| scatter | `dot` (`symbol` channel for shape — native) |
| heatmap | `cell` / `rect` |
| box | `boxY/boxX` |
| row / column | `fy` / `fx` (native facets) |
| xOffset (grouped bars) | `fx` sub-facet or a nested band scale (no native xOffset) |
| title/subtitle/note | `title`/`subtitle`/`caption` options **or** app-drawn text so export matches tiles |
| pie/donut | not in Plot — `d3-shape`, as `donut.ts` already does |

**Real gaps (design for them):**
1. **Dash is not a Plot channel** — `strokeDasharray` is a constant [V]; there is no dash scale. Compile line series into
   one mark per series (each with its own dash) and draw our own legend swatches.
2. **No fill patterns / hatch.** Insert `<defs><pattern>` into the SVG and set `fill="url(#…)"` per series (via
   `className`/`render` hooks or one mark per series). Patterns are defined in the same SVG so PNG/SVG export works.
   Pattern colours come from tokens.
3. **Plot's legend covers colour/opacity/symbol only** [V]. Use the app's `ChartLegend` (`LegendSpec`) for everything,
   including dash and pattern — it already owns the tile legend row.
4. **Tooltips:** never Plot `tip`; mark `title: (_d,i) => 'wfa:'+i` + `armPlot(...)` per the chart-kind guide.
5. **Return type:** with title/subtitle/caption/legend Plot returns an `HTMLElement` figure, otherwise an SVG. Prefer
   drawing text ourselves so `exportTile.ts` sees one shape.
6. No dual axis, no native pie/radar/sankey — out of scope for v1.

Colour rule: no hard-coded colours; palette via `theme.cat(i)` / `chartColor.ts`; differences are never green/red.

## 9. UI / design language

Follow `wftdm-design-system` and `project-docs/redesign/` (Corridor Pro): existing tokens, shadcn primitives
(`components/ui/*`: tabs, select, dropdown-menu, popover, badge, button, tooltip, slider, switch), type scale and spacing
from the design system, light **and** dark verified.
- Field chips carry a type glyph (N/O/Q/T/geo) using neutral tokens; drop zones show accepted types; invalid drops
  explain why.
- Shelves = the channel list for the chosen chart (only channels that chart supports are shown, required ones marked).
- Per-chip popover: aggregate, bin/time unit, sort, type override (discrete↔continuous toggle).
- Re-query changes (fields, aggregates, filters) vs view-only changes (labels, axis format, text styling) are separated so
  view-only edits never hit DuckDB (from dash-ui).
- Controls: undo/redo, swap x/y, clear, duplicate tab.
- Brand rule: WFRC blue stays the one signature accent; chrome uses `brandColor`, data uses the data palette.

## 10. Phasing

1. **Foundations:** spec types + JSON Schema; relation data path; spec→SQL; spec→Plot compiler for bar/line/scatter; a
   fixed (non-draggable) channel form; `custom` kind in a tile via YAML. Proves the architecture and visual parity.
2. **Data tab:** pickers + preview + schema strip; SQL editor (textarea) through the guard; save temp relations;
   one-way builder.
3. **Builder shell:** viz tabs, field list, drag-and-drop shelves (+ keyboard), suggestions, remaining v1 charts
   (area, heatmap, histogram, box, pie/donut), facets, dash/symbol/pattern.
4. **Two-way SQL sync** (json_serialize_sql), filters/computed fields, reference lines, axis/scale options.
5. **Export/import** JSON + PNG/SVG/CSV; YAML `kind: custom`.
6. **Later:** CodeMirror editor, remaining chart types ("coming soon" list), brushing→filter.

## 11. Risks

| Risk | Mitigation |
|---|---|
| `json_serialize_sql` unavailable/needs extension fetch in WASM | spike first; fallback one-way sync (section 6) |
| AST schema changes with DuckDB upgrades | pin version, fixture unit tests |
| One connection: user SQL blocks panels | mutex, timeout, Cancel, in-flight notice |
| Shadowing/clobbering app views by temp names | reserved prefix enforced in the guard |
| Dash/hatch hacks diverge from Plot | one-mark-per-series compile, own legend, tests on SVG output |
| Large relations → slow Plot | SQL aggregation, row cap with notice |
| Drag-and-drop a11y | click/keyboard assign fallback from day one |
| Scope creep toward Tableau parity | v1 list fixed; rest "coming soon" |
| Export fidelity (patterns, fonts) | patterns in-SVG; fonts from theme; check PNG path in `exportTile.ts` |

## 12. Unverified items to spike before planning relies on them

1. `SELECT json_serialize_sql('select a from t where b>1')` in the live app: autoload network fetch? Round-trip on 5–10
   representative queries; exact error text for non-SELECT. (Wasm binary contains the function names [V]; running not
   verified.)
2. TEMP VIEW/TABLE behaviour on the shared connection in duckdb-wasm 1.32.0 [V version]; memory ceiling for TEMP TABLE.
3. Per-series dash and hatch compile in Plot 0.6.17 — element order and class names for patching.
4. Whether `services/ai/catalog.ts` already supplies column types (reuse vs duplicate).
5. dash-ui's `column-selector.tsx` / pie config (aggregation, pie value axis) — not read.
6. Effort estimate for `astToModel()` (300–500 lines is an estimate).

## 13. Sources

GW: github.com/Kanaries/graphic-walker (`interfaces.ts`, `config.ts`, `lib/autoViz/rules.ts`). dash-ui:
github.com/gropaul/dash-ui (`chart-type-selector.tsx`, `config-view-cartesian.tsx`, `relation-view-chart.ts`). Vega-Lite:
vega.github.io/vega-lite/docs/encoding.html. Plot: observablehq/plot docs (features/*, transforms/stack). DuckDB:
duckdb.org/docs/2.0/data/json/sql_to_and_from_json, duckdb.org/docs/current/clients/wasm/extensions. Repo:
`src/charts/types.ts`, `project-docs/redesign/09-chart-kind-guide.md`, `src/services/ai/sqlGuard.ts`,
`src/services/duckdb.ts`, `src/panels/GraphicWalkerPanel.tsx`, `public/demo-dashboard-config/dashboard-7-explore.yaml`.
