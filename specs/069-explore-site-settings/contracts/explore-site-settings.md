# Contract: Explore settings in dashboard-config.yaml

```yaml
explore:
  limits:
    chart_rows: 50000        # 100 to 1000000
    scatter_sample: 5000     # 100 to 100000
    histogram_bins: 12       # 2 to 100
    legend_series: 15        # 2 to 50
    distinct_values: 200     # 10 to 5000
    pivot_rows: 500          # 20 to 5000
    # existing: csv_rows, page_size, undo_steps, max_joins
  charts:
    default: line            # one of the allowed charts
```

- All keys are optional; unset means today's value.
- The same keys work on a page's and a panel's Explore options (the panel's own spelling is unchanged); a lower level wins per key.
- Cascade: `explore.limits.*` replace per key; `explore.charts.default` replaces.
- Not accepted: any key not listed (reported by path). No setting touches the SQL guard or the query time limit.
- Reported (never fatal): out-of-range number (nearest end used), non-number (default), unknown key, a default chart that is not allowed (first allowed used).
- The generated `project-docs/CONFIG-REFERENCE.md` and `dashboard-config.schema.json` list each key with its range and default.
- Notes on screen quote the number in force: the chart's "Showing the first N groups", the legend note, the pivot's "Showing the first N of M rows".
