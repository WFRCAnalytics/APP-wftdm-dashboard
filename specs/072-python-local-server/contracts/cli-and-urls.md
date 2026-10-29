# Contract: the commands and the URLs

## Commands

```
wftdm-dashboard here  [FOLDER] [--port N] [--host H] [--no-browser]
wftdm-dashboard serve [FOLDER] [--port N] [--host H]
wftdm-dashboard init  [FOLDER]
```

### `here`

Starts the server, prints `Serving <folder> at http://127.0.0.1:<port>/ (Ctrl+C to stop)`, opens the browser (unless `--no-browser`), runs until interrupted. Never writes to the folder. With no site file it still starts and prints the `init` hint. With `--host` not loopback it prints that the folder is visible on the network.

### `serve`

Same server without the app, with cross-origin access. Prints the address and:

```
Some browsers block a secure (https) web page from reading a local http address
(mixed content, private network access). If the hosted app cannot read these files, use `wftdm-dashboard here`.
```

### `init`

Writes `dashboard-config.yaml` and `dashboard-1-overview.yaml` if missing; prints `wrote <file>` or `kept <file> (already there)` for each; exit 0. After writing it prints `Next: wftdm-dashboard here <folder>`; the app's own check is `npm run check -- <folder>` in the repository (not available in the library yet).

## URLs (served by `here`; `serve` serves the same without `/` and the app files)

See [data-model.md](../data-model.md) for the map. Every file answers `GET` and `HEAD`, with `Accept-Ranges: bytes`, `Cache-Control: no-cache` and the right type; a `Range` header gets `206`.

| Type | Content-Type |
|---|---|
| `.wasm` | `application/wasm` |
| `.parquet`, `.geoparquet` | `application/octet-stream` |
| `.yaml`, `.yml` | `text/yaml; charset=utf-8` |
| `.json` | `application/json` |
| `.js`, `.mjs` | `text/javascript; charset=utf-8` |
| `.css`, `.html`, `.svg`, fonts, images | the usual types |

## Refusals (404, never a file)

`..` segments, hidden segments, drive letters, alternate streams, NUL, absolute paths, symbolic links that resolve outside the folder, directories, and (with a loopback bind) a non-local `Host` header (400).

## Exit codes

0 on a normal stop or a finished `init`; 1 for a missing bundle or a taken `--port`; 2 for click usage errors.
