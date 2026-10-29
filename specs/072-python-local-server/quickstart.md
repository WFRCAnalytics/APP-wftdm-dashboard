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
