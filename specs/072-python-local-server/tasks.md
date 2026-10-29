---

description: "Task list for 072 Run the dashboard locally from the Python library (here, init, serve)"
---

# Tasks: Run the dashboard locally from the Python library (`here`, `init`, `serve`)

**Input**: Design documents from `/specs/072-python-local-server/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-and-urls.md, quickstart.md

**Tests**: Included. pytest in `python/tests` for every route rule and command; one real-socket test; a Vitest check for the packaged schema copy and the build mode. The app itself is not changed, so no new Playwright spec: the quickstart walks it once.

**Organization**: Grouped by user story. The package build is foundational because `here` and `serve` need the embedded app to be tried for real.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 `here`, US2 `init`, US3 `serve`, US4 the package carries the app

## Path Conventions

Python in `python/wftdm_dashboard/` and `python/tests/`; Vite/Node changes in `vite.config.ts`, `package.json`, `scripts/`, `tests/unit/`. Python >=3.10, existing dependencies only, ruff-clean (`uv run ruff check python`), line length 100. No dashboard logic in Python (Principle X). The server never writes.

---

## Phase 1: Setup

- [X] T001 Confirm the baseline on branch `072-python-local-server`: `uv run pytest python/tests -q` and `uv run ruff check python` are green (record the test count), `npx tsc --noEmit` and `npx vitest run` are green. If `uv` or the Python environment is not ready, run `uv sync` first and note anything that was needed

---

## Phase 2: Foundational (blocks the stories)

**Purpose**: the embedded bundle exists and works from any address, so the server can be tried for real.

- [X] T002 `vite.config.ts`: `base` is `./` in mode `package` (an explicit `WFTDM_BASE` still wins, the default for every other mode is unchanged); `package.json`: add `build:package` = `tsc --noEmit && vite build --mode package --outDir python/wftdm_dashboard/static --emptyOutDir`. Mode `package` must not turn the demo flag on (070: `demo` is only `serve` or mode `demo`). Vitest `tests/unit/configPackageSchema.test.ts` (new file, also used by T011): the `base` for mode `package` is `./`, for `demo` and the default it is the Pages path, and the demo flag is false in `package` mode (read the exported pieces of the config or the resolved config through `vite`'s `resolveConfig`)
- [X] T003 `Makefile`: the `build` target runs `npm run build:package` (no `cp -r dist`); `clean` still removes the folder; confirm `.gitignore` already ignores `python/wftdm_dashboard/static/`. Run `npm run build:package` and check: `python/wftdm_dashboard/static/index.html` exists, its asset URLs start with `./`, there is no `demo-*` folder, and `git status` shows no new tracked file
- [X] T004 Create `python/wftdm_dashboard/server.py` skeleton with `static_dir()` (via `importlib.resources`; returns the folder or raises a `BundleMissingError` whose message is the one in data-model.md) and a pytest `python/tests/test_server.py` start with the bundle lookup (present, missing) using a tmp package directory

**Checkpoint**: the bundle builds, is ignored by git, and the server module can find it or say how to build it.

---

## Phase 3: User Story 1 - `here` shows my dashboard (Priority: P1) MVP

**Goal**: one command serves the embedded app and the folder safely, with ranges, right types, no stale cache and generated lists.

**Independent Test**: build the bundle, run `here` on a folder (site file, one page, one run): the dashboard shows with its data; the folder has no new file; a path escape is refused.

- [X] T005 [US1] In `server.py`: `safe_path(root, rel)` per research.md decision 4 (empty and NUL refused; `..` and hidden segments refused; on Windows `:` and backslash refused; join and `resolve()`; must be inside `root.resolve()` through `is_relative_to`; must be a regular file); returns the path or `None`. Tests in `test_server.py`: a normal file, a nested file, `..` (plain and as a segment), an encoded `%2e%2e` (literal name, no escape), an absolute path, a hidden folder (`.git/config`), a directory, a missing file, NUL, a Windows drive letter and `file.txt:stream`, and a symbolic link out of the folder (skipped with a clear reason where the platform cannot create one)
- [X] T006 [US1] In `server.py`: the content-type map (`.wasm`, `.parquet`, `.geoparquet`, `.yaml`/`.yml`, `.json`, `.js`/`.mjs`, `.css`, `.html`, `.svg`, fonts, images, `mimetypes` as the fallback) and `create_app(folder, *, serve_app=True, cors=False)`: the URL map of data-model.md (`/dashboard-config/*` flat or public layout, `/scenarios/*`, `/observed/*`, `/geometry/*`, the app files at `/` when `serve_app`), files sent with `send_file(conditional=True, mimetype=..., etag=True, max_age=0)` and `Cache-Control: no-cache`, only `GET`/`HEAD`. Tests with the Flask test client: each URL group from both layouts, the content type of each file kind, `Cache-Control`, an ETag and a `304` on a repeat, a `Range` request gives `206` with `Content-Range` and the right bytes (and `Accept-Ranges`), a suffix range and an unsatisfiable range (`416`), HEAD, `POST`/`PUT`/`DELETE` give 405, an unknown path 404
- [X] T007 [US1] The generated lists: `/scenarios/index.json` (sorted names of subfolders of `<folder>/scenarios` that have a `summary` folder or a `manifest.yaml`; the file wins when present) and `/scenarios/<run>/summary/index.json` and `/observed/summary/index.json` (sorted `*.parquet` names; the file wins when present). Tests: generated when absent, the file used when present, runs without `summary` or `manifest.yaml` left out, hidden folders left out, an empty or missing `scenarios/` gives `[]`, a run added later appears on the next request, nothing is written to the folder (compare a directory listing before and after)
- [X] T008 [US1] The `Host` guard and headers: with the loopback default, a request whose `Host` is not `localhost`, `127.0.0.1` or `[::1]` (with or without a port) gets 400; `create_app(..., allow_any_host=True)` skips it. Tests for each accepted and refused `Host`, and that it is skipped when the option is set
- [X] T009 [US1] In `server.py`: `run_server(app, host, port, *, exact_port, open_browser)` using werkzeug `make_server(threaded=True)`: bind to `port`, or the next free one up to 20 higher unless `exact_port` (then a taken port raises a `PortInUseError` with `Port N is already in use.`); print `Serving <folder> at http://<host>:<port>/ (Ctrl+C to stop)` after the socket is bound; open the browser after binding with `webbrowser.open` (any failure is ignored, the address is already printed); stop cleanly on Ctrl+C. Test in `python/tests/test_server_live.py`: start on a free port in a thread, fetch `index`-free files with `urllib`, a ranged request, then shut down; a taken exact port raises; the next-free-port search skips a held port
- [X] T010 [US1] In `cli.py` add `here [FOLDER] [--port] [--host] [--no-browser]`: default folder `.`, checks the folder exists (click path), builds the app, handles `BundleMissingError` (message, exit 1) and `PortInUseError` (message, exit 1), prints the `init` hint when the folder has no site file (flat `dashboard-config.yaml` or public `dashboard-config/dashboard-config.yaml`), prints the network warning for a non-loopback `--host`. Tests with `CliRunner` (the server start is patched): help text, the missing-bundle message and exit code, the no-site-file hint, the warning for `--host 0.0.0.0`, `--port` forwarded as exact
- [X] T011 [US1] Walk the quickstart steps 2, 4 and 5 by hand once against the built bundle: a folder with the site file, a page and one run copied from `public/demo-scenarios/` (build it in a scratch folder, do not touch the repository demo): the app loads from the printed address and again on a second port, the run appears with no `index.json` written, an edit shows on reload, the escapes in quickstart 5 answer 404, a ranged request answers 206, `Host: evil.example` answers 400. Record the results at the foot of `quickstart.md`

**Checkpoint**: US1 works alone: `here` serves a folder safely and the app runs on it.

---

## Phase 4: User Story 2 - `init` writes a starter configuration (Priority: P2)

**Goal**: a generated, neutral, valid starter that never overwrites.

**Independent Test**: `init` in an empty folder then `here` shows a page; a second `init` keeps both files.

- [X] T012 [US2] `scripts/gen-config-reference.ts`: also write `python/wftdm_dashboard/templates/dashboard-config.schema.json` (the same text as `project-docs/dashboard-config.schema.json`). Run `npm run docs:config`. Extend `tests/unit/configPackageSchema.test.ts`: the two copies are byte-equal (so a schema change without `docs:config` fails)
- [X] T013 [US2] Create `python/wftdm_dashboard/scaffold.py`: `starter_site_yaml(schema: dict) -> str` (first line `# yaml-language-server: $schema=<raw GitHub address>`, then `version: 1` and a `pages:` list naming the starter page, then every other setting as comments grouped under its parent keys with `# description` and, for an enum, the allowed values; no live setting besides `version` and `pages`), `starter_page_yaml() -> str` (header tab and title, one markdown panel with a welcome and next steps) and `write_missing(folder) -> list[tuple[str, bool]]` (creates the folder if missing, writes only absent files, returns `(name, written)`). Tests in `python/tests/test_scaffold.py` with a small schema and with the real packaged schema: every leaf path of the real schema appears exactly once as a comment (100% listed), the text parses as YAML to exactly `{version: 1, pages: [...]}`, the page parses and has the expected keys, a second call writes nothing, an existing file is not changed (compare bytes), a partial folder gets only the missing file, non-ASCII folder names work
- [X] T014 [US2] In `cli.py` add `init [FOLDER]`: loads the packaged schema (`importlib.resources`), calls `write_missing`, prints `wrote <file>` or `kept <file> (already there)` per file, then `Next: wftdm-dashboard here <folder>` and the note that the app's own check is `npm run check -- <folder>` in the repository (not in the library yet). Tests with `CliRunner`: an empty folder, a second run, a partial folder, a folder that does not exist yet, exit 0 each time
- [X] T015 [US2] Check the written starter against the app's own check: run `init` into a scratch folder and `npm run check -- <scratch>`: no problem, exit 0; then `here` on it shows the starter page (record in `quickstart.md`). If the starter page fails the check, fix `starter_page_yaml()` and the test

---

## Phase 5: User Story 4 - The package carries the app (Priority: P2)

**Goal**: an installed library has the app and the schema, with nothing else to do.

**Independent Test**: `uv build`, install the wheel in a clean environment, `here` works on a folder.

- [X] T016 [US4] Run `uv build` (after `npm run build:package`) and list the wheel (`python -m zipfile -l dist/*.whl` or `unzip -l`): it must contain `wftdm_dashboard/static/index.html`, `wftdm_dashboard/static/assets/*` and `wftdm_dashboard/templates/dashboard-config.schema.json`. If the ignored `static/` folder is missing from the wheel, add the include setting to `[tool.uv.build-backend]` in `pyproject.toml` (research.md decision 15) and re-check. Install the wheel into a clean virtual environment and run `wftdm-dashboard init` and `wftdm-dashboard here --no-browser` for a few seconds: both work from the installed package. Record the wheel listing and the result in `quickstart.md`
- [X] T017 [P] [US4] A repository checkout that has not built the app: with `static/` absent, `here` and `serve` stop with the build message (the test already exists from T004/T010; add a case that `init` still works without the bundle)

---

## Phase 6: User Story 3 - `serve` for a hosted copy of the app (Priority: P3)

**Goal**: the folder offered with cross-origin access and an honest note.

**Independent Test**: fetch a file from another origin: it arrives with the cross-origin header and a range works.

- [X] T018 [US3] `create_app(..., serve_app=False, cors=True)`: no app routes (`/` is 404), every response (and `OPTIONS` preflight) carries `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, ETag`, `Access-Control-Allow-Headers: Range, If-None-Match`, and `Access-Control-Allow-Private-Network: true` for a preflight that asks; the folder rules, ranges and refusals are the same as `here`. In `cli.py` add `serve [FOLDER] [--port] [--host]` printing the address and the limits note of the contract. Tests: preflight, the headers on a file and on a 404, `/` is not the app, a range request, a path escape refused, the printed note, a non-loopback `--host` warning

---

## Phase 7: Polish and cross-cutting

- [ ] T019 [P] Docs: `README.md` (remove the "designed but not built yet" notice for `here`, `serve` and `init`; how to use each; the two folder layouts; the limits of `serve`; that `init --scenario-dir` and `check` are not in the library yet), `project-docs/ARCHITECTURE.md` (the deployment-model paragraphs for `serve`, `here` and `init` as built; the note that `init` writes the site starter here and the scenario scaffold is a later step), `project-docs/CONFIGURATION.md` (Phase G step 12 done, what is deferred, section 2 table), `CLAUDE.md` (the file structure: `server.py`, `scaffold.py`, `templates/`, `static/`, the `build:package` script and mode), `project-docs/IMPLEMENTATION-HISTORY.md` ("072 Run the dashboard locally from the Python library")
- [ ] T020 `uv run ruff check python`, `uv run pytest python/tests -q`, `npx tsc --noEmit`, `npx vitest run`; then `npx playwright test` only for the specs that read the base path or the build (`firstRun`, `boot`) to confirm the Vite config change did not move the default base
- [ ] T021 Walk `quickstart.md` end to end and record the result at its foot
- [ ] T022 Rebuild `docs/` with `npm run build:pages` (only when the user asks; not part of the implementation)

---

## Dependencies and Order

- Phase 1, then Phase 2 (T002 and T003 first, then T004).
- US1 (Phase 3): T005, then T006 (needs T005), T007 and T008 (need T006), T009, T010, T011.
- US2 (Phase 4) needs only T012 onward; it can run beside US1 after Phase 2 (different files), except `cli.py` edits (T010, T014, T018) which run in order.
- US4 (Phase 5): T016 needs T003, T012 and T013 (the wheel must include the schema); T017 any time after T010.
- US3 (Phase 6) needs T006 to T008.
- Polish after the stories. T022 only on request.

## Parallel example

After Phase 2: T005 to T008 (server) and T012 to T013 (scaffold) in parallel (different files); `cli.py` tasks T010, T014 and T018 in order.

## MVP

Phases 1 and 2 plus US1 (T001 to T011): `wftdm-dashboard here` works on a folder with the embedded app. Stop at the US1 checkpoint if asked.
