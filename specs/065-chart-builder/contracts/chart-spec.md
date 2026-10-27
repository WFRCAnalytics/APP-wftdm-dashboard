# Contract: Chart spec (`ChartSpec` v1)

One schema for the builder, the exported JSON configuration and `dashboard-*.yaml`. Validated by a JSON Schema
(`src/charts/builder/schema.ts`); import and YAML loading reject unknown keys with a path-qualified message.

## Shape

```json
{
  "version": 1,
  "data": {
    "relation": "xb_my_join",
    "source": { "scenarios": ["base-2023", "alt-a-2023"], "sql": "SELECT … UNION ALL SELECT …" }
  },
  "mark": "bar",
  "encoding": {
    "x":      { "field": "purpose", "type": "nominal", "sort": "-y" },
    "y":      { "field": "trips", "type": "quantitative", "aggregate": "sum", "stack": "normalize" },
    "color":  { "field": "mode", "type": "nominal" },
    "strokeDash": null, "shape": null, "pattern": null, "size": null, "opacity": null,
    "row": null, "column": null, "order": null, "detail": null, "text": null
  },
  "filter": [{ "field": "year", "op": "=", "value": 2023 }],
  "scales": { "y": { "type": "linear", "zero": true, "domain": null } },
  "axes":   { "x": { "title": null, "labelAngle": -30 }, "y": { "format": "~s" } },
  "refLines": [{ "axis": "y", "value": 0.5, "label": "Target" }],
  "text": {
    "title":    { "text": "Trips by purpose", "size": "lg", "weight": "bold",   "italic": false },
    "subtitle": { "text": "", "size": "md", "weight": "normal", "italic": false },
    "source":   { "text": "", "size": "xs", "weight": "normal", "italic": true },
    "note":     { "text": "", "size": "xs", "weight": "normal", "italic": false }
  },
  "layout": { "legend": true }
}
```

## Fields

- `mark`: `bar | line | area | scatter | heatmap | histogram | box | pie`. `pie` with `donut: true` in `layout` is the donut.
  Any other string is a schema error with the message "coming soon".
- `encoding.<channel>`: `null` or a **FieldDef**: `field` (required, except `aggregate: count`), `type`
  (`nominal|ordinal|quantitative|temporal`), `aggregate` (`sum|mean|median|min|max|count|distinct`), `bin`
  (`true` or `{maxbins}`), `timeUnit` (`year|quarter|month|week|day|hour`), `sort` (`ascending|descending|"-<channel>"|
  "<channel>"|null`), `stack` (`zero|normalize|center|null`, on the measure channel), `title`, `format`.
- Channels (13): `x y color strokeDash shape pattern size opacity row column order detail text`. Which channels a mark
  shows, requires and accepts is the table below (single source in `spec.ts`, used by the UI and by validation).
- `filter`: AND-list of `{field, op: = != < <= > >= in not-in between regex, value}`; applied in SQL.
- `scales.<x|y|color|size|opacity>`: `type` (`linear|log|sqrt|symlog|time|band`), `zero`, `domain`, `reverse`, `nice`.
  Colour palettes are never specified: they come from the app theme.
- `axes.<x|y>`: `title` (null hides), `format` (d3-format or date format), `labelAngle`, `grid`, `ticks`.
- `text.*.size`: `xs|sm|md|lg|xl` mapped to theme font sizes; `weight`: `normal|bold`; `italic`: boolean. **No font family,
  no colour, no free px.** Unknown keys fail validation.
- `data.relation`: relation id in the live session; `data.source` makes an exported file self-contained: on import the
  app re-creates the relation from `source` (scenarios must be loaded, else the import dialog lists the missing ones).
  In dashboard YAML `data.source.sql` may reference views with `$scenario`-style names only through the normal expander.

## Channel acceptance table

| Mark | Required | Optional |
|---|---|---|
| bar | x or y = nominal/ordinal/temporal/binned; the other = quantitative or count | color, pattern, row, column, order, text |
| line | x temporal/ordinal/quantitative; y quantitative | color, strokeDash, shape, detail, row, column, order |
| area | x temporal/ordinal/quantitative; y quantitative | color, pattern, row, column, order |
| scatter | x quantitative; y quantitative | color, shape, size, opacity, detail, text, row, column |
| histogram | x quantitative (binned) | color, pattern, row, column |
| box | y quantitative; x nominal/ordinal | color, pattern, row, column |
| heatmap | x, y nominal/ordinal/temporal/binned; color quantitative or count | text, row, column |
| pie | color or detail = nominal; size = quantitative (theta) | row, column |

## Validation rules (testable)

1. Every `field` exists in the relation's columns; `type` compatible with the column's effective type.
2. Required channels present for the mark; channels not allowed for the mark are rejected.
3. `aggregate` only on quantitative (or `count` on any); `stack` only with a categorical `color`.
4. `pie`: ≤ 12 slices (warning above 6), no negative values (error shown in the chart region, not thrown).
5. Colour channel with > 12 categories → warning "consider facets or a sorted bar" (non-blocking).
6. Round trip: `export(import(file))` is byte-identical after key ordering normalisation.
