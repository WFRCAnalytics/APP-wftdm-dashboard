# Contract: deployer options on the `explore-builder` panel

A deployer sets these keys on the panel in `dashboard-*.yaml`. Every key is optional. **An unset key behaves exactly as the
builder did before the key existed.** The options are plain YAML, so they work the same whichever tool publishes the
dashboard (the Python post-processor, an R package, or a hand-edited file); nothing here is language specific.

Code: `src/explore/options.ts` (`resolveExploreOptions`, defaults, table globs, number formats), read at
`src/explore/ExploreBuilderPanel.tsx`. Tests: `tests/unit/exploreOptions.test.ts`,
`tests/integration/exploreBuilderOptions.spec.ts`.

```yaml
- type: explore-builder
  title: Explore the Demo Data
  limits:
    csv_rows: 100000      # rows in a CSV download (1 to 5,000,000)
    page_size: 12         # fixed rows per page (5 to 200). Unset: as many as fit the tile
    undo_steps: 60        # undo history per session (1 to 500)
    max_joins: 4          # tables joined to the first (1 to 8)
  features:               # every one true unless set
    sql_tab: true         # the SQL view of the Query box (and so hand-written SQL)
    csv: true             # Download CSV on the table
    copy_sql: true        # Copy SQL on the table
    import_export: true   # the Import button and the chart Export button
    my_tables: true       # saving a result as a table, and the My tables list
    undo: true            # Undo and Redo buttons and shortcuts
  charts:
    allow: [bar, line, area, pie]   # chart types on offer, shown in the grid's own order. Unset: all nineteen
    default: bar                    # the type a new chart tab starts with (must be allowed)
  tables:
    include: [trips_*, persons]     # names or patterns (* only). Unset or empty: every table
    exclude: ["*_raw"]              # wins over include. Quote a pattern that starts with * (YAML reads a bare * as an alias)
  columns:                          # by column name
    trips: { label: Trips made, unit: trips, format: "#,##0" }
  presets:                          # starter charts: the JSON the Export button writes, as YAML
    - { version: 1, data: { relation: "t:trips", source: { scenarios: [], sql: "" } }, mark: bar, ... }
```

## Rules

- **A wrong value never stops the page.** The key keeps its default, the problem is listed under the panel title
  ("Explore settings were not all applied: ...") and in the console. A number outside its range is pulled to the nearest end.
  An unknown key is reported too, so a typo is visible.
- **`features` hides the control, it does not add a second lock.** `sql_tab: false` removes the only place a viewer can type
  SQL, so no hand-written statement reaches the database; everything the builder runs is still authorised by
  `sqlGuard.authorize` on the one shared connection. `features` is not an access-control system for data.
- **`tables` decides which names the builder offers** (source table, joins, chart sources). It is a display filter, not a
  security boundary: with `sql_tab` on, a viewer can still type a name that is not listed. To keep a table out of reach, leave
  it out of the dashboard's data or turn `sql_tab` off.
- **`charts.allow`** keeps the order of the grid, not the order written. The "coming soon" Map placeholder shows only when
  every chart is allowed. A chart that is open in a tab (for example an imported one) keeps its own type in the grid.
- **`columns.label`** replaces the column name in the Columns list, the table header, the field chips, the shelves, legend
  titles and tooltips. It never changes SQL, an exported configuration or a column's real name. `unit` shows beside it in the
  header and on the field chip. `format` formats numbers in the table: `#,##0`, `0.0`, `0%` (the value is a share, so 0.25
  shows 25%), `$#,##0`; text and nulls are left alone.
- **`presets`** adds a "Starter charts" button. Each preset is a chart configuration (the Export JSON). Its `data.source.scenarios`
  is ignored, so a starter applies to whatever scenarios are selected. A starter is named by its `name`, else its title,
  else its chart type. A starter that does not fit the loaded data shows the first problem under the chart controls.
