# Research: Control the outside calls (the `network` block)

## What the code does today

- **Basemap resolution**: every map (flow map, zone map) calls `resolveEffectiveBasemap(panel, tab, viewerPick, siteDefault)` and gets the winner of panel, page (`_tabDefaultBasemap`), viewer pick, site `basemap.default`, then the app's own `APP_DEFAULT` (`openfreemap-positron`). The result is a `BasemapSelection`: a name (a built-in preset, a Protomaps flavour, a raster provider such as `Esri.WorldImagery` or `OpenStreetMap.Mapnik`) or a `{ layers: [...] }` composition (an authoring escape hatch). `loadBasemapStyle` turns it into a style; an unknown or unconfigured name falls back to the blank style.
- **Viewer choices**: the Basemap tab picks names only (`state/basemapState.ts` is typed as a plain name): built-in presets (`listBuiltInPresetNames`), Protomaps flavours, and the curated raster dropdown (`listCuratedRasterProviders`, from `public/basemap/leaflet-providers.json`). A viewer cannot enter a URL or a composition.
- **Fonts**: `appearanceTab.tsx` has four cards (Schibsted Grotesk, the bundled default; Geist and IBM Plex Sans, from Google; System UI), custom-font inputs and a shortlist (any Google font), and an effect that loads two Google preview fonts whenever the tab opens. `state/fontPreferenceState.ts` holds the viewer's pick in memory.
- **Extensions**: `panels/zoneGeometry.ts#ensureSpatialExtensionLoaded` runs `INSTALL spatial` and `LOAD spatial` through `services/duckdb.ts#query` (the app's own path). The parquet reader autoloads on first use. `sqlGuard` refuses `INSTALL`, `LOAD`, `SET` and the like in user SQL (assistant and Explore SQL tab); the guard is applied by those runners, not by `query()`.
- **`check`**: reads one folder; `explain()` prints cascading settings per page; the Explore panel check is passed in as `panelCheck`.

## Decisions

1. **The allow-list is enforced in `resolveEffectiveBasemap`, plus the Basemap tab's lists.**
   Decision: after the cascade picks a winner, `basemapPolicy.apply(selection)` returns it when allowed, else the first allowed catalogue entry (catalogue order: built-in presets, Protomaps flavours, raster providers), else the blank background (a reserved selection that `loadBasemapStyle` already treats as the blank style). Each distinct replacement is reported once through `addProblems` (key path `basemap.default` or the panel), deduplicated by selection.
   Rationale: it is the one function every map goes through, so no map can bypass the list, and the app default, the site default, a page or panel default and a stale viewer pick are all handled the same way (FR-005, edge case on a stale pick).
   Alternatives: filter at each map component (two copies, easy to miss); only filter the tab (the app default would still call out).

2. **Catalogue ids.** Built-in preset names, the Protomaps flavour names, and the curated raster providers as `Provider` (no variants) or `Provider.Variant`. A pattern list is matched case-insensitively with `*` only, the same escaping rule as Explore's `tableAllowed` (reuse the idea in a pure `src/config/network.ts#matchesAny`, not the Explore module).

3. **Deployer-authored compositions and style URLs are not blocked.** A panel's `basemap: { layers: [...] }`, or a full `https://` style URL, is a deployer's own explicit YAML, not a viewer choice; blocking it would make a self-hosted style unusable (a self-hosted style is exactly what an offline site wants). `check --explain` lists their hosts so nothing is hidden. Only catalogue names are subject to the list.
   Alternative: block everything not matching (would need a way to allow a self-hosted style, i.e. an id for it; too much for the first build).

4. **Blank background when nothing matches.** The existing blank style makes zero requests. This is reported (a list that matches no catalogue entry is itself a mistake, and `check` says so).

5. **Matching nothing is a mistake only against a known catalogue.** `unmatchedPatterns(patterns, ids)` returns each pattern that matches none of the ids. The app knows the built-in and Protomaps ids at boot and the raster ones after the provider file is read; to avoid a false report before it loads, the app reports an unmatched pattern only after the catalogue is loaded (the Basemap tab loads it; `check` reads the file). Documented as informational in the note; `check` is the authoritative place.

6. **Fonts: hide, not disable.** With `bundled`, the cards for Geist and IBM Plex Sans, the custom inputs and the shortlist are not rendered, the preview effect does not run, and `setFont` refuses any family other than the default and System UI. A session preference already holding a hidden family is ignored when applied.

7. **The extension setting is one `SET` on the app's connection.** `services/duckdb.ts#setExtensionRepository(url)` runs `SET custom_extension_repository = '<escaped url>'` through the same connection, and `main.tsx` loads the site first and calls it before `discoverScenarios()` so it precedes any extension use. The value is escaped (single quotes doubled) and must pass the `http`/`https` check first. `sqlGuard` is untouched; `query()` is the app's internal path, so the assistant and the Explore tab remain unable to `SET`. DuckDB-WASM honours `custom_extension_repository` (the follow-up already recorded in the project notes); a Playwright check with a routed host confirms the request goes there.

8. **Hosts for `check --explain`.** The pure `outsideHosts` takes a catalogue of `{ id, hosts[] }` (the script derives hosts with `new URL` from preset URLs, composition layers and the provider file's tile templates), the settings, and the deployer's authored compositions/URLs found in pages, and returns a sorted unique list with a reason. Fonts not bundled add `fonts.googleapis.com`; no extension address adds `extensions.duckdb.org`. Information only; the exit code depends on real problems.

9. **No schema `default`.** As in 069, `validate` copies a row default into the settings; none of these rows needs one (unset means today's behaviour), so the defaults are in the descriptions.

## Risks

- DuckDB-WASM and `custom_extension_repository` for the parquet autoload: verified by a routed request in the browser test; if the autoload ignores it, only the spatial install is covered and the docs say so.
- The raster catalogue loads asynchronously; the policy treats raster ids as unknown until loaded and, for a pattern list that only names raster providers, the first allowed fallback waits for the catalogue (the app default is a built-in, so a list that names none of the built-ins and some raster providers briefly shows the blank background until the catalogue arrives).
- A map drawn before `configureBasemapPolicy` runs would see no list: `main.tsx` configures it before rendering, with the other site settings.
