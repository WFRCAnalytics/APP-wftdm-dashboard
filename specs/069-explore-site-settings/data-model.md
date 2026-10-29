# Data model: Explore settings for the whole site

## The limits table (`explore.limits.*`)

| YAML key | Code name | Default | Range | Where it applies |
|---|---|---|---|---|
| `csv_rows` | `csvRows` | 100 000 | 1 to 5 000 000 | CSV export (existing) |
| `page_size` | `pageSize` | none (fit the tile) | 5 to 200 | Data tab rows per page (existing) |
| `undo_steps` | `undoSteps` | 60 | 1 to 500 | undo depth (existing) |
| `max_joins` | `maxJoins` | 4 | 1 to 8 | query builder joins (existing) |
| `chart_rows` | `chartRows` | 50 000 | 100 to 1 000 000 | groups a chart may draw before truncating |
| `scatter_sample` | `scatterSample` | 5 000 | 100 to 100 000 | points a scatter plot samples |
| `histogram_bins` | `histogramBins` | 12 | 2 to 100 | bins of the histogram chart |
| `legend_series` | `legendSeries` | 15 | 2 to 50 | legend values drawn |
| `distinct_values` | `distinctValues` | 200 | 10 to 5 000 | values a filter list offers |
| `pivot_rows` | `pivotRows` | 500 | 20 to 5 000 | rows a pivot table draws |

All integers. A number outside its range is pulled to the nearest end with a message; a non-number is reported and the default stays. Unknown key under `explore.limits`: reported by path.

## Starting chart

`explore.charts.default`: a string, cascading as a scalar (panel over page over site). Must be one of the allowed charts; otherwise reported and the first allowed chart is used.

## Resolution order

For each limit: the panel's value, else the page's, else the site's, else the default. Each level is validated where it is written (site and page at load, a panel when it opens), so a bad value at one level does not hide a good one at another.

## Problem catalogue

| Situation | Reported at | Message gist | Result |
|---|---|---|---|
| number outside range | load (site/page) or panel open | `<key>: N is outside A to B, so M is used` | nearest end used |
| not a number | load or panel open | `<key>: expected a whole number` | default used |
| unknown key under `explore.limits` | load or panel open | `explore.limits.<k>: not a known setting` | ignored |
| default chart not allowed or unknown | panel open and `check` | `charts.default: "x" is not one of the allowed charts` | first allowed chart |
| default chart not a string | load | `explore.charts.default: expected text` | built-in default (bar) |
