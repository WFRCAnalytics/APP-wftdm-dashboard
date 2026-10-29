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
