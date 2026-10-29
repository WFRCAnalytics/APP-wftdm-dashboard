# Quickstart: validating the network block

Prerequisites: `npm install`; the demo folders under `public/` are tracked.

## 1. Unit layer

```
npx vitest run tests/unit/configNetwork.test.ts tests/unit/basemapPolicy.test.ts tests/unit/networkPolicy.test.ts tests/unit/resolveEffectiveBasemap.test.ts tests/unit/configValidate.test.ts tests/unit/configCheck.test.ts tests/unit/configReference.test.ts tests/unit/configJsonSchema.test.ts
```

Expected: patterns match as written, the fallback and the blank background follow the rules, a bad value is reported and ignored, the fonts filter holds, and the generated reference and JSON Schema match the table (`npm run docs:config`).

## 2. Nothing changes without the keys

`npm run dev`, open Settings. Expected: the Basemap tab lists everything, the Appearance tab four font cards and the custom inputs; a map uses `openfreemap-positron`; no configuration note.

## 3. Basemaps

In the demo site file add `network: { basemaps: { allow: ["ugrc-vector-lite", "protomaps-*"] } }`. Open a map page and Settings, Basemap. Expected: only those entries (and no raster dropdown entry); the map uses `ugrc-vector-lite` (the first allowed, the app default is not on the list) and the configuration note says the default was replaced; the network log has no request to `openfreemap.org` or `cartocdn.com`.

## 4. Fonts

Add `network: { fonts: bundled }`. Open Settings, Appearance. Expected: two cards, no custom inputs, no request to `fonts.googleapis.com`.

## 5. Extensions

Add `network: { duckdb_extensions: "http://127.0.0.1:9999/duckdb" }` (or route that address in the browser spec). Open a zone map. Expected: the extension request goes to that address and not to `extensions.duckdb.org`.

## 6. Mistakes and `--explain`

Add `fonts: sideways`, an allow-list of `["nope-*"]`, and an extension address of `ftp://x`. Reload: the app loads and each is listed with its path; `npm run check -- public/demo-dashboard-config` lists the same and exits 1. `npm run check -- <folder> --explain` on a clean site ends with the list of outside hosts left.

## 7. Browser spec

```
npx playwright test --project=chromium tests/integration/networkBlock.spec.ts
```

Then the full run; compare with the known flakes in CLAUDE.md (re-run a failure with `--workers=1` first).

## Checked so far (2026-10-29, US1 to US3)

- Extension address: with `network.duckdb_extensions` set to a routed address, the app requested `<address>/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm` (the parquet autoload, not only the spatial install) and made no request to `extensions.duckdb.org`. Without it, the request goes to DuckDB's host as before.
- Boot order: the site file is now read before the runs are discovered (the mirror must be set before the first Parquet read); `boot`, `zonemapPanel`, `assistantConfig`, `exploreBuilderSite` and `firstRun` specs pass.
- `npm run check -- public/demo-dashboard-config --explain` (no network keys): ends with the outside-hosts block, one line per host (Google Fonts, DuckDB's extension host, and every catalogue host such as `basemaps.cartocdn.com  allowed basemaps carto-positron, carto-dark-matter, carto-voyager`); exit 0.
- A scratch site with `fonts: bundled`, an extension address, an allow-list of `protomaps-*` and `basemap.default: protomaps-light`: `--explain` ends with `no outside host is known`; exit 0.
- A scratch site with `fonts: sideways`, `duckdb_extensions: "ftp://x"` and an allow-list of `["nope-*", "protomaps-*"]`: four problems with their paths (the font mode, the address, the pattern that matches nothing, and the app default replaced by `protomaps-light`); exit 1.


## Walked (2026-10-29)

- Unit layer: 115 files, 1523 tests pass. `npm run check` on the demo folder is clean; the `--explain` and mistake walks are recorded above.
- Browser spec `networkBlock.spec.ts` (9 cases): no keys, an allow-list (tab, default replaced, no other basemap host, note), a raster pattern, a list that matches nothing, fonts bundled and not, the extension address (parquet autoload and nothing to DuckDB's host) and without it, and the mistakes.
- Full Playwright run (655 tests): 646 passed, 9 failed. `realDemo.spec.ts:19` and `:39` (pre-existing) and `chartMaps.spec.ts:95` and `:189` (known flaky) are the baseline. `observablePlotPanel:403` and `:642`, `panelExpand:314`, `pieChartPanel:122` and `layoutExport:66` passed when re-run alone (load flakes; a second dev server was running during the full run).
