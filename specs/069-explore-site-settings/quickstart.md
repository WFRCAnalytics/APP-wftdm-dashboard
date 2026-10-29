# Quickstart: validating the Explore site settings

Prerequisites: `npm install`; the demo roots under `public/` are tracked.

## 1. Unit layer (no browser)

```
npx vitest run tests/unit/configExploreLimits.test.ts tests/unit/exploreOptions.test.ts tests/unit/configValidate.test.ts tests/unit/configCheck.test.ts tests/unit/configReference.test.ts tests/unit/configJsonSchema.test.ts
```

Expected: every limit has a default and a range that `options.ts` and the schema share; a number outside its range is pulled to the nearest end with a message; a non-number keeps the default; an unknown key under `explore.limits` is reported; site, page and panel values resolve per key with the panel winning; `charts.default` resolves site-wide and a disallowed one falls back; the chart query, legend and pivot take the caps and default to today's constants; the generated reference and JSON Schema match the table (`npm run docs:config`).

## 2. Nothing changes without the keys

`npm run dev`, open Explore. Expected: the same caps, sample, bins, legend, lists and starting chart as before; no config note.

## 3. A site-wide setting

In the demo's `dashboard-config.yaml` add `explore: { limits: { chart_rows: 200, legend_series: 3 }, charts: { default: line } }`. Reload, open Explore. Expected: a new chart tab starts as a line chart; a chart with more than 3 legend values says "first 3"; a chart with more than 200 groups says "first 200". Add `chart_rows: 300` to one Explore panel in a page file: that panel uses 300, others 200.

## 4. Mistakes

Add `chart_rows: 10`, `scatter_sample: lots`, `histogram_bins: 500`, an unknown `explore.limits.foo` and `charts.default: nonsense`. Reload: the app loads, each is listed with its path in the note, and `npm run check -- public/demo-dashboard-config` lists the same and exits 1.

## 5. Browser spec

```
npx playwright test --project=real tests/integration/exploreBuilderSite.spec.ts
```

Then the full run; compare with the known flakes in CLAUDE.md (re-run a failure with `--workers=1` first).
