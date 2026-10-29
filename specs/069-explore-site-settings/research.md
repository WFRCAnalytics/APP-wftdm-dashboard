# Research: Explore settings for the whole site

## What the code does today

- `config/schema.ts` has `explore.limits` as one `map` row (`plainMap` check). The four limits are validated and clamped only in `explore/options.ts` when a panel opens, so a bad number in the site file surfaces under a panel title, and `check` finds it only through `panelCheck`.
- `explore/options.ts#withSiteDefaults` merges the site tree under the panel's keys by the schema's cascade rules. `charts.default` is not a schema row, so it is not cascaded and a site-level `explore.charts.default` would be an unknown key.
- Constants to turn into settings: `ROW_CAP` 50 000, `SCATTER_SAMPLE` 5 000 and `HIST_BINS` 12 (`charts/builder/specToSql.ts`), `MAX_SERIES` 15 (`compile.ts`), `MAX_ROWS` 500 (`pivotDraw.ts`), and the `LIMIT 200` / page size 200 in `explore/useDistinct.ts`.
- Not settings: `profile.ts` (`HIST_BINS` 12, `TOP_VALUES` 8, `LIMIT 200` for column summaries: Data-tab display), label truncation lengths, `MAX_CHIPS`, the 60 000 ms `RUN_TIMEOUT_MS` (a safety bound).

## Decisions

1. **One integer row per limit, with a `clean` hook that clamps.**
   Decision: replace the `explore.limits` map row by rows `explore.limits.csv_rows` ... `explore.limits.pivot_rows`, all `cascade: true`. The `clean` hook (added in 067) pulls an out-of-range number to its nearest end and reports it, which is what `options.ts` already does for a panel.
   Rationale: the reference, the JSON Schema, `validate` and `check` then list every key with its range and description (SC-004), and a bad site value is reported at load, not only when Explore opens. Cascade by leaf is equivalent to "maps merge per key".
   Alternatives: keep the map row and describe the keys in its text (not checkable, not in the JSON Schema per key); a new `limits:` block (the plan already decided the chart limits are Explore panel keys).

2. **Bounds in one pure module.** `src/config/exploreLimits.ts` holds, per limit, the YAML name, default and range. The schema rows and `options.ts` read it, so the two cannot drift (a unit test compares them).

3. **`explore.charts.default` is a plain string row.** `src/config` cannot import the chart list (it sits behind the `@/` alias). Whether the name is an allowed chart is already checked in `options.ts` (reported under the panel by the app and by `check` through `panelCheck`), and the first allowed chart is used. Cascade is a scalar replace.

4. **The chart core takes optional caps.** `chartQuery(..., caps)` and the compile/pivot options default to the existing constants; the Explore panel passes the resolved limits. The pure core never reads a store, and `kind: custom` tiles keep the defaults.

5. **Notes quote the number in force.** The truncation note in `ChartTabView.tsx` already builds its text from `ROW_CAP`; it reads the resolved value instead. The legend note ("first 15 values") gets the number from the draw result.

6. **Histogram bins affect the chart builder only.** Column-summary mini histograms keep 12 (Data-tab display).

7. **Nothing else loosens.** The raw-row scatter query, CSV export and distinct lists stay inside their maxima; the SQL guard and the time limit are not touched.
