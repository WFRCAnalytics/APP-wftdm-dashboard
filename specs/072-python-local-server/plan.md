# Implementation Plan: Run the dashboard locally from the Python library (`here`, `init`, `serve`)

**Branch**: `072-python-local-server` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/072-python-local-server/spec.md`

## Summary

Three new `wftdm-dashboard` commands and the build that makes them work:

- **`here [FOLDER]`**: a small read-only file server (`python/wftdm_dashboard/server.py`, Flask, which is already a dependency) that serves the embedded app at `/` and maps the user's folder onto the URLs the app already reads: `dashboard-config/` (the site file and its pages), `scenarios/` (runs), `observed/` and `geometry/`. The two small JSON lists the app needs and a static host cannot produce (`scenarios/index.json`, and each run's `summary/index.json`) are generated on the fly when the folder does not have them. Range requests, explicit content types, `Cache-Control: no-cache` (the browser revalidates, so an edit shows on reload) and a strict path rule (resolve, then require the result to be inside the folder; refuse hidden segments, drive letters and links out) are in one function each and tested one by one.
- **`init [FOLDER]`**: `python/wftdm_dashboard/scaffold.py` writes a starter `dashboard-config.yaml` and one starter page, only if missing. The site file is generated from the JSON Schema that `npm run docs:config` already writes: that file is also written into the package (`templates/dashboard-config.schema.json`) so the starter lists every setting with its description, commented out, and never goes stale (a Vitest check keeps the two copies equal).
- **`serve [FOLDER]`**: the same app object without the embedded app and with CORS on, plus a printed note on the limits with a hosted secure page.
- **Build**: a new Vite mode `package` builds the normal app (no demo, `base: './'`) straight into `python/wftdm_dashboard/static/` (`npm run build:package`); the Makefile `build` target calls it; the folder stays gitignored. A `uv build` check confirms the wheel contains it.

No app logic enters Python (Principle X): the server lists folders and serves bytes; the app reads, checks and draws. `check` is not built (needs the TypeScript core); `init --scenario-dir` (the model-repository scaffold) is deferred and the docs say so.

## Technical Context

**Language/Version**: Python >=3.10 (library), TypeScript/Vite (the build mode only)

**Primary Dependencies**: existing only: click, flask (werkzeug), pyyaml; stdlib `mimetypes`, `webbrowser`, `socket`, `importlib.resources`. No new dependency.

**Storage**: none (the server never writes; `init` writes only the starter files, never over an existing one)

**Testing**: pytest in `python/tests` (Flask test client for routes, ranges, content types, path safety, generated lists; tmp folders for `init`; click's `CliRunner` for the commands); one real-socket test that starts the server on a free port and fetches with `urllib`; a Playwright spec is not needed (the app is already covered): the quickstart walks the app against `here` by hand once. Vitest: the two schema copies are equal and the new base mode is `./`.

**Target Platform**: Windows (main), macOS, Linux; bound to 127.0.0.1 by default

**Project Type**: Python library with an embedded static web app

**Performance Goals**: files stream (never read whole): memory does not grow with a Parquet file's size; first page in a few seconds

**Constraints**: ruff-clean (`pyproject.toml` rules, line length 100); `python/wftdm_dashboard/static/` is generated and gitignored; no dashboard logic in Python; read-only server; a request outside the folder is never answered with a file; loopback-only by default and the `Host` header must be local unless `--host` was given (DNS-rebinding guard)

**Scale/Scope**: 2 new modules, 1 edited (`cli.py`), 1 generated template, tests, build script and Makefile edits, docs

## Constitution Check

*GATE: passes. Re-checked after Phase 1.*

| Principle | Status |
|---|---|
| I TypeScript throughout / Python only where Python is the target | Pass: Python is the delivery target (Principle X); the only TypeScript change is a Vite mode and the schema copy |
| IV YAML parsed at runtime | Pass: the app still parses; Python only copies/generates starter text |
| V Browser reads Parquet only | Pass: files are served as they are |
| VII Minimal fixed config file set | Pass: `init` writes the existing two kinds of file (site file, a page) |
| X Delivery targets (no app logic in the wrappers) | Pass: serving and scaffolding only |
| No Web Storage, DuckDB in a worker, one instance | Pass: untouched |
| Security (local data) | Pass: loopback, read-only, path-safe, no upload route, no code execution |

No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/072-python-local-server/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-and-urls.md
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
python/wftdm_dashboard/
├── server.py                    # NEW: create_app(), safe_path(), generated lists, content types, run_server() (port search, browser)
├── scaffold.py                  # NEW: starter_site_yaml(schema), starter_page_yaml(), write_missing()
├── cli.py                       # + here, serve, init
├── templates/
│   └── dashboard-config.schema.json   # NEW, GENERATED by `npm run docs:config` (committed, like the reference)
└── static/                      # generated by `npm run build:package` (gitignored)

python/tests/
├── test_server.py               # NEW: routes, ranges, content types, path safety, generated lists, Host guard, CORS
├── test_scaffold.py             # NEW: starter text from a small schema, never overwrite, validates as YAML
├── test_cli.py                  # (extended: here/serve/init help and errors, the missing-bundle message)
└── test_server_live.py          # NEW: real socket on a free port

vite.config.ts                   # base: './' in mode `package`
package.json                     # + "build:package"
scripts/gen-config-reference.ts  # + also writes python/wftdm_dashboard/templates/dashboard-config.schema.json
Makefile                         # build: npm run build:package (no cp); clean unchanged
tests/unit/configPackageSchema.test.ts   # NEW: the two schema copies are equal; build mode base
README.md, project-docs/ARCHITECTURE.md, project-docs/CONFIGURATION.md, CLAUDE.md, project-docs/IMPLEMENTATION-HISTORY.md   # docs
```

**Structure Decision**: one Python package as today. The server is a Flask app factory so tests use the test client and the command only adds binding, port search and the browser. The folder-to-URL mapping is data in one place (`server.py`), so a later R wrapper can reuse the same rules by shelling to the same command.

## Phase 0: Research

See [research.md](research.md). Decisions: Flask's `send_file(conditional=True)` for ranges; explicit content types (Windows `mimetypes` reads the registry); `no-cache` plus ETag; two folder layouts (flat, or the app's own public layout) through one rule; generated lists only when the files are absent; schema reaches `init` as a packaged copy; relative-base build as a Vite mode; `init` references the schema by URL; no demo flag in `here`.

## Phase 1: Design

- [data-model.md](data-model.md): the folder layouts, the URL map, the generated lists and the starter files.
- [contracts/cli-and-urls.md](contracts/cli-and-urls.md): the three commands, their options and output, and every URL with its source and headers.
- [quickstart.md](quickstart.md): end-to-end validation.

Constitution re-check after design: unchanged, still passes.

## Complexity Tracking

None.
