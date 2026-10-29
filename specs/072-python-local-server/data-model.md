# Data model: Run the dashboard locally from the Python library

## Folder layouts

**Flat** (the default): the folder given to the command.

```text
<folder>/
├── dashboard-config.yaml        # the site file
├── dashboard-1-overview.yaml    # the pages it lists
├── scenarios/<run>/             # one folder per run
│   ├── manifest.yaml
│   └── summary/*.parquet        # (summary/index.json optional)
├── observed/                    # optional: manifest.yaml, summary/*.parquet, summary/index.json
└── geometry/                    # optional: zone and rail GeoParquet files
```

**Public** (when `<folder>/dashboard-config/` exists, the app's own `public/` layout): `dashboard-config/` holds the site file and pages; `scenarios/`, `observed/`, `geometry/` as above. `here public/` works unchanged.

## URL map

| URL | Source | Notes |
|---|---|---|
| `/` and the app's own files (`index.html`, `assets/*`, `basemap/*`, the service worker) | the embedded `static/` | `here` only |
| `/dashboard-config/<path>` | `<folder>/dashboard-config/<path>` if that directory exists, else `<folder>/<path>` | the site file and pages |
| `/scenarios/index.json` | the file if present, else generated | sorted names of subfolders of `scenarios/` that have `summary/` or `manifest.yaml` |
| `/scenarios/<run>/summary/index.json` | the file if present, else generated | sorted `*.parquet` names |
| `/scenarios/<path>`, `/observed/<path>`, `/geometry/<path>` | the same path in the folder | |
| anything else | 404 | |

## Rules

- Only regular files inside the folder (or the bundle) are served; a path with `..`, a hidden segment (starting with `.`), a drive letter or alternate stream, a NUL, or one that resolves outside the folder (including through a link) gets 404.
- Only `GET`, `HEAD` (and `OPTIONS` for `serve`); no route writes.
- Every response: `Cache-Control: no-cache`, the right content type, `Accept-Ranges: bytes`; a `Range` request gets `206` with `Content-Range`.
- A request whose `Host` is not local, with the default loopback bind, gets 400.
- `serve` adds `Access-Control-Allow-Origin: *` (and the exposed range headers) and does not serve the app.

## Starter files (`init`)

| File | Content | Written when |
|---|---|---|
| `dashboard-config.yaml` | the schema line; `version: 1`; `pages:` with the starter page; every setting as a comment with its description (and allowed values), grouped by parent key | missing |
| `dashboard-1-overview.yaml` | `header` (tab, title) and one markdown panel: a welcome and the next steps | missing |

Output lines: `wrote <file>` or `kept <file> (already there)`; exit 0 either way.

## Commands

| Command | Arguments | Options |
|---|---|---|
| `here` | `[FOLDER]` (default `.`) | `--port` (exact; default 8050 then next free), `--host` (default 127.0.0.1), `--no-browser` |
| `serve` | `[FOLDER]` (default `.`) | `--port`, `--host` |
| `init` | `[FOLDER]` (default `.`; created if missing) | none |

## Problems and messages

| Situation | Message |
|---|---|
| the bundle is missing | `The dashboard app has not been built into this package. In the repository run: make build (or npm run build:package).` exit 1 |
| the folder does not exist | click's own path error |
| no site file | printed hint: `No dashboard-config.yaml found in <folder>. Create one with: wftdm-dashboard init <folder>`; the server still starts |
| `--port` is taken | `Port N is already in use.` exit 1 |
| `--host` is not loopback | warning that the folder is visible on the network |
