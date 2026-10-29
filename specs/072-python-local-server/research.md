# Research: Run the dashboard locally from the Python library

## What exists today

- `python/wftdm_dashboard/cli.py` has `summarize` and `validate-observed` (click). `server.py`, `static/` and `templates/` do not exist; `.gitignore` already ignores `python/wftdm_dashboard/static/`; the Makefile `build` runs `npm run build` (Pages base path `/APP-wftdm-dashboard/`) and copies `dist/` over.
- Dependencies already declared: click, duckdb, flask, openmatrix, pyyaml. Python >=3.10. Ruff rules in `pyproject.toml`. Tests in `python/tests` (pytest).
- The app reads, relative to its base URL: `dashboard-config/dashboard-config.yaml` and the page files it lists; `scenarios/index.json` (a list of run names), then per run `scenarios/<run>/manifest.yaml` and `scenarios/<run>/summary/index.json` (a list of `*.parquet` names) and the Parquet files; `observed/manifest.yaml` and `observed/summary/index.json`; zone geometry at `geometry/<file>`; its own `basemap/leaflet-providers.json`. With the normal build (070) nothing under `demo-*` exists, and a missing site file gives the first-run screen. `summarize` writes `summary/*.parquet` and `manifest.yaml` but no `summary/index.json` or `scenarios/index.json`: those lists are what a static host cannot produce.
- `WFTDM_BASE=./ npx vite build` was spiked earlier (CONFIGURATION.md Phase A step 3): charts draw from a nested folder, the service worker scopes to that folder, the DuckDB worker needs the page-relative URL fix (done). The Playwright `firstrun` project already serves a normal build on a preview server.
- `npm run docs:config` (`scripts/gen-config-reference.ts`) writes `project-docs/CONFIG-REFERENCE.md` and `project-docs/dashboard-config.schema.json` from the schema table.

## Decisions

1. **Flask for the server.**
   Decision: an app factory `create_app(folder, *, serve_app, cors)`; files go out with `flask.send_file(path, conditional=True, mimetype=..., etag=True, max_age=0)`.
   Rationale: Flask is already a dependency (the architecture notes say "thin Python file server"); werkzeug's `send_file` with `conditional=True` answers `Range` with `206 Partial Content` and `Accept-Ranges`, and streams the file (memory does not grow with size), which is what DuckDB-WASM's range reads need. The test client covers every route without a socket.
   Alternatives: stdlib `http.server` (no range support, so a hand-written one); Starlette/uvicorn (new dependencies).

2. **Explicit content types.** A small map (`.wasm` `application/wasm`, `.parquet` and `.geoparquet` `application/octet-stream`, `.yaml`/`.yml` `text/yaml; charset=utf-8`, `.json`, `.js`, `.css`, `.svg`, fonts) with `mimetypes` as the fallback. On Windows `mimetypes` consults the registry, which is unreliable for exactly these types (a `.js` served as `text/plain` breaks module loading, `.wasm` without its type breaks streaming compile).

3. **No caching surprises.** Every response carries `Cache-Control: no-cache` (store, but revalidate each time) with the ETag/Last-Modified werkzeug adds, so an unchanged Parquet file is a cheap `304` and an edited page shows on a plain reload. The app's own hashed assets get the same header: simplicity over a few saved revalidations on a localhost server.

4. **One path rule, tested by itself.** `safe_path(root, rel)`: reject empty and NUL; reject any segment that is `..` or starts with `.`; on Windows reject `:` and backslash in the URL path (drive letters, alternate data streams); join and `resolve()`; require `resolved.is_relative_to(root.resolve())` (so a symbolic link out is refused); require a regular file. Flask decodes the URL once, so a double-encoded `..` is just a file name. Hidden segments are refused because a site folder is often a git checkout.
   Alternatives: `werkzeug.security.safe_join` alone (does not catch links or Windows alternate streams).

5. **Two folder layouts, one rule.** The URL `/dashboard-config/<p>` maps to `<folder>/dashboard-config/<p>` when that directory exists (the app's own `public/` layout, so `here public/` works), else to `<folder>/<p>` (flat layout: the site file and pages at the root, with `scenarios/`, `observed/`, `geometry/` beside them). `scenarios/`, `observed/`, `geometry/` map to the same-named folders.

6. **Generated lists only when absent.** `scenarios/index.json`: the names of subfolders of `<folder>/scenarios` that contain a `summary` folder or a `manifest.yaml`, sorted, as JSON; `…/summary/index.json`: the sorted `*.parquet` file names in that folder. A real file on disk always wins (a deployer who already publishes these keeps full control). Run order is the sort order (the deployer who needs another order writes `scenarios/index.json`).

7. **The schema reaches `init` as a packaged file.** `gen-config-reference.ts` also writes `python/wftdm_dashboard/templates/dashboard-config.schema.json`; it is committed like the reference, and a Vitest test fails when it differs from `project-docs/dashboard-config.schema.json`. `scaffold.starter_site_yaml(schema)` walks `properties` and prints each leaf as a commented `# path: description` (with the allowed values for an enum) under its parent keys, after the live lines `version: 1` and `pages:`. The file therefore validates as written (comments only), is neutral, and lists 100% of the settings of the version that wrote it.
   Alternatives: hand-copying the keys (goes stale, which the spec forbids); running the TypeScript generator at `init` time (needs Node).

8. **`init` references the schema by address.** The first line is `# yaml-language-server: $schema=https://raw.githubusercontent.com/WFRCAnalytics/APP-wftdm-dashboard/main/project-docs/dashboard-config.schema.json`. A deployer behind a firewall can copy the file and change the line; no second file is written (the spec lists two starter files).

9. **The starter page** is one markdown panel (a welcome and the next steps) so `here` shows a working page at once; it is checked in the quickstart with the app's own `npm run check` (a pytest cannot run the TypeScript core).

10. **Relative-base build as a Vite mode.** `vite.config.ts`: `base` is `./` in mode `package` (unless `WFTDM_BASE` is set); `npm run build:package` = `tsc --noEmit && vite build --mode package --outDir python/wftdm_dashboard/static --emptyOutDir`. A mode, not an environment variable, because the project is developed on Windows. Mode `package` is not `demo`, so the 070 flag stays off: no demo content. The Makefile `build` target calls it and no longer copies `dist/`.

11. **A missing bundle is a message, not a traceback.** `server.static_dir()` uses `importlib.resources`; if `index.html` is not there, `here` exits with: the app has not been built; run `make build` (or `npm run build:package`) in the repository.

12. **Port, browser, Host guard.** Default port 8050, then up to 20 higher ones (a requested `--port` is exact); the socket is bound before the browser is opened (`webbrowser.open`, skipped with `--no-browser` or on failure); with the default loopback bind a request whose `Host` header is not `localhost`, `127.0.0.1` or `[::1]` (any port) gets 400 (DNS-rebinding guard); `--host` other than loopback removes the guard and prints a warning that the folder is then visible to the network.

13. **No demo flag.** A normal build has no demo content (070), so a quick look would need a second bundle; not required by the spec, left out.

14. **`serve`.** The same factory with `serve_app=False` and CORS (`Access-Control-Allow-Origin: *`, exposed `Content-Range`, `Accept-Ranges`; `OPTIONS` answered; `Access-Control-Allow-Private-Network: true` for browsers that ask). The start message states the limits (a hosted https page may be blocked from a local http address; `here` always works).

15. **Wheel contents.** `uv_build` with `module-root = "python"`: the generated `static/` is gitignored; whether the wheel includes ignored files is checked in the plan's build task (`uv build` and list the wheel), with `source-include`/`wheel-include` settings added if needed.

## Risks

- The wheel may leave out the ignored `static/` folder (decision 15): a task builds and lists the wheel and adds the include setting if needed.
- The app's service worker registers with a relative scope under the relative base: verified once in the quickstart against `here` on two ports.
- `webbrowser.open` can fail silently on a headless machine: the address is always printed first.
