# Quickstart: validating the Python commands

Prerequisites: `uv sync` (Python deps), `npm install` (to build the app once).

## 1. Python tests

```
uv run pytest python/tests -q
uv run ruff check python
```

Expected: the server tests (ranges, content types, path safety, generated lists, Host guard, CORS), the scaffold tests (never overwrites, every schema setting listed, valid YAML) and the CLI tests pass; ruff is clean.

## 2. Build the bundle into the package

```
npm run build:package
```

Expected: `python/wftdm_dashboard/static/index.html` exists, no `demo-*` folder inside it, and `grep -o 'base' ...` is not needed: the asset URLs in `index.html` are relative (`./assets/...`). `git status` shows nothing new (the folder is ignored).

## 3. `init` then `here`

```
uv run wftdm-dashboard init some-folder
uv run wftdm-dashboard here some-folder
```

Expected: `wrote dashboard-config.yaml`, `wrote dashboard-1-overview.yaml`; a second `init` prints `kept` twice; the browser opens and shows the starter page; `npm run check -- some-folder` reports no problem; the folder has only the two files (nothing written by `here`).

## 4. Runs and edits

Copy a run folder (a `summary/` of Parquet files and a `manifest.yaml`) into `some-folder/scenarios/<run>/` and list a chart page; reload: the run appears with no `index.json` written. Edit the page file and reload: the change shows. Start a second `here` at the same time: it prints the next free port and the app loads on both.

## 5. Safety

With `here` running, `curl --path-as-is "http://127.0.0.1:8050/scenarios/../../secret.txt"`, an encoded `..`, an absolute path and a link out of the folder all answer 404. `curl -H "Range: bytes=0-99"` on a Parquet file answers 206 with 100 bytes. A request with `Host: evil.example` answers 400.

## 6. `serve`

```
uv run wftdm-dashboard serve some-folder
```

Expected: the address and the limits message; a file fetched from a page of another origin arrives with `Access-Control-Allow-Origin: *`; `/` is not the app.

## 7. The wheel

```
uv build
```

Expected: the wheel lists `wftdm_dashboard/static/index.html` and `wftdm_dashboard/templates/dashboard-config.schema.json`; installed into a clean environment, `wftdm-dashboard here` works on a folder.

## Walked (2026-10-29, US1)

- Python: `uv run pytest python/tests -q` all pass (the two symbolic-link tests skip on Windows without the privilege); `uv run ruff check python` reports only the two findings that were already in `observed.py` (an import order and a complexity of 16).
- Bundle: `npm run build:package` writes `python/wftdm_dashboard/static/` (asset URLs start with `./`, no `demo-*`, git status clean: the folder is ignored).
- `here` on a scratch folder (the demo pages, three demo runs and the demo geometry copied in, every `index.json` removed): `scenarios/index.json` and each run's `summary/index.json` were generated; a `Range: bytes=0-99` on a Parquet file answered 206 with 100 bytes; `..`, `%2e%2e`, `..%2f..%2f` and `/dashboard-config/../` all answered 404; `Host: evil.example` answered 400; a POST answered 405.
- In a browser the app loaded and drew its charts (24 SVGs, no console error, no first-run screen) from `http://127.0.0.1:8061/` and from a second server on `8050`; an edit to a page title showed after a reload; no file was written to the folder. The page also requested `raw.githubusercontent.com` (the logo addresses in the demo site file) and `extensions.duckdb.org` (the DuckDB extension download).

## Walked (2026-10-29, US2 and US4)

- `init` into an empty scratch folder wrote `dashboard-config.yaml` and `dashboard-1-overview.yaml`; `npm run check -- <folder>` reported no problem (exit 0), and `check --explain` listed the outside hosts left. A second `init` printed `kept` twice and changed nothing. `here` on that folder showed the page "Overview" with the welcome text, no configuration note, no console error.
- The generated site file is 184 lines (every setting of this version, commented out). The pytest uncomments it and checks that its settings are exactly the schema's settings, none twice, none missing.
- `uv build` (after `npm run build:package`): the wheel holds `wftdm_dashboard/static/index.html`, the service worker, the assets and `wftdm_dashboard/templates/dashboard-config.schema.json`, with no `demo-*` entry. The gitignored `static/` folder IS included by `uv_build`, so no include setting was needed.
- The wheel installed into a clean virtual environment: `wftdm-dashboard init` and `wftdm-dashboard here --no-browser --port 8072` worked from it; the app loaded in a browser (page "Overview") and `scenarios/index.json` answered `[]` for the folder with no runs.

## Walked (2026-10-29, US3)

- `wftdm-dashboard serve <folder> --port 8082`: `/` answers 404 (no app); a file answers with `Access-Control-Allow-Origin: *` and the range headers exposed; the start message gives the address and the limits note (mixed content, private network access, use `here`).
- From a page served by a `here` on another port (another origin), a browser `fetch` read `scenarios/index.json` (the three runs) and a ranged Parquet request (`Range: bytes=0-3`) answered 206 with `Content-Range: bytes 0-3/1107` and the bytes `PAR1`.
- pytest: 201 pass (2 skipped symbolic-link tests on Windows); `ruff` is clean for everything this feature added.

