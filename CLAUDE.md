# CLAUDE.md — WFRC TDM Calibration Dashboard

ActivitySim calibration/validation dashboard. Static web app + Python post-processor.
Read `docs/ARCHITECTURE.md` and `docs/SPEC.md` before writing any code.

---

## Stack

| Layer | Technology |
|---|---|
| Build | Vite, TypeScript (ES2022 target) |
| Query — browser | DuckDB-WASM in a Web Worker |
| Query — offline | Python DuckDB (`uv run`) |
| Charts — default | Plotly.js |
| Charts — reactive inputs | Observable Plot (`@observablehq/plot`) |
| Explore tab | Graphic Walker (`<GraphicWalker>` component, rendered directly — not `embedGraphicWalker`, see "Graphic Walker panel" below) |
| Maps | MapLibre GL (NOT Mapbox) |
| O-D flows | `@flowmap.gl/layers` + `@deck.gl/mapbox` (`MapboxOverlay`) |
| Config parsing | js-yaml (runtime, not build-time) |
| File format | Parquet / GeoParquet only — no CSV/GeoJSON/OMX in browser |
| Geometry | DuckDB spatial extension (`ST_Read`, `ST_AsGeoJSON`) |

**TypeScript throughout; React once a UI feature needs it** (constitution
v2.0.0 — the earlier three-phase, branch-per-phase migration plan is
retired):

The app is TypeScript (`.ts`), not plain JavaScript — no branch to merge
from, no gate to clear first, work lands directly on `main`. `services/
duckdb.ts`, `state/appState.ts`, `state/filterState.ts`, panel config
interfaces (`PlotlyPanelConfig`, `FlowMapPanelConfig`) get real types instead
of JSDoc — catches YAML config errors and DuckDB column mismatches at
write-time.

React **is adopted** — `002-design-tokens` brought it in for the design
token/component foundation (Tailwind CSS + shadcn/ui + Radix +
`lucide-react`, constitution v2.1.0/Principle VI), with a working demo page
(`demo.html`) rendering real components. The panel/layout layer is next to
consume it, following the panel pattern (constitution v2.2.0 — function
components + the `useFilterState` hook + `panels/registry.tsx`). The data
layer (`services/`, `state/`) stays plain TypeScript regardless — no JSX
there, no reason to add it. Commute Explorer remains the working reference
(React + DuckDB-WASM + MapLibre + flowmap.gl) for the map panels
specifically.

---

## Non-negotiables

- DuckDB-WASM runs in a **Web Worker** — never the main thread
- One DuckDB instance shared across all panels via `services/duckdb.ts`
- React only — no Vue/Svelte/other frameworks; panel registry is a
  type-to-component map (`panels/registry.tsx`), not factory functions or
  classes
- No eval() — SQL fragments use string replacement only
- YAML parsed at **runtime** — dashboard content is not known at build time
- Browser only reads Parquet — all format conversion is offline
- MapLibre not Mapbox — `@deck.gl/mapbox` `MapboxOverlay` works with MapLibre

---

## Config file set (three files, no more)

```
summarize.yaml        post-processor: sources, mappings, bins, sql_fragments, metrics → Parquet
dashboard-*.yaml      tab layout and panels — first file is the landing page
manifest.yaml         per-scenario metadata
```

- No `topsheet.yaml` — the first `dashboard-*.yaml` serves as the landing page
- No `dashboard-config.yaml` — app settings live in code and CLI args (not to be confused with the `public/dashboard-config/` *directory* below, which holds published copies of the existing `dashboard-*.yaml` tab-layout files, not a new config file type)
- No `summarize-preprocessor.yaml` — join logic lives in `sql_fragments` inside `summarize.yaml`
- Dashboard YAML configs (`dashboard-*.yaml`, `summarize.yaml`) are authored alongside the model scripts in the TDM repo (not in the dashboard repo) — same authored-vs-published split as `manifest.yaml`. A published copy of the `dashboard-*.yaml` files (WFRC's default templates ship seven) is expected in `public/dashboard-config/` in the dashboard repo, discovered at runtime via `public/dashboard-config/index.json` — the same discovery pattern as `public/scenarios/index.json` — and fetched by the browser at startup; `summarize.yaml` is post-processor-only and is never published or read by the browser.
- `public/dashboard-config/index.json` and `public/scenarios/index.json` are discovery metadata (a list of filenames/names to fetch), not one of the three config file types above — same category as each other, not a new type (constitution Principle VII still holds: exactly three *config* file types, no more)
- `028-dashboard-branding`: `dashboard-config/index.json` (and, additively, `demo-dashboard-config/index.json`) may ALSO carry a deployer-configurable app-wide `title`/`logoUrl`/`logoUrlDark`, alongside its existing filename-list role — `{"dashboards": [...], "title": "...", "logoUrl": "...", "logoUrlDark": "..."}` instead of the old bare array. This is a richer shape for a discovery file that already existed, not a new config file type either (same reasoning as the bullet above) — a deliberate choice over adding a fourth config file, or a build-time/env constant, since a deployer of a fresh `wftdm-dashboard init` scaffold is a planner running a CLI, not a JS developer touching `src/`. All three fields are optional; an unconfigured deployment's header renders exactly as it always did (`layout/dashboardBrand.tsx`, rendered inside `shell.tsx`'s `<header>`) — no logo shows no image (never a broken-image icon, FR-004), no title sets neither header text nor the browser tab title. `logoUrlDark` is a separate, optional field (not a boolean paired with one URL) — WFRC's own real logo assets (wired into `public/demo-dashboard-config/index.json` by default) are a dark-navy-on-transparent PNG and a white-on-transparent PNG, each illegible against the other theme's header, the same light/dark-pair convention `PlotlyPanel.tsx`'s `FALLBACK_FOREGROUND`/`FALLBACK_BORDER` already established. See `services/yamlLoader.ts`'s own `loadDashboardBranding()`/`DashboardBranding` doc comments — including a real, confirmed `loadDashboards()`/`loadDashboardBranding()` doubled-path bug found and fixed by this same feature — for the full story.
- Parquet outputs live in `{scenario-dir}/summary/` — written by the post-processor
- Published scenarios are manually copied into `public/scenarios/` in the dashboard repo
- `public/scenarios/`, `public/dashboard-config/`, and `public/observed/` are ALL gitignored (`npm run dev:fixtures` destructively copies `tests/fixtures/{scenarios,dashboard-config,observed}` into them for local/CI checks — see `scripts/copy-fixtures.js`) — nothing real was ever checked in at those exact paths before `026-activitysim-demo-content`. That feature's own real, non-fixture content (a `summarize.yaml` run through the post-processor against three real ActivitySim `prototype_mtc` runs — baseline + a land-use-density variant + a transit-service variant) lives instead at a **new, separate, git-tracked root**, `public/demo-scenarios/`/`public/demo-dashboard-config/`, discovered via the same `index.json` pattern but never touched by `copy-fixtures.js` and never gitignored (`.gitignore`'s existing three entries are exact directory names, not a wildcard, so no `.gitignore` edit was needed at all). `main.ts`/`scenarioDiscovery.ts` fetch this second root additively, alongside (never instead of) the existing fixture-copy-targeted paths — see `services/scenarioDiscovery.ts`'s entry below and `specs/026-activitysim-demo-content/` for the full design record.

---

## Navigation model

The set of tabs is **discovered at runtime**, not a fixed app-level constant:
`main.ts` fetches `public/dashboard-config/index.json` — an array of
`dashboard-*.yaml` filenames, in display order — the same discovery pattern
`public/scenarios/index.json` already uses for scenarios. The first filename
in that list is always the landing page, rendered on scenario load. Whatever
WFRC's default templates (`python/wftdm_dashboard/templates/`, see
`docs/ARCHITECTURE.md`) happen to ship is what a freshly-`init`'d project
gets — today that's seven tabs, but the app itself imposes no count or name
on the set; adding, removing, or renaming a tab is purely an `index.json` +
file edit, no code change.

The default seven-tab set WFRC ships:
```
Scenario loaded → dashboard-1-summary.yaml (landing page, always active on load)
  ├── Tab: Summary ★    dashboard-1-summary.yaml   ← value boxes + overview charts
  ├── Tab: Person/HH    dashboard-2-person.yaml
  ├── Tab: Tour         dashboard-3-tour.yaml
  ├── Tab: Mode Choice  dashboard-4-mode.yaml
  ├── Tab: Trip         dashboard-5-trip.yaml
  ├── Tab: Network      dashboard-6-network.yaml
  └── Tab: Explore      dashboard-7-explore.yaml   (Graphic Walker)
```

The Summary tab renders on scenario load. Its value boxes read from `summary_kpis.parquet`
(smallest file, loads first). Charts below load progressively as other Parquet files register.

---

## File structure

```
APP-wftdm-dashboard/
├── CLAUDE.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SPEC.md
│   ├── grammar.md
│   └── CALIBRATION-SUMMARIES.md
├── index.html                  # coi-serviceworker FIRST, then main.ts
├── package.json
├── vite.config.ts
├── public/
│   ├── coi-serviceworker.js
│   ├── observed/               # observed data — deselectable, always pre-loaded
│   │   ├── manifest.yaml       # name: "Observed Data", pinned: true
│   │   └── summary/
│   │       ├── summary_kpis.parquet
│   │       ├── observed_mode_share.parquet
│   │       ├── observed_counts.parquet
│   │       └── observed_tlfd.parquet
│   ├── scenarios/              # published model runs for sharing/web access
│   │   ├── index.json          # ["2027-rtp-baseyear", "2027-rtp-horizonyear"]
│   │   ├── 2027-rtp-baseyear/
│   │   │   ├── manifest.yaml
│   │   │   └── summary/
│   │   │       ├── summary_kpis.parquet
│   │   │       └── ...
│   │   └── 2027-rtp-horizonyear/
│   │       ├── manifest.yaml
│   │       └── summary/
│   └── dashboard-config/       # published tab layout, discovered + fetched at startup
│       ├── index.json          # ["dashboard-1-summary.yaml", "dashboard-2-person.yaml", ...]
│       ├── dashboard-1-summary.yaml
│       └── ...                 # whatever else index.json lists (seven, by default)
├── pyproject.toml
├── Makefile                    # npm run build → copy dist/ → uv build
├── python/
│   ├── wftdm_dashboard/        # Python package
│   │   ├── __init__.py
│   │   ├── cli.py              # done (025-python-postprocessor) — a
│   │   │                       # click.group `main` with one real
│   │   │                       # subcommand, `summarize` (wftdm-dashboard
│   │   │                       # serve/here/init from CLAUDE.md's own
│   │   │                       # earlier sketch are NOT built by this
│   │   │                       # feature — separate, still-not-started
│   │   │                       # work; this file did not exist at all
│   │   │                       # before this feature, matching
│   │   │                       # pyproject.toml's own already-existing
│   │   │                       # [project.scripts] wftdm-dashboard =
│   │   │                       # "wftdm_dashboard.cli:main" entry point,
│   │   │                       # which had zero real target until now)
│   │   ├── server.py           # not built yet — no feature has needed it
│   │   ├── static/             # not built yet — no feature has needed it
│   │   ├── templates/          # not built yet — `init`'s own scaffolding
│   │   │                       # job (summarize.yaml + dashboard-*.yaml
│   │   │                       # defaults) is separate, deliberately
│   │   │                       # out-of-scope work
│   │   │                       # (025-python-postprocessor's own spec.md
│   │   │                       # Assumptions section)
│   │   └── postprocessor/      # done (025-python-postprocessor) — the
│   │       │                   # actual CSV→Parquet pipeline this
│   │       │                   # dashboard has always assumed exists.
│   │       │                   # Generic by construction (FR-007, mirroring
│   │       │                   # the frontend's own already-confirmed
│   │       │                   # discipline) — zero hardcoded real-world
│   │       │                   # table/column/mapping/bin name anywhere in
│   │       │                   # this subpackage; every name flows through
│   │       │                   # a parsed summarize.yaml.
│   │       ├── __init__.py
│   │       ├── errors.py       # PostprocessorError + 6 subclasses
│   │       │                   # (SourceNotFoundError/
│   │       │                   # UnresolvedPlaceholderError/
│   │       │                   # UnknownBinTypeError/DuplicateMetricError/
│   │       │                   # MetricExecutionError/InvalidConfigError —
│   │       │                   # the last one added beyond this feature's
│   │       │                   # own original plan, for the
│   │       │                   # malformed/missing-key summarize.yaml
│   │       │                   # edge case) — each names the specific
│   │       │                   # offending element in its message,
│   │       │                   # mirroring services/sqlExpander.ts's own
│   │       │                   # missing() convention on the TS side
│   │       ├── config.py       # parses summarize.yaml (PyYAML, a new
│   │       │                   # dependency — no YAML library existed in
│   │       │                   # this project's Python side before this
│   │       │                   # feature) into typed dataclasses
│   │       │                   # (Source/Mapping/Bin-as-tagged-union/
│   │       │                   # SqlFragment/Metric/SummarizeConfig).
│   │       │                   # A bad `bins.type` parses into an
│   │       │                   # `UnknownBin` placeholder rather than
│   │       │                   # failing at parse time — the actual
│   │       │                   # UnknownBinTypeError only fires later, in
│   │       │                   # expand.py, if some metric's SQL actually
│   │       │                   # references that bin (deferred validation,
│   │       │                   # mirroring sqlExpander.ts's own lazy
│   │       │                   # $bins.x resolution)
│   │       ├── expand.py       # $mappings.x/$bins.x/$sql.x → literal SQL
│   │       │                   # text — an independent Python
│   │       │                   # reimplementation targeting the same SQL
│   │       │                   # shapes as services/sqlExpander.ts's own
│   │       │                   # expandMappings()/expandBins()/
│   │       │                   # expandSqlFragment() (confirmed directly
│   │       │                   # against that file's real source, not
│   │       │                   # docs/GRAMMAR.md's prose alone — catching
│   │       │                   # one real doc/code divergence along the
│   │       │                   # way: $mappings.x emits no ELSE, despite
│   │       │                   # GRAMMAR.md's own worked example showing
│   │       │                   # one). Plain string templating only, no
│   │       │                   # eval()/exec() (constitution Principle
│   │       │                   # III) — the same non-negotiable this
│   │       │                   # project's TS side already holds itself
│   │       │                   # to
│   │       ├── sources.py      # loads one `sources:` entry into DuckDB
│   │       │                   # as a queryable, UNPREFIXED view (`CREATE
│   │       │                   # OR REPLACE VIEW "<name>" AS SELECT * FROM
│   │       │                   # read_csv_auto(...)`/`read_parquet(...)`,
│   │       │                   # chosen purely by file extension) —
│   │       │                   # mirrors services/duckdb.ts's own
│   │       │                   # createViewOverParquet() pattern, an
│   │       │                   # independent implementation of the same
│   │       │                   # idea. Unprefixed (unlike the browser's own
│   │       │                   # `{scenario}__{metric}` scheme) because
│   │       │                   # this pipeline processes exactly one
│   │       │                   # scenario's raw data per run, in its own
│   │       │                   # fresh connection — required, not just
│   │       │                   # simpler: every real metric SQL in
│   │       │                   # docs/GRAMMAR.md already references
│   │       │                   # sources this way unprefixed
│   │       │                   # (`FROM trips t`). `ensure_source_exists()`
│   │       │                   # is the pre-flight existence check
│   │       │                   # pipeline.py calls for every declared
│   │       │                   # source, as a batch, before any source is
│   │       │                   # loaded or any metric SQL runs
│   │       ├── pipeline.py     # run_pipeline() — the actual
│   │       │                   # orchestration: validate every source
│   │       │                   # exists, delete+recreate
│   │       │                   # `{output}/summary/` in full (idempotent
│   │       │                   # re-runs — no Parquet file survives from a
│   │       │                   # metric since renamed or removed), load
│   │       │                   # every source, then for each metric expand
│   │       │                   # its SQL and run `COPY (...) TO
│   │       │                   # '...' (FORMAT PARQUET)`. Uses DuckDB's own
│   │       │                   # Python API throughout for both
│   │       │                   # reading (CSV/Parquet) and writing
│   │       │                   # (Parquet) — no pandas dependency
│   │       │                   # introduced. A metric SQL execution
│   │       │                   # failure is re-raised as
│   │       │                   # MetricExecutionError naming the metric,
│   │       │                   # not a bare DuckDB error with no context
│   │       └── manifest.py     # generate_manifest()/write_manifest() —
│   │                           # the standard Tableau10 categorical
│   │                           # palette (confirmed against
│   │                           # docs/GRAMMAR.md's own worked
│   │                           # manifest.yaml example, whose
│   │                           # `color: "#4e79a7"` is exactly this
│   │                           # palette's first entry), auto-assigned via
│   │                           # `hashlib.sha256(scenario_name) % 10` — a
│   │                           # real, self-caught bug during this
│   │                           # feature's own implementation: an initial
│   │                           # draft used Python's builtin `hash()`,
│   │                           # which is per-process randomized for `str`
│   │                           # (`PYTHONHASHSEED`) and would have
│   │                           # silently broken the "same scenario
│   │                           # re-run twice gets the same color"
│   │                           # guarantee this function exists to
│   │                           # provide — fixed before it ever shipped,
│   │                           # not found later. `model_version`/`notes`
│   │                           # are omitted from the written YAML
│   │                           # entirely when not supplied, never written
│   │                           # as a literal `null`
│   └── tests/                  # pytest suite for the Python package — a
│       │                       # NEW, separate tree from the repo-root
│       │                       # tests/ (Vitest/Playwright, JS-only);
│       │                       # mixing two languages/runners into one
│       │                       # directory had no existing convention to
│       │                       # follow, so this stays its own sibling of
│       │                       # wftdm_dashboard/ itself, matching uv's
│       │                       # own module-root = "python" boundary
│       ├── conftest.py         # shared fixtures — tiny CSV/Parquet files
│       │                       # written to tmp_path using real
│       │                       # ActivitySim column names (confirmed
│       │                       # directly against ActivitySim's own
│       │                       # current example config, not assumed),
│       │                       # plus a minimal summarize.yaml-shaped dict
│       │                       # exercising all three placeholder kinds
│       │                       # together
│       ├── test_config.py
│       ├── test_expand.py
│       ├── test_sources.py
│       ├── test_pipeline.py
│       ├── test_manifest.py
│       └── test_cli.py         # 57/57 passing across the whole suite
└── src/                        # Dashboard application source (JS app only) — TypeScript (constitution v2.0.0)
    ├── main.ts                 # boot sequence
    ├── state/
    │   ├── appState.ts         # loaded scenarios registry — gained a
    │   │                       # subscribe()/notify() pub/sub (009,
    │   │                       # mirroring filterState.ts's own shape):
    │   │                       # FR-008 needed panels to react to a
    │   │                       # newly-activated local scenario without
    │   │                       # losing their own local UI state, which
    │   │                       # a naive remount-based fix would have
    │   │                       # broken (research.md §1). 018-baseline-
    │   │                       # scenario-designation added a second
    │   │                       # piece of derived state alongside the
    │   │                       # scenarios Map: a single nullable
    │   │                       # explicitBaseline pointer (mutual
    │   │                       # exclusivity falls out of the data shape
    │   │                       # itself, not per-scenario-boolean
    │   │                       # invariant-maintenance code) plus
    │   │                       # setBaseline()/getBaseline() — the latter
    │   │                       # always resolved fresh (explicit-if-
    │   │                       # still-valid, else the earliest
    │   │                       # pinned === false && status === 'ready'
    │   │                       # entry, else undefined), never a second
    │   │                       # cached value. A real, confirmed finding
    │   │                       # shaped that resolver: observed is
    │   │                       # ALWAYS the literal first-registered
    │   │                       # entry in every real deployment
    │   │                       # (scenarioDiscovery.ts's
    │   │                       # registerObserved() registers it
    │   │                       # synchronously before any published
    │   │                       # scenario, even before its own data
    │   │                       # fetch resolves) — a naive "first Map
    │   │                       # entry" default would therefore always
    │   │                       # pick survey/count reference data as the
    │   │                       # diff baseline, never a real model run
    │   │                       # (research.md §1). unregister() now
    │   │                       # clears explicitBaseline when it matches
    │   │                       # the removed name, BEFORE deleting the
    │   │                       # entry — not a separate "shift to next"
    │   │                       # rule; getBaseline() being always-fresh
    │   │                       # means the very next read naturally
    │   │                       # re-applies the same automatic-default
    │   │                       # rule with no dangling reference
    │   │                       # possible (research.md §3, FR-005).
    │   │                       # 020-settings-modal added three more
    │   │                       # `Scenario` fields — `path: string` (the
    │   │                       # real folder URL for a `source: 'url'`
    │   │                       # entry, or `dirHandle.name` for a
    │   │                       # `source: 'handle'` one — the File System
    │   │                       # Access API exposes no real absolute path
    │   │                       # at all, a browser security boundary, not
    │   │                       # a gap in this app's own code),
    │   │                       # `order: number` (viewer-controlled
    │   │                       # DISPLAY order only, assigned from a new
    │   │                       # module-level ever-incrementing
    │   │                       # `nextOrder` counter at `register()` time
    │   │                       # and reassigned only by the new
    │   │                       # `moveScenario()` — deliberately never
    │   │                       # read by `getBaseline()`, which still
    │   │                       # iterates `scenarios.values()` directly,
    │   │                       # making "reordering never moves the
    │   │                       # automatic baseline" hold structurally,
    │   │                       # with no guard needed), and
    │   │                       # `label?: string` (an optional
    │   │                       # viewer-facing display label, read by
    │   │                       # nothing outside the Scenarios tab's own
    │   │                       # rendering — no resolution path was ever
    │   │                       # given access to it, so "never a
    │   │                       # substitute for the real name in SQL"
    │   │                       # holds with zero enforcement code).
    │   │                       # New exports: `moveScenario(name,
    │   │                       # direction)`, `listByDisplayOrder()`,
    │   │                       # `setLabel(name, label)`,
    │   │                       # `clearLabel(name)` — all following the
    │   │                       # existing `setBaseline()`/`setActive()`
    │   │                       # look-up/throw/mutate/`notify()`
    │   │                       # convention. `unregister()` needed NO
    │   │                       # change (unlike `explicitBaseline`'s own
    │   │                       # special-cased clearing) — `order`/
    │   │                       # `label` live directly on the `Scenario`
    │   │                       # object, so `scenarios.delete(name)`
    │   │                       # already discards both.
    │   ├── basemapState.ts     # done (020-settings-modal) — the single,
    │   │                       # viewer-set global basemap choice, NOT
    │   │                       # added onto appState.ts (whose own header
    │   │                       # comment scopes it explicitly to scenario
    │   │                       # metadata/selection state) — mirrors
    │   │                       # appState.ts's/filterState.ts's own
    │   │                       # subscribe/notify shape, a single
    │   │                       # module-level value rather than a Map
    │   │                       # (there is exactly one global basemap
    │   │                       # choice for the whole app). Typed
    │   │                       # `BasemapPresetName | undefined` (a plain
    │   │                       # string), not the full `BasemapSelection`
    │   │                       # union that also includes
    │   │                       # `BasemapComposition` objects — the
    │   │                       # Basemap tab's picker only ever offers
    │   │                       # entries from `registry.ts`'s
    │   │                       # `BUILT_IN_PRESETS`, which never contains
    │   │                       # a composition — keeping this a primitive
    │   │                       # avoids `useGlobalBasemap()` needing a
    │   │                       # memoized cache, matching `useBaseline.ts`'s
    │   │                       # own reasoning for its own primitive
    │   │                       # return value. No persistence (FR-015).
    │   └── filterState.ts      # global filters + pub/sub
    ├── services/
    │   ├── duckdb.ts           # DuckDB-WASM API — owns the sole AsyncDuckDB
    │   │                       # instance + DuckDB-WASM's own bundled worker
    │   │                       # script (self-hosted via Vite `?url` imports,
    │   │                       # not a CDN). No separate duckdb.worker.ts —
    │   │                       # the library provides its own worker; there's
    │   │                       # nothing for the app to author into one
    │   │                       # (constitution Principle II, amended 1.2.0)
    │   ├── yamlLoader.ts       # fetch + parse dashboard-*.yaml files
    │   ├── sqlExpander.ts       # expand $mappings/$bins/$sql/$filters/$scenario/
    │   │                       # $inputs — plus $baseline (018-baseline-
    │   │                       # scenario-designation): a NEW, sixth,
    │   │                       # optional trailing expand() parameter
    │   │                       # (baselineScenario?: string), same
    │   │                       # zero-touch evolution shape $inputs
    │   │                       # itself already established — verified
    │   │                       # directly, not assumed, that all nine
    │   │                       # real existing call sites need zero
    │   │                       # changes (research.md §5). $baseline.x
    │   │                       # resolves to a single bare quoted view
    │   │                       # reference ("{scenario}__{metric}"), NOT
    │   │                       # a UNION ALL like $scenario.x — matching
    │   │                       # 013-zonemap-panel's own comparison:
    │   │                       # diff `a`/`b` expansion shape instead
    │   │                       # (the nearer precedent for "reference
    │   │                       # one specific named scenario directly",
    │   │                       # research.md §4). No dashboard-*.yaml
    │   │                       # grammar or panel call site supplies
    │   │                       # this value yet — that's the next,
    │   │                       # separate feature (spec.md FR-011); this
    │   │                       # one only proves expand() itself
    │   │                       # resolves correctly, via direct unit
    │   │                       # tests, not through any real panel.
    │   └── scenarioDiscovery.ts # register observed/ + public/scenarios/ at startup.
    │                             # 026-activitysim-demo-content added
    │                             # registerDemoScenarios() — structurally
    │                             # identical to registerPublishedScenarios(),
    │                             # pointed at the new, git-tracked
    │                             # public/demo-scenarios/ root instead,
    │                             # called from discoverScenarios() alongside
    │                             # (not instead of) the two existing
    │                             # registration calls. A deliberate sibling
    │                             # function rather than parameterizing
    │                             # registerPublishedScenarios() itself —
    │                             # keeps that function's own existing
    │                             # behavior/tests completely untouched.
    ├── hooks/
    │   ├── useFilterState.ts   # wraps state/filterState.ts with
    │   │                       # useSyncExternalStore (constitution v2.2.0)
    │   ├── useActiveScenarios.ts # done (009-scenario-manager) — same
    │   │                       # useSyncExternalStore shape, wrapping
    │   │                       # appState.ts's new subscribe() instead;
    │   │                       # every data-bound panel type consumes
    │   │                       # this now, not appState.getActive()
    │   │                       # directly (research.md §1)
    │   ├── useColorScheme.ts   # done (011-basemap-style-system) — reads
    │   │                       # (never sets) the Tailwind `.dark` class
    │   │                       # on document.documentElement via a
    │   │                       # MutationObserver + useSyncExternalStore,
    │   │                       # same shape as the two hooks above. Its
    │   │                       # own write-side counterpart is now real
    │   │                       # too (015-theme-toggle, originally
    │   │                       # layout/themeToggle.tsx, RELOCATED by
    │   │                       # 020-settings-modal to layout/settings/
    │   │                       # appearanceTab.tsx — same component logic,
    │   │                       # new file) — this hook needed zero changes
    │   │                       # to compose with it either time (its
    │   │                       # MutationObserver reacts to any class
    │   │                       # mutation regardless of source), the same
    │   │                       # relationship registerScenario() had to
    │   │                       # 009's own caller from 001 until 009
    │   │                       # built it.
    │   ├── useBaseline.ts      # done (018-baseline-scenario-designation)
    │   │                       # — useSyncExternalStore over appState's
    │   │                       # subscribe()/getBaseline(), same shape as
    │   │                       # useActiveScenarios() above BUT with no
    │   │                       # memoized cache: getBaseline() returns a
    │   │                       # primitive (string | undefined), which
    │   │                       # useSyncExternalStore's default Object.is
    │   │                       # comparison already handles correctly by
    │   │                       # value — useActiveScenarios() only needs
    │   │                       # its own cache because getActive() builds
    │   │                       # a new ARRAY every call (research.md §7).
    │   ├── useGlobalBasemap.ts # done (020-settings-modal) — same
    │   │                       # primitive-return, no-cache shape as
    │   │                       # useBaseline.ts, over
    │   │                       # state/basemapState.ts instead. Consumed
    │   │                       # by FlowMapPanel.tsx/ZoneMapPanel.tsx
    │   │                       # (its only two callers, both already
    │   │                       # reading useColorScheme() the same
    │   │                       # symmetric way) as
    │   │                       # resolveEffectiveBasemap()'s new 4th
    │   │                       # argument.
    │   └── useScenarioList.ts  # done (020-settings-modal) — the
    │                           # Scenarios tab needs to re-render on ANY
    │                           # scenario field changing (order/label/
    │                           # path/status/pinned/active/source), not
    │                           # just the active-scenario set
    │                           # (useActiveScenarios.ts) or the resolved
    │                           # baseline (useBaseline.ts), neither of
    │                           # which changes for a label/order-only
    │                           # mutation. A REAL bug found during this
    │                           # feature's own implementation:
    │                           # layout/settings/scenariosTab.tsx
    │                           # originally relied on those two hooks
    │                           # alone, so calling
    │                           # appState.setLabel()/moveScenario() never
    │                           # triggered a re-render at all. This hook's
    │                           # own memoized-cache comparison then hit a
    │                           # SECOND, subtler bug on first attempt:
    │                           # appState.ts's listByDisplayOrder() (like
    │                           # list()/getActive() before it) returns
    │                           # LIVE Scenario object references — every
    │                           # mutator changes fields IN PLACE on the
    │                           # same object stored in its Map, never
    │                           # replacing it. Caching those live
    │                           # references directly meant a later
    │                           # comparison's "previous" and "current"
    │                           # values were literally the SAME object
    │                           # read twice — always equal, permanently
    │                           # suppressing re-renders. Fixed by
    │                           # snapshotting shallow COPIES into the
    │                           # cache (`live.map((s) => ({ ...s }))`)
    │                           # instead of the live array itself.
    │   # layout/ and panels/ below are now real (003-dashboard-shell-
    │   # navigation built the shell/nav/panel-card layer and the first two
    │   # panel types; 004-panel-expand-dialog added the generic expand
    │   # mechanism on top; 005-table-panel, 006-markdown-panel,
    │   # 007-observable-plot-panel, and 008-sankey-panel each added one
    │   # more panel type — table/markdown/observable-plot/sankey are all
    │   # real now, completing the originally-listed six-panel-type set;
    │   # 010-flowmap-panel added the seventh one (this codebase's first
    │   # real map — MapLibre + deck.gl + flowmap.gl); 013-zonemap-panel
    │   # then added the eighth and actual final one (a second, pure-
    │   # MapLibre map — no deck.gl, this project's first GeoParquet/
    │   # DuckDB-spatial feature); 014-graphic-walker-panel added the
    │   # ninth and actual final one — this project's originally-listed
    │   # panel-type roadmap is now complete in full, no panel type left.
    │   # scenario/scenarioManager.ts + manifestReader.ts are
    │   # also now real (009-scenario-manager, closing services/duckdb.ts's
    │   # registerScenario() zero-callers gap open since 001) — styles/ is
    │   # the only entry in this tree still not built (out of scope for
    │   # every feature to date). Anything that renders JSX is .tsx;
    │   # pure-logic modules with no JSX (scenarioManager.ts,
    │   # manifestReader.ts, panelQuery.ts, plotlyTraces.ts, tableLogic.ts,
    │   # formatValue.ts, observablePlotEncoding.ts, flowmapData.ts) stay
    │   # .ts, same as
    │   # services/ and state/ (constitution v2.2.0, Development Workflow)
    ├── layout/
    │   ├── shell.tsx             # top-level app shell: NavBar + active tab
    │   │                         # (020-settings-modal: header's right-
    │   │                         # hand slot is now a single
    │   │                         # <SettingsModal /> — REPLACING the
    │   │                         # 015-theme-toggle-era
    │   │                         # ScenarioLoader+ThemeToggle pair
    │   │                         # entirely, not kept alongside it,
    │   │                         # FR-001/FR-002 — top-right, same
    │   │                         # placement 009 originally established
    │   │                         # for a dashboard-wide, not
    │   │                         # panel-specific, header control)
    │   ├── navBar.tsx            # DELETED (030-sidebar-navigation) — the
    │   │                         # top tab strip is replaced by a
    │   │                         # persistent left Sidebar; see
    │   │                         # sidebar.tsx/sidebarNav.tsx below and
    │   │                         # this file's own Implementation order
    │   │                         # item 18 for the full story
    │   ├── sidebarNav.tsx        # done (030) — renders the sidebar's own
    │   │                         # tab list + accordion sub-navigation,
    │   │                         # role="tablist"/role="tab" set
    │   │                         # explicitly (SidebarMenuButton is a
    │   │                         # plain <button>, not Radix Tabs) for a
    │   │                         # real, deliberate a11y reason — see
    │   │                         # Implementation order item 18
    │   ├── dashboardLayout.ts    # done (030) — pure, unit-tested:
    │   │                         # isMetricStripRow()/findFullPagePanel()/
    │   │                         # resolveSections(), same
    │   │                         # split-pure-logic-into-its-own-module
    │   │                         # convention as tableLogic.ts/
    │   │                         # sankeyGraph.ts/zonemapColor.ts
    │   ├── dashboardRenderer.tsx # renders one tab's layout as rows of PanelCards;
    │   │                         # also (011-basemap-style-system) the one place
    │   │                         # that injects each map-rendering panel's
    │   │                         # tab-level default_basemap onto its own config
    │   │                         # as _tabDefaultBasemap — memoized on `tab` alone
    │   │                         # (a real regression, found empirically: an
    │   │                         # earlier version rebuilt this on every render,
    │   │                         # breaking FlowMapPanel's own config-referential-
    │   │                         # stability assumption)
    │   ├── panelCard.tsx         # shadcn Card wrapper: title, expand trigger
    │   │                         # (usePanelExpandHost), hosts one registry-
    │   │                         # resolved panel + its error boundary
    │   ├── panelExpandHost.tsx   # 004: the generic expand-to-dialog hook —
    │   │                         # a persistent portal host node, imperatively
    │   │                         # relocated between an inline card anchor
    │   │                         # and a Dialog anchor, not a createPortal
    │   │                         # target swap (found not to preserve
    │   │                         # mounted state — research.md §1b)
    │   ├── types.ts              # typed DashboardTabConfig/PanelConfig,
    │   │                         # parsed from yamlLoader's DashboardConfig.raw.
    │   │                         # 019-baseline-diff-consumption: new
    │   │                         # ComparisonCapablePanelConfig mixin
    │   │                         # (comparison?/compare_on?), mirroring
    │   │                         # MapRenderingPanelConfig's own mixin
    │   │                         # pattern exactly — ZoneMapPanelConfig's
    │   │                         # previously-local `comparison` field
    │   │                         # is now inherited from it (gaining
    │   │                         # compare_on too), and PlotlyPanelConfig/
    │   │                         # TablePanelConfig/ObservablePlotPanelConfig
    │   │                         # each gain the same mixin — one shared
    │   │                         # comparison-diff grammar across all four,
    │   │                         # not four independently invented ones
    │   │                         # (see panels/panelQuery.ts below for the
    │   │                         # full story).
    │   ├── settingsModal.tsx     # done (020-settings-modal) — the single
    │   │                         # dashboard-wide settings entry point,
    │   │                         # REPLACING scenarioLoader.tsx (009) and
    │   │                         # themeToggle.tsx (015) entirely — both
    │   │                         # DELETED, their logic relocated (not
    │   │                         # duplicated) into layout/settings/
    │   │                         # below. A trigger Button opening
    │   │                         # components/ui/dialog.tsx's Dialog
    │   │                         # (004-panel-expand-dialog's existing
    │   │                         # primitive, reused unmodified) with
    │   │                         # components/ui/tabs.tsx's Tabs (already
    │   │                         # proven by navBar.tsx's own tab strip)
    │   │                         # for the four-tab internal navigation —
    │   │                         # no new modal/tab primitive built from
    │   │                         # scratch. components/ui/dropdown-menu.tsx
    │   │                         # (015) is now a zero-consumer file
    │   │                         # (ThemeToggle was its only caller) —
    │   │                         # deliberately left in place, not
    │   │                         # deleted: a generic, reusable shadcn/ui
    │   │                         # primitive, same category this project
    │   │                         # already keeps unused-until-needed.
    │   │                         # 021-basemap-catalog-redesign: gave
    │   │                         # `DialogContent` a fixed target height
    │   │                         # (`h-[600px]`) ALONGSIDE its existing
    │   │                         # viewport-relative caps
    │   │                         # (`max-h-[85vh] w-[95vw] max-w-[720px]`)
    │   │                         # — the modal's size is now a pure
    │   │                         # function of the viewport, never of
    │   │                         # which tab is active (FR-019/FR-021).
    │   │                         # Switched `Tabs` from a horizontal
    │   │                         # top-row strip to a vertical left-side
    │   │                         # rail (`orientation="vertical"` +
    │   │                         # `flex-row` container) — confirmed
    │   │                         # directly against the installed
    │   │                         # `@radix-ui/react-tabs` version that
    │   │                         # this needed zero primitive changes,
    │   │                         # only markup/CSS (see
    │   │                         # components/ui/tabs.tsx below).
    │   │                         # `TabsContent` keeps its existing
    │   │                         # `overflow-y-auto` — it just needed a
    │   │                         # properly `flex-1 min-h-0`-bounded
    │   │                         # ancestor to actually take effect,
    │   │                         # which it hadn't had before.
    │   ├── settings/             # done (020-settings-modal) — the
    │   │   │                     # SettingsModal's four tab components
    │   │   ├── appearanceTab.tsx # relocated themeToggle.tsx's `mode`
    │   │   │                     # state/effect UNCHANGED (FR-004) — only
    │   │   │                     # the visual form reverts, from that
    │   │   │                     # file's own later icon-only DropdownMenu
    │   │   │                     # redesign back to THREE DIRECTLY VISIBLE
    │   │   │                     # options. That redesign was driven
    │   │   │                     # specifically by header-crowding next to
    │   │   │                     # ScenarioLoader's own variable width in
    │   │   │                     # the shared header row — a constraint
    │   │   │                     # confirmed NOT to exist once the control
    │   │   │                     # lives inside its own dedicated modal
    │   │   │                     # tab with no competing header space
    │   │   │                     # (research.md §9).
    │   │   │                     # 024-settings-modal-visual-redesign
    │   │   │                     # (US4): the three-button row is REBUILT
    │   │   │                     # on this app's shared Tabs/TabsList/
    │   │   │                     # TabsTrigger primitive (state/effect
    │   │   │                     # wiring unchanged) — a real, keyboard-
    │   │   │                     # navigable role="tab" control instead of
    │   │   │                     # three independent role="button"
    │   │   │                     # elements. This nests a SECOND
    │   │   │                     # role="tablist" inside settingsModal.tsx's
    │   │   │                     # own outer one; both gained a distinct
    │   │   │                     # aria-label ("Theme" here, "Settings
    │   │   │                     # sections" on the outer TabsList) so any
    │   │   │                     # query can tell them apart — the same
    │   │   │                     # class of nested-role="tab" collision
    │   │   │                     # risk 014-graphic-walker-panel already
    │   │   │                     # taught this codebase to guard against
    │   │   │                     # up front (research.md §3). Confirmed via
    │   │   │                     # direct grep, not assumed: every existing
    │   │   │                     # test query for "System"/"Light"/"Dark"
    │   │   │                     # used role="button"+aria-pressed and
    │   │   │                     # needed migrating to role="tab"+
    │   │   │                     # aria-selected — more call sites than
    │   │   │                     # this feature's own plan.md originally
    │   │   │                     # estimated ("only two assertions"), a
    │   │   │                     # real correction made during
    │   │   │                     # implementation, not left stale.
    │   │   ├── scenariosTab.tsx  # relocated scenarioLoader.tsx's list/
    │   │   │                     # add/remove/baseline-mark logic
    │   │   │                     # UNCHANGED (FR-006), plus three real
    │   │   │                     # differences: (1) renders each
    │   │   │                     # scenario's real `path` (FR-005, new)
    │   │   │                     # and `label ?? name` via
    │   │   │                     # hooks/useScenarioList.ts (not
    │   │   │                     # appState.list()/useActiveScenarios());
    │   │   │                     # (2) LOCAL-deployment-mode handling is
    │   │   │                     # CORRECTED (FR-019, research.md §8) —
    │   │   │                     # scenarioLoader.tsx used to return
    │   │   │                     # `null` entirely (hiding the whole
    │   │   │                     # list/baseline/remove controls, not
    │   │   │                     # just the loader) whenever
    │   │   │                     # isLocalDeployment() was true; this
    │   │   │                     # component instead ALWAYS renders its
    │   │   │                     # full content, with only "Load Local
    │   │   │                     # Scenario" itself going
    │   │   │                     # disabled-with-tooltip, via the exact
    │   │   │                     # same TooltipProvider/disabled-span
    │   │   │                     # pattern already proven for the
    │   │   │                     # no-File-System-API case; (3) new
    │   │   │                     # move-up/move-down controls (US3,
    │   │   │                     # FR-007) calling appState.moveScenario(),
    │   │   │                     # and a new fully store-driven
    │   │   │                     # controlled `<input>` per row (US4,
    │   │   │                     # FR-009/FR-010) calling
    │   │   │                     # appState.setLabel()/clearLabel() on
    │   │   │                     # every change, `value={s.label ?? ''}`/
    │   │   │                     # `placeholder={s.name}` — no local
    │   │   │                     # draft state, matching every other
    │   │   │                     # control in the same row. A real,
    │   │   │                     # confirmed bug found while testing
    │   │   │                     # this: `Button`'s own base CSS classes
    │   │   │                     # already include `font-medium`, so a
    │   │   │                     # test locator keying on that class
    │   │   │                     # collided with the row's own move
    │   │   │                     # buttons — fixed with a dedicated
    │   │   │                     # `data-testid="scenario-name"`.
    │   │   │                     # 024-settings-modal-visual-redesign
    │   │   │                     # (US1): each row gains a color status
    │   │   │                     # dot (new `scenarioStatusColor.ts`, a
    │   │   │                     # pure module same category as
    │   │   │                     # `panels/zonemapColor.ts`/
    │   │   │                     # `panels/sankeyColor.ts`) ALONGSIDE the
    │   │   │                     # existing "(status)" text, not replacing
    │   │   │                     # it (FR-001) — `ready`→new `--success`
    │   │   │                     # token, `failed`→the SAME `--destructive`
    │   │   │                     # this tab's own load-error text already
    │   │   │                     # uses, `registering`→neutral/pulsing,
    │   │   │                     # no new color. Confirmed directly
    │   │   │                     # (`state/appState.ts`) that
    │   │   │                     # `ScenarioStatus` has no "warning" third
    │   │   │                     # value at all — the feature request's own
    │   │   │                     # "yellow for warning" suggestion doesn't
    │   │   │                     # map to any real status, recorded as an
    │   │   │                     # Assumption rather than invented.
    │   │   │                     # SUPERSEDED by a second pass, same
    │   │   │                     # feature: the dot+"(status)"-text change
    │   │   │                     # above was correctly assessed by the
    │   │   │                     # user as incremental polish on the
    │   │   │                     # existing single-line-per-row shape, not
    │   │   │                     # a real redesign — the same failure mode
    │   │   │                     # this project already hit once with
    │   │   │                     # 015-map-navigation-controls' 3D toggle
    │   │   │                     # button (three rounds of unproductive
    │   │   │                     # text-only iteration). Fixed the same way
    │   │   │                     # that was resolved: consulting this
    │   │   │                     # environment's own design skill directly,
    │   │   │                     # AND grounding the row layout in a real
    │   │   │                     # reference — `gropaul/dash`'s own
    │   │   │                     # installed `connections-view.tsx`
    │   │   │                     # (fetched and read directly from
    │   │   │                     # `gropaul/dash-ui`, docs/PIPELINE.md's
    │   │   │                     # own on-record design-inspiration note —
    │   │   │                     # its own UI source, not the extension
    │   │   │                     # repo, and confirmed to run nearly the
    │   │   │                     # same stack this app already does:
    │   │   │                     # Next.js/React/Tailwind/Radix/CVA/
    │   │   │                     # lucide-react). The ACTUAL row shape is
    │   │   │                     # now: one card surface (`rounded-xl
    │   │   │                     # border bg-card overflow-hidden`) with a
    │   │   │                     # summary band above the rows ("N
    │   │   │                     # scenarios loaded · N need attention" —
    │   │   │                     # "surface the summary before the
    │   │   │                     # detail," the artifact-design skill's own
    │   │   │                     # "When it's a UI, not a document"
    │   │   │                     # section); rows are hairline-`border-b`
    │   │   │                     # separated INSIDE that card, not N
    │   │   │                     # individually-bordered boxes; each row is
    │   │   │                     # a real two-tier stack — leading status
    │   │   │                     # dot, a two-line identity block (label
    │   │   │                     # input on top, `font-mono text-xs`
    │   │   │                     # path below — monospace specifically
    │   │   │                     # marking it as a technical identifier,
    │   │   │                     # distinct from UI chrome), a trailing
    │   │   │                     # independently-colored "(status)" word,
    │   │   │                     # then the move/baseline/remove actions
    │   │   │                     # grouped at the far end (Dash's own row
    │   │   │                     # has no per-row reorder/pin — that
    │   │   │                     # cluster's grouping convention, not its
    │   │   │                     # specific controls, is what's reused).
    │   │   │                     # A REAL, confirmed project-specific
    │   │   │                     # constraint shaped the exact classes
    │   │   │                     # used: a local `npx tailwindcss` build
    │   │   │                     # re-confirmed mapControls.css's own prior
    │   │   │                     # finding that an opacity-modifier utility
    │   │   │                     # (`bg-muted/40`, and — newly confirmed
    │   │   │                     # here — `bg-background/80`, already used
    │   │   │                     # elsewhere in this codebase, e.g.
    │   │   │                     # dialog.tsx/FlowMapPanel.tsx) generates
    │   │   │                     # NO CSS AT ALL against this project's
    │   │   │                     # plain-hex tokens.css — every
    │   │   │                     # background/hover treatment in this
    │   │   │                     # redesign uses a full-opacity token
    │   │   │                     # utility instead (`bg-muted`, never
    │   │   │                     # `bg-muted/40`). The `bg-background/80`
    │   │   │                     # instances elsewhere were NOT touched —
    │   │   │                     # out of scope for this feature, a
    │   │   │                     # separate latent bug to fix later, not
    │   │   │                     # here.
    │   │   ├── basemapTab.tsx    # 020-settings-modal's own version was a
    │   │   │                     # flat single-select `role="radio"` list
    │   │   │                     # over listBuiltInPresetNames(), applying
    │   │   │                     # immediately on click.
    │   │   │                     # 021-basemap-catalog-redesign REPLACED
    │   │   │                     # this entirely (not extended) with:
    │   │   │                     # four labeled sections (UGRC Vector
    │   │   │                     # Tiles ×3 real compositions, CARTO
    │   │   │                     # Vector Tiles ×3, OpenFreeMap ×5, Raster
    │   │   │                     # Tiles — a curated
    │   │   │                     # `listCuratedRasterProviders()`
    │   │   │                     # dropdown); ONE persistent shared
    │   │   │                     # `maplibregl.Map` preview area above
    │   │   │                     # them, mount-scoped to the Basemap tab's
    │   │   │                     # own active lifetime (created/destroyed
    │   │   │                     # by ordinary React mount/unmount, since
    │   │   │                     # neither TabsContent nor DialogContent
    │   │   │                     # force-mount in this codebase — no
    │   │   │                     # exclusivity-guard state needed, because
    │   │   │                     # there is structurally only ever one
    │   │   │                     # preview map to begin with); and a
    │   │   │                     # stage-then-Apply flow — clicking any
    │   │   │                     # entry only sets local `stagedSelection`
    │   │   │                     # state (initialized once, on mount, to
    │   │   │                     # `useGlobalBasemap() ?? APP_DEFAULT` —
    │   │   │                     # the preview never starts blank,
    │   │   │                     # FR-011) and, for a vector selection,
    │   │   │                     # re-styles the preview map via the SAME
    │   │   │                     # `loadBasemapStyle()` every real panel
    │   │   │                     # already calls; a raster selection
    │   │   │                     # stages identically but never drives the
    │   │   │                     # live preview (FR-008/FR-013 — the
    │   │   │                     # preview area shows a placeholder
    │   │   │                     # message instead). A single Apply
    │   │   │                     # `Button` is the ONLY call site for
    │   │   │                     # `setGlobalBasemap()` anywhere in this
    │   │   │                     # component (FR-012) — closing the modal
    │   │   │                     # or switching Settings tabs with an
    │   │   │                     # unapplied staged selection discards it
    │   │   │                     # with NO explicit discard code: it lives
    │   │   │                     # only in this component's own state,
    │   │   │                     # which simply ceases to exist on unmount
    │   │   │                     # (FR-014). An earlier draft of this
    │   │   │                     # redesign gave each catalog entry its
    │   │   │                     # own independent `Popover`-based preview
    │   │   │                     # (applying immediately on click) — found
    │   │   │                     # during review to allow more than one
    │   │   │                     # preview open simultaneously; rather
    │   │   │                     # than patching that with a shared
    │   │   │                     # "which one is open" gating value, the
    │   │   │                     # whole per-entry-preview design was
    │   │   │                     # discarded in favor of the single shared
    │   │   │                     # preview above, which removes the
    │   │   │                     # multiplicity at its root instead of
    │   │   │                     # gating it — see
    │   │   │                     # `specs/021-basemap-catalog-redesign/
    │   │   │                     # research.md` §3/§4 for the full design
    │   │   │                     # history. No new dependency: no
    │   │   │                     # `components/ui/popover.tsx` exists in
    │   │   │                     # this codebase.
    │   │   │                     # 024-settings-modal-visual-redesign
    │   │   │                     # (US2/US3): REVERSES 021's own FR-008
    │   │   │                     # ("no live preview for raster
    │   │   │                     # providers") — a real, confirmed finding
    │   │   │                     # made BEFORE writing any new code:
    │   │   │                     # `loadBasemapStyle()`'s own
    │   │   │                     # `resolvePresetName()` already had a
    │   │   │                     # working raster-provider branch (built
    │   │   │                     # for Apply-time use), reached via the
    │   │   │                     # SAME call every vector entry already
    │   │   │                     # goes through — the preview effect's own
    │   │   │                     # `isRasterProviderSelection(...)` early
    │   │   │                     # return was the ONLY thing skipping it.
    │   │   │                     # Fixed by removing that bypass and the
    │   │   │                     # placeholder render — no change to
    │   │   │                     # `loadBasemapStyle.ts` at all. A second,
    │   │   │                     # real MapLibre-internal finding surfaced
    │   │   │                     # only once a genuinely-unreachable
    │   │   │                     # provider was tested end-to-end: its own
    │   │   │                     # `map.on('error', ...)` event does NOT
    │   │   │                     # reliably fire for a raster tile
    │   │   │                     # failure — `SourceCache` can self-abort
    │   │   │                     # an in-flight tile for unrelated internal
    │   │   │                     # reasons, and a self-aborted tile never
    │   │   │                     # reaches the code path that fires
    │   │   │                     # `'error'` at all (confirmed by reading
    │   │   │                     # `SourceCache#_loadTile`'s own real,
    │   │   │                     # installed source directly). Fixed with a
    │   │   │                     # bounded (4s) timeout fallback, cleared
    │   │   │                     # the moment a real tile-loaded `'data'`
    │   │   │                     # event is observed for the current
    │   │   │                     # generation — the `'error'` listener
    │   │   │                     # stays as the FAST path, the timeout is
    │   │   │                     # what makes FR-007 actually reliable.
    │   │   │                     # Also: visual polish (US3, first pass) of
    │   │   │                     # the existing flat section/entry markup —
    │   │   │                     # section headings gained a border-b/
    │   │   │                     # uppercase/muted "section label"
    │   │   │                     # treatment; entries gained a colored
    │   │   │                     # left-accent border on the staged one.
    │   │   │                     # SUPERSEDED by a second pass, same
    │   │   │                     # feature: correctly assessed by the user
    │   │   │                     # as the same "border/color accent on the
    │   │   │                     # unchanged shape" pattern already once
    │   │   │                     # unproductive in this project's own
    │   │   │                     # history (015-map-navigation-controls'
    │   │   │                     # 3D toggle button). The section-heading
    │   │   │                     # treatment above was kept (it already
    │   │   │                     # worked); the per-entry `<Button>`
    │   │   │                     # VERTICAL LIST inside each section is
    │   │   │                     # REPLACED with a responsive
    │   │   │                     # `grid-cols-[repeat(auto-fit,minmax(84px,
    │   │   │                     # 1fr))]` grid of icon-topped tiles —
    │   │   │                     # `gropaul/dash`'s own real, installed
    │   │   │                     # `view-mode-picker.tsx` (fetched directly
    │   │   │                     # from `gropaul/dash-ui`, same on-record
    │   │   │                     # inspiration source as scenariosTab.tsx's
    │   │   │                     # own note above) solves the adjacent
    │   │   │                     # "pick one of several visual options"
    │   │   │                     # problem with exactly this shape — a
    │   │   │                     # grid of square tiles (icon on top, label
    │   │   │                     # below), the SELECTED tile using the
    │   │   │                     # accent color pair, resting tiles on the
    │   │   │                     # card surface with muted text. Still no
    │   │   │                     # accordion, still no real thumbnail
    │   │   │                     # images (out of scope, unchanged) — each
    │   │   │                     # tile instead gets a new per-entry
    │   │   │                     # CATEGORY icon (Sun/Sparkles/Moon/
    │   │   │                     # Compass/Palette/Waves/Satellite/
    │   │   │                     # Mountain), an honest categorical cue
    │   │   │                     # (light/dark/hybrid/outdoors/colorful),
    │   │   │                     # never a fabricated preview of what the
    │   │   │                     # style actually renders as. The selected-
    │   │   │                     # tile pairing (`bg-accent
    │   │   │                     # text-accent-foreground`) is not a new
    │   │   │                     # convention borrowed wholesale from
    │   │   │                     # Dash — `components/ui/tabs.tsx`'s own
    │   │   │                     # `TabsTrigger` already uses that exact
    │   │   │                     # pair for the active Settings-modal tab,
    │   │   │                     # one file up from here; reusing it here
    │   │   │                     # is consistency with this app's own
    │   │   │                     # existing "active" language.
    │   │   └── documentationTab.tsx # a static placeholder (FR-014) — no
    │   │                         # `<a>` element at all, rather than a
    │   │                         # dead/placeholder href.
    │   └── sidebar.tsx           # not built yet — no feature has needed it
    ├── panels/
    │   ├── registry.tsx          # type -> component map: valuebox, plotly
    │   ├── panelQuery.ts         # PanelConfig + filters -> SQL template.
    │   │                         # 019-baseline-diff-consumption:
    │   │                         # buildComparisonDiffQuery() — 013's own
    │   │                         # zonemap-only version — generalized to
    │   │                         # plain parameters (metric, aScenario,
    │   │                         # bScenario, compareOn, expr) instead of
    │   │                         # (config: ZoneMapPanelConfig, diff);
    │   │                         # compareOn generalizes zonemap's own
    │   │                         # hardcoded metric_id to one or more
    │   │                         # join/select columns, byte-for-byte
    │   │                         # identical output for the single-column
    │   │                         # case (verified by a dedicated
    │   │                         # regression test). New
    │   │                         # resolveComparisonScenarioName(name,
    │   │                         # baseline) — resolves the new '$baseline'
    │   │                         # sentinel a comparison: diff's a/b may
    │   │                         # now hold, to appState.getBaseline()'s
    │   │                         # current value; returns undefined if
    │   │                         # unresolved, checked by the CALLER
    │   │                         # before ever building a query (never a
    │   │                         # thrown exception here) — same
    │   │                         # caller-resolves-first convention
    │   │                         # sqlExpander.ts's own inputState/
    │   │                         # activeScenarios params already
    │   │                         # established. isComparisonDiff() moved
    │   │                         # here from its previous
    │   │                         # ZoneMapPanel.tsx-local definition, now
    │   │                         # shared by all four comparison-capable
    │   │                         # panel types (plotly/table/observable-
    │   │                         # plot/zonemap), each of which gained a
    │   │                         # comparison: diff branch in their own
    │   │                         # fetch effect (identical shape across
    │   │                         # all four) plus useBaseline() in that
    │   │                         # effect's dependency array, so a live
    │   │                         # baseline change reactively recomputes
    │   │                         # with no reload. NOT the same mechanism
    │   │                         # as 018's own $baseline.<metric>
    │   │                         # sqlExpander placeholder — that's a
    │   │                         # separate, still-unconsumed-by-any-
    │   │                         # panel path (docs/GRAMMAR.md's own
    │   │                         # placeholder-reference table has the
    │   │                         # full disambiguation); this one never
    │   │                         # touches sqlExpander.ts at all, matching
    │   │                         # comparison: diff's own pre-existing
    │   │                         # "no $filters/$scenario expansion"
    │   │                         # behavior (research.md §4).
    │   │                         #
    │   │                         # Two real, confirmed findings from this
    │   │                         # feature's own implementation, not
    │   │                         # merely planned: (1) panels/
    │   │                         # observablePlotEncoding.ts's own
    │   │                         # resolveObservablePlotEncoding() now
    │   │                         # filters out any row whose configured y
    │   │                         # value is null before Plot.plot() ever
    │   │                         # sees it — this feature's own plan
    │   │                         # originally assumed Observable Plot's
    │   │                         # native null-handling would omit a
    │   │                         # null-valued barY mark the same way
    │   │                         # Plotly's does; empirically false,
    │   │                         # caught only because a real Playwright
    │   │                         # assertion against the live rendered
    │   │                         # SVG failed — barY actually renders a
    │   │                         # real <rect height="0"> at the exact
    │   │                         # position a genuine 0 value would
    │   │                         # occupy, silently indistinguishable
    │   │                         # from "no change." (2) panels/
    │   │                         # formatValue.ts's formatValue(null, ...)
    │   │                         # was found, live, to return the literal
    │   │                         # string "null" (String(null)) — fixed
    │   │                         # with an explicit null/undefined branch
    │   │                         # returning "N/A"; panels/tableLogic.ts's
    │   │                         # cellColor() gained the equivalent
    │   │                         # dedicated-color branch, matching
    │   │                         # panels/zonemapColor.ts's own
    │   │                         # already-established NO_DATA_COLOR
    │   │                         # convention for a missing value.
    │   │                         #
    │   │                         # A third, non-code finding worth
    │   │                         # recording: a single git-stash
    │   │                         # comparison first suggested this
    │   │                         # feature's own new fixture panels were
    │   │                         # causing a real regression in an
    │   │                         # unrelated 012-webgl-context-management
    │   │                         # test (moved a new zonemap fixture
    │   │                         # panel off the Summary tab in response)
    │   │                         # — a LARGER, repeated-run comparison
    │   │                         # afterward disproved that: the test
    │   │                         # fails at a similar rate (~1 in 3-4
    │   │                         # runs) with or without this feature's
    │   │                         # changes, including on the clean
    │   │                         # pre-019 commit — genuine, pre-existing
    │   │                         # flakiness. The fixture panel was left
    │   │                         # in its new (Detail tab) location
    │   │                         # anyway as a harmless precaution, but
    │   │                         # the move is explicitly NOT a proven
    │   │                         # fix — a real example of this project's
    │   │                         # own "confirm before concluding"
    │   │                         # discipline catching its own
    │   │                         # insufficiently-sampled first
    │   │                         # conclusion, not just other people's.
    │   ├── ValueBoxPanel.tsx
    │   ├── PlotlyPanel.tsx
    │   ├── plotlyTraces.ts       # pure trace-resolution logic (split out of
    │   │                         # PlotlyPanel.tsx — plotly.js-dist-min
    │   │                         # references `self` at module load, which
    │   │                         # breaks Vitest's Node environment)
    │   ├── PanelEmptyState.tsx   # shared empty-result state
    │   ├── PanelErrorState.tsx   # shared error state
    │   ├── TablePanel.tsx        # done (005-table-panel)
    │   ├── tableLogic.ts         # pure sort/paginate/search/color-scale
    │   │                         # logic, split out of TablePanel.tsx same
    │   │                         # reason as plotlyTraces.ts (005)
    │   ├── formatValue.ts        # pure value-formatting helper (005)
    │   ├── MarkdownPanel.tsx     # done (006-markdown-panel) — marked +
    │   │                         # DOMPurify, sanitized rendering
    │   ├── ObservablePlotPanel.tsx # done (007-observable-plot-panel)
    │   ├── observablePlotEncoding.ts # pure, DOM-free mark/options
    │   │                         # resolution, split out of
    │   │                         # ObservablePlotPanel.tsx same reason as
    │   │                         # plotlyTraces.ts (007)
    │   ├── SankeyPanel.tsx       # done (008-sankey-panel) — the sixth
    │   │                         # panel type (flowmap and zonemap below
    │   │                         # are the seventh and eighth/final
    │   │                         # ones, not this)
    │   ├── sankeyGraph.ts        # pure, DOM-free rows-to-graph transform +
    │   │                         # d3-sankey layout wrapper, split out of
    │   │                         # SankeyPanel.tsx same reason as
    │   │                         # plotlyTraces.ts (008)
    │   ├── sankeyColor.ts        # pure color_scheme name resolution (008)
    │   ├── FlowMapPanel.tsx      # done (010-flowmap-panel) — the seventh
    │   │                         # and final originally-listed panel
    │   │                         # type, and this codebase's first real
    │   │                         # map (MapLibre + MapboxOverlay +
    │   │                         # FlowmapLayer, imperative mount-
    │   │                         # lifetime instance — genuinely
    │   │                         # different rendering model from every
    │   │                         # prior chart panel type)
    │   ├── flowmapData.ts        # pure, DOM-free rows-to-locations/flows
    │   │                         # transform, split out of FlowMapPanel.tsx
    │   │                         # same reason as sankeyGraph.ts (010).
    │   │                         # FlowMapPanel.tsx itself gained a real
    │   │                         # basemap (011-basemap-style-system) —
    │   │                         # a second, independent setStyle()-
    │   │                         # application effect (never folded into
    │   │                         # the mount or data-update effects),
    │   │                         # keyed on panels/basemap/'s own
    │   │                         # basemapKey(), plus a scoped map.on
    │   │                         # ('error', ...) listener that only
    │   │                         # reacts before that call's own
    │   │                         # 'style.load' — a real fix, found
    │   │                         # empirically: a first, lifetime-scoped
    │   │                         # version wrongly reverted an already-
    │   │                         # successfully-loaded style on ordinary,
    │   │                         # expected post-load tile noise.
    │   │                         # 012-webgl-context-management: the
    │   │                         # MapboxOverlay flips to
    │   │                         # interleaved: true (halves per-panel
    │   │                         # WebGL context cost from 2 to 1 —
    │   │                         # confirmed via @deck.gl/mapbox's own
    │   │                         # source that interleaved mode creates
    │   │                         # no separate canvas/context of its
    │   │                         # own, unlike non-interleaved). This
    │   │                         # reopens a setStyle()-wipes-deck.gl-
    │   │                         # layers risk 011's non-interleaved
    │   │                         # design didn't have, fixed by clearing
    │   │                         # layers before setStyle() and re-
    │   │                         # populating once the new style is
    │   │                         # ready — via a NEW
    │   │                         # layerRepopulateGeneration state
    │   │                         # counter feeding the EXISTING data-
    │   │                         # update effect's own dependency array
    │   │                         # (not a new standalone helper — an
    │   │                         # earlier design that read
    │   │                         # status/rows/config directly from two
    │   │                         # long-lived event-handler closures was
    │   │                         # found to be a real stale-closure bug
    │   │                         # during this feature's own plan
    │   │                         # review). Also found empirically (and
    │   │                         # confirmed against real upstream
    │   │                         # reports, github.com/maplibre/
    │   │                         # maplibre-gl-js/discussions/2716):
    │   │                         # 'style.load' fires only ONCE per Map
    │   │                         # instance's lifetime, never again on a
    │   │                         # second+ setStyle() call — 011's own
    │   │                         # original `map.once('style.load', ...)`
    │   │                         # therefore never actually detached its
    │   │                         # scoped 'error' listener past the
    │   │                         # first basemap switch, a real latent
    │   │                         # bug this feature's own instrumentation
    │   │                         # surfaced and fixed by switching to a
    │   │                         # 'styledata'-driven one-shot check
    │   │                         # instead. That check FIRST tried
    │   │                         # filtering on getStyle().sources being
    │   │                         # non-empty (the same "simpler, race-
    │   │                         # free signal" waitForBasemapApplied()
    │   │                         # already relies on in the test suite)
    │   │                         # — found, via direct instrumentation
    │   │                         # on the fixture's own "Unreachable
    │   │                         # Basemap" panel, to be a SECOND real
    │   │                         # bug: BLANK_STYLE (loadBasemapStyle()'s
    │   │                         # own fallback for a genuinely
    │   │                         # unreachable preset) legitimately has
    │   │                         # zero sources, so that filter NEVER
    │   │                         # fired for it — the overlay's layers
    │   │                         # (cleared unconditionally just before
    │   │                         # every setStyle() call, interleaved-
    │   │                         # mode's own requirement) were silently
    │   │                         # wiped and never restored, violating
    │   │                         # FR-010/SC-004's "a missing/unreachable
    │   │                         # basemap never prevents a panel's
    │   │                         # data-driven content from rendering"
    │   │                         # guarantee — 011's own core promise.
    │   │                         # Fixed by reacting to the FIRST
    │   │                         # 'styledata' after each setStyle() call
    │   │                         # unconditionally, regardless of source
    │   │                         # count (safe: nothing else calls
    │   │                         # setStyle() on this map between
    │   │                         # registration and the call, and a
    │   │                         # repopulate triggered by an unchanged
    │   │                         # style is a safe, cheap no-op-
    │   │                         # equivalent via the data-update
    │   │                         # effect's own guards).
    │   │                         # Also new: a contextLost boolean state,
    │   │                         # independent of `status` (data-model.md's
    │   │                         # own "Map Panel Rendering State" —
    │   │                         # these answer different questions and
    │   │                         # can each change independently), driven
    │   │                         # by MapLibre's own already-built-in
    │   │                         # webglcontextlost/webglcontextrestored
    │   │                         # Map events (MapLibre already calls
    │   │                         # preventDefault() and rebuilds its own
    │   │                         # painter internally — this is wiring up
    │   │                         # existing library events, not new
    │   │                         # low-level instrumentation) — renders a
    │   │                         # distinct "Map context lost" banner
    │   │                         # overlaid on the still-mounted map
    │   │                         # container (which must never unmount
    │   │                         # while contextLost is true, since
    │   │                         # MapLibre's automatic restoration
    │   │                         # rebuilds resources against the SAME
    │   │                         # canvas element). A THIRD real bug,
    │   │                         # found only from a live user report
    │   │                         # after this feature was believed
    │   │                         # complete ("summary tab and top 2
    │   │                         # basemap-tab panels work, the rest are
    │   │                         # blank gray canvases with flow lines
    │   │                         # on top"): `BLANK_STYLE`
    │   │                         # (panels/basemap/loadBasemapStyle.ts)
    │   │                         # was a single module-level object every
    │   │                         # flowmap panel's Map was constructed
    │   │                         # with directly — MapLibre treats a
    │   │                         # Map's constructor-time/setStyle()
    │   │                         # style as a LIVE, mutable reference,
    │   │                         # not something it clones, so one
    │   │                         # panel's own real basemap transition
    │   │                         # mutated resolved sprite/glyphs fields
    │   │                         # directly onto that shared object,
    │   │                         # corrupting every other panel still
    │   │                         # starting from "blank" — invisible with
    │   │                         # one flowmap panel per tab (010/011's
    │   │                         # own coverage), only surfaced once 012
    │   │                         # made several real panels on one tab
    │   │                         # normal. Fixed with `freshBlankStyle()`
    │   │                         # (a real, independent `structuredClone`
    │   │                         # each call) — every MapLibre-facing
    │   │                         # call site (Map construction, both
    │   │                         # `setStyle(BLANK_STYLE)` fallback
    │   │                         # sites) now uses it; the exported
    │   │                         # `BLANK_STYLE` constant itself stays
    │   │                         # untouched, used only for read-only
    │   │                         # value comparisons. A FOURTH real bug,
    │   │                         # found from the SAME live user report
    │   │                         # after the third bug's own fix was
    │   │                         # believed to have resolved it (it
    │   │                         # hadn't — a genuinely different root
    │   │                         # cause behind the identical symptom):
    │   │                         # the basemap-application effect's own
    │   │                         # `transformStyle` callback (reused
    │   │                         # directly from `APP-WFRC-Commute-
    │   │                         # Patterns`, present since 011) merges
    │   │                         # `previous`-style layers not already in
    │   │                         # `next` and APPENDS them LAST — correct
    │   │                         # for a genuine future app-added custom
    │   │                         # layer (this mechanism's real intent),
    │   │                         # but wrong for `BLANK_STYLE`'s own
    │   │                         # opaque `background` layer: CARTO/
    │   │                         # OpenFreeMap presets happen to define
    │   │                         # their OWN `"background"` layer as
    │   │                         # their first layer (masking the bug in
    │   │                         # 011's own coverage), but a raster
    │   │                         # preset (no `background` layer of its
    │   │                         # own) or a namespaced composition (its
    │   │                         # own `background`, if any, renamed to
    │   │                         # `layer0__background`) do not — so
    │   │                         # `BLANK_STYLE`'s own background layer
    │   │                         # got carried forward and painted, fully
    │   │                         # opaque, on top of an already-correctly
    │   │                         # -resolved real basemap underneath it.
    │   │                         # Confirmed directly against a real
    │   │                         # production build (not just the dev
    │   │                         # server or the test suite):
    │   │                         # `map.getStyle()` showed the correct
    │   │                         # real sources/tiles genuinely fetched
    │   │                         # and loaded, with `"background"` sitting
    │   │                         # at the LAST layer-array index
    │   │                         # specifically for the two affected
    │   │                         # panel types — real tile requests had
    │   │                         # fired and succeeded; this was never a
    │   │                         # fetch problem, and neither of the
    │   │                         # first two bugs' own fixes touch this
    │   │                         # code path at all. Fixed with a new
    │   │                         # `BLANK_STYLE_LAYER_IDS` constant,
    │   │                         # excluded from what `transformStyle`
    │   │                         # preserves. Every existing "sources
    │   │                         # resolved correctly" test kept passing
    │   │                         # throughout — none of them inspect
    │   │                         # layer stacking order, which is exactly
    │   │                         # why this shipped once already; new
    │   │                         # regression coverage asserts
    │   │                         # `"background"` is absent from the
    │   │                         # affected styles' own layer id list AND
    │   │                         # samples real canvas pixels away from
    │   │                         # the flow lines to confirm they aren't
    │   │                         # uniformly `BLANK_STYLE`'s own fill
    │   │                         # color.
    │   │                         #
    │   │                         # REMOVED (later, deliberate project
    │   │                         # decision — not a bug fix, and NOT
    │   │                         # motivated by the separate flowmap
    │   │                         # line-jaggedness/antialiasing
    │   │                         # investigation happening around the
    │   │                         # same time, confirmed explicitly
    │   │                         # unrelated): the WebGL context-loss
    │   │                         # RECOVERY portion of everything
    │   │                         # described above — the `contextLost`
    │   │                         # boolean state, both
    │   │                         # `webglcontextlost`/
    │   │                         # `webglcontextrestored` Map-event
    │   │                         # listeners (and their cleanup), the
    │   │                         # "Map context lost" banner and its
    │   │                         # wrapping `position: relative` div (the
    │   │                         # containerRef div returned to a plain,
    │   │                         # unwrapped child, matching
    │   │                         # SankeyPanel.tsx's/
    │   │                         # ObservablePlotPanel.tsx's own shape),
    │   │                         # and `layerRepopulateGeneration`'s OWN
    │   │                         # context-restore-triggered call site —
    │   │                         # all gone. `interleaved: true` itself,
    │   │                         # and `layerRepopulateGeneration`'s
    │   │                         # OTHER, still-real trigger (the
    │   │                         # basemap-switch interleaved-mode
    │   │                         # layer-wipe repopulate described
    │   │                         # above), were UNCHANGED — that state
    │   │                         # counter never depended on the removed
    │   │                         # trigger for anything, confirmed
    │   │                         # directly before removing either
    │   │                         # (`layerRepopulateGeneration` itself
    │   │                         # is not gone, only one of its two
    │   │                         # callers). `ZoneMapPanel.tsx` never had
    │   │                         # any of this (confirmed directly — it
    │   │                         # has no deck.gl/`MapboxOverlay` of its
    │   │                         # own to have needed it for), so no
    │   │                         # functional change was needed there;
    │   │                         # its own comments contrasting itself
    │   │                         # against this mechanism were updated to
    │   │                         # reflect the removal. The two
    │   │                         # context-loss-specific Playwright tests
    │   │                         # this feature added ("WebGL context
    │   │                         # loss is reported honestly," "a pinned
    │   │                         # basemap recovers to itself, not the
    │   │                         # app default") were removed along with
    │   │                         # their own `loseContext()`/
    │   │                         # `restoreContext()` helpers — confirmed
    │   │                         # via grep that neither helper had any
    │   │                         # other caller. `canvasHasDrawnPixels()`
    │   │                         # (used by both removed tests) stayed —
    │   │                         # confirmed it's also used by other,
    │   │                         # unrelated still-real tests. See
    │   │                         # `specs/012-webgl-context-management/
    │   │                         # spec.md`'s own added removal note and
    │   │                         # `docs/PIPELINE.md`'s new flowmap
    │   │                         # line-jaggedness entry for the related
    │   │                         # (but explicitly not causal) investigation
    │   │                         # that was happening at the same time.
    │   │                         # 016-fix-ugrc-dark-mode: a SIXTH real
    │   │                         # bug, this one confirmed real-hardware-
    │   │                         # only (NVIDIA Quadro RTX 4000,
    │   │                         # Chromium AND Firefox) — never
    │   │                         # reproduced under Playwright's own
    │   │                         # SwiftShader software rendering,
    │   │                         # meaning this bug could only ever be
    │   │                         # found and confirmed by a human on
    │   │                         # real hardware, not by this project's
    │   │                         # own CI. Two specific real UGRC
    │   │                         # vector-tile compositions (Flowmap
    │   │                         # UGRC Composition / Flowmap UGRC
    │   │                         # Outdoors Composition) rendered with
    │   │                         # corrupted/inverted-looking colors
    │   │                         # specifically in dark mode. `color-
    │   │                         # scheme` was a strong, thoroughly-
    │   │                         # tested lead — a standalone, pure-
    │   │                         # MapLibre-no-deck.gl artifact cleanly
    │   │                         # isolated it as causal (3/3, both
    │   │                         # directions) — but THREE separate
    │   │                         # real-hardware fix variants each
    │   │                         # confirmed applying and each left both
    │   │                         # panels exactly as broken as before —
    │   │                         # RULED OUT as the real cause; the
    │   │                         # artifact's own clean result was a
    │   │                         # real but DIFFERENT effect, not the
    │   │                         # actual bug. ROOT CAUSE FOUND:
    │   │                         # `composeStyles()` never guaranteed a
    │   │                         # `background`-typed layer in its
    │   │                         # output, and neither real UGRC service
    │   │                         # provides one of its own (already
    │   │                         # indirectly confirmed by this app's
    │   │                         # own pre-existing test suite). MapLibre's
    │   │                         # own docs name this exact failure mode
    │   │                         # ("avoid transparent or semi-
    │   │                         # transparent backgrounds — have the
    │   │                         # first layer be a background layer",
    │   │                         # github.com/maplibre/maplibre-gl-js/
    │   │                         # issues/4036) and a directly matching
    │   │                         # real issue describes the same
    │   │                         # mechanism ("Opacity blending without
    │   │                         # background causing colours to
    │   │                         # darken", github.com/maplibre/
    │   │                         # maplibre-native/issues/3125) — never
    │   │                         # actually dark-mode-specific; the same
    │   │                         # defect is present in both themes, only
    │   │                         # visually obvious against this app's
    │   │                         # own dark page chrome (invisible
    │   │                         # against an already-light page/basemap
    │   │                         # in light mode). Confirmed causally,
    │   │                         # live, on real hardware, on BOTH
    │   │                         # panels independently (manually adding
    │   │                         # a background layer to the already-
    │   │                         # running map immediately fixed each
    │   │                         # one). Fixed: `composeStyles()` now
    │   │                         # injects `{ id: 'background', type:
    │   │                         # 'background', paint: {'background-
    │   │                         # color': '#ffffff'} }` at the bottom
    │   │                         # of the composed layer stack whenever
    │   │                         # none of the composed layers already
    │   │                         # provides one (checked by TYPE, not
    │   │                         # id, so a real author's own namespaced
    │   │                         # background is respected, never
    │   │                         # double-covered) — general across
    │   │                         # every composition with this gap, not
    │   │                         # scoped to these two panels by name.
    │   │                         # See `specs/016-fix-ugrc-dark-mode/
    │   │                         # diagnostic-results.md` and
    │   │                         # `research.md` §8 for the full record.
    │   │                         # Confirmed a SECOND time, real hardware,
    │   │                         # a genuine page reload of the SHIPPED
    │   │                         # fix (not just the live console patch
    │   │                         # used above to confirm causation) —
    │   │                         # both panels render correctly in dark
    │   │                         # mode, light mode unaffected, chrome
    │   │                         # unregressed, no new corruption
    │   │                         # elsewhere. RESOLVED.
    │   │                         # 017-multi-sprite-support: a SEVENTH
    │   │                         # real, separate bug, found while
    │   │                         # investigating the two UGRC panels
    │   │                         # further after 016 shipped — highway/
    │   │                         # route-shield icons were missing from
    │   │                         # both panels' road labels entirely,
    │   │                         # in both themes. Root cause:
    │   │                         # composeStyles()'s own long-standing
    │   │                         # "first sprite wins" behavior (every
    │   │                         # composed layer's sprite EXCEPT the
    │   │                         # first that declared one was silently
    │   │                         # discarded) — confirmed directly by
    │   │                         # fetching both real UGRC compositions'
    │   │                         # own sprite index JSONs: LiteBase/
    │   │                         # OutdoorsBase (layer0 in both real
    │   │                         # compositions) declare ZERO highway-
    │   │                         # shield icons; LiteLabels/
    │   │                         # Outdoors_Labels (layer1, the one
    │   │                         # that actually needs them) declare
    │   │                         # ONLY highway-shield icons — exactly
    │   │                         # the sprite "first wins" discarded.
    │   │                         # maplibre-gl@^4.7.1 (this project's
    │   │                         # pinned version) genuinely supports a
    │   │                         # multi-sprite array — confirmed
    │   │                         # directly against the installed
    │   │                         # package's real types AND runtime
    │   │                         # bundle (colon-prefixed `{spriteId}:
    │   │                         # {iconName}` lookup, landed in
    │   │                         # MapLibre 3.0). Fixed: composeStyles()
    │   │                         # now collects EVERY composed layer's
    │   │                         # own sprite into that array form
    │   │                         # (`{id: 'layer<i>', url: ...}`, one
    │   │                         # entry per layer, ALWAYS the array
    │   │                         # form even for a single sprite — no
    │   │                         # special-cased skip, confirmed
    │   │                         # necessary since a plain-string
    │   │                         # sprite has no id to prefix against
    │   │                         # at all) and rewrites every symbol
    │   │                         # layer's own `icon-image` to
    │   │                         # reference its own originating
    │   │                         # layer's sprite id. Confirmed,
    │   │                         # exhaustively (not assumed): zero of
    │   │                         # 39 real symbol layers across every
    │   │                         # currently-composed service use a
    │   │                         # style expression for icon-image
    │   │                         # (only the literal-string case
    │   │                         # exists today) — a synthetic test
    │   │                         # covers the hypothetical expression
    │   │                         # case anyway (warn, leave
    │   │                         # unrewritten, never silent). Unlike
    │   │                         # 016's own GPU-dependent defect, this
    │   │                         # one is a data-lookup process, not a
    │   │                         # rendering one — confirmed fully
    │   │                         # verifiable via Playwright alone
    │   │                         # (MapLibre's own real, public
    │   │                         # `map.hasImage()`/`listImages()` API),
    │   │                         # no real-hardware step needed. See
    │   │                         # `specs/017-multi-sprite-support/
    │   │                         # research.md` for the full record.
    │   │                         # 021-basemap-catalog-redesign: an EIGHTH
    │   │                         # real bug, found via this feature's own
    │   │                         # new integration test coverage (never
    │   │                         # via manual/real-hardware testing this
    │   │                         # time — fully reproducible via
    │   │                         # Playwright alone). This panel's
    │   │                         # `setStyle()` call carried a
    │   │                         # `transformStyle` option (011's own
    │   │                         # original mechanism, unmodified through
    │   │                         # 012/016/017) that preserved ANY
    │   │                         # `previous`-style layer id not already
    │   │                         # in the new style — intended to protect
    │   │                         # a hypothetical future app-owned custom
    │   │                         # layer, but this panel adds none of its
    │   │                         # own (confirmed directly, not assumed).
    │   │                         # No prior test ever exercised a LIVE
    │   │                         # switch FROM a real vector style (e.g.
    │   │                         # carto-voyager) TO a raster preset — the
    │   │                         # only precedent was a raster preset set
    │   │                         # STATICALLY in a panel's own YAML config
    │   │                         # (`previous === null`, this option's own
    │   │                         # no-op case). 020/021's own global
    │   │                         # basemap picker is what first made that
    │   │                         # transition reachable at all (021 is the
    │   │                         # first feature to put a raster provider
    │   │                         # option in that picker in the first
    │   │                         # place). The bug: `transformStyle`
    │   │                         # carried carto-voyager's own real text/
    │   │                         # symbol layers forward (their ids
    │   │                         # weren't in the new style), but the
    │   │                         # merge only touched `sources`/`layers`,
    │   │                         # never `next.glyphs` — the new raster
    │   │                         # style legitimately has none — so
    │   │                         # MapLibre rejected the WHOLE merged
    │   │                         # style
    │   │                         # (`layers[N].layout.text-field: use of
    │   │                         # "text-field" requires a style "glyphs"
    │   │                         # property`) and the panel silently
    │   │                         # reverted to BLANK_STYLE via the
    │   │                         # already-existing `onLoadError` handler
    │   │                         # (working exactly as designed — the bug
    │   │                         # was upstream of it, in what got merged
    │   │                         # into the style `onLoadError` then had
    │   │                         # to reject). Traced via temporary
    │   │                         # `console.log` instrumentation on
    │   │                         # `onLoadError`/`resolveEffectiveBasemap`/
    │   │                         # the basemap-application effect itself
    │   │                         # (removed once confirmed). Fixed by
    │   │                         # REMOVING the `transformStyle` option
    │   │                         # entirely from this panel's `setStyle()`
    │   │                         # call — the preservation it provided was
    │   │                         # already a no-op for every real case in
    │   │                         # this codebase, so removing it is
    │   │                         # strictly simpler than special-casing
    │   │                         # which previous layers are "safe" to
    │   │                         # keep. ZoneMapPanel.tsx (below) has a
    │   │                         # REAL preservation need of its own (its
    │   │                         # `zonemap-zones`/`zonemap-fill` layer)
    │   │                         # and got the equivalent fix narrowed
    │   │                         # instead of removed — see that file's
    │   │                         # own entry. See
    │   │                         # `specs/021-basemap-catalog-redesign/
    │   │                         # research.md` §8 for the full record,
    │   │                         # including a SECOND, smaller finding
    │   │                         # from the same debugging session: a
    │   │                         # test asserting "no new basemap request
    │   │                         # on a theme flip" via raw page-wide
    │   │                         # network-request counting intermittently
    │   │                         # failed on unrelated MapLibre-internal
    │   │                         # resize-driven re-tiling noise — fixed
    │   │                         # by counting `setStyle()` calls directly
    │   │                         # instead, the same technique the
    │   │                         # existing "explicit pin is not
    │   │                         # re-paired" test already used reliably.
    │   ├── basemap/              # done (011-basemap-style-system) — shared
    │   │   │                     # basemap registry/resolution, consumed by
    │   │   │                     # FlowMapPanel.tsx AND (013-zonemap-panel)
    │   │   │                     # ZoneMapPanel.tsx unmodified through 013
    │   │   │                     # — confirming this module's own generic-
    │   │   │                     # across-map-panel-types design intent for
    │   │   │                     # real, not merely assumed.
    │   │   │                     # 020-settings-modal is the first feature
    │   │   │                     # to actually touch either call site (one
    │   │   │                     # line each — a new useGlobalBasemap()
    │   │   │                     # call, threaded as resolveEffectiveBasemap()'s
    │   │   │                     # new 4th argument), still symmetric with
    │   │   │                     # how both already independently call
    │   │   │                     # useColorScheme() the same way.
    │   │   ├── types.ts          # BasemapSelection/BasemapComposition/
    │   │   │                     # EffectiveBasemap. 020-settings-modal:
    │   │   │                     # BasemapSource gained a 4th literal,
    │   │   │                     # 'global' — additive, every existing
    │   │   │                     # literal/comparison unaffected.
    │   │   ├── registry.ts       # built-in CARTO/OpenFreeMap style URLs +
    │   │   │                     # resolveRasterProvider() — the real
    │   │   │                     # dotted provider.variant lookup against
    │   │   │                     # public/basemap/leaflet-providers.json
    │   │   │                     # (leaflet-providers' own real catalog
    │   │   │                     # shape, most providers nested under a
    │   │   │                     # parent with a variants map — NOT flat
    │   │   │                     # per-variant keys, a real correction
    │   │   │                     # found only once real data existed).
    │   │   │                     # A FIFTH real bug, found from a live
    │   │   │                     # user report AFTER the 012 fourth-bug
    │   │   │                     # fixture work above was believed
    │   │   │                     # complete: leaflet-providers' own
    │   │   │                     # `{attribution.ProviderName}` placeholder
    │   │   │                     # convention (real, un-extracted-away —
    │   │   │                     # the catalog JSON is the RAW pre-
    │   │   │                     # substitution provider-definitions
    │   │   │                     # object; the real substitution only
    │   │   │                     # happens inside leaflet-providers.js's
    │   │   │                     # own `initialize()`, which this app
    │   │   │                     # never calls) was never resolved at
    │   │   │                     # all — the raw placeholder text was
    │   │   │                     # passed straight through to MapLibre's
    │   │   │                     # raster source, rendering literally.
    │   │   │                     # Confirmed directly against
    │   │   │                     # leaflet-providers.js's own real
    │   │   │                     # `attributionReplacer` (quoted in
    │   │   │                     # resolveAttributionPlaceholders()'s
    │   │   │                     # own comment): a placeholder always
    │   │   │                     # references another TOP-LEVEL
    │   │   │                     # provider's own `options.attribution`
    │   │   │                     # (never a variant's), and resolution
    │   │   │                     # is genuinely RECURSIVE — a referenced
    │   │   │                     # provider's own attribution can itself
    │   │   │                     # carry another placeholder, though no
    │   │   │                     # real 2-level chain exists in the
    │   │   │                     # current catalog (confirmed directly).
    │   │   │                     # OpenTopoMap's and Esri.WorldImagery's
    │   │   │                     # own real, current attribution strings
    │   │   │                     # both genuinely contain this
    │   │   │                     # placeholder — the two regression
    │   │   │                     # cases. Fixed with
    │   │   │                     # resolveAttributionPlaceholders(),
    │   │   │                     # applied to `resolveRasterProvider()`'s
    │   │   │                     # return value before it reaches EITHER
    │   │   │                     # of loadBasemapStyle.ts's two call
    │   │   │                     # sites (resolvePresetName's simple-
    │   │   │                     # preset branch, composeStyles' raster-
    │   │   │                     # layer branch) — same fail-soft
    │   │   │                     # convention as everything else in this
    │   │   │                     # feature (an unresolvable reference
    │   │   │                     # leaves that one placeholder's raw text
    │   │   │                     # in place rather than throwing or
    │   │   │                     # dropping the whole string), plus a
    │   │   │                     # depth cap the real upstream code has
    │   │   │                     # no equivalent of at all (pure defense
    │   │   │                     # against a hypothetical malformed/
    │   │   │                     # circular catalog hanging the browser
    │   │   │                     # — no real cycle exists today).
    │   │   │                     # 020-settings-modal added
    │   │   │                     # listBuiltInPresetNames() — every
    │   │   │                     # BUILT_IN_PRESETS key, for the Settings
    │   │   │                     # modal's Basemap tab picker (FR-011);
    │   │   │                     # BUILT_IN_PRESETS itself was never
    │   │   │                     # exported before, only single-name
    │   │   │                     # lookup via resolveUrlPreset().
    │   │   │                     # 021-basemap-catalog-redesign generalized
    │   │   │                     # BUILT_IN_PRESETS from
    │   │   │                     # Record<name, UrlPreset> to a tagged
    │   │   │                     # union (UrlPreset | CompositionPreset),
    │   │   │                     # replacing resolveUrlPreset() with
    │   │   │                     # resolveBuiltInPreset() — same lookup,
    │   │   │                     # generalized return type — and added
    │   │   │                     # three named UGRC composition aliases
    │   │   │                     # ('ugrc-vector-lite'/'-hybrid'/
    │   │   │                     # '-outdoors', the exact three real
    │   │   │                     # compositions already fixture-proven by
    │   │   │                     # 011/016/017, promoted from ad hoc
    │   │   │                     # dashboard-3-basemaps.yaml panels into
    │   │   │                     # reusable presets). Also replaced the
    │   │   │                     # theme-paired APP_DEFAULT_LIGHT/
    │   │   │                     # APP_DEFAULT_DARK pair with one static
    │   │   │                     # APP_DEFAULT ('carto-voyager') — see
    │   │   │                     # resolveEffectiveBasemap.ts below. New
    │   │   │                     # listCuratedRasterProviders() export — a
    │   │   │                     # read-only VIEW over the SAME cached
    │   │   │                     # leaflet-providers.json fetch
    │   │   │                     # resolveRasterProvider() already
    │   │   │                     # performs (no second network request),
    │   │   │                     # computed (not hand-copied) by checking
    │   │   │                     # every effective URL a provider can
    │   │   │                     # produce against three conditions — no
    │   │   │                     # API-key/token placeholder, HTTPS-only,
    │   │   │                     # no URL-template token outside
    │   │   │                     # {s}/{r}/{variant}/{z}/{x}/{y} — plus
    │   │   │                     # one explicit editorial exclusion
    │   │   │                     # (CartoDB, whose vector GL styles are
    │   │   │                     # already offered more prominently
    │   │   │                     # elsewhere in the same catalog).
    │   │   │                     # Deliberately lets its own catalog-fetch
    │   │   │                     # rejection propagate (unlike
    │   │   │                     # resolveRasterProvider()'s fail-soft
    │   │   │                     # "return undefined") — the Basemap tab's
    │   │   │                     # loading/error/empty UI states need to
    │   │   │                     # distinguish a genuine fetch failure
    │   │   │                     # from an empty result.
    │   │   ├── resolveEffectiveBasemap.ts # pure panel > tab > app-default
    │   │   │                     # precedence resolver + basemapKey()
    │   │   │                     # (the content-stable identity
    │   │   │                     # FlowMapPanel.tsx's own basemap effect
    │   │   │                     # keys its dependency array on, so a
    │   │   │                     # pinned basemap's resolved value never
    │   │   │                     # changes across a theme flip).
    │   │   │                     # 020-settings-modal added an optional
    │   │   │                     # 4th parameter, `globalBasemap`, and a
    │   │   │                     # new 3rd-priority branch between `tab`
    │   │   │                     # and `app-default` — a viewer's
    │   │   │                     # Settings-modal Basemap-tab pick FILLS
    │   │   │                     # the app-default fallback tier
    │   │   │                     # specifically, never outranking an
    │   │   │                     # author's own explicit panel/tab
    │   │   │                     # `basemap:` (FR-012). Backward
    │   │   │                     # compatible — the existing 4-row truth
    │   │   │                     # table stayed valid unchanged, a 5th
    │   │   │                     # row added for the new branch.
    │   │   │                     # 021-basemap-catalog-redesign REMOVED
    │   │   │                     # the `theme` parameter entirely — the
    │   │   │                     # bottom fallback tier is now the single
    │   │   │                     # static APP_DEFAULT unconditionally,
    │   │   │                     # never theme-dependent (confirmed
    │   │   │                     # directly, not assumed: `theme` was
    │   │   │                     # consumed by exactly one ternary in the
    │   │   │                     # bottom branch). The `ColorScheme` type
    │   │   │                     # this file used to export is deleted
    │   │   │                     # along with it. This function's only two
    │   │   │                     # callers (FlowMapPanel.tsx/
    │   │   │                     # ZoneMapPanel.tsx) each dropped the
    │   │   │                     # now-removed 3rd positional argument —
    │   │   │                     # `useColorScheme()` was each panel's
    │   │   │                     # ONLY use of that hook, confirmed dead
    │   │   │                     # and deleted from both, not left as an
    │   │   │                     # unused import.
    │   │   └── loadBasemapStyle.ts # BLANK_STYLE + preset/raster resolution
    │   │                         # + composeStyles() (the generic
    │   │                         # multi-source composition mechanism,
    │   │                         # FR-006/FR-008/FR-012 — proven during
    │   │                         # development against UGRC's real
    │   │                         # 2-layer LiteBase+LiteLabels service,
    │   │                         # never shipped as a named preset here).
    │   │                         # Inlines each vector source's own
    │   │                         # TileJSON `tiles` array at composition
    │   │                         # time rather than leaving a `url`
    │   │                         # reference — MapLibre cannot resolve a
    │   │                         # fetched TileJSON's own relative
    │   │                         # `tiles` template for an in-memory,
    │   │                         # non-setStyle(url)-loaded style (found
    │   │                         # empirically against the real UGRC
    │   │                         # endpoint, not assumed)
    │   │                         # composeStyles() later (012, fixture
    │   │                         # work) gained a SECOND composition-layer
    │   │                         # shape: a bare raster provider preset
    │   │                         # name (no http(s):// scheme, e.g.
    │   │                         # "Esri.WorldImagery") instead of a URL
    │   │                         # to fetch as a style document —
    │   │                         # resolved via registry.ts's own
    │   │                         # resolveRasterProvider() and inlined
    │   │                         # directly as a namespaced raster
    │   │                         # source+layer, no fetch needed (a raw
    │   │                         # ArcGIS MapServer/raster endpoint has no
    │   │                         # style-spec document the URL branch
    │   │                         # could fetch-and-merge). Built to
    │   │                         # represent UGRC's real "Vector Hybrid
    │   │                         # Base Map" (opendata.gis.utah.gov/
    │   │                         # datasets/utah-vector-hybrid-base-map,
    │   │                         # confirmed via its own live ArcGIS item
    │   │                         # JSON): Esri World Imagery raster UNDER
    │   │                         # UGRC's own real Vector_Overlay vector
    │   │                         # labels/roads service — the first
    │   │                         # raster+vector mix this mechanism needed
    │   │                         # to represent at all.
    │   │                         #
    │   │                         # A REAL bug found immediately after,
    │   │                         # via live production-build debugging
    │   │                         # (same discipline as every other 012
    │   │                         # finding — dev-server/unit tests alone
    │   │                         # didn't catch it): both this new branch
    │   │                         # AND resolvePresetName()'s own existing
    │   │                         # simple-preset raster branch built their
    │   │                         # raster source object with
    │   │                         # `maxzoom: raster.maxZoom` unconditionally
    │   │                         # — for any leaflet-providers entry that
    │   │                         # defines no maxZoom override at all
    │   │                         # (confirmed: Esri.WorldImagery in the
    │   │                         # real catalog is exactly this — only
    │   │                         # some other Esri variants like
    │   │                         # WorldTerrain/WorldPhysical define one),
    │   │                         # `raster.maxZoom` is `undefined`, but the
    │   │                         # `maxzoom` KEY still ends up own-
    │   │                         # enumerable on the resulting object
    │   │                         # (`Object.keys()` reports it even though
    │   │                         # its value is `undefined` — confirmed
    │   │                         # directly in a Node REPL, not assumed).
    │   │                         # MapLibre's real style-spec validator
    │   │                         # normalizes that to `null` for its type
    │   │                         # check, producing a genuine, user-visible
    │   │                         # "Expected value to be of type number,
    │   │                         # but found null instead" warning AND a
    │   │                         # real MapLibre 'error' event —
    │   │                         # FlowMapPanel's own FR-010 error-
    │   │                         # fallback listener (correctly, per its
    │   │                         # own coarse-by-design contract) then
    │   │                         # treats that as "the basemap failed,"
    │   │                         # reverting straight to freshBlankStyle()
    │   │                         # before any tile ever fetches — traced
    │   │                         # live via temporary console.log
    │   │                         # instrumentation in a real production
    │   │                         # preview build: resolveRasterProvider()
    │   │                         # itself resolved correctly every time,
    │   │                         # confirming the bug was downstream, in
    │   │                         # the object literal, not the lookup.
    │   │                         # Fixed with a conditional spread (the
    │   │                         # same defensive pattern
    │   │                         # inlineTileJsonSource() already used for
    │   │                         # its own optional TileJSON fields) at
    │   │                         # both call sites, omitting the key
    │   │                         # entirely instead of setting it to
    │   │                         # undefined. The existing raster+vector
    │   │                         # composition unit test had NOT caught
    │   │                         # this — it used `toMatchObject`, which
    │   │                         # only checks listed keys, never fails on
    │   │                         # an extra own-enumerable key — so a new,
    │   │                         # dedicated test was added asserting the
    │   │                         # key is truly ABSENT via `Object.keys()`/
    │   │                         # `hasOwnProperty`, confirmed to actually
    │   │                         # fail against the reverted bug before
    │   │                         # confirming it passes against the fix.
    │   │                         # 021-basemap-catalog-redesign:
    │   │                         # resolvePresetName() gained one new
    │   │                         # branch, checked before the existing
    │   │                         # raster-provider fallback: a built-in
    │   │                         # preset name may now resolve to a
    │   │                         # `kind: 'composition'` value (via
    │   │                         # registry.ts's new
    │   │                         # resolveBuiltInPreset()), in which case
    │   │                         # it calls composeStyles() with that
    │   │                         # preset's own `layers` array — the EXACT
    │   │                         # same call an author's own hand-written
    │   │                         # `basemap: { layers: [...] }` composition
    │   │                         # already reaches, proving the three new
    │   │                         # UGRC preset aliases structurally cannot
    │   │                         # diverge from what an author could
    │   │                         # always write by hand (FR-009). No
    │   │                         # change to composeStyles() itself.
    │   │                         # 027-map-auto-fit-and-reset: this panel
    │   │                         # no longer fits its initial view to a
    │   │                         # static DEFAULT_CENTER/DEFAULT_ZOOM
    │   │                         # regardless of data — a new
    │   │                         # `hasAutoFittedRef` one-shot guard, added
    │   │                         # to the existing data-update effect
    │   │                         # (zero new effects, zero dependency-array
    │   │                         # changes), calls the new
    │   │                         # `panels/mapBounds.ts`'s
    │   │                         # `computeFlowBounds()` against
    │   │                         # `buildFlowmapData()`'s own already-
    │   │                         # deduplicated `locations` output and
    │   │                         # `map.fitBounds()`s the result — but
    │   │                         # ONLY when the author configured NEITHER
    │   │                         # `center` NOR `zoom` (FR-003, the pair
    │   │                         # treated as one unit), and only once per
    │   │                         # mount, ever (FR-006 — later filter/
    │   │                         # scenario changes, basemap switches, and
    │   │                         # 004 expand/collapse never re-trigger
    │   │                         # it). Also adds a new shared
    │   │                         # `ResetViewControl` (new module,
    │   │                         # `panels/resetViewControl.ts` — the
    │   │                         # first custom `IControl` shared by BOTH
    │   │                         # map panel types, matching
    │   │                         # `mapTooltip.ts`'s own existing shared-
    │   │                         # module precedent rather than
    │   │                         # `zonemap3dControl.ts`'s zonemap-only
    │   │                         # one) to the same corner cluster as
    │   │                         # `NavigationControl`, resetting to
    │   │                         # whichever view is currently effective.
    │   │                         # A real, confirmed MapLibre finding
    │   │                         # shaped the reset design: `map.
    │   │                         # cameraForBounds(bounds, opts)` and the
    │   │                         # position `map.fitBounds(bounds, opts)`
    │   │                         # itself actually animates to — called
    │   │                         # back-to-back from the identical,
    │   │                         # untouched transform, same bounds/
    │   │                         # padding/maxZoom — can disagree
    │   │                         # measurably on the resulting center
    │   │                         # (confirmed empirically via this
    │   │                         # feature's own Playwright coverage: a
    │   │                         # real ~0.02°–0.03° drift, reproduced
    │   │                         # identically across three separate
    │   │                         # panel instances, ruled out as caused by
    │   │                         # object mutation or React 18 StrictMode's
    │   │                         # dev-only double-mount). Fixed by never
    │   │                         # predicting the destination ahead of
    │   │                         # time at all — a one-time `map.once
    │   │                         # ('moveend', ...)` listener captures the
    │   │                         # REAL landed `getCenter()`/`getZoom()`
    │   │                         # once the initial fit animation
    │   │                         # genuinely finishes, and reset always
    │   │                         # `easeTo()`s straight back to that
    │   │                         # concrete, already-resolved value —
    │   │                         # ground truth by construction, nothing
    │   │                         # left to disagree with reality. Also
    │   │                         # found and fixed during this feature's
    │   │                         # own implementation: calling a second,
    │   │                         # separate `easeTo({pitch:0,bearing:0})`
    │   │                         # immediately after `fitBounds()`
    │   │                         # INTERRUPTS it (a second camera
    │   │                         # animation call issued right after the
    │   │                         # first one starts freezes center/zoom at
    │   │                         # whatever they were at that instant) —
    │   │                         # `pitch`/`bearing` are folded into the
    │   │                         # SAME `easeTo()`/`fitBounds()` call
    │   │                         # instead (`FitBoundsOptions` already
    │   │                         # extends `CameraOptions`, which already
    │   │                         # includes both).
    │   ├── ZoneMapPanel.tsx      # done (013-zonemap-panel) — the eighth
    │   │                         # and final originally-listed panel
    │   │                         # type. Pure MapLibre choropleth + real
    │   │                         # GeoParquet (this codebase's first) —
    │   │                         # confirmed no deck.gl/MapboxOverlay
    │   │                         # capability gap (a data-driven
    │   │                         # fill-color paint expression + native
    │   │                         # mousemove/click cover fill + hover),
    │   │                         # the ONE map-rendering panel type
    │   │                         # outside 012's interleaved-mode scope
    │   │                         # entirely (012's own separate context-
    │   │                         # loss-recovery machinery, once real in
    │   │                         # FlowMapPanel.tsx, was itself later
    │   │                         # removed there — see that file's own
    │   │                         # tree entry — so there's no longer a
    │   │                         # "context-loss scope" to be outside of
    │   │                         # either way).
    │   │                         # Consumes panels/basemap/ (011)
    │   │                         # completely unmodified, confirming
    │   │                         # that module's own generic-across-
    │   │                         # map-panel-types design intent.
    │   │                         # zonemapColor.ts (color-scale
    │   │                         # resolution) and zoneGeometry.ts (the
    │   │                         # module-level, never-evicted-by-design
    │   │                         # geometry cache — a boundaries_id
    │   │                         # mismatch across panels sharing one
    │   │                         # boundaries file rejects loudly,
    │   │                         # never silently) split out same
    │   │                         # reason as every prior pure-module
    │   │                         # split. Geometry loads via
    │   │                         # registerFileURL() + read_parquet() +
    │   │                         # ST_GeomFromWKB()/ST_AsGeoJSON() —
    │   │                         # never ST_Read()/registerFileBuffer(),
    │   │                         # a real, confirmed upstream
    │   │                         # incompatibility (duckdb/
    │   │                         # duckdb-wasm#1791) a scenario-
    │   │                         # independent, registerFileURL-
    │   │                         # published boundaries: file was never
    │   │                         # going to hit anyway. DuckDB-WASM's
    │   │                         # spatial extension — confirmed NOT
    │   │                         # bundled/autoloaded, unlike parquet/
    │   │                         # json/icu/autocomplete — needs an
    │   │                         # explicit INSTALL/LOAD, fetched
    │   │                         # lazily from extensions.duckdb.org on
    │   │                         # first use; docs/ARCHITECTURE.md's
    │   │                         # existing parquet-extension "no
    │   │                         # internet required" caveat now covers
    │   │                         # this second, confirmed exception too.
    │   │                         # comparison: diff (panelQuery.ts's
    │   │                         # buildComparisonDiffQuery()) resolves
    │   │                         # its two named scenarios as literal,
    │   │                         # unvalidated view-name prefixes — the
    │   │                         # same zero-upfront-validation
    │   │                         # convention config.scenario singular
    │   │                         # already uses, corrected during
    │   │                         # implementation from an earlier, more
    │   │                         # complex draft that assumed
    │   │                         # resolveActiveScenarios() performs
    │   │                         # validation it actually doesn't. One
    │   │                         # real, confirmed implementation-time
    │   │                         # bug worth naming here too:
    │   │                         # panelQuery.ts's existing
    │   │                         # 'column' in config check (written
    │   │                         # for ValueBoxPanelConfig) also
    │   │                         # unintentionally matched
    │   │                         # ZoneMapPanelConfig's own,
    │   │                         # differently-meaning column field,
    │   │                         # silently dropping metric_id from the
    │   │                         # generated SQL and rendering every
    │   │                         # zone as "no data" with no error at
    │   │                         # all — found via Playwright, not
    │   │                         # typecheck or any unit test; fixed by
    │   │                         # also excluding any config that
    │   │                         # carries metric_id.
    │   │                         # 021-basemap-catalog-redesign: NARROWED
    │   │                         # this panel's own `transformStyle`
    │   │                         # option (011/012's original "preserve
    │   │                         # any previous-style layer id not already
    │   │                         # in next" mechanism, unmodified until
    │   │                         # now) from that unscoped shape to
    │   │                         # preserving ONLY `previous` layers whose
    │   │                         # `source` is this panel's own SOURCE_ID
    │   │                         # ('zonemap-zones') — its real, current
    │   │                         # need (FILL_LAYER_ID/EXTRUSION_LAYER_ID)
    │   │                         # is satisfied exactly, while a
    │   │                         # third-party basemap's own real content
    │   │                         # (e.g. carto-voyager's text/symbol
    │   │                         # layers) is never eligible for
    │   │                         # preservation regardless of what the
    │   │                         # next style does or doesn't provide.
    │   │                         # Companion fix to FlowMapPanel.tsx's own
    │   │                         # entry above (that panel had NO real
    │   │                         # preservation need at all and had this
    │   │                         # option removed entirely instead) — see
    │   │                         # that entry, and
    │   │                         # `specs/021-basemap-catalog-redesign/
    │   │                         # research.md` §8, for the full bug this
    │   │                         # fixes (a real, confirmed MapLibre
    │   │                         # style-rejection when switching a
    │   │                         # zonemap FROM a real vector basemap TO a
    │   │                         # raster preset via the new global
    │   │                         # Raster Tiles picker).
    │   │                         # 027-map-auto-fit-and-reset: the same
    │   │                         # `hasAutoFittedRef`/`ResetViewControl`
    │   │                         # addition as `FlowMapPanel.tsx`'s own
    │   │                         # entry above, sourced from geometry
    │   │                         # instead of flow points —
    │   │                         # `mapBounds.ts`'s `computeGeometryBounds()`
    │   │                         # reduces the ALREADY-loaded
    │   │                         # `zoneGeometry.features` cache (013's
    │   │                         # own module-level cache, unmodified) to
    │   │                         # its real polygon extent, independent of
    │   │                         # which zones have matching metric data
    │   │                         # (FR-002) — added inside the existing
    │   │                         # data-update effect, gated the same way
    │   │                         # (no `center`/`zoom` configured, once
    │   │                         # per mount). `onReset` additionally
    │   │                         # resets the existing 3D toggle
    │   │                         # (`is3dRef`/`threeDToggle.setActive`/
    │   │                         # layer visibility) before easing
    │   │                         # pitch/bearing back to 0 — a viewer who
    │   │                         # tilted into 3D and hits reset gets back
    │   │                         # to the panel's genuine flat starting
    │   │                         # state, not a tilted view of the correct
    │   │                         # bounds. Hit the SAME real
    │   │                         # `cameraForBounds()`-vs-`fitBounds()`-
    │   │                         # actual-landing-spot discrepancy
    │   │                         # `FlowMapPanel.tsx`'s own entry above
    │   │                         # documents in full — this file's own
    │   │                         # three real fixture panels sharing one
    │   │                         # `boundaries` file reproduced it
    │   │                         # identically byte-for-byte (same
    │   │                         # resolved-vs-landed drift on all three),
    │   │                         # which is what first ruled out a
    │   │                         # per-instance fluke and pointed at the
    │   │                         # `moveend`-capture fix instead.
    │   └── GraphicWalkerPanel.tsx # done (014-graphic-walker-panel) — the
    │                              # ninth and final originally-listed
    │                              # panel type. Renders <GraphicWalker>
    │                              # as ordinary JSX in its own React
    │                              # tree — NOT embedGraphicWalker
    │                              # (DOM-mount), reversing this file's
    │                              # own original sketch: embedGraphicWalker's
    │                              # own real, installed source creates an
    │                              # independent React root it never
    │                              # exposes, so it can never be disposed —
    │                              # a real, confirmed leak (38 real
    │                              # document/window listeners + a MobX
    │                              # store per mount) given shell.tsx
    │                              # mounts only the active tab's
    │                              # DashboardRenderer (every tab switch
    │                              # is a real mount/unmount cycle). See
    │                              # "Graphic Walker panel" below for the
    │                              # full finding. panels/
    │                              # graphicWalkerFields.ts (new, pure) —
    │                              # apache-arrow DataType-predicate field-
    │                              # schema inference, this app's own code
    │                              # rather than the library's internal,
    │                              # non-public-API lib/inferMeta. Pins
    │                              # @kanaries/graphic-walker to the EXACT
    │                              # version "0.4.82" (no ^ range) — its
    │                              # peer dependency requires React >=19
    │                              # starting at 0.4.83, and a ^0.4.82
    │                              # range was confirmed, live, to still
    │                              # resolve to 0.4.84 and reproduce that
    │                              # exact conflict (npm's own ^0.x.y
    │                              # semantics keep the whole 0.x minor in
    │                              # range) — the exact pin is load-
    │                              # bearing, not a style choice.
    │                              # 028-graphic-walker-dataset-picker
    │                              # added a NEW, opt-in capability
    │                              # alongside 014's original fixed-
    │                              # dataset behavior (never a
    │                              # replacement — every existing config
    │                              # is unaffected): a new
    │                              # `dataset_picker?: boolean` field on
    │                              # `GraphicWalkerPanelConfig`
    │                              # (`dataset` itself stays required
    │                              # unconditionally — it's simply the
    │                              # picker's initial selection) shows the
    │                              # viewer a control listing every
    │                              # dataset genuinely queryable against
    │                              # the active scenario(s), and lets them
    │                              # switch it at view time — re-querying
    │                              # and discarding whatever chart they'd
    │                              # built, by design (a fresh `data`/
    │                              # `fields` prop pair is what
    │                              # `<GraphicWalker>` needs anyway; no
    │                              # explicit "reset" call exists). New
    │                              # pure module `panels/
    │                              # graphicWalkerDatasets.ts` —
    │                              # `listSelectableDatasets()` derives
    │                              # the offered list from
    │                              # `services/duckdb.ts`'s own
    │                              # already-existing `listViews()`
    │                              # (a zero-callers export since 001,
    │                              # its FIRST real consumer), filtered to
    │                              # views prefixed by a currently
    │                              # *active* scenario name (excludes
    │                              # `zoneGeometry.ts`'s own unrelated
    │                              # `zonemap-geom__*` views without a
    │                              # guessed regex — `"zonemap-geom"` can
    │                              # never itself be a registered scenario
    │                              # name) and intersected — not unioned —
    │                              # across every scenario in scope, so
    │                              # every offered choice is guaranteed to
    │                              # have a view everywhere `sqlExpander.ts`'s
    │                              # existing, unmodified `expandScenario()`
    │                              # would need one. A SECOND, real,
    │                              # confirmed gap surfaced during this
    │                              # feature's own implementation (not
    │                              # merely anticipated): view EXISTENCE
    │                              # alone doesn't guarantee column
    │                              # COMPATIBILITY across scenarios —
    │                              # `expandScenario()`'s `UNION ALL` is
    │                              # positional and throws if two
    │                              # scenarios' own copies of a metric
    │                              # have a different column count, a
    │                              # real, live case in this project's own
    │                              # fixture data (`vmt_by_home_taz` has 2
    │                              # columns under `observed`, 3 under
    │                              # `good_scenario` — a deliberate
    │                              # departure `013-zonemap-panel`'s own
    │                              # fixture generator documents for its
    │                              # own, unrelated testing needs).
    │                              # `filterSchemaConsistent()` (same
    │                              # module, still pure — the caller
    │                              # fetches columns via one
    │                              # `information_schema.columns` query
    │                              # per scenario in scope) closes it.
    │                              # `GraphicWalkerPanel.tsx`'s own
    │                              # available-datasets state became an
    │                              # async `useEffect`+state pair rather
    │                              # than a `useMemo` for exactly this
    │                              # reason — real column names require a
    │                              # real query. New UI component
    │                              # `panels/graphicWalkerDatasetPicker.tsx`
    │                              # (`DatasetPicker`) is the first real
    │                              # consumer of `components/ui/
    │                              # dropdown-menu.tsx` since both of its
    │                              # prior consumers (ThemeToggle,
    │                              # 020-settings-modal's original
    │                              # Basemap tab) were superseded — that
    │                              # file's own "zero-consumer, left in
    │                              # place deliberately" status (see
    │                              # `components/ui/` entry below) no
    │                              # longer applies. A THIRD real bug
    │                              # caught during this feature's own
    │                              # implementation, before it ever
    │                              # shipped: `graphicWalkerPanel.css`'s
    │                              # existing `.graphic-walker-panel-host
    │                              # > div` height-forcing rule (written
    │                              # for 014, targeting `<GraphicWalker>`'s
    │                              # own shadow-DOM host, its only direct
    │                              # child div at the time) would have
    │                              # ALSO matched the new picker's own
    │                              # wrapper div once it became a second
    │                              # direct child, stretching a small
    │                              # button row to the panel's full
    │                              # height — fixed by rescoping that rule
    │                              # to a new, dedicated
    │                              # `.graphic-walker-panel-content`
    │                              # wrapper (flex column layout: picker
    │                              # keeps its natural height, content
    │                              # absorbs the rest via `flex: 1;
    │                              # min-height: 0`) instead of every
    │                              # direct child indiscriminately. The
    │                              # picker is now part of every status
    │                              # branch (loading/error/empty/ready),
    │                              # not just the ready one — a viewer
    │                              # whose current selection fails (e.g.
    │                              # its scenario was deactivated
    │                              # elsewhere, or a config error) can
    │                              # still pick a different, working
    │                              # dataset from the same control instead
    │                              # of being stuck.
    ├── RechartsPanel.tsx          # done (029-shadcn-chart-panel) — the
    │                              # tenth panel type, and this app's new
    │                              # default/primary bar/line/area chart
    │                              # engine (shadcn/ui's own official
    │                              # chart component — a themed layer over
    │                              # Recharts, confirmed via direct source
    │                              # read NOT a wrapper). A fully
    │                              # declarative React component, unlike
    │                              # PlotlyPanel.tsx — Recharts (via
    │                              # shadcn's ChartContainer/
    │                              # ResponsiveContainer) re-renders on
    │                              # ordinary prop changes, no imperative
    │                              # Plotly.react()/ResizeObserver dance,
    │                              # and every color resolves from a CSS
    │                              # custom property so a theme flip
    │                              # repaints for free through the
    │                              # ordinary cascade, no re-render of
    │                              # this component needed at all. Reuses
    │                              # buildPanelQuery()/buildComparisonDiffQuery()/
    │                              # sqlExpander.expand() completely
    │                              # UNMODIFIED (this panel type needed
    │                              # zero changes to shared query code) —
    │                              # the same data-fetch effect shape
    │                              # every other data-bound panel type
    │                              # already uses. A real TypeScript
    │                              # finding during implementation:
    │                              # Recharts' own `Bar`/`Area` class
    │                              # components (a `getDerivedStateFromProps`
    │                              # static requiring a concrete `dataKey`
    │                              # prop) aren't structurally assignable
    │                              # to React's own `ElementType` when
    │                              # stored in a shared
    │                              # `Record<string, ElementType>` for
    │                              # dynamic-per-`chart_type` JSX-tag
    │                              # selection — fixed with
    │                              # `Record<string, any>`, the same
    │                              # deliberate, narrowly-scoped escape
    │                              # hatch `panels/registry.tsx`'s own
    │                              # value type already uses for the
    │                              # identical "type resolved dynamically
    │                              # at render time from a config value"
    │                              # reason. Also validates `chart_type`
    │                              # at RUNTIME, independent of the TS
    │                              # union — YAML has no schema
    │                              # validation at runtime (this project's
    │                              # own non-negotiable) — so an
    │                              # unsupported value (e.g. `pie`) fails
    │                              # fast with a specific, surfaced error
    │                              # message before any query even fires,
    │                              # never a silent blank panel.
    ├── rechartsEncoding.ts        # pure, DOM-free tidy-rows-to-Recharts'-
    │                              # own-wide-row-shape pivot + ChartConfig
    │                              # builder, split out of RechartsPanel.tsx
    │                              # same reason as plotlyTraces.ts/
    │                              # sankeyGraph.ts/flowmapData.ts/
    │                              # observablePlotEncoding.ts. Cycles
    │                              # --chart-1..--chart-5 in first-seen
    │                              # (query result) order, wrapping past
    │                              # the fifth distinct series value; a
    │                              # missing x/series combination is left
    │                              # `undefined`, never coerced to `0`.
    ├── rechartsPanel.css          # post-completion polish pass — two
    │                              # real, confirmed theme-integration
    │                              # bugs found via live DOM measurement:
    │                              # `chart.tsx`'s own default className
    │                              # relies on Tailwind slash-opacity
    │                              # modifiers (`stroke-border/50`,
    │                              # `border-border/50`) against this
    │                              # project's plain-hex tokens — the
    │                              # exact same silent-no-CSS-generated
    │                              # limitation `mapControls.css`'s own
    │                              # history already recorded, confirmed
    │                              # to still apply here too (a
    │                              # gridline's real computed stroke was
    │                              # Recharts' own hardcoded `#ccc`, the
    │                              # tooltip's own border was Tailwind's
    │                              # generic gray-200 — neither the real
    │                              # `--border` token, in either theme).
    │                              # Fixed with real `color-mix()` rules,
    │                              # matching `tableLogic.ts`'s/
    │                              # `zonemapColor.ts`'s own established
    │                              # alternative — `chart.tsx` itself
    │                              # stays untouched for this fix, kept
    │                              # pristine per this directory's own
    │                              # convention (see `components/ui/`
    │                              # entry below for the two SEPARATE,
    │                              # deliberate exceptions this same pass
    │                              # made to that convention). Also this
    │                              # pass, in `tokens.css`: `--chart-1`..
    │                              # `--chart-5` were REPLACED, TWICE —
    │                              # first with shadcn's own real default
    │                              # categorical palette (fetched from
    │                              # `ui.shadcn.com/docs/theming`, oklch→
    │                              # hex via a real canvas render — a
    │                              # `getComputedStyle()` read does NOT
    │                              # resolve `oklch()` in current
    │                              # Chromium, confirmed live), then
    │                              # SUPERSEDED (round 5, same day) by
    │                              # Observable Plot's own real
    │                              # `schemeObservable10` — read directly
    │                              # from this project's own already-
    │                              # installed `d3-scale-chromatic`
    │                              # package (the same real dependency
    │                              # `SankeyPanel.tsx` already uses for
    │                              # Tableau10, no new dependency added),
    │                              # on the user's own explicit,
    │                              # sequential requests both times. Each
    │                              # time, values failing this project's
    │                              # own 3:1 non-text contrast minimum
    │                              # (a real, confirmed gap in BOTH
    │                              # reference schemes, each tuned for
    │                              # its own site's background, not an
    │                              # arbitrary embedding app's literal
    │                              # white) were lightness-adjusted only
    │                              # (same hue/chroma, via CSS relative
    │                              # color syntax) to clear it. A
    │                              # deliberate, user-directed, one-time
    │                              # exception to this app's own Brand
    │                              # Identity rule — scoped to these 5
    │                              # categorical data-series tokens only,
    │                              # `--primary`/`--accent`/every other
    │                              # brand token untouched (see
    │                              # `wftdm-design-system` skill's own
    │                              # Brand Identity section for the full
    │                              # exception note).
    ├── components/
    │   └── ui/                   # shadcn-pattern primitives (002-design-
    │                              # tokens onward): button.tsx, card.tsx,
    │                              # tabs.tsx, tooltip.tsx, dialog.tsx (004),
    │                              # dropdown-menu.tsx (015-theme-toggle —
    │                              # ThemeToggle's icon-only trigger; only
    │                              # Root/Trigger/Content/RadioGroup/
    │                              # RadioItem exported, same "only what's
    │                              # needed" convention tooltip.tsx already
    │                              # established). Both of ITS OWN original
    │                              # consumers (ThemeToggle, 020-settings-
    │                              # modal's original Basemap tab) were
    │                              # later superseded, leaving it a real,
    │                              # confirmed zero-consumer file for a
    │                              # while — 028-graphic-walker-dataset-
    │                              # picker's `DatasetPicker`
    │                              # (`panels/graphicWalkerDatasetPicker.tsx`)
    │                              # is its first real consumer since,
    │                              # ending that status. tabs.tsx
    │                              # (021-basemap-catalog-redesign): gained
    │                              # `data-[orientation=vertical]:`
    │                              # Tailwind variants on `TabsList`/
    │                              # `TabsTrigger`, alongside their existing
    │                              # horizontal classes — Radix sets
    │                              # `data-orientation` automatically from
    │                              # the Root's own `orientation` prop, so
    │                              # this needed zero new prop threading.
    │                              # navBar.tsx's own horizontal usage
    │                              # (dashboard tab strip, unrelated to the
    │                              # Settings modal) is unaffected — it
    │                              # never sets `orientation`, so Radix's
    │                              # own default ("horizontal") still
    │                              # applies and none of the new variants
    │                              # match. chart.tsx (029-shadcn-chart-
    │                              # panel, NEW): the one file in this
    │                              # directory NOT hand-authored against
    │                              # this project's own shadcn-pattern
    │                              # convention — added verbatim via the
    │                              # real shadcn CLI (`npx shadcn@latest
    │                              # add chart`), a deliberate departure
    │                              # (research.md §5) since this
    │                              # component's own value IS being
    │                              # shadcn's real, current, maintained
    │                              # source. Exports `ChartContainer`/
    │                              # `ChartTooltip`/`ChartTooltipContent`/
    │                              # `ChartLegend`/`ChartLegendContent`/
    │                              # `ChartStyle`/`ChartConfig`. The CLI's
    │                              # own per-file overwrite prompt (`card.tsx
    │                              # already exists`) has no non-interactive
    │                              # skip via `-y` alone — required piping
    │                              # `echo "n" | npx shadcn@latest add
    │                              # chart -y` to decline overwriting
    │                              # card.tsx (confirmed preserved, still
    │                              # carries the app-wide UI/UX redesign's
    │                              # own Phase 2 `text-base` `CardTitle`
    │                              # fix, commit 138c75d) while still
    │                              # creating this file. Two later,
    │                              # deliberate, DOCUMENTED exceptions to
    │                              # its own "keep pristine" rule (a
    │                              # polish-pass round, real bugs
    │                              # backported directly from shadcn's own
    │                              # CURRENT (v3) registry source, fetched
    │                              # and diffed line-by-line, not
    │                              # style preferences): `item.value !=
    │                              # null` (was `item.value &&`, which hid
    │                              # a legitimate `0` tooltip value
    │                              # entirely) and `item.payload?.fill`
    │                              # (optional chaining). Every OTHER real
    │                              # v3 difference (Tailwind v4-only
    │                              # syntax, a new `data-slot` attribute,
    │                              # a new `initialDimension` prop) was
    │                              # considered and explicitly NOT
    │                              # adopted at the time — this project
    │                              # stayed on Tailwind v3 THEN (later
    │                              # migrated to v4 by
    │                              # 033-shadcn-default-theme — see this
    │                              # file's own Implementation order item
    │                              # 20 for the real, confirmed migration
    │                              # decision; this file (chart.tsx) was
    │                              # not touched by that migration, kept
    │                              # pristine per its own convention), and
    │                              # this app's own
    │                              # loading-skeleton-then-mount pattern
    │                              # already avoids the 0×0-first-paint
    │                              # flash `initialDimension` exists to
    │                              # prevent (see `panels/rechartsPanel.css`'s
    │                              # own tree entry above for the OTHER,
    │                              # separate real bug this same pass
    │                              # found and fixed WITHOUT touching this
    │                              # file). A THIRD, LATER round (the real
    │                              # `recharts` v2→v3 dependency upgrade,
    │                              # research.md §13) added genuinely
    │                              # NECESSARY type-only ports, not style
    │                              # backports: `ChartTooltipContent`'s
    │                              # prop type gained an `& Omit<
    │                              # RechartsPrimitive.
    │                              # DefaultTooltipContentProps<...>,
    │                              # "accessibilityLayer">` intersection
    │                              # (v3 changed `DefaultTooltipContent`'s
    │                              # own exported prop shape — the real,
    │                              # confirmed `npx tsc --noEmit` failures
    │                              # this upgrade produced before the
    │                              # fix), `ChartLegendContent` switched
    │                              # from `Pick<RechartsPrimitive.
    │                              # LegendProps, "payload" |
    │                              # "verticalAlign">` to
    │                              # `RechartsPrimitive.
    │                              # DefaultLegendContentProps` (v3 made
    │                              # `LegendProps.payload` REQUIRED,
    │                              # breaking every real call site that
    │                              # renders `<ChartLegendContent
    │                              # className="..." />` without passing
    │                              # `payload` explicitly — Recharts' own
    │                              # `<Legend content={...}>` injects it at
    │                              # runtime via `cloneElement`, invisible
    │                              # to static analysis), and the tooltip
    │                              # payload map's `key={item.dataKey}`
    │                              # became `key={index}` (v3's real
    │                              # `DataKey<any>` type can now be a
    │                              # function accessor, which React's own
    │                              # `key` prop rejects). All three ported
    │                              # directly from shadcn's own real v3
    │                              # `new-york-v4` source, confirmed
    │                              # necessary (not optional polish) by the
    │                              # real compiler errors each one fixed.
    │                              # `npx shadcn@latest add chart` was
    │                              # confirmed, live, NOT to be a path to
    │                              # any of this for this project — its own
    │                              # `components.json` `"style": "default"`
    │                              # resolves against shadcn's legacy,
    │                              # never-upgraded-to-v3 registry track,
    │                              # confirmed via a real `--dry-run` (it
    │                              # still proposes installing
    │                              # `recharts@2.15.4`, byte-for-byte the
    │                              # OLD pre-fix source) — every change
    │                              # here is a manual, independently
    │                              # verified port, not a CLI re-fetch.
    ├── scenario/                # done (009-scenario-manager) — closes
    │   │                        # services/duckdb.ts's registerScenario()
    │   │                        # zero-callers gap, open since 001
    │   ├── scenarioManager.ts  # showDirectoryPicker flow, collision
    │   │                       # handling (FR-006), isLocalDeployment()/
    │   │                       # supportsLocalFolderLoading()
    │   ├── manifestReader.ts   # reads manifest.yaml from a
    │   │                       # FileSystemDirectoryHandle directly (not
    │   │                       # a URL fetch) — yamlLoader.ts's
    │   │                       # loadConfig/loadManifest are fetch-only
    │   └── fileSystemAccess.d.ts # ambient Window.showDirectoryPicker()
    │                           # declaration — TypeScript's bundled DOM
    │                           # lib declares FileSystemDirectoryHandle
    │                           # itself (for OPFS) but not this entry
    │                           # point (confirmed against the installed
    │                           # TS version directly, not assumed)
    └── styles/
        ├── global.css
        ├── layout.css
        └── wfrc-theme.css
```

---

## Python package

```bash
uv tool install git+https://github.com/WFRCAnalytics/APP-wftdm-dashboard

wftdm-dashboard serve   # file server only — use with hosted web app
wftdm-dashboard here    # self-contained: file server + embedded app (intended no-internet;
                        # one known, confirmed exception — see ARCHITECTURE.md's own caveat
                        # on DuckDB-WASM's parquet-extension fetch)
wftdm-dashboard init --scenario-dir <path>   # scaffold default summarize.yaml + dashboard-*.yaml if missing; never overwrites
```

```toml
# Add to model repo
[tool.uv.sources]
wftdm-dashboard = { git = "https://github.com/WFRCAnalytics/APP-wftdm-dashboard" }
```

**Deployment detection:**
```js
const LOCAL = window.location.hostname === 'localhost'
// LOCAL → registerFileURL via http://localhost:8050/
// WEB   → registerFileHandle via showDirectoryPicker()
```

---

## Boot sequence (`main.ts`)

```js
await initDuckDB()                          // Web Worker init
await discoverScenarios()                   // register observed/ + public/scenarios/* + public/demo-scenarios/*
applyURLParams()                            // pre-select ?s= scenarios from URL
const dashboards = await loadDashboards()   // fetch public/dashboard-config/index.json, then each listed dashboard-*.yaml
renderShell(dashboards)                     // nav tabs, sidebar, scenario manager
renderDashboard(dashboards[0])              // first tab (Summary) as landing page
```

`026-activitysim-demo-content` added a second `loadDashboards()` call
against `public/demo-dashboard-config/`, concatenated with the existing
call's result before rendering — `loadDashboards()` itself needed **zero**
code change, since its existing `baseUrl` parameter already supported this
second call (confirmed by direct read before implementing). `discoverScenarios()`
similarly gained one new, additive call (`registerDemoScenarios()`, see
`services/scenarioDiscovery.ts`'s entry above) — both existing calls in the
snippet above are unmodified.

**Correction (`028-dashboard-branding`):** the "zero code change" claim
above was WRONG — a real, confirmed bug, found while wiring this feature's
own demo-root branding read through the same function. `loadDashboards()`
used to hardcode a literal `dashboard-config/` path SEGMENT onto whatever
`baseUrl` it was given, correct only for the app's own base path
(`import.meta.env.BASE_URL`) — 026's own second call already passed the
FULL directory (`${BASE_URL}demo-dashboard-config/`) as `baseUrl`, so that
hardcoded segment doubled it into a nonexistent
`demo-dashboard-config/dashboard-config/index.json`, silently 404ing
(the function's own existing fail-soft `if (!res.ok) return []`) and
rendering **zero** demo dashboard tabs in every real, non-test run since
026 shipped. Invisible to this project's own Playwright suite the whole
time, purely because `tests/global-setup.js` deliberately blanks
`public/demo-dashboard-config/index.json` to `[]` for every test run — an
already-empty result either way, correct path or not. Confirmed via
direct, live reproduction against a plain `vite` dev server (not the
fixture-populated Playwright harness) before fixing. Fixed by moving the
`dashboard-config/` segment into `loadDashboards()`'s own DEFAULT
parameter value instead of hardcoding it inside the function body — a
caller now passes the full directory it wants read, matching what 026's
own second call already, correctly, assumed the contract to be.
`loadDashboardBranding()` (below) shares the identical fix, having copied
the same (buggy, at the time) shape.

---

## DuckDB service API (`services/duckdb.ts`)

```js
initDuckDB()
registerScenario(name, dirHandle)   // summary/*.parquet → name__* views
unregisterScenario(name)
registerFileURL(viewName, url)      // for wftdm-dashboard serve/here mode
query(sql) → Array<Object>
queryArrow(sql) → ArrowTable
distinctValues(view, column) → Array
listViews() → Array<string>
```

Scenario namespacing: `registerScenario('abm_2026', handle)` creates views
`abm_2026__mode_share`, `abm_2026__tlfd`, etc. from `summary/*.parquet` files.

---

## Panel pattern

A React function component receiving a single `config` prop — not a
factory function returning `{ element, destroy }` (constitution v2.2.0;
that shape predates React's adoption in `002-design-tokens`).

```tsx
const ALL_FILTERS: ['*'] = ['*'] // module-level constant — stable identity,
                                  // never an inline `?? ['*']` literal (that
                                  // allocates a new array every render)

export function Panel({ config }: PanelProps) {
  const filters = useFilterState(config.filter_ids ?? ALL_FILTERS)
  const containerRef = useRef<HTMLDivElement>(null)

  // Data fetch + draw. Re-runs on config/filters change. Plotly panels call
  // Plotly.react() here — never newPlot(), never purge() — react() diffs
  // against the existing plot itself.
  useEffect(() => {
    let cancelled = false
    query(buildSQL(config, filters)).then((rows) => {
      if (!cancelled) /* draw rows into containerRef.current */
    })
    return () => { cancelled = true }
  }, [config, filters])

  // Unmount-only teardown — deliberately a second effect with an empty
  // dependency array, not folded into the effect above.
  useEffect(() => {
    return () => { /* e.g. Plotly.purge(containerRef.current) */ }
  }, [])

  return <div ref={containerRef} />
}
```

`query`/`queryArrow` come from a direct `import { query } from
'services/duckdb.ts'` — not an injected `conn`, matching how `main.ts` and
`scenarioDiscovery.ts` already consume that singleton.

`config.filter_ids` needs no defensive `useMemo`: `yamlLoader.ts` parses
each `dashboard-*.yaml` exactly once at boot and returns the parsed object
graph verbatim, so the array reference is stable across re-renders whenever
the field is present. `ALL_FILTERS` exists only to keep the *absent*-field
fallback equally stable.

---

## `useFilterState` hook (`hooks/useFilterState.ts`)

Wraps `state/filterState.ts`'s existing pub/sub store with
`useSyncExternalStore` — the React 18 hook built for exactly this: a
tearing-free subscription to an external mutable store, not React state
itself.

```ts
export function useFilterState(ids: FilterId[] | ['*']): Record<FilterId, FilterValue> {
  const cache = useRef<Record<FilterId, FilterValue>>({})

  const getSnapshot = useCallback(() => {
    const next = ids[0] === '*' ? getAll() : Object.fromEntries(ids.map((id) => [id, get(id)]))
    const prev = cache.current
    const changed =
      Object.keys(next).length !== Object.keys(prev).length ||
      Object.entries(next).some(([k, v]) => prev[k] !== v)
    if (changed) cache.current = next
    return cache.current
  }, [ids])

  return useSyncExternalStore((onChange) => subscribe(ids, onChange), getSnapshot)
}
```

The memoized snapshot is deliberate, not incidental: `filterState.getAll()`
builds a new object every call, and `useSyncExternalStore` compares
snapshots by `Object.is` — an unmemoized snapshot re-renders on every call
(or loops). The cache is only replaced when a subscribed id's value
actually differs.

---

## Panel registry

```tsx
export const registry: Record<string, ComponentType<PanelProps>> = {
  'plotly':           PlotlyPanel,
  'observable-plot':  ObservablePlotPanel,
  'table':            TablePanel,
  'valuebox':         ValueBoxPanel,
  'flowmap':          FlowMapPanel,
  'zonemap':          ZoneMapPanel,
  'sankey':           SankeyPanel,
  'graphic-walker':   GraphicWalkerPanel,
  'markdown':         MarkdownPanel,
  'recharts':         RechartsPanel,
}
```

`recharts` (029-shadcn-chart-panel) is the tenth panel type and this app's
new default/primary engine for bar/line/area charts — shadcn/ui's own
official chart component (a themed layer over Recharts, confirmed via
direct source read NOT a wrapper — `panels/RechartsPanel.tsx`, new
`components/ui/chart.tsx` added via the shadcn CLI, new `panels/
rechartsEncoding.ts` pure tidy-to-wide pivot module). `plotly`/
`observable-plot`/`sankey` are unmodified and remain fully supported for
what this new type deliberately doesn't cover: Sankey diagrams, and
Plotly's own interactive per-category legend click-to-toggle (shadcn's
shipped `ChartLegendContent` wires up no click handler at all —
`shadcn-ui/ui#4188`, a real, closed upstream request — accepted as a
deliberate gap for new `recharts` charts, not something to build here).
`chart_type: 'bar' | 'line' | 'area'` only in this version — no `pie`/
`radar`/`radial`, even though shadcn's own component supports them. New
`--chart-1`..`--chart-5` tokens (`src/styles/tokens.css`) — verified
pairwise-distinct and ≥3:1 (WCAG 1.4.11 non-text minimum) against
`--background` in both themes (`tokenContrast.test.ts`'s own new
describe block). A real, caught-before-shipping design flaw: an initial
draft reused `SankeyPanel.tsx`'s own `FALLBACK_TOKEN_VARS` sequence
directly (`--primary`, `--brand-wfrc-secondary-blue`, ...) — `--primary`
already resolves to `--brand-wfrc-secondary-blue` in dark mode, so
`--chart-1`/`--chart-2` would have rendered IDENTICALLY in dark mode,
defeating a 5-series categorical palette. Fixed with 5 genuinely distinct
hues instead (blue/amber-gold/teal-slate/gray/muted-purple) before this
ever reached a real component — see `specs/029-shadcn-chart-panel/
research.md` §1 for the full computed-contrast record.

**Recharts version history (three real, confirmed states, in order —
none of them assumed, each verified directly against installed
`node_modules`)**: (1) originally installed at `^2.15.4` — the real
shadcn CLI's own pinned version at the time, NOT npm's newer "latest" tag
`3.10.1` originally researched before implementation began (a real,
confirmed version-discrepancy correction made during that implementation).
(2) **Deliberately upgraded to `^3.10.1`** (research.md §13) — a real,
informed major-version upgrade, not drift: `npx shadcn@latest add chart`
was confirmed, live, to STILL install `recharts@2.15.4` for this project
specifically, because `components.json`'s own `"style": "default"` points
at shadcn's legacy registry track, which was never upgraded to Recharts
v3 at all — only their separate `new-york-v4` style/registry (Tailwind v4,
recharts@3.8.0) was. Re-running the CLI in this repo therefore never was,
and still isn't, a path to v3 — the upgrade here is a manual,
independently-verified dependency bump plus a hand-ported `chart.tsx` type
fix (below), not a CLI re-fetch. npm's own real current latest (`3.10.1`,
newer than the `new-york-v4` registry's own pinned `3.8.0`) was installed
instead, matching "current 3.x release," not shadcn's specific snapshot.
Confirmed real, load-bearing dependency-chain changes via direct
`npm ls`, not assumed: `react-smooth`/`recharts-scale` are GONE (v3
dropped both); `@reduxjs/toolkit`, `es-toolkit`, `decimal.js-light` are
new, recharts-exclusive additions (a genuine internal move to a
Redux-based state layer — `recharts/lib/state/store.js`'s own real
`legendSlice`/`chartData`/`cartesianAxis`/`rootProps` slices, confirmed by
direct source read); `victory-vendor` bumped `^36.6.8` → `^37.0.2`;
`immer`/`react-redux`/`reselect`/`use-sync-external-store` are ALSO real,
new recharts dependencies but were left OUT of the `recharts`
`vite.config.ts` chunk (see that file's own comment) because each is
independently already pulled in by an unrelated, pre-existing dependency
elsewhere in this tree. `lodash` was REMOVED from the chunk list
entirely — confirmed via `npm ls lodash` that it was **never actually a
recharts dependency at all**, in v2 or v3: it's `@kanaries/
graphic-walker`'s own transitive dependency, a pre-existing inaccuracy in
this project's own chunk rule now fixed (unrelated to, but surfaced by,
this upgrade). `chart.tsx` itself needed a real, necessary type-only port
(NOT the Tailwind v4 syntax, `data-slot`, or `initialDimension` — still
declined, same reasoning as before): v3 changed `DefaultTooltipContent`'s
exported prop shape and made `LegendProps.payload` required, both
confirmed via real `npx tsc --noEmit` failures before the port and a
clean pass after — see that file's own updated comments and research.md
§13 for the full, line-by-line record. All three originally-fixed real
bugs (aspect-ratio/`ChartContainer` sizing, the tooltip `indicator="dot"`
solid-swatch fix, the `ChartLegendContent` flex-wrap override) plus the
Round 6 tooltip-animation fix (`isAnimationActive={false}`) were
re-verified live, in both themes, against the real v3 runtime — all four
still hold, confirmed by direct DOM measurement/screenshot, not assumed
to carry over.

`dashboardRenderer.tsx` looks up `registry[config.type]` and renders
`<PanelComponent config={config} />` directly — no wrapper call, no manual
`.element` DOM append, no manual `.destroy()` on teardown.

---

## SQL expander (`services/sqlExpander.ts`)

- `$mappings.major_trip_mode` → WHEN clauses inside a CASE block
- `$bins.income_category` → CASE expression from manual_breaks / quantiles
- `$sql.trips_merged` → inline FROM clause joining trips + persons + households + zones
- `$filters.purpose` → current filter value (omit WHERE if value is `'all'`)
- `$scenario` → UNION ALL across all loaded scenario views

---

## Filter state (`state/filterState.ts`)

```js
get(id), set(id, value)
subscribe(ids, fn) → unsubFn   // ids: ['purpose'] or ['*'] for all
getAll() → Object
```

---

## Map panels

**FlowMapPanel** — done (`010-flowmap-panel`). Built following this
note's own original plan: the `useFilterState`/`services/duckdb.ts`
query/fetch chain reused directly, React fully in place (no stripping).
Lifecycle as planned: `maplibregl.Map` + `MapboxOverlay` created once, in
a mount-only effect → `overlay.setProps()` on data update → `map.remove()`
in that effect's cleanup, mirroring the Panel pattern's two-effect split
above — never recreated on data change. One real addition this note
didn't anticipate: a `mapReady` React-state gate on the data-update
effect (a bare `overlayRef.current` ref check has no mechanism to
re-trigger a React effect once it becomes non-null late — found during
that feature's own contract review, `specs/010-flowmap-panel/
research.md` §11). `010`'s own minimal, self-contained `background`-only
`BLANK_STYLE` remains the mount-time default and the universal fallback;
real basemap tiles were resolved by `011-basemap-style-system` (three-
level panel/tab/app-default precedence, `panels/basemap/`) and are no
longer unresolved.

`012-webgl-context-management` then fixed a real production bug: enough
flowmap panels on one tab (`010`'s non-interleaved `MapboxOverlay`, 2 real
WebGL contexts each) could exceed the browser's own concurrent-context
ceiling, silently losing context on the earliest-mounted panels — deck.gl's
own View system and viewport-gated mounting were both researched and
rejected (the former architecturally incompatible with this app's
independent, individually-004-expandable panels; the latter unneeded once
the chosen fix — `interleaved: true`, halving cost to 1 context/panel —
already clears the real floor with margin). MapLibre's own already-
built-in `webglcontextlost`/`webglcontextrestored` Map events (it already
calls `preventDefault()` and rebuilds its own painter internally) used to
drive a `contextLost` panel state, rendering a distinct "Map context
lost" banner overlaid on the still-mounted map container. A real,
confirmed MapLibre behavior surfaced during this feature's own empirical
testing (matching `github.com/maplibre/maplibre-gl-js/discussions/2716`):
`'style.load'` fires only once per `Map` instance's lifetime, never again
on a second+ `setStyle()` call — `011`'s original design assumed
otherwise; both `011`'s error-listener cleanup and `012`'s own repopulate
trigger now key off `'styledata'` instead. A follow-up, post-completion
finding corrected that first `'styledata'` handler further: it originally
still gated on the new style's `sources` being non-empty, which never
fires for `BLANK_STYLE` (legitimately zero sources) — permanently
skipping the overlay repopulate for any panel that fell back to blank.
Fixed by firing unconditionally on the FIRST `'styledata'` after each
`setStyle()` call, no sources filter at all.

**Later removed** (a deliberate project decision, not a bug fix, and
explicitly not motivated by the separate flowmap line-jaggedness/
antialiasing investigation happening around the same time — see
`docs/PIPELINE.md`'s own entry on that): the `contextLost` state, both
`webglcontextlost`/`webglcontextrestored` listeners and their cleanup,
the "Map context lost" banner and its wrapping `position: relative` div
(FlowMapPanel.tsx's own container returned to a plain, unwrapped child),
and `layerRepopulateGeneration`'s context-restore-triggered call site are
all gone from `FlowMapPanel.tsx` now. `interleaved: true` itself, and
`layerRepopulateGeneration`'s other (basemap-switch) trigger described
above, are unchanged — confirmed directly before removing anything that
neither ever depended on the removed recovery code. `ZoneMapPanel.tsx`
never had any of this to begin with (no deck.gl/`MapboxOverlay` of its
own), so needed no functional change, only a comment update. The two
Playwright tests that specifically exercised recovery were removed with
it; a general-purpose pixel-readback helper (`canvasHasDrawnPixels()`)
they'd also used stayed, since other, unrelated tests still use it.

**ZoneMapPanel** — done (`013-zonemap-panel`), built exactly to this
note's own original sketch: zone GeoParquet loaded once via DuckDB
spatial (`panels/zoneGeometry.ts`'s module-level, deliberately
never-evicted cache — a `boundaries_id` mismatch across panels sharing
one `boundaries` file rejects loudly rather than silently), metric rows
joined to features in JS, `map.getSource('zonemap-zones').setData(geojson)`
on update. Deliberately **pure MapLibre** — no `MapboxOverlay`/deck.gl at
all, confirmed no capability gap forces it (a data-driven `fill-color`
paint expression plus native `mousemove`/`click` events cover the
choropleth fill and hover/click need, matching `ar-puuk/
spatial-sql-explorer`'s own real reference implementation) — making this
the one map-rendering panel type with a single WebGL context, entirely
outside `012-webgl-context-management`'s interleaved-mode scope (that
feature's own separate context-loss-recovery machinery, once real in
`FlowMapPanel.tsx`, was itself later removed — see that panel's own note
above). Geometry itself loads via `registerFileURL()` + plain
`read_parquet()` + `ST_GeomFromWKB()`/`ST_AsGeoJSON()` — never
`ST_Read()`/`registerFileBuffer()`, a real, confirmed upstream
incompatibility (`duckdb/duckdb-wasm#1791`) a scenario-independent,
`public/geometry/`-published `boundaries:` file was never going to hit
anyway. DuckDB-WASM's `spatial` extension is confirmed NOT bundled/
autoloaded (unlike `parquet`/`json`/`icu`/`autocomplete`) — a second,
real instance of the `parquet`-extension network-fetch caveat already
below, now both documented in `docs/ARCHITECTURE.md`.

**Pinned versions (peer deps must match):**
- `@deck.gl/core` + `@deck.gl/layers` + `@deck.gl/mapbox`: ^9.0.0
- `@flowmap.gl/layers`: ^9.3.0
- `maplibre-gl`: ^4.7.1

---

## Graphic Walker panel

Done (`014-graphic-walker-panel`). The sketch this section originally
carried (`embedGraphicWalker`'s imperative DOM-mount, `query()` +
string-templated SQL) is **not** what got built — both were corrected
during implementation for real, confirmed reasons, not stylistic
drift:

```tsx
import { useEffect, useState } from 'react'
import { GraphicWalker } from '@kanaries/graphic-walker'

export function GraphicWalkerPanel({ config }: PanelProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [fields, setFields] = useState<InferredField[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const sql = sqlExpander.expand(buildGraphicWalkerQuery(config), ..., activeScenarioNames)
    queryArrow(sql).then((table) => {
      if (cancelled) return
      const nextRows = table.toArray().map((r) => r.toJSON())
      if (nextRows.length === 0) { setStatus('empty'); return }
      setRows(nextRows)
      setFields(inferFields(table.schema.fields, config.fields))
      setStatus('ready')
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [config.dataset, config.scenario, config.limit, config, activeScenarioNames])

  // ...error/empty/loading branches...
  return (
    <div style={{ height: config.height ?? 700 }}>
      <GraphicWalker data={rows} fields={fields} themeKey="g2" />
    </div>
  )
}
```

Two real, confirmed corrections from this original sketch:

1. **`queryArrow()`, not `query()`** — field-schema inference needs the
   Arrow schema alongside the row data, not just plain JS objects
   (`services/duckdb.ts`'s `queryArrow()` export existed since `001` with
   zero callers until this feature).
2. **`<GraphicWalker>` JSX, not `embedGraphicWalker`** — a real bug found
   post-completion by reading `embedGraphicWalker`'s own installed
   source directly: it creates a second, independent
   `ReactDOM.createRoot()` and never exposes it, so it can never be
   disposed. Since this app's `shell.tsx` mounts only the active tab's
   `DashboardRenderer` (a real, repeated mount/unmount cycle on every tab
   switch), that leaked 38 real `document`/`window` listeners plus a
   MobX store on every cycle. Rendering the plain `<GraphicWalker>`
   component as ordinary JSX — proven exactly equivalent in output by
   `embedGraphicWalker`'s own source — lets this app's single, unified
   React tree dispose it correctly via normal unmount reconciliation, no
   manual cleanup needed. See `specs/014-graphic-walker-panel/
   research.md` §3 for the full finding.

Graphic Walker is a snapshot — does not share DuckDB connection or respond to
global filters. Intentional — Explore tab is an open-ended sandbox.

**`028-graphic-walker-dataset-picker`** added a new, opt-in capability
alongside this — never a replacement, every existing config is
unaffected: `dataset_picker: true` shows the viewer a control listing
every dataset genuinely queryable against the active scenario(s) and lets
them switch it, re-querying and discarding whatever chart they'd built (a
fresh `data`/`fields` prop pair does this automatically — no explicit
"reset" call exists). Global-filter non-reactivity is unchanged either
way. The "queryable" list is deliberately narrower than "every view that
exists": `panels/graphicWalkerDatasets.ts`'s `listSelectableDatasets()`
intersects — never unions — the metric names available across every
scenario in scope (so a choice never fails for a scenario missing it),
excluding non-metric views like `zoneGeometry.ts`'s own
`zonemap-geom__*` by anchoring on real, currently-active scenario names
rather than a guessed pattern. A second pass, `filterSchemaConsistent()`,
then also excludes a metric whose real COLUMNS differ between scenarios
(view existence alone doesn't guarantee that) — a real, confirmed,
reachable case in this project's own fixture data (`vmt_by_home_taz` has
2 columns under `observed`, 3 under `good_scenario`), which would
otherwise make `sqlExpander.ts`'s existing `$scenario.` `UNION ALL` throw
the instant a viewer picked it.

---

## vite.config.ts

```js
export default defineConfig({
  base: '/APP-wftdm-dashboard/',        // GitHub Pages
  // base: '/wftdm-dashboard/',         // wfrc.utah.gov subdirectory
  worker: { format: 'es' },            // REQUIRED for DuckDB-WASM
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },  // REQUIRED
  build: {
    target: 'esnext',
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('@duckdb/duckdb-wasm')) return 'duckdb'
      if (id.includes('maplibre-gl'))         return 'maplibre'
      if (id.includes('plotly'))              return 'plotly'
      if (id.includes('graphic-walker'))      return 'graphic-walker'
      // recharts@^3.10.1 (upgraded from ^2.15.4 — research.md §13):
      // react-smooth/recharts-scale are gone in v3; lodash was removed
      // from this list entirely (it was never actually a recharts
      // dependency — graphic-walker's own transitive one). immer/
      // react-redux/reselect/use-sync-external-store are real, new
      // recharts deps too but deliberately left OUT here — each is
      // already pulled in by an unrelated, pre-existing dependency
      // elsewhere, so leaving them unmatched lets Rollup's own default
      // chunking place them wherever they're naturally shared.
      if (id.includes('recharts') || id.includes('@reduxjs/toolkit') ||
          id.includes('es-toolkit') || id.includes('decimal.js-light') ||
          id.includes('victory-vendor'))      return 'recharts'
    }}}
  },
  server: { headers: {                 // dev only
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  }}
})
```

---

## index.html

```html
<script src="/APP-wftdm-dashboard/coi-serviceworker.js"></script>  <!-- MUST BE FIRST -->
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

---

## package.json dependencies

```json
{
  "@duckdb/duckdb-wasm": "latest",
  "@deck.gl/core": "^9.0.0",
  "@deck.gl/mapbox": "^9.0.0",
  "@flowmap.gl/layers": "^9.3.0",
  "@kanaries/graphic-walker": "0.4.82",  // EXACT pin, not a range — the
                                          // last React-18-compatible
                                          // release; 0.4.83+ requires
                                          // React >=19 (014-graphic-
                                          // walker-panel)
  "@observablehq/plot": "latest",
  "apache-arrow": "^18.0.0",
  "js-yaml": "latest",
  "maplibre-gl": "^4.7.1",
  "plotly.js-dist-min": "latest",
  "recharts": "^3.10.1"  // 029-shadcn-chart-panel, later UPGRADED from the
                          // original ^2.15.4 the shadcn CLI itself
                          // installed (research.md §13) — a deliberate,
                          // informed major-version upgrade to npm's real
                          // current latest, not version drift. Re-running
                          // the CLI does NOT get you this version for this
                          // project: components.json's own "style":
                          // "default" points at shadcn's legacy registry
                          // track, which was never upgraded to Recharts
                          // v3 at all (only their separate "new-york-v4"
                          // style/registry was, confirmed live). Peer deps
                          // confirmed React ^18.0.0-compatible (unchanged
                          // in v3). Real dependency-chain changes,
                          // confirmed via `npm ls`: react-smooth/
                          // recharts-scale are GONE; @reduxjs/toolkit,
                          // es-toolkit, decimal.js-light are new
                          // (a genuine internal move to Redux-based
                          // state); victory-vendor bumped to ^37.0.2;
                          // immer/react-redux/reselect/
                          // use-sync-external-store are also new but
                          // already shared with other, pre-existing
                          // dependencies. lodash was NEVER actually a
                          // recharts dependency (a pre-existing, unrelated
                          // graphic-walker transitive dependency).
}
```

---

## Implementation order

Status as of `010-flowmap-panel` (re-audited against real
files/git history — `git log --oneline`, `src/scenario/`, `src/panels/`
and `src/panels/registry.tsx` on disk, `package.json` — not assumed from
the prior list; see also the `004-panel-expand-dialog` session for the
first cross-reference this list was built from). ✅ done,
🟡 partial/started, ❌ not started, ⏸️ explicitly deferred.

1. ✅ `vite.config.ts`, `index.html`, `package.json` + postinstall for
   coi-serviceworker — done (`001-data-state-layer`)
2. ✅ `services/duckdb.ts` — init, query, registerScenario, registerFileURL
   (owns DuckDB-WASM's own bundled worker; no separate duckdb.worker.ts)
   — done (`001-data-state-layer`)
3. ✅ `services/scenarioDiscovery.ts` — register `public/observed/` +
   `public/scenarios/*` + apply `?s=` URL params — done
   (`001-data-state-layer`)
4. ✅ `services/yamlLoader.ts` + `services/sqlExpander.ts` — done
   (`001-data-state-layer`)
5. ✅ `state/appState.ts` + `state/filterState.ts` — done
   (`001-data-state-layer`)
6. ✅ `layout/shell.tsx`, `navBar.tsx`, `panelCard.tsx`,
   `dashboardRenderer.tsx` — done (`003-dashboard-shell-navigation`);
   `panelCard.tsx` later extended, not rebuilt, by `004` (expand trigger)
7. ✅ `scenario/scenarioManager.ts` + `manifestReader.ts` — folder picker
   + view registration — done (`009-scenario-manager`), closing a gap
   carried forward undecided since `001`: `services/duckdb.ts`'s
   `registerScenario()` (item 2) had existed since `001` as a receiving
   API with **zero callers** until this feature built the picker UI that
   calls it (`layout/scenarioLoader.tsx`, mounted in `shell.tsx`'s
   header). Hidden entirely in `LOCAL` deployment mode
   (`hostname === 'localhost'`) — that mode has its own file-serving path
   via `scenarioDiscovery.ts` already (item 3), which remains unchanged
   and continues to handle `public/observed/`/`public/scenarios/*`
   auto-registration. The one real cross-cutting piece this feature
   needed beyond the picker itself: `appState.ts` gained a `subscribe()`
   mechanism (item 5's file, mirroring `filterState.ts`'s own shape) so a
   newly-activated local scenario refreshes already-rendered panels'
   data without discarding any panel's own local UI state — chosen over
   a cheaper remount specifically because remount would have regressed
   `004`'s and `007`'s own state-preservation guarantees (spec.md
   FR-008, research.md §1). Every data-bound panel type (item 8) now
   consumes the active-scenario set via the new `hooks/
   useActiveScenarios.ts` hook instead of reading `appState.getActive()`
   directly.
8. Panels — per-type status, list kept at its original six, not shrunk:
   - ✅ `ValueBoxPanel` — done (`003-dashboard-shell-navigation`)
   - ✅ `PlotlyPanel` — done (`003-dashboard-shell-navigation`)
   - ✅ `TablePanel` — done (`005-table-panel`); split out
     `panels/tableLogic.ts` (sort/paginate/search/color-scale, pure) and
     `panels/formatValue.ts`, same reason `plotlyTraces.ts` was split out
     of `PlotlyPanel.tsx`
   - ✅ `MarkdownPanel` — done (`006-markdown-panel`); `marked` +
     `dompurify` added to `package.json`, XSS-sanitized rendering with an
     `afterSanitizeAttributes` hook forcing `target="_blank"`/
     `rel="noopener noreferrer"` on every link
   - ✅ `ObservablePlotPanel` — done (`007-observable-plot-panel`);
     `@observablehq/plot` added to `package.json`; split out
     `panels/observablePlotEncoding.ts` (pure, DOM-free mark/options
     resolution), same reason as `plotlyTraces.ts`
   - ✅ `SankeyPanel` — done (`008-sankey-panel`); `d3-sankey` +
     `d3-scale-chromatic` added to `package.json` (plus `@types/d3-sankey`/
     `@types/d3-scale-chromatic` devDependencies — neither ships its own
     types); split out `panels/sankeyGraph.ts` (pure, DOM-free
     rows-to-graph transform + `d3-sankey` layout wrapper — a genuinely
     new data-transform problem, not just a split-for-Vitest-testability
     reason like `plotlyTraces.ts`) and `panels/sankeyColor.ts`
     (`color_scheme` name resolution). **This completes the
     originally-listed six-panel-type set** — no panel type in this list
     remains not-started
9. `FlowMapPanel` + `ZoneMapPanel` (map panels — most complex):
   - ✅ `FlowMapPanel` — done (`010-flowmap-panel`); `maplibre-gl` +
     `@deck.gl/core`/`@deck.gl/layers`/`@deck.gl/mapbox` +
     `@flowmap.gl/layers` added to `package.json` (no new
     devDependencies — every package ships its own types, unlike
     `d3-sankey`); split out `panels/flowmapData.ts` (pure, DOM-free
     rows-to-locations/flows transform, same reason `sankeyGraph.ts` was
     split out of `SankeyPanel.tsx`). This codebase's first real map —
     genuinely different rendering model from every prior panel type: the
     `maplibregl.Map`/`MapboxOverlay` instances are imperative,
     mount-lifetime objects (created once, `overlay.setProps()` on data
     change, `map.remove()` on unmount — `docs/SPEC.md`'s own documented
     wiring), not rebuilt per-render the way every chart panel type
     before it works. Also required a `vite.config.ts` `manualChunks`
     addition (a `maps` chunk) — the first panel-type feature since
     `003`'s own Plotly chunk to need a build-config change. `sankey`
     was mistakenly described as "sixth and final" in `008`'s own
     completion note, then flowmap in turn was mistakenly described as
     "the actual final one" here — `zonemap` below is the real eighth
     and final one.
   - ✅ `ZoneMapPanel` — done (`013-zonemap-panel`). **This completes the
     originally-listed eight-panel-type set** — no panel type in this
     list remains not-started (`graphic-walker`, item 10 below, was a
     separate, initially-deferred Explore-tab feature, never part of this
     eight — it's since been built too; see item 10). This project's
     first GeoParquet/DuckDB-spatial feature —
     `010-flowmap-panel` deliberately avoided needing this (its own
     `docs/GRAMMAR.md` grammar correction replaced a live spatial-join
     design with plain lat/lon field-mapping columns for flowmap
     specifically), but zonemap's own real `boundaries`/`boundaries_id`
     grammar genuinely needs it. Confirmed, not assumed, during planning
     and implementation: the DuckDB-WASM `spatial` extension is NOT
     bundled/autoloaded (unlike `parquet`/`json`/`icu`/`autocomplete`) —
     needs an explicit `INSTALL spatial; LOAD spatial;`
     (`panels/zoneGeometry.ts`'s `ensureSpatialExtensionLoaded()`), fetched
     lazily from `extensions.duckdb.org` the first time any `zonemap`
     panel loads — a second, real instance of `010`'s own already-
     documented `parquet`-extension network-fetch caveat, both now
     recorded in `docs/ARCHITECTURE.md`. Geometry itself is loaded via
     `registerFileURL()` + plain `read_parquet()` + `ST_GeomFromWKB()`/
     `ST_AsGeoJSON()` — never `ST_Read()`/`registerFileBuffer()`,
     confirmed via a real, live upstream bug
     (`duckdb/duckdb-wasm#1791`: `ST_Read()` fails against
     `registerFileBuffer()`-registered files) that a `boundaries` file
     (a scenario-independent, published `public/geometry/` static asset)
     was never going to hit anyway. Deliberately **pure MapLibre, no
     deck.gl/`MapboxOverlay`** — confirmed no capability gap forces it
     (a data-driven `fill-color` paint expression plus native
     `mousemove`/`click` events cover the choropleth fill and hover/click
     need), matching `ar-puuk/spatial-sql-explorer`'s own real, fetched
     reference implementation — making `zonemap` the one map-rendering
     panel type with a single WebGL context, entirely outside
     `012-webgl-context-management`'s interleaved-mode scope by design
     (that feature's own context-loss-recovery machinery, once real in
     `FlowMapPanel.tsx`, was itself later removed — see `CLAUDE.md`'s own
     "Map panels" section). Reuses `panels/basemap/` (011) completely
     unmodified, confirming that module's own stated generic-across-
     map-panel-types design intent. New pure modules: `panels/
     zonemapColor.ts` (color-scale resolution — extends `005-table-
     panel`'s `tableLogic.ts` `cellColor()` token-derived/capped-
     `color-mix()`/zero-anchored-diverging convention, not `008-sankey-
     panel`'s categorical `color_scheme` as originally assumed — a real
     correction made during spec-writing, not silently designed around)
     and `panels/zoneGeometry.ts` (the module-level, deliberately
     never-evicted zone-geometry cache — `boundaries_id` mismatch across
     panels sharing one `boundaries` file rejects loudly rather than
     silently picking a winner, a real gap caught and fixed before
     implementation began). `comparison: diff` (a genuinely new
     cross-scenario per-zone SQL computation, `panelQuery.ts`'s
     `buildComparisonDiffQuery()`) resolves `a`/`b` as literal,
     unvalidated view-name prefixes — the same zero-upfront-validation
     convention `config.scenario` singular already uses elsewhere in
     that file, corrected during implementation from an earlier, more
     complex draft. One real, confirmed implementation-time bug worth
     naming: `panelQuery.ts`'s existing `'column' in config` check
     (written for `ValueBoxPanelConfig`) also unintentionally matched
     `ZoneMapPanelConfig`'s own, differently-meaning `column` field,
     silently dropping `metric_id` from the generated SQL and rendering
     every zone as "no data" with no error at all — found via Playwright,
     not typecheck or any unit test; fixed by also excluding any config
     that carries `metric_id`.
10. ✅ `GraphicWalkerPanel` (Explore tab) — done
    (`014-graphic-walker-panel`). **This completes this project's
    originally-listed panel-type roadmap in full** — nine panel types
    total (`valuebox`, `plotly`, `table`, `markdown`, `observable-plot`,
    `sankey`, `flowmap`, `zonemap`, `graphic-walker`), none remaining.
    Confirmed directly against `docs/GRAMMAR.md`'s own already-documented
    `type: graphic-walker` grammar before any design work, not assumed:
    this is an *ordinary* panel entry in the same row/panel grid every
    other type uses (`dataset`/`limit`/`height`/`width`) — "Explore tab"
    is purely an authoring convention (one full-width panel in its own
    dashboard file), not a special construct the app needs to
    special-case. A real, confirmed version-compatibility finding shaped
    the dependency pin: `@kanaries/graphic-walker`'s peer dependency
    requires React `>=19.0.0` starting at `0.4.83`, incompatible with
    this project's pinned React `^18.3.1` — pinned to the exact version
    `0.4.82` instead (the last React-18-compatible release), not a caret
    range: `npm install @kanaries/graphic-walker@^0.4.82` was confirmed,
    live, to still resolve to `0.4.84` (npm's own `^0.x.y` semantics keep
    the whole `0.x` minor in range), reproducing the exact peer-dependency
    error the pin exists to avoid — the exact version string, no range
    operator, is load-bearing here, not a style choice. `0.4.82` was also
    confirmed (via a direct GitHub diff, not just a version-string read)
    to include two named bug fixes (`fix: arc`, `fix: text stack`) that
    an earlier-considered `0.4.80` pin lacks, at no React-compatibility
    cost. Renders `<GraphicWalker>` as ordinary JSX inside the panel's
    own React tree — NOT `embedGraphicWalker` (DOM-mount), reversing this
    file's own original sketch and `docs/ARCHITECTURE.md`'s "no React
    ownership required" framing above, for a real, confirmed reason found
    post-completion: `embedGraphicWalker`'s own real, installed source
    (`node_modules/@kanaries/graphic-walker/dist/vanilla.js`, read
    directly, not its `: any`-typed `.d.ts`) calls
    `ReactDOM.createRoot(dom)` and keeps that root in a fully local
    variable — never returned, never exposed, so no caller can ever
    dispose of it. The compiled bundle registers 38 real `document`/
    `window.addEventListener` calls (mostly the standard React
    `useEffect`-cleanup idiom) plus a MobX `VizSpecStore` — none of it
    gets torn down when the container is merely removed from the DOM,
    since that doesn't trigger a *different, independent* React root's
    own unmount lifecycle. This app's `shell.tsx` mounts only the active
    tab's `DashboardRenderer`, so every tab switch is a real, repeated
    mount/unmount cycle — a real, accumulating leak, not theoretical.
    Fixed by rendering the plain `<GraphicWalker>` component directly —
    `embedGraphicWalker`'s own source proves this is exactly equivalent
    in rendered output once `data`/`fields` are provided (no extra
    wrapping), so the only actual difference is disposal correctness: the
    app's own single, unified React tree now handles it via ordinary
    unmount reconciliation, no manual cleanup call needed. Confirmed via
    the full existing Playwright suite passing unchanged against the new
    component (identical rendered DOM, as the source predicted) plus a
    repeated tab-switch mount/unmount smoke test showing no new console
    errors.
    Field-schema inference (`panels/graphicWalkerFields.ts`'s
    `inferFields()`) is this app's own code, not the library's: GW's
    `fields` prop is required input, not auto-inferred from an empty
    array, and this app's own `apache-arrow`-`DataType`-predicate mapping
    (confirmed directly against the installed `apache-arrow` version
    before writing it) was judged safer than depending on the library's
    own internal, non-public-API `lib/inferMeta` module (present in the
    installed package but never re-exported from its own public entry
    point). Dataset/scenario binding reuses `sqlExpander.ts`'s existing,
    **unmodified** `$scenario.` UNION-ALL mechanism via a new, small
    `panelQuery.ts` export (`buildGraphicWalkerQuery()`) — literal reuse,
    not a parallel reimplementation; `GraphicWalkerPanelConfig` extends
    `PanelConfigBase` directly, not `DataBoundPanelConfigBase` (that base
    type requires a `metric` field this grammar never has, a real
    correction caught during `/speckit-plan`). `panelCard.tsx`/`004`'s
    `usePanelExpandHost` needed zero changes — confirmed by direct read,
    not assumed, to already be fully generic across every panel type.
    `services/duckdb.ts`'s `queryArrow()` (exported since `001`, simply
    never called by any panel type until now) gained the same
    `__debugQueryLog()` instrumentation `query()` already had — a real,
    confirmed test-instrumentation gap this feature's own testing
    surfaced, not present before. Testing needed one genuinely new
    technique this project's Playwright suite hadn't needed before:
    `@kanaries/graphic-walker`'s field list uses `react-beautiful-dnd`
    (confirmed via its own `data-rbd-*` DOM attributes), which does not
    respond to Playwright's native-HTML5-DnD-based `dragTo()`/raw mouse
    sequences reliably — its own documented keyboard drag alternative
    (focus the draggable, Space to lift, arrow keys to cross into a
    neighboring droppable, Space to drop) does, and is what
    `tests/integration/graphicWalkerPanel.spec.ts` uses throughout. A
    real, confirmed regression surfaced by this feature's own new
    Summary-tab fixture panel (added so the tab exercises all nine panel
    types together, matching every prior panel-type feature's own closing
    regression check): `dashboardShell.spec.ts`'s pre-existing, page-level
    `page.getByRole('tab')` query also picked up GraphicWalker's own
    internal chart-navigation UI (its "Data"/"Visualization" switcher and
    "Chart 1" tab strip both genuinely use `role="tab"` too) once a
    graphic-walker panel existed on the landing tab — fixed by scoping
    that query to `navBar.tsx`'s own `role="tablist"` region specifically,
    the correct fix now that the app legitimately has two independent
    tablist regions on one page, not a workaround.
11. ✅ `src/styles/tokens.css` (Tailwind CSS variables) — done
    (`002-design-tokens`). This **supersedes** the `styles/wfrc-theme.css`
    filename/approach this line originally named — that plan was replaced
    by `002`'s actual Tailwind + shadcn/ui token approach, not merely
    not-yet-built under the old name
12. 🟡 Python package (`python/`) — partial, no longer "essentially empty".
    ✅ `postprocessor/` (the summarize.yaml → Parquet pipeline) and
    `cli.py` (a `summarize` subcommand) are now real, done
    (`025-python-postprocessor`) — the foundational data-preparation step
    this dashboard has always assumed exists. Verified end-to-end against
    a real, packaged `uv run wftdm-dashboard summarize` subprocess
    invocation (not just in-process `pytest`/`CliRunner`), producing
    correct Parquet output (mode mapping + income binning + a 3-table join
    all confirmed correct together) and a correct `manifest.yaml`.
    `server.py`/`static/`/`templates/` (the `serve`/`here`/`init`
    subcommands) remain ❌ not started — separate, still-unscoped work;
    `pyproject.toml` gained two new dependencies this feature needed and
    didn't have before: `PyYAML` (no YAML parser existed on the Python
    side at all) and `pytest` (dev-only, this package's first test
    runner)
13. ✅ Panel error/empty/loading states — done
    (`003-dashboard-shell-navigation`). `PanelErrorState.tsx`/
    `PanelEmptyState.tsx` are shared components; loading states are
    **deliberately** inline per panel (`animate-pulse` skeletons directly
    in `ValueBoxPanel.tsx`/`PlotlyPanel.tsx`) rather than a third shared
    component — `003`'s own research.md documents this as a considered
    choice (no reusable loading pattern existed to port, unlike
    error/empty), not an inconsistency to fix later
14. ✅ Generic panel expand-to-dialog mechanism
    (`layout/panelExpandHost.tsx`, `components/ui/dialog.tsx`) — done
    (`004-panel-expand-dialog`). Not part of this list when originally
    written — a cross-cutting capability at the `panelCard.tsx` level
    (every registry panel type inherits it automatically, current and
    future, no per-type wiring), added here so the list has a record of
    it at all
15. ✅ Real, non-synthetic demo content — done
    (`026-activitysim-demo-content`). Not part of this list when
    originally written either — the first feature to exercise item 12's
    Python post-processor (`025-python-postprocessor`) against real
    ActivitySim output rather than synthetic fixtures. One `summarize.yaml`
    (repo root, never published — authored against ActivitySim's real
    confirmed `final_*.csv` column shape, e.g. `zone_id`/`primary_purpose`/
    `depart`, not `docs/GRAMMAR.md`'s own illustrative example column
    names, which this feature's own research directly confirmed do NOT
    match real ActivitySim output) run three times through the unmodified
    `wftdm-dashboard summarize` CLI against three real `prototype_mtc` runs
    (a baseline, a land-use-density variant raising TAZ 1 employment ~40%,
    and a transit-service variant cutting AM/PM `WALK_LOC` in-vehicle-time
    20%/wait-time 50%) produces 3 scenario folders published to a **new,
    separate, git-tracked root** — `public/demo-scenarios/`/
    `public/demo-dashboard-config/` — rather than the existing
    `public/scenarios/`/`public/dashboard-config/` paths, which stay
    reserved for `npm run dev:fixtures`'s ephemeral, gitignored copy from
    `tests/fixtures/` (confirmed, before building anything, that those
    paths hold zero real checked-in content today — `git ls-files` returns
    nothing under any of the three existing `public/*` content roots).
    Three new `dashboard-*.yaml` tabs (Overview, Destination Choice,
    Transit Service) make both real causal stories directly visible, and
    the Destination Choice tab's diff table is the first time the
    project's own already-built `comparison: diff`/`$baseline` mechanism
    (`018`–`021`) has ever run against real, non-fixture data. Confirmed a
    real, load-bearing correctness detail before authoring the
    `time_of_day_period` bin: `expand.py`'s `_expand_manual_breaks()` only
    ever reads `breaks[1..len(labels)-1]` in the generated SQL — the first
    and last `breaks` entries are documentary bookends only, not literal
    boundaries — resolved by reading that function's real source directly
    rather than trusting `docs/GRAMMAR.md`'s own two worked examples, which
    use inconsistent breaks-vs-labels lengths relative to each other.
    Confirmed no usable real zone-boundary geometry exists for
    `prototype_mtc`'s 25 zones (the only geometry ActivitySim's own example
    ships, `taz1454.geojson`, is an unrelated 1,454-zone full-region MTC
    system) — `zonemap` is deliberately not used anywhere in this feature's
    panel set. `main.ts`/`scenarioDiscovery.ts` gained small, additive-only
    code (a second `loadDashboards()` call — needing zero change to that
    function itself, since its existing `baseUrl` parameter already
    supported it — and one new sibling function, `registerDemoScenarios()`)
    to also discover the new root; every existing call/behavior for
    `public/observed/`/`public/scenarios/`/`public/dashboard-config/` is
    untouched, confirmed by the full existing Vitest/Playwright suite
    passing unchanged.

    A real, confirmed regression was found and fixed during this feature's
    own implementation, not merely anticipated: `playwright.config.js`'s
    `webServer` runs the raw `vite` dev server directly against the repo's
    real `public/` tree, and `tests/global-setup.js`/`global-teardown.js`
    only ever swap fixture content in/out of `public/observed`/
    `public/scenarios`/`public/dashboard-config`/`public/geometry` — never
    `public/demo-scenarios`/`public/demo-dashboard-config`, since those
    didn't exist before this feature. Because the new content is real,
    git-tracked, and *permanently* present (unlike every other path under
    `public/`, which are all gitignored and only ever populated
    ephemerally), it bled into every Playwright run unconditionally,
    breaking 5 real assertions that count or name scenarios/tabs exactly
    (`scenarioNamesInOrder()` in `settingsModal.spec.ts`, a query-count
    check in `dashboardShell.spec.ts`). Fixed, with the user's explicit
    sign-off on touching test-harness infrastructure (not test assertions,
    not `tests/fixtures/`, not `copy-fixtures.js`) to do it: `global-setup.js`
    now blanks `public/demo-scenarios/index.json` and
    `public/demo-dashboard-config/index.json` to `[]` before the run (so
    `registerDemoScenarios()`/`loadDashboards()` discover nothing, the
    identical effect to the directories not existing), and
    `global-teardown.js` restores the original file content after. A
    directory-rename approach (hiding the whole `public/demo-scenarios/`
    tree, not just its `index.json`) was tried first and rejected — it hit
    a real, repeatedly-reproducible Windows `EPERM` on `renameSync()` even
    with a retry-with-backoff wrapper, while blanking two small files never
    failed once. Full suite re-confirmed passing (230/230) after the fix.
    See `specs/026-activitysim-demo-content/` for the full design record.
16. ✅ `RechartsPanel` — done (`029-shadcn-chart-panel`). Not part of this
    list when originally written either — the app-wide UI/UX redesign's
    own shadcn/Recharts chart research (logged in `docs/PIPELINE.md`)
    identified shadcn/ui's official chart component as this app's new
    default/primary bar/line/area chart engine, and this feature is the
    first (of the five-technology charting direction PIPELINE.md records)
    to actually get built. A NEW npm dependency (`recharts`, originally
    `^2.15.4` — the real shadcn CLI's own pinned version at the time, not
    npm's newer "latest" tag `3.10.1` originally researched, a real,
    confirmed correction made during implementation; later deliberately
    upgraded to `^3.10.1` — see this file's own "Recharts version
    history" note above and research.md §13) plus shadcn's own
    `components/ui/chart.tsx`,
    added verbatim via the real CLI rather than hand-authored (this
    repo's one deliberate departure from its own shadcn-pattern
    convention — `specs/029-shadcn-chart-panel/research.md` §5). New
    `--chart-1`..`--chart-5` tokens, WFRC-brand-consistent and
    WCAG-verified in both themes — including a real, caught-before-
    shipping design flaw (an initial draft would have rendered
    `--chart-1`/`--chart-2` identically in dark mode, since `--primary`
    already resolves to `--brand-wfrc-secondary-blue` there; fixed with 5
    genuinely distinct hues before any real component ever used them).
    `plotly`/`observable-plot`/`sankey` needed and got ZERO changes — the
    same `buildPanelQuery()`/`sqlExpander.expand()` shared query code
    every other data-bound panel type already uses, confirmed unmodified
    both by direct read and by the full existing Vitest/Playwright suite
    passing unchanged, plus a dedicated regression test confirming the
    one existing capability this new panel type deliberately does NOT
    replicate (Plotly's own legend click-to-toggle) still works exactly
    as before. One real regression WAS found and fixed during this
    feature's own final full-suite confirmation pass, not merely
    anticipated: a new fixture panel's title
    (`"Recharts Mode Share by Purpose (Bar)"`) contained
    `markdownPanel.spec.ts`'s own pre-existing non-exact
    `getByText('Mode Share by Purpose')` query as a literal substring,
    causing a strict-mode collision — renamed to `"Recharts Mode
    Breakdown (Bar)"` after grepping the whole `tests/integration/` tree
    for other possible collisions first (the same title-collision
    discipline every prior panel-type feature's own fixture additions
    have required since 007). Several other full-suite failures observed
    during this same pass were investigated individually (re-run in
    isolation, and — for the two that still reproduced alone — directly
    compared via `git stash` against the unmodified fixture file) and
    confirmed genuinely pre-existing, unrelated to this feature, matching
    this project's own established "confirm before concluding" discipline
    rather than being assumed innocent or silently fixed out of scope.

17. ✅ (US1, US4) / 🟡 (US2, US3 — real, correct, complete but not yet
    published) All ten panel types demonstrated with real ActivitySim
    data — done (`031-all-panel-demo-content`). Extends `026-
    activitysim-demo-content`'s real pipeline (same three real scenarios:
    `activitysim-baseline`/`activitysim-density-variant`/
    `activitysim-transit-variant`) to cover the remaining panel types
    `026` didn't touch — `recharts`/`observable-plot` (Overview tab, a new
    `row_mode_share_alt_engines` row bound to the already-real
    `trip_mode_share` metric), `graphic-walker`/`markdown` (a new Explore
    tab, `dashboard-5-explore.yaml`), and `zonemap` (a new Network tab,
    `dashboard-4-network.yaml`). **Published** — all four are live in
    `public/demo-dashboard-config/index.json` today.

    **Real, git-tracked TAZ 1-25 boundary geometry** —
    `public/demo-geometry/taz25.geoparquet` — sourced directly from MTC's
    real, live TAZ1454 FeatureServer
    (`services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services/
    Travel_Analysis_Zones/FeatureServer`) by a new, one-off script,
    `scripts/build-demo-zone-geometry.py` — fetches real GeoJSON for
    `TAZ1454 IN (1..25)`, converts via native (non-WASM) DuckDB spatial
    (`ST_Read()`/`ST_AsWKB()`), and prints (never auto-writes) a
    ready-to-paste `zone_centroids` YAML block for `summarize.yaml`
    — keeping that file human-authored/reviewed, same discipline as every
    other `summarize.yaml` edit in this project. Has a `KNOWN_CENTROIDS`
    ground-truth check (TAZ 1/6/16/25) that exits non-zero on mismatch —
    run once, confirmed passing, not re-run automatically. A new
    `!/public/demo-geometry/**/*.geoparquet` `.gitignore` negation was
    added (mirroring `026`'s own `public/demo-scenarios/` negation) — this
    is real, permanent, git-tracked content, not fixture-copy output.

    **`src/panels/zoneGeometry.ts`'s `loadZoneGeometry()`** gained a
    fallback: a `boundaries:` file that fails to resolve against the
    normal `public/geometry/` fixture-copy path (e.g. in a real deployment
    where no fixture was ever copied in) now retries against
    `public/demo-geometry/` via a new `resolveDemoGeometryUrl()`. A real,
    confirmed bug found and fixed during this feature's own
    implementation: the first draft reused the SAME DuckDB view name for
    the retry, on the (wrong) assumption that was safe — empirically
    false. `registerFileURL()` registers the filename→URL mapping
    immediately, before the view-creation query ever runs, so a failed
    first attempt leaves that name "already registered," and the retry's
    own `registerFileURL()` call throws `File already registered`. Fixed
    with a distinct view name for the fallback attempt
    (`zonemap-geom-demo__${boundaries}`) — `contracts/geometry-pipeline.md`
    under `specs/031-all-panel-demo-content/` was corrected to match (an
    earlier draft of that contract wrongly asserted reusing the name was
    safe).

    **`src/panels/ZoneMapPanel.tsx`** — a second real bug, found via live
    choropleth inspection (every zone rendering as uniform "no data"
    color despite confirmed-matching, non-null real trip counts on both
    sides): the join from metric rows to zone features rejected any value
    whose `typeof` wasn't `'number'`. DuckDB's `COUNT(*)`-derived columns
    (the real `trips_by_destination_zone` metric's own `trips` column)
    arrive over Arrow as a JS `bigint`, not `number` — silently, never a
    thrown error, just a dropped value. Fixed: `typeof raw === 'number' ||
    typeof raw === 'bigint' ? Number(raw) : null`. This is a **separate**
    code path from `panels/formatValue.ts`'s own null-handling — confirmed
    directly by reading that file before writing this comment (an earlier
    draft of this same comment wrongly claimed they shared a reason; do
    not repeat that claim without re-checking).

    **Two new, real `summarize.yaml` metrics — written, correct, tested,
    but PENDING PUBLICATION**: `purpose_mode_flow` (a real primary_purpose
    × major_trip_mode flow-count, for `sankey`) and `od_flows` (real
    origin/destination trip counts joined to the new real zone-centroid
    lat/lon, for `flowmap`) — both added to `summarize.yaml` and covered
    by two new, real, passing tests in `python/tests/test_pipeline.py`
    (`test_purpose_mode_flow_sums_to_total_trips`,
    `test_od_flows_coordinates_match_centroid_table`). A real,
    implementation-time bug fixed along the way: DuckDB infers a bare
    decimal literal (the `zone_centroids` VALUES table's own lat/lon) as
    `DECIMAL`, not `DOUBLE` — caught by a real test failure
    (`Decimal('37.2') != 37.2`), fixed with explicit `CAST(... AS
    DOUBLE)` in the metric SQL itself (a real risk for FlowMap's browser
    consumer, which expects a plain JS number, not just a test-comparison
    nuisance). `public/demo-dashboard-config/dashboard-6-flows.yaml`
    holds the real, correct `sankey`/`flowmap` panels bound to these two
    metrics — **deliberately NOT added to `index.json`**, per this
    feature's own real-data-availability constraint: raw ActivitySim
    scenario directories weren't available in the implementing
    environment to actually re-run the `wftdm-dashboard summarize` CLI
    and publish the resulting Parquet. See that file's own header comment
    for the full story.

    **REMAINING STEP, mechanical, no design decision left to make**: once
    raw `prototype_mtc` ActivitySim output (baseline + the density-variant
    + transit-variant input configs, `026`'s own originals) is available
    again, re-run `uv run wftdm-dashboard summarize` three times against
    the now-updated `summarize.yaml` (unchanged invocation, two new
    metrics included automatically), confirm the two new Parquet files
    (`purpose_mode_flow.parquet`, `od_flows.parquet`) publish correctly
    into each `public/demo-scenarios/{name}/summary/`, then add
    `dashboard-6-flows.yaml` to `public/demo-dashboard-config/index.json`.

    **MAJOR pre-existing bug found, NOT introduced by this feature, NOT
    yet fixed**: the real `wftdm-dashboard summarize` Python CLI
    (`python/wftdm_dashboard/postprocessor/pipeline.py`) never writes a
    `summary/index.json` enumeration file — but
    `services/scenarioDiscovery.ts`'s `registerSummaryFolder()` requires
    one (fetches `{folderUrl}/index.json` to learn which Parquet
    filenames exist) for every scenario folder, observed/published/demo
    alike. `tests/fixtures/generate.py` writes this file explicitly (with
    a deliberate `broken_scenario` case testing its absence) — `pipeline.py`
    does not. This means `026`'s real, published demo scenarios have been
    silently non-functional in an actual live browser load since that
    feature shipped — invisible because `026`'s own verification only
    used offline DuckDB CLI queries against the Parquet files directly,
    never a real page load. Found here only because this feature's own
    verification discipline required a real, live browser check of every
    new panel. Worked around for this feature's own three real demo
    scenarios by hand-writing their three `summary/index.json` files
    (safe, data-only, matches each folder's real file listing exactly —
    not a design decision, purely mechanical). `pipeline.py` itself is
    deliberately **not** touched here (FR-014, out of scope for this
    feature) — flagged as a real, separate, still-open bug for its own
    follow-up feature.

    **Real bugs fixed in `public/demo-dashboard-config/dashboard-5-
    explore.yaml`'s own `graphic-walker` panel and
    `tests/integration/demoContentAllPanels.spec.ts`** (both found via
    live browser verification, not assumed): the panel originally had no
    `scenario:` pin, so its `$scenario.` union tried to include `observed`
    (always active, `pinned: true`) — which never published a
    `trip_mode_share` view, a real `Catalog Error`. Fixed by pinning
    `scenario: activitysim-baseline`, the same explicit-scenario
    convention every other real demo panel in this repo already uses. The
    test spec itself had a real, confirmed bug of its own: its
    `beforeAll`/`afterAll` restored `public/demo-dashboard-config/
    index.json` but not `public/demo-scenarios/index.json` — both are
    blanked to `[]` by `tests/global-setup.js` for the whole suite run —
    so every scenario-pinned panel this spec exercises found no matching
    views and failed with "Couldn't load this chart/value/map," a real,
    reproducible failure (not a hang) the first time this spec actually
    ran end-to-end. Fixed by restoring both files together. Two more real,
    confirmed test/strict-mode bugs from that same first real run:
    Recharts (v3) renders each bar as `<path class="recharts-rectangle">`,
    never a plain `<rect>` — the spec's original selector matched zero
    elements; and two `getByText(..., {exact: false})`/`{exact: true}`
    calls hit real Playwright strict-mode violations (the queried text
    genuinely appears more than once — `.first()` was the fix, not a
    locator bug).

    A fourth, deeper real finding from the same verification pass, this
    one an **app-level architectural nuance**, not a test bug alone:
    `shell.tsx` renders `<DashboardRenderer tab={active} />` with **no
    `key` prop**, so switching tabs never unmounts/remounts that subtree
    — React just re-renders the same component tree with new props. This
    spec is the first in the whole suite to load the fixture
    `dashboard-config` AND `demo-dashboard-config` roots into the SAME
    page at once (every prior spec exercises one root alone); when a row
    name + panel index in the newly-active demo tab happens to coincide
    with a row name + index already used by an earlier-mounted fixture
    tab (here: the fixture's own landing-page `zonemap` panel, "Zone Map
    VMT per Capita"), React reconciles them as the SAME `ZoneMapPanel`
    component instance. Its mount-only effect (empty deps — where
    `window.__zonemapTestMaps[config.title] = map` AND the initial
    `center`/`zoom` camera are both set, once, from THAT FIRST mount's own
    `config`) never re-runs on a reused instance — confirmed via three
    rounds of live diagnostic instrumentation, each correcting the last:
    (1) the test-only registry key stays stuck on the FIRST title that
    instance ever mounted with, even though the DOM (heading, panel
    title, `data-render-count`) always reflects the CORRECT, current
    panel; (2) resolving the live map by DOM container identity instead
    (`document.querySelector('.zonemap-chart')` matched against
    `Object.values(window.__zonemapTestMaps).find(m => m.getContainer()
    === container)`, in one `page.evaluate()` — an `ElementHandle`-
    bridged version of the same idea was tried first and, for a reason
    not worth chasing further, could not resolve the identical correct
    pair) DID find the right map/source (`hasMap`/`isStyleLoaded`/
    `sourceExists` all confirmed `true` on every poll attempt) — yet
    `querySourceFeatures()` still returned nothing; (3) root cause: that
    API only returns features MapLibre has actually tiled for the
    CURRENT camera viewport, and this reused instance's camera is still
    wherever the FIRST-mounted (fixture) config's own `center`/`zoom`
    left it — this panel's real San Francisco polygons, correctly
    `setData()`'d onto the source by its own data-update effect (which
    DOES re-run every time, unlike the mount effect), sit outside that
    stale viewport and are never tiled/rendered, so
    `querySourceFeatures()` legitimately returns empty regardless of how
    correctly the map/source were resolved. This is a real, narrow
    consequence of the same underlying gap (a mount-effect-only side
    effect on a reused component instance), extending from a test-only
    instrumentation problem to a genuine (if here practically unreachable
    outside this exact two-dashboard-root test scenario) camera-position
    bug: a real deployment only ever loads ONE dashboard-config root, so
    this specific collision cannot occur there today — but the general
    mechanism (any panel whose mount effect captures per-instance state
    from `config` and never re-syncs it) is real and would resurface the
    moment two dashboard-config roots are ever combined for a real
    reason. Fixed, for the test's own purposes, by reading the GeoJSON
    source's raw, camera-independent `_data.features` directly instead of
    the viewport-dependent `querySourceFeatures()` — the right read for
    "did real data reach the source," which is genuinely what this
    assertion needs; `zonemapPanel.spec.ts`'s own tests correctly keep
    using `querySourceFeatures()`, since they never hit this camera-reuse
    scenario (a single dashboard-config root, no cross-root panel-
    instance reuse possible). A real,
    still-open, low-priority follow-up worth naming: `key={tab.header.tab}`
    on `shell.tsx`'s own `DashboardRenderer` would close this class of
    stale-mount-effect gap generally, for any future test or app code
    that keys a side effect by something other than DOM identity — not
    done here, out of scope for this feature.

    **Regression check, confirmed not assumed**: a targeted subset of the
    existing suite most exposed to this feature's own `zoneGeometry.ts`/
    `ZoneMapPanel.tsx` changes (`zonemapPanel.spec.ts`,
    `dashboardShell.spec.ts`, `flowmapPanel.spec.ts` — 86 tests) ran
    83/86 passing. The 3 failures (a dark-mode Plotly re-query-count
    assertion off by exactly one query; an identical "Settings button
    outside viewport" timeout in both `flowmapPanel.spec.ts`'s and
    `zonemapPanel.spec.ts`'s own "manual pan survives... basemap switch"
    test) were confirmed genuinely pre-existing and unrelated — not
    assumed innocent: the identical 3 tests were re-run, single-worker,
    against this feature's changes fully `git stash`ed (a clean,
    unmodified tree), and all 3 reproduced byte-for-byte identically.
    Real, separate, pre-existing bugs — flagged here for their own
    future fix, out of scope for this feature.

18. ✅ Left sidebar navigation — done (`030-sidebar-navigation`). Replaces
    the top `navBar.tsx` tab strip entirely with a persistent, collapsible
    left `Sidebar` (new `components/ui/sidebar.tsx`/`separator.tsx`,
    hand-authored against this repo's own legacy-registry/Tailwind-v3
    conventions — not a verbatim `new-york-v4` port, matching `chart.tsx`'s
    own established precedent for when the shadcn CLI's output doesn't fit
    this project). `layout/shell.tsx` is fully rewritten:
    `SidebarProvider > Sidebar(SidebarHeader[DashboardBrand+SidebarTrigger]
    /SidebarContent[SidebarNav]/SidebarFooter[SettingsModal]) +
    SidebarInset[DashboardRenderer]`. **Deleted entirely**:
    `layout/navBar.tsx`, `hooks/useNavBarVisibilityMode.ts`,
    `state/navBarVisibilityState.ts`, `hooks/useScrollDirection.ts` — the
    old fixed-header/`ResizeObserver`/scroll-direction machinery has no
    equivalent in the new design (a sticky sidebar doesn't need to hide on
    scroll). `layout/settings/appearanceTab.tsx`'s "Top Bar Behavior"
    control (which only ever configured that removed machinery) is gone
    with it — Theme control unchanged.

    New `layout/dashboardLayout.ts` (pure, unit-tested — 13/13 —
    `tests/unit/dashboardLayout.test.ts`) — `isMetricStripRow()`,
    `findFullPagePanel()`, `resolveSections()` — same "split non-trivial
    pure layout logic into its own testable module" convention as
    `tableLogic.ts`/`sankeyGraph.ts`/`zonemapColor.ts`. `layout/types.ts`
    gained `SectionConfig`, `DashboardTabConfig.header.icon?`/`.full_page?`,
    `DashboardTabConfig.sections?` — all fail-soft-parsed, matching this
    project's own "YAML has no runtime schema" discipline.

    Three new mechanisms, all additive and all opt-in via YAML (no
    existing `dashboard-*.yaml` needs any change):
    - **Chromeless full-page mode** (`header.full_page: true`) — a tab
      whose `layout` resolves to EXACTLY ONE panel total renders via a new
      `FullPagePanel` component in `dashboardRenderer.tsx`: no page title,
      no `Card` chrome, no expand trigger, the panel filling real, current
      viewport space (`flex-1 min-h-0` against `SidebarInset`'s own flex
      column) — not a fixed pixel default. A misconfigured `full_page` tab
      (not exactly one panel) falls back to ORDINARY rendering with a
      `console.warn`, never a blank page.
    - **Accordion sub-navigation** (`sections: [{id, label, rows}]` per
      tab) — a `SidebarMenuButton` gains an expandable sub-list of section
      labels; clicking one `scrollIntoView()`s to that section's first row
      in real layout order (never reordering rows), no page navigation. A
      tab with no `sections:` shows no expand affordance at all — the
      default, unchanged appearance.
    - **Metric Strip auto-fill layout** (FR-018) — a row whose panels are
      ALL `valuebox` (`isMetricStripRow()`) auto-classifies into
      `grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6` instead of
      the existing fraction-based `gridTemplateColumns` math (untouched
      for every other row shape) — zero YAML change needed for any
      existing all-valuebox row to pick this up.

    **FR-012a — a real, deliberate content relocation, not a mechanism
    workaround**: the real, published `demo-dashboard-config/dashboard-5-
    explore.yaml` had TWO panels (a "About This Demo" markdown panel plus
    the `graphic-walker` panel), so it didn't originally qualify for
    full-page mode's exactly-one-panel condition. Chose to relocate the
    markdown panel's content into `demo-dashboard-config/dashboard-1-
    overview.yaml` (as its own new first row, `row_about`, content
    byte-identical) rather than redesign `findFullPagePanel()`'s own
    qualifying condition — made explicit, with reasoning, before any code
    was written (this feature's own spec.md/`contracts/dashboard-
    grammar.md` were corrected to match BEFORE implementation, not
    discovered as a mismatch mid-build). `dashboard-5-explore.yaml` is now
    genuinely single-panel and carries `icon: compass`/`full_page: true`.

    **Two real, confirmed bugs found and fixed during this feature's own
    T035 full-suite regression pass — not merely anticipated**:

    1. **A genuine cross-worker race condition**, found via a live,
       reproduced full-suite run: `npx playwright test` (no `--workers`
       override — neither `playwright.config.js` nor this project's own
       `npm run test:integration` script sets one) reported "Running 291
       tests using 10 workers" on the implementing machine — real,
       confirmed cross-SPEC-FILE parallelism.
       `playwright.config.js`'s `fullyParallel: false` only serializes
       tests WITHIN one file; it does nothing to stop different files
       running concurrently. This feature's own new `sidebarNav.spec.ts`/
       `fullPagePanel.spec.ts` (both temporarily rewrite the shared
       `public/dashboard-config/index.json` in file-scoped
       `beforeAll`/`afterAll`, following an established, but — this
       finding proved — WRONGLY assumed-safe technique) genuinely
       collided with `dashboardShell.spec.ts`'s own exact-3-tab assertion
       AND with `026-activitysim-demo-content`'s pre-existing
       `demoContentAllPanels.spec.ts` (which does the equivalent for the
       sibling `public/demo-dashboard-config/index.json` — a different
       file, but rendered into the SAME combined tablist `main.ts` builds
       from both roots). Reproduced concretely: `dashboardShell.spec.ts`'s
       tab-count assertion observed extra tabs from BOTH other files at
       once, and `demoContentAllPanels.spec.ts`'s own non-exact
       `getByRole('tab', {name:'Explore'})` resolved to two elements
       (`"Explore Fixture"` + `"Explore"`) simultaneously. Fixed with a
       new `tests/integration/_sharedFixtureLock.ts` — a real, atomic,
       cross-WORKER-PROCESS mutual-exclusion lock FILE (`openSync(path,
       'wx')`, not an in-process mutex/boolean, since colliding spec files
       run in genuinely different OS processes) — acquired in every
       participant's `beforeAll` (held for that file's ENTIRE run, since
       the whole run is the real risk window, not just the initial write)
       and released in `afterAll`; `dashboardShell.spec.ts`'s own
       sensitive test acquires/releases it too, around its whole body.
       Each `beforeAll`/that one test also calls `test.setTimeout(420_000)`
       — a real, necessary consequence of the fix: `demoContentAllPanels.
       spec.ts` (the suite's own slowest file, ~5+ minutes) can now
       legitimately hold the lock long enough to exceed another
       participant's default 60s Playwright timeout while it merely WAITS
       to acquire it — extending the timeout is the correct fix for
       genuine queueing, not a symptom to paper over. Confirmed via 3
       consecutive full-suite re-runs after the fix: zero recurrences of
       the collision signature in any of them (down from 100% before the
       fix). This also corrected a real, WRONG "safe under
       `fullyParallel: false`" claim that had been written into BOTH this
       feature's own new spec files AND `026`'s pre-existing
       `demoContentAllPanels.spec.ts` — that assumption was never actually
       true, just never previously tested under a real 10-worker run.

    2. **A real, evidence-confirmed regression in `zonemapPanel.spec.ts`'s
       own pre-existing "auto-fits its initial view" test** (from
       `027-map-auto-fit-and-reset`, unrelated to this feature's own
       code) — its `bounds.east` assertion started failing consistently
       (reproduced in full isolation, not just under full-suite load,
       ruling out resource-contention flakiness). Root-caused via a direct
       `git stash` A/B measurement of the SAME `.zonemap-chart` element's
       `getBoundingClientRect()`: `width: 344.66px` on the pre-sidebar
       tree (fixed top nav) vs. `width: 259.33px` on this tree (a real
       ~25% reduction — the persistent left `Sidebar` genuinely takes
       horizontal space the old top-nav design didn't, exactly as
       intended). A narrower container shifts `fitBounds()`'s exact
       computed zoom/camera (the same real `cameraForBounds()`-vs-
       `fitBounds()` landing-spot sensitivity `027`'s own CLAUDE.md entry
       already documents) enough to cross the test's previously-tight
       margin. Fixed by widening ONLY the `east` assertion
       (`-111.75` → `-111.85`, real measured slack) — `west`/`south`/
       `north` are UNCHANGED (none of them ever failed in any
       reproduction, and the container's own height, 400px, did not
       change between layouts, so there was no evidence to widen them).
       Confirmed via the full `zonemapPanel.spec.ts` file (30/30 passing)
       and the full suite (289/291 — the remaining 2 are the already-
       documented pre-existing dark-mode query-count flake plus a
       `flowmapPanel.spec.ts` reset-view timing test independently
       confirmed to pass 1/1 in isolation, i.e. genuine resource-
       contention flakiness under 10-worker load, not a real regression).

    **A third, separate, deliberate accessibility decision** (found
    proactively, before it could break anything, not discovered via a
    failing test): the new plain-`<button>`-based `SidebarMenuButton`
    provides none of Radix `Tabs`' automatic `role="tab"`/
    `role="tablist"`/`aria-selected` — but 8 existing spec files'
    `getByRole('tab', {name})` queries depend on exactly that. Rather than
    silently drop this compatibility or add a workaround shim,
    `sidebarNav.tsx` explicitly sets `role="tablist"`/`role="tab"` +
    `aria-selected` on the real nav list — a genuine, defensible
    accessibility choice (mutually-exclusive view switching IS the tab
    pattern), reasoned through in code comments, that happens to also
    preserve every existing test's query. Verified via both new
    (`sidebarNav.spec.ts`, 3/3) and existing (`dashboardShell.spec.ts`)
    live test runs, not just typechecking.

    **A fourth, small, self-caused-and-fixed regression**: the shell
    rewrite removed the `<header>` element `dashboardShell.spec.ts`'s own
    box-shadow test targeted. Per this project's own instruction to
    consult the `wftdm-design-system` skill BEFORE writing/reviewing any
    shadow class, confirmed `shadow-md` is the correct, established value
    for this class of persistent chrome (same tier as `Card`/dropdown
    menus/the old fixed header) — added it to the real `Sidebar` component
    (with a comment citing the skill's own Elevation section) and
    retargeted/renamed the test to `[data-sidebar="sidebar"]`. Confirmed
    live in both themes via `getComputedStyle()` — dark mode correctly
    shows both the `shadow-md` layer AND the documented edge-highlight
    ring, matching the skill's own described dark-mode elevation
    mechanism exactly.

    New Playwright specs, all real-browser, all passing at completion:
    `sidebarNav.spec.ts` (3), `fullPagePanel.spec.ts` (4, including a live
    misconfiguration case), `sectionSubNav.spec.ts` (5),
    `metricStrip.spec.ts` (3). SC-002 (the Explore tab's real content-area-
    to-viewport ratio) confirmed via direct `getBoundingClientRect()`
    measurement, both themes: 100.0% of available vertical space (up from
    the session's own recorded ~70% baseline), comfortably clearing the
    90% bar — there is no separate top header left to subtract in the new
    design at all.

19. ✅ Six-tab comprehensive demo content — done (`032-six-tab-demo-
    content`). Replaces the narrower three-tab causal-story demo
    (`Overview`/`Destination Choice`/`Transit Service`, all `026`-era, all
    deleted with no content preserved per this feature's own explicit
    instruction) with the full six-tab ActivitySim calibration outline
    `docs/CALIBRATION-SUMMARIES.md` already documented: Summary,
    Person/Household Models, Tour Models, Mode Choice, Trip Models,
    Network — using `030-sidebar-navigation`'s own real `sections:`
    accordion mechanism, one section per real submodel heading, in that
    document's own order. The Explore tab (`dashboard-5-explore.yaml`) is
    untouched — deliberately kept at its existing filename despite landing
    7th (last) in the new tab order, since `index.json`'s array order, not
    any filename's numeric prefix, controls real display order.
    `dashboard-4-network.yaml` (`031`'s narrower Network tab) was renamed
    to `dashboard-6-network.yaml` and fully rewritten; `dashboard-6-
    flows.yaml` (`031`'s own unpublished Sankey/FlowMap staging file) is
    dissolved, its two panels re-authored fresh into `dashboard-4-mode-
    choice.yaml`/`dashboard-6-network.yaml` — `purpose_mode_flow`/
    `od_flows` are real, now-published metrics for the first time.

    **The three real ActivitySim scenarios were REUSED, not re-run** — the
    exact real raw output (baseline, TAZ-1 density-variant, transit-
    variant) this session had already produced and verified once was still
    present on disk; re-running would have risked landing on different
    real stochastic draws for zero benefit over output already directly
    re-confirmed. Both causal edits were re-verified directly against that
    real data before use: TAZ 1 employment +40.0% in the density-variant's
    real `final_land_use.csv` (`TOTEMP` 27,318→38,245, etc., matching the
    edit exactly); real WALK_LOC AM/PM trip-mode share increase in the
    transit-variant (19.55%→20.56% AM, 19.34%→20.52% PM, a real, direct
    aggregation of `final_trips.csv`, not assumed carried over). All three
    scenarios' `final_checkpoints.csv` have identical real row counts (33),
    confirming full completion.

    **A full, real, column-level computability audit** — checked directly
    against the real, installed `configs/settings.yaml` `models:` list and
    real CSV headers/values, not assumed from `docs/CALIBRATION-
    SUMMARIES.md`'s own prose (already once found to contain an
    illustrative-only naming convention, per `026`) — found 34 of 40
    documented submodel summaries genuinely computable, one
    partially-computable (Joint Tour Participation: real participant
    counts exist, not a literal per-eligible-person binary choice table),
    and 6 real, confirmed gaps, two of them Level-1/starred: **Work from
    Home**, **Telecommute Frequency**, Transit Pass Subsidy, Transit Pass
    Ownership, Screenline Volumes vs Observed AADT, VMT by Facility Type —
    the first four because their real ActivitySim components are absent
    from this project's real `configs/settings.yaml` `models:` list
    entirely (confirmed directly, not merely inferred from a missing
    column); the last two because this pipeline has no traffic-assignment
    step anywhere (`write_trip_matrices` produces real zone-to-zone trip
    *demand*, never assigned link volumes) and no real observed-AADT
    dataset exists for this synthetic 25-zone system. Each of the 6 gets
    its own real `markdown` gap-note panel in the live dashboard stating
    its specific real reason (never an empty or fabricated panel standing
    in for it) — `docs/CALIBRATION-SUMMARIES.md` itself is corrected to
    match, plus two smaller, incidentally-found doc inaccuracies: the
    "Person type" segmentation list was missing the real 8th ActivitySim
    `ptype` value (pre-school child, confirmed present in real output,
    range 1-8), and the "Geography" segmentation note overstated real
    coverage — this pipeline's real `land_use` output has only `zone_id`/
    `DISTRICT`/`SD`, not the documented four-level small/medium/large/
    super-district set.

    **28 new `summarize.yaml` metrics** (one per genuinely computable
    summary the audit found, `specs/032-six-tab-demo-content/data-
    model.md` §3), plus two new segmentation mechanisms using only
    existing, unmodified `$mappings`/`$bins` grammar (`mappings.
    person_type`, `bins.income_group` — plus a shared `bins.
    distance_bin_half_mile` reused by every distance-based metric via a
    consistent `distance_miles`-aliasing convention) and two new
    `sources:` entries (`joint_tour_participants`, `accessibility` — both
    real, already-present `final_*.csv` files `026`'s original
    `summarize.yaml` never needed). Every tour-scoped metric filters by
    the real, confirmed-exhaustive `tour_category` values (`mandatory`/
    `non_mandatory`/`joint`/`atwork`). Distance-dependent metrics with no
    precomputed real column (only `persons.distance_to_school`/
    `distance_to_work` are precomputed real values; everything else —
    Joint/Non-Mandatory/At-Work Subtour Destination, Trip Destination, VMT
    by Home TAZ — has none) use a real, honest straight-line-distance proxy
    between real zone centroids (a plain haversine expression over two
    `$sql.zone_centroids` references, the same `c1`/`c2` alias convention
    `od_flows` already established) — disclosed as a straight-line proxy,
    never presented as a modeled network distance, in both the relevant
    panels' own descriptions and the corrected doc. Confirmed, before
    writing a single distance metric, that this model's real zone system
    is EXACTLY the 25 zones `031`'s own `taz25.geoparquet`/
    `zone_centroids` already cover (both `final_land_use.csv`'s real zone
    rows and the real distinct set of zones touched by real trip origins/
    destinations are precisely `{1..25}`) — no geometry work was needed.

    **A real, confirmed bug found and fixed via the real CLI itself**,
    before any dashboard content was authored: the naive haversine formula
    throws DuckDB's `ACOS is undefined outside [-1,1]` for a same-zone
    (origin == destination) trip — floating-point rounding pushes the
    argument fractionally above 1.0, and DuckDB's `acos()` rejects this
    outright rather than clamping. Fixed with a `LEAST(1.0, GREATEST(-1.0,
    ...))` clamp, applied everywhere the formula appears; documented
    inline as load-bearing, not defensive style. Real total VMT for the
    baseline scenario (a new `summary_kpis.total_vmt` scalar column) came
    out to 15,212 straight-line miles across 23,583 real trips — directly
    spot-checked, not merely trusted.

    **Two more real bugs found via live browser verification** (a real,
    running `npm run dev` session, not offline queries alone — this
    feature's own real `SC-006` requirement): (1) every `valuebox` panel
    bound to `summary_kpis` with no `scenario`/`scenarios` pin defaulted to
    a `$scenario` union including the always-active `observed` pinned
    scenario, which has no real `public/observed/` content in a plain
    checkout (gitignored, fixture-populated-only) and therefore no
    matching view — a real Catalog Error, fixed by pinning `scenario:
    activitysim-baseline` on every affected valuebox (found via a
    systematic PyYAML scan of every panel across all six files, not just
    the ones that visibly broke — this project's own established
    discipline of confirming a class of bug is fully fixed, not just its
    first visible symptom). (2) `dashboard-3-tour-models.yaml`'s original
    "Mandatory Tour Scheduling" panel was `plotly` keyed on `start` alone,
    but `mandatory_tour_scheduling` groups by `(primary_purpose, start,
    end, duration)` together — even filtered to one purpose, this produces
    many thin, scattered bars per start hour rather than one clean bar per
    hour; switched to `table` (the genuinely correct real fit per FR-012,
    not a chart type forced to look clean by hiding real detail).

    **A real, confirmed, deployment-relevant application bug** — not
    merely a test-locator issue — was found and fixed while getting
    `tests/integration/demoContentAllPanels.spec.ts` (fully rewritten, not
    merely extended — every `031`-era test referenced deleted content) to
    pass: `main.ts`'s boot sequence always concatenates a deployer's own
    `dashboard-config/` root with this repo's own `demo-dashboard-config/`
    root into ONE tab array, in every real environment (dev, prod, test),
    unconditionally. This feature's new "Summary" tab name (matching
    `CALIBRATION-SUMMARIES.md`'s own real heading, and this app's own
    canonical example landing-tab name from `CLAUDE.md`'s own Navigation
    model section) collided with the test fixture root's own landing tab,
    ALSO named "Summary" — and `src/layout/shell.tsx`'s `dashboards.
    find((d) => d.header.tab === activeTab)` always resolved to the FIRST
    same-named match regardless of which sidebar button was actually
    clicked, while `src/layout/sidebarNav.tsx`'s own name-based `isActive`
    comparison lit up BOTH same-named buttons simultaneously. Confirmed via
    a live Playwright accessibility-tree snapshot: the sidebar correctly
    showed the 2nd "Summary" tab as `[selected]`, but `<main>` still
    rendered the FIRST (fixture) tab's real content. This is a real,
    reachable defect for any actual deployment where a deployer's own real
    `dashboard-config/` landing tab is ALSO named "Summary" (this app's own
    encouraged convention) — not a test-only coincidence — so it was fixed
    at the root, not worked around in a test: both files now track the
    active tab by array INDEX instead of display name (`shell.tsx`'s
    `activeIndex` state, `sidebarNav.tsx`'s `activeIndex`/
    `onTabChange(index)` props, its own `key` also switched from the name
    to `${name}-${index}`) — always unique regardless of how many tabs
    share a display name. A real, deliberate, documented deviation from
    this feature's own plan.md Constitution Check ("no file under `src/`
    changes") — justified by this project's own extensive, standing
    discipline of fixing a real, confirmed bug found during otherwise-
    in-scope work rather than leaving it or working around it in a test.
    Confirmed via direct grep that neither file has any other consumer
    that would be affected.

    **All ten registered panel types** are used at least once across the
    six tabs, each chosen for a genuine real data-shape fit, confirmed by
    a direct PyYAML scan (not merely eyeballed): `valuebox`×6, `plotly`×4,
    `observable-plot`×5, `table`×18, `markdown`×5, `sankey`×1, `flowmap`×1,
    `zonemap`×2, `graphic-walker`×1 (a new `person_household_profile`
    dataset — one real row per person, deliberately the one new metric
    that does NOT aggregate — built specifically for this open-ended
    exploration panel, on the Person/Household Models tab), `recharts`×2.

    Verification: `uv run pytest python/tests/` 64/64 passing (was 59/59
    before this feature — 5 new representative tests cover the distinct
    real SQL shapes all 28 new metrics reuse: the haversine clamp fix
    including a same-zone-trip case, `tour_category` filtering, the new
    8-value `person_type` mapping, `land_use_summary`'s per-zone household
    aggregate join, and `person_household_profile`'s deliberate
    ungrouped-row exception — the real end-to-end CLI run against real
    ActivitySim data already validated all 28 metrics' own real invariants
    more strongly than any synthetic fixture could, for the metrics it
    covers). `npm run typecheck` clean; `npm run test:unit` 321/321
    passing, unaffected by the `shell.tsx`/`sidebarNav.tsx` fix (neither
    file has a direct unit-test consumer). A targeted Playwright regression
    subset — expanded, once the real shell/nav bug was found, to include
    every 030-era shell/nav spec, not just the originally-planned zonemap/
    flowmap/dashboardShell set — ran 29/30 plus 30/30 (zonemap/flowmap)
    passing; the one failure is the SAME already-documented, pre-existing
    dark-mode Plotly re-query-count flake `030`'s and `031`'s own entries
    above already recorded (`Expected: 79, Received: 80`), not a new
    regression. `demoContentAllPanels.spec.ts` (fully rewritten) — 7/7
    passing, including the new all-ten-panel-types coverage assertion.

20. ✅ Full shadcn/ui default-theme adoption (colors, typography, complete
    form-input primitive set) — done (`033-shadcn-default-theme`). A
    user-directed, EXPLICIT, DELIBERATE policy reversal of this project's
    own prior WFRC-blue-anchored token system — full adoption of
    shadcn/ui's own real, current default theme instead, WFRC branding
    intended to be REAPPLIED later as its own separate, future feature
    (see the `wftdm-design-system` skill's own new suspension notice,
    added directly by this feature — the "never dilute the WFRC blue"
    rule is not deleted, just marked suspended with a clear pointer back
    to this feature and forward to whatever re-branding feature comes
    next).

    **The real, current shadcn preset behind "new-york"/neutral is
    called "Nova"** (`baseColor: "neutral"`, Geist font, Lucide icons) —
    confirmed by fetching the real, current `packages/shadcn/src/preset/
    defaults.ts` directly, not assumed from memory or from the
    "default"/"new-york" naming this project's own prior features used.
    Every real color/typography value in `tokens.css` was converted from
    shadcn's own real, fetched `oklch()` source via a genuine Canvas 2D
    round-trip (`getComputedStyle()` in this project's pinned Playwright/
    Chromium version returns `oklch()` colors UNPARSED — a real,
    confirmed gotcha; the round-trip forces real sRGB resolution) — the
    resulting hex values land exactly on Tailwind's own published Neutral
    palette steps, an independent cross-check that the conversion was
    correct.

    **A real, confirmed Tailwind v3→v4 migration** — the single highest-
    stakes decision this feature made, resolved via genuine, hands-on
    empirical trial (not migration-guide reading alone), per the user's
    own explicit instruction. This repo's `components.json` was
    confirmed pinned to shadcn's LEGACY `"default"` style; the real,
    current neutral/zinc default output is on the NEWER `new-york-v4`
    registry track, which uses Tailwind v4-only syntax
    (`has-[>svg]:`/`aria-invalid:`/named container queries/opacity-
    modifiers-on-custom-tokens) confirmed via direct compilation attempt
    to produce ZERO CSS under this project's real, then-installed
    Tailwind v3.4.15 — the same class of registry-track mismatch that had
    already forced hand-porting for both `components/ui/chart.tsx` (029)
    and `components/ui/sidebar.tsx` (030), now at much larger scale. A
    real, isolated scratch-directory trial (copying the project's actual
    `components.json`/`tailwind.config.js`/`tokens.css`, running the real
    shadcn CLI against three different `style` values) proved Tailwind
    v4's own real `@config "./tailwind.config.js";` backward-compatibility
    bridge compiles this project's EXISTING, UNMODIFIED
    `tailwind.config.js` with zero errors and byte-identical utility
    output — presented to the user via `AskUserQuestion` as three real,
    evidence-grounded options; the user selected **migrate to Tailwind
    v4 via the `@config` bridge**, confirmed and executed. `tailwind.
    config.js` itself was NOT rewritten into CSS-native `@theme` syntax —
    keeping it as plain JS behind `@config` was the whole point of this
    path over a full config migration. `@tailwindcss/vite` (the official
    Vite-native v4 plugin) replaces `postcss.config.js`/`autoprefixer`/
    `postcss` entirely (all three removed, confirmed via grep first that
    nothing else referenced them). `components.json`'s `style` is now
    `"new-york-v4"`.

    A genuine, POSITIVE side effect of this migration, found during
    re-verification, not planned: Tailwind v3 + this project's plain-hex
    (not `hsl(var(--x))`-wrapped) token convention meant every opacity-
    modifier utility (`bg-primary/90`, `bg-background/80`, `border-
    border/50`) silently generated ZERO CSS — a real, previously-
    documented limitation (`024-settings-modal-visual-redesign`'s own
    CLAUDE.md entry). Tailwind v4 handles this correctly via real
    `color-mix()` rules regardless of the underlying token's format —
    confirmed directly in the real compiled CSS output
    (`color-mix(in oklab,var(--primary) 90%,transparent)`, wrapped in a
    `@supports (color:color-mix(in lab,red,red))` progressive-enhancement
    block with a solid-color fallback). Every one of this app's existing
    opacity-modifier usages (in `button.tsx`, `dialog.tsx`, `chart.tsx`)
    now genuinely renders translucent for the first time, with zero code
    change required.

    **New token groups**: `--popover`/`--popover-foreground` (parity with
    shadcn's real current source; this app's own `dialog.tsx`/`dropdown-
    menu.tsx` still reuse `--card` directly, confirmed harmless since the
    two resolve identically in both themes) and the full `--sidebar-*`
    family (8 tokens) — `components/ui/sidebar.tsx` (030) previously had
    no dedicated sidebar token set of its own to consume at all, reusing
    the app's main `--background`/`--border`/etc. directly; this feature
    gave it real, dedicated tokens for the first time
    (`bg-sidebar`/`text-sidebar-foreground`/`border-sidebar-border` on
    the `<aside>`, `bg-sidebar-accent`/`ring-sidebar-ring` on
    `SidebarMenuButton`/`SidebarTrigger` — `SidebarProvider`'s own
    outermost app-wide wrapper deliberately stays on the main
    `--background`/`--foreground` tokens, since it wraps the whole app,
    not just the sidebar surface). The real shadcn dark-mode
    `--sidebar-primary` is a genuine, confirmed non-neutral Blue-600
    accent (`#1447e6`) — the one real colored token anywhere in this
    otherwise fully-neutral default theme, not an authoring error.
    `--chart-1..5`/`--success`/`--success-foreground` are UNCHANGED —
    confirmed, explicitly, non-brand-derived (Observable Plot's own
    `schemeObservable10`, `029-shadcn-chart-panel`'s own prior, separate,
    on-record exception) and out of this feature's scope from the start.

    **Typography**: Geist for both `font-body` AND `font-heading` (Nova
    has no separate heading face at all) plus Geist Mono for `font-mono`,
    replacing the prior Poppins/Inter/Fira Code WFRC brand typefaces —
    loaded via real, self-hosted `@fontsource-variable/geist(-mono)`
    side-effecting imports (confirmed genuinely open-source/SIL-licensed
    and self-hostable before adopting). A real, confirmed finding: the
    old `src/lib/loadBrandFonts.ts` Google-Fonts-CDN mechanism this
    replaces was NEVER actually called from `src/main.tsx` at all — its
    only real call site was the throwaway `002-design-tokens` demo page
    (`src/demo/DesignTokenDemo.tsx`/`src/demo/main.tsx`, `demo.html`) —
    so the real, production dashboard app never loaded the old WFRC
    typefaces in the first place, despite `tokens.css` naming them. Wiring
    the new imports into `src/main.tsx` is therefore genuinely the FIRST
    time real font loading reaches the production boot sequence, not a
    like-for-like swap. `src/lib/loadBrandFonts.ts` is deleted entirely
    (`git rm`, confirmed no dedicated test existed for it).

    **Seven new form-input primitives** — `label.tsx`/`input.tsx`/
    `textarea.tsx`/`checkbox.tsx`/`switch.tsx`/`radio-group.tsx`/
    `select.tsx` — this app's first real gap-check of `components/ui/`
    found none of these existed at all. Each fetched directly from
    shadcn's real, current `new-york-v4` registry source, then adapted to
    this project's own established Radix-wrapping convention (confirmed
    by reading `dialog.tsx` first): `React.forwardRef` +
    `React.ElementRef`/`ComponentPropsWithoutRef` (not the real source's
    own ref-less `React.ComponentProps` shape), namespaced
    `@radix-ui/react-x` package imports (not the unified `radix-ui`
    meta-package the real source uses — confirmed this project's own
    existing convention first, via `package.json`), `@/lib/utils` `cn`,
    single quotes, no `"use client"`. `data-slot` attributes ARE kept
    (real-source fidelity, no existing project convention against them).
    A new dependency, `tw-animate-css` (the real, current Tailwind-v4-
    native replacement for `tailwindcss-animate`, which this project
    never had at all) — needed for `select.tsx`'s own real open/close
    transition classes to actually render as anything but instant;
    wired via one new `@import "tw-animate-css";` in `tokens.css`,
    scoped to `Select` only (existing `Dialog`/`DropdownMenu` deliberately
    NOT retrofitted with animation classes they never had before). New
    Radix packages: `@radix-ui/react-label`/`-checkbox`/`-switch`/
    `-radio-group`/`-select`. Verified via a real, extended
    `DesignTokenDemo.tsx`/`demo.html` "Form Inputs" section (a genuinely
    interactive form, not a static render) plus a new
    `tests/integration/formInputPrimitives.spec.ts` (7/7 passing) —
    real typed-value/toggled-state/selected-option assertions for every
    primitive, in both themes.

    **Real WFRC-brand-name references fixed** (FR-008 scope,
    distinguished explicitly from `RechartsPanel`'s own separate,
    correctly-out-of-scope `--chart-1..5`, per the user's own explicit
    disambiguation instruction): `tableLogic.ts`'s/`zonemapColor.ts`'s
    `cellColor()`/choropleth-fill anchor (`var(--brand-wfrc-blue)` →
    `var(--primary)`, 2 call sites each). `SankeyPanel.tsx`'s
    `FALLBACK_TOKEN_VARS`/`FALLBACK_HEX_COLORS` — a REAL, DOCUMENTED
    DEVIATION from this feature's own plan: the plan's own suggested
    replacement sequence (`--secondary`/`--accent`/...) would have
    produced two LITERALLY IDENTICAL fallback colors (`--secondary` and
    `--accent` both resolve to `#f5f5f5` in the new light theme),
    defeating the whole categorical-distinction purpose — caught by
    reasoning through the real new token values before writing any code,
    not via a test failure. Fixed with `--chart-1..4` instead (this app's
    own already-verified-distinct, already-accessible categorical
    palette, explicitly non-brand-derived).

    **A real, confirmed accessibility regression found and fixed during
    re-verification** (`components/ui/button.tsx`'s `destructive`
    variant): the OLD code used `text-destructive-foreground` on
    `bg-destructive`. Confirmed directly by fetching shadcn's real,
    current `button.tsx`/`badge.tsx`/`alert.tsx` sources that NONE of
    them actually pair these two tokens as text-on-background (Button/
    Badge use literal `text-white`; Alert pairs `text-destructive` with
    the unrelated `bg-card`) — and that shadcn's own real dark-mode
    `--destructive-foreground`/`--destructive` pair resolves to a mere
    1.66:1 contrast ratio, nowhere near legible. Fixed to match the real
    source exactly: `'bg-destructive text-white hover:bg-destructive/90
    dark:bg-destructive/60'`. `tests/unit/tokenContrast.test.ts`'s own
    `PAIRINGS` list was updated to match — `destructive-foreground/
    destructive` removed entirely (no real invariant left to protect,
    once nothing in this app renders that pairing), with the finding
    documented in a block comment rather than silently dropped. A
    SEPARATE, disclosed (not fixed — out of scope, WFRC-specific
    contrast tuning deferred) real finding from the same pass:
    `muted-foreground/muted` resolves to a genuine 4.35:1 in light mode —
    just under WCAG AA's 4.5:1 floor, a well-known real characteristic of
    shadcn's own current default theme, pulled into its own dedicated,
    non-floor-enforcing test rather than left as a permanently-red
    assertion or silently patched.

    **Dark-mode fix re-verification** (all six of this project's own
    previously-proven fixes — Plotly transparent backgrounds, Observable
    Plot tooltip contrast, Sankey `currentColor` labels, map-control
    `invert(1)` icons, native form-control `color-scheme`, Dialog text-
    color inheritance): re-verified by RUNNING the existing real
    Playwright specs that originally proved each one, not by writing new
    ones. Found exactly the predictable class of fallout — 8 stale
    HARDCODED literal `rgb(...)` expected values across 4 spec files
    (`dashboardShell.spec.ts`/`observablePlotPanel.spec.ts`/
    `flowmapPanel.spec.ts`/`zonemapPanel.spec.ts`), comparing against the
    RETIRED WFRC-brand dark values instead of the new real shadcn ones —
    never a broken mechanism; every `currentColor`/`invert(1)`/
    `color-scheme`/explicit-text-color fix itself needed and got ZERO
    code changes. One real, useful disambiguation surfaced by this pass:
    the OLD theme's `--card` and `--background` dark values happened to
    be textually IDENTICAL, so several tests' own "--card/--background"
    comments were genuinely ambiguous about which token a given assertion
    was really checking — resolved by reading `panels/mapControls.css`'s
    own real `.maplibregl-ctrl-group { background: var(--card) !important; }`
    rule directly (it's `--card`, not `--background`) rather than
    guessing. Also caught 2 stale dark-mode `--border` divider-color
    checks expecting the old OPAQUE hex — the new real shadcn dark
    `--border` is a genuinely TRANSLUCENT value (`#f5ffff1a`, i.e.
    `oklch(1 0 0 / 10%)`) that Chromium's `getComputedStyle()` reports as
    `rgba(245, 255, 255, 0.1)`, confirmed via a real headless-Chromium
    round-trip rather than computed by hand from the hex alone.

    Full regression confirmation: `npm run typecheck` clean; `npm run
    test:unit` 386/386 passing (up from 321 at feature start — T009's new
    hex-value-snapshot describe block, T021's new typography-token test
    file, plus the dark-mode-fix test-literal updates); `npm run build`
    clean, no new warnings; the FULL `tests/integration/` Playwright
    suite (298 tests) — 296 passing, the 2 failures each independently
    re-run in isolation and confirmed pre-existing, unrelated flakiness
    (the already-documented flowmap-tooltip-hover flake, and a
    `027-map-auto-fit-and-reset` reset-button-disabled-before-load timing
    race under full-suite load — neither touched by this feature).

21. ✅ Metric-panel redesign — scoped expand-ability, shadcn-inspired
    value-box redesign, sparkline + baseline-diff trend indicators — done
    (`034-metric-panel-redesign`). Three independent parts, one feature.

    **Part A — expand-ability is now scoped per panel TYPE, with a
    per-panel author override.** The generic 004 expand-to-dialog
    mechanism (`usePanelExpandHost()`) used to apply to every panel type
    unconditionally; it now applies only to `table`/`markdown`/`plotly`/
    `observable-plot`/`sankey`/`recharts`/`flowmap`/`zonemap` by default —
    `valuebox` and ordinary (non-`dataset_picker`, non-full-page)
    `graphic-walker` panels no longer show an Expand control at all,
    since neither benefits from more working room the way a chart/table/
    map does. The default list lives in a new, deliberately
    dependency-free module, `panels/expandablePanelTypes.ts`
    (`EXPANDABLE_PANEL_TYPES`) — NOT co-located in `panels/registry.tsx`,
    a real, confirmed Vitest constraint: `registry.tsx` eagerly imports
    all ten real panel components, and importing it (even indirectly)
    from a plain-Node unit test fails on `FlowMapPanel.tsx`'s own
    `@flowmap.gl/layers` dependency ("directory import is not supported
    resolving ES modules").

    **A mid-implementation design change** (the user's own explicit
    instruction, after Part A's hardcoded-Set version was already
    partially built) added a genuine author override on top of that
    default: `PanelConfigBase` gained a new optional `expandable?:
    boolean` field, and `layout/panelCard.tsx` resolves expand-ability as
    `config.expandable ?? EXPANDABLE_PANEL_TYPES.has(config.type)` —
    deliberately `??`, not `||`, so an explicit `expandable: false`
    override is never confused with "unset." `usePanelExpandHost()` stays
    fully UNCONDITIONAL (React's own rules-of-hooks requirement) even for
    a panel that ends up non-expandable — its returned `trigger`/`body`
    elements are simply never placed in the returned JSX, which is safe:
    an unplaced React element is inert, never mounted, never a second
    instance of anything. `docs/GRAMMAR.md` documents the new field and
    its default table.

    **Part B — `ValueBoxPanel.tsx`'s visual redesign**, researched
    directly against shadcn's real, current dashboard example
    (`apps/v4/app/(app)/examples/dashboard/components/section-cards.tsx`,
    fetched from the same registry `033-shadcn-default-theme` used —
    never assumed from memory). A real, confirmed correction to this
    part's own original premise, found before writing any redesign code:
    `ValueBoxPanel.tsx` never rendered its own title/label at all —
    `panelCard.tsx`'s shared `CardHeader`/`CardTitle` already renders
    `config.title` above `CardContent` for every panel type generically,
    already visually smaller/lighter than the value itself. The label
    was therefore already "above the value" by construction; the one
    genuinely new change was adding `tabular-nums` to the value's own
    className (shadcn's real reference uses it for exactly this reason —
    digit alignment across re-renders). No shared chrome was forked or
    duplicated. A real, confirmed test-authoring finding along the way:
    the label and value resolve to the IDENTICAL color in both themes
    (both inherit `text-card-foreground` from the shared `Card` ancestor,
    neither sets its own color) — distinguished by size/weight only; the
    redesign deliberately did NOT fork `CardTitle`'s color per panel type
    to manufacture a difference the requirement never actually demanded.

    **Part C — two new, independently-configurable, OPTIONAL trend
    indicators** on `ValueBoxPanelConfig`:
    - `sparkline: { metric, x, y, chart_type? }` — a small embedded
      Recharts chart showing the metric's OWN distribution across a
      category, via a genuinely new, independent query (own `idle`/
      `loading`/`ready`/`empty`/`error` state, never blocking or being
      blocked by the panel's own primary scalar value). New
      `panelQuery.ts` export `buildSparklineQuery()` — a thin,
      purely-additive delegation to the EXISTING, unmodified
      `buildPanelQuery()` via a synthetic config object. New
      `panels/valueBoxSparkline.tsx` reuses `rechartsEncoding.ts`'s
      existing `encodeRechartsData()` unmodified, rendering bare
      Recharts primitives (`BarChart`/`LineChart` + `Bar`/`Line` inside a
      plain `ResponsiveContainer`) — deliberately NOT the full
      `ChartContainer` chrome from `components/ui/chart.tsx` (no
      axes/legend/tooltip needed at sparkline scale).
    - `baseline_trend: { expr, format? }` — a directional badge (Badge +
      `TrendingUp`/`TrendingDown`/`Minus` from `lucide-react`) comparing
      the panel's own scalar value against the resolved `$baseline`
      scenario, reusing `useBaseline()`/`resolveComparisonScenarioName()`
      completely UNMODIFIED (018/019/021's own baseline-diff machinery —
      per this feature's own explicit scope exclusion, none of that code
      was touched). A real, confirmed grammar gap closed by a NEW,
      SEPARATE sibling function rather than modifying anything existing:
      `buildComparisonDiffQuery()` requires a `compare_on` JOIN key,
      which a scalar (`summary_kpis`, one row per scenario) metric has
      none of — `buildValueBoxBaselineTrendQuery()` uses a plain comma
      cross join (`FROM a, b`) instead, evaluating the author's own
      `expr` (e.g. `a.total_trips - b.total_persons`) directly. A
      same-scenario "baseline resolves to the panel's own scenario"
      case is handled as its own distinct `Minus`/neutral state, never a
      misleading up/down arrow on a guaranteed-zero diff. New
      `components/ui/badge.tsx` — adapted from shadcn's real, current
      `new-york-v4` source (`default`/`secondary`/`destructive`/`outline`
      variants only), following `button.tsx`'s own established
      non-Radix, `cva`-based, `forwardRef` convention. Deliberately NO
      color-coded up-is-good/down-is-bad semantics — this app has no
      per-metric "which direction is desirable" metadata (VMT decreasing
      is good; trip count decreasing might not be) — directionality is
      conveyed by icon only, using the neutral `outline` badge variant.

    **Real fixture-data constraint found and worked around during
    testing**: `tests/fixtures/generate.py`'s own `SUMMARY_KPIS_ROWS` is
    written IDENTICALLY for `observed` and `good_scenario` — any
    same-column diff between them is always exactly 0, and no existing
    `comparison: diff` fixture panel uses a scalar metric+column at all
    (every one uses `vmt_by_home_taz`, multi-row) to cross-check against.
    Resolved by hand-verifying a deliberate, real, non-zero CROSS-column
    expression instead (`a.total_trips - b.total_persons = 9200 - 3800 =
    5400`, documented inline in the new fixture row's own header
    comment) — proves the real scenario-view resolution and cross-join
    mechanism correctly, which is what the test actually needs, without
    forcing a misleading same-column comparison the fixture data can't
    support.

    **A real regression found and fixed during the Polish-phase full
    Playwright run** (not merely anticipated): `dashboardShell.spec.ts`'s
    pre-existing "a value-box panel displays a number matching its
    underlying fixture data" test became a strict-mode violation once
    this feature's own new fixture panels (`row_valuebox_trends`,
    `tests/fixtures/dashboard-config/dashboard-1-summary.yaml`) also
    legitimately display the same real values ("1,500"/"9,200") —
    fixed with `.first()` on both assertions.

    **A real, EXPECTED consequence of Part A's own default-scope change**,
    also found and fixed during the same full-suite run:
    `graphicWalkerPanel.spec.ts`'s pre-existing User Story 3 tests
    specifically exercised the 004 expand mechanism against a
    `graphic-walker` panel — no longer expandable by default. Fixed via
    the SAME per-panel override this feature built for exactly this
    purpose: `dashboard-2-detail.yaml`'s "Free-form Visual Analytics"
    fixture panel gained `expandable: true`, restoring that real
    expand-mechanism coverage rather than discarding it; a separate,
    now-inapplicable expand-button assertion in the unrelated
    SC-005 "all nine panel types render" test was removed instead (that
    test's own purpose is panel-type rendering, not expand-ability, so no
    override was warranted there).

    Full regression confirmation: `npm run typecheck` clean; `npm run
    test:unit` 403/403 passing (up from 386 — T004's new
    `panelRegistry.test.ts`, 11 tests, plus 6 new `panelQuery.test.ts`
    cases for the two new query-builder functions); `npm run build`
    clean, no new warnings beyond this project's existing, already-
    documented ones. The full `tests/integration/` Playwright suite
    across two complete runs: 1 real regression found and fixed (the
    dashboardShell fixture collision above), 3 real, expected,
    correctly-caused failures from Part A's own design fixed via the
    per-panel override (the graphic-walker cases above), and 9 further
    failures spread across both runs — no two runs failing the same set,
    the signature of genuine multi-worker resource-contention flakiness —
    each individually re-run in isolation and confirmed passing alone
    (the dark-mode Plotly "no re-query" flake additionally cross-checked
    against a clean `git stash`'d tree, reproducing there too:
    Expected 79/Received 80 on main vs. this branch's Expected
    103/Received 104 — same pre-existing off-by-one-query flake, a
    different absolute count only because of this feature's own added
    fixture queries).

22. ✅ Scenario label propagation & color override — done
    (`035-scenario-label-color`). Two independent, presentation-only
    additions to how scenario identity renders.

    **Part A** propagates `020-settings-modal`'s existing `Scenario.label`
    field to every real place a scenario name becomes human-facing display
    text — a full source audit (not assumed) found exactly four such
    surfaces: `plotly` trace legend names (`panels/plotlyTraces.ts`'s
    `resolveTraces()`, when a trace's `color`/`name` resolves to the bare
    `$scenario` placeholder), `recharts` `chartConfig[key].label`
    (`panels/rechartsEncoding.ts`'s `encodeRechartsData()`, when `series
    === 'scenario'`), `observable-plot`'s row-driven legend/axis text
    (structurally different from the other two — Observable Plot reads
    legend text directly from each row's own cell value, with no separate
    trace-name/config-label indirection layer, so
    `panels/observablePlotEncoding.ts`'s `resolveObservablePlotEncoding()`
    builds a fresh, label-substituted row COPY rather than substituting a
    separate field), and `table` cell values in a `scenario`-keyed column
    (`TablePanel.tsx`'s existing cell-render branch — the column HEADER
    stays the literal field name `"scenario"`, never a scenario name, so
    it's unaffected either way). Confirmed, not assumed, that `sankey`/
    `flowmap`/`zonemap`/`graphic-walker`'s dataset picker (028)/
    `valuebox`'s `baseline_trend` badge (034) have NO scenario-name-as-
    display-text surface at all today — none of them were touched.
    Grouping/filtering/query-resolution always keys off the real name;
    `label ?? name` substitution happens only to the final, already-
    resolved value shown to the viewer (FR-002/FR-003) — zero change to
    `services/sqlExpander.ts` or `panels/panelQuery.ts`.

    **Part B** — a real, significant corrected premise found during
    research, before any code was written: `Scenario.color` (sourced from
    `manifest.yaml`) had ZERO real rendering consumers anywhere in this
    codebase. `docs/GRAMMAR.md`'s own "the panel colors by scenario" line
    refers to `plotlyTraces.ts`'s generic per-trace default-palette
    cycling (no explicit `marker.color` set at all), completely unrelated
    to the manifest field. This feature is therefore the FIRST real wiring
    of a per-scenario color to a rendered pixel — treated as the correct,
    complete reading of the original request (a viewer overriding "that
    scenario's own displayed color" needs a real baseline to override),
    not scope creep. Manifest color is now the real default at the same
    three chart-type surfaces Part A's own audit found (`table` has no
    per-scenario color dimension, so it's Part-B-out-of-scope);
    `plotlyTraces.ts` sets `marker.color` only when a color actually
    resolves (Plotly's own default cycling still applies otherwise, never
    an explicit `undefined`); `rechartsEncoding.ts` falls back to the
    existing `--chart-${n}` token cycling; `observablePlotEncoding.ts` hit
    a genuine, confirmed API constraint the other two don't share —
    Observable Plot's own color `range` is all-or-nothing (an explicit
    array replaces its built-in default cycling for the WHOLE scale, with
    no way to mix "my color" and "your default" within one scale), so
    `domain`/`range` are only set when EVERY distinct scenario in that
    panel's own result resolves to a color; even one unresolved falls the
    WHOLE panel back to Plot's own default, unchanged (research.md §4).

    **A real, significant, pre-existing bug found and fixed while
    implementing Part B** — not introduced by this feature, and confirmed
    before writing any fix: `services/scenarioDiscovery.ts` (the
    registration path for `public/observed/`/`public/scenarios/*`/
    `public/demo-scenarios/*` — the vast majority of real scenario
    loading) never fetched `manifest.yaml` at all, for any of its three
    registration functions. Only `scenario/scenarioManager.ts`'s separate
    LOCAL-folder-loading path ever read `manifest?.color` into
    `appState.register()`. This means `Scenario.color` has been
    `undefined` for every normally-discovered scenario since the field was
    introduced (`025-python-postprocessor`) — invisible until now because,
    per the Part B finding above, nothing ever consumed the field closely
    enough to notice. Fixed with a new `fetchScenarioManifest()` helper in
    `scenarioDiscovery.ts`, reusing `services/yamlLoader.ts`'s existing,
    previously-zero-caller `loadManifest()` and a newly-extracted
    `scenario/manifestReader.ts#manifestFromObject()` (pulled out of that
    file's own existing handle-based `readManifest()`, so the handle-based
    local-folder path and the new URL-fetch-based discovery path share ONE
    field-extraction implementation, not two independently-maintained
    copies) — called before each of the three `appState.register()` sites,
    fail-soft like every other step in that file.

    **A second, downstream bug the first one's fix surfaced**: once
    manifest fetching was wired up, colors still resolved to `undefined`
    in a live browser test. Root cause: `tests/fixtures/generate.py`'s own
    hand-rolled `write_manifest()` (a deliberate non-PyYAML shortcut for
    "this small, flat, scalar-only shape") wrote every string field
    completely UNQUOTED — `color: #4e79a7` — which YAML parses as a
    comment start (an unquoted `#` preceded by whitespace), not literal
    text, so this generator's own `color:` field has ALWAYS silently
    parsed to `null`. Confirmed directly, live, that the REAL production
    manifest writer (`python/wftdm_dashboard/postprocessor/manifest.py`,
    genuine PyYAML `yaml.dump()`) already quotes this correctly and was
    never affected — this bug was confined entirely to the test-fixture
    generator. Fixed by double-quoting every string value there;
    `tests/fixtures/observed/manifest.yaml`/`.../good_scenario/
    manifest.yaml`/etc. regenerated via `uv run python tests/fixtures/
    generate.py`.

    **A third, related reactivity bug found while building the new
    Scenarios-tab color swatch**: `hooks/useScenarioList.ts`'s own
    change-detection comparison (the memoized snapshot `ScenariosTab`
    re-renders from) checked `label`/`order`/`status`/`path`/`pinned`/
    `active`/`source` but not the new `colorOverride` field — so
    `appState.setColorOverride()` correctly updated the store and called
    `notify()`, but this hook's own snapshot saw no relevant field change
    and returned the STALE cached scenario, meaning the swatch's own
    displayed value never reflected the color it had just been set to.
    Fixed by adding `colorOverride` to that comparison — the exact same
    class of bug that file's own header comment already documents finding
    and fixing for `label`/`order` during `020-settings-modal`.

    **Shared infrastructure** (`panels/scenarioDisplay.ts`, new, pure,
    dependency-free like `panels/expandablePanelTypes.ts` — Vitest-
    importable with no store/React dependency; `hooks/
    useScenarioDisplay.ts`, new, mirrors `hooks/useActiveScenarios.ts`'s
    own memoized-`useSyncExternalStore` shape exactly): one
    `ScenarioDisplayMap` (name → `{label?, color?}`, `color` already
    resolved as `colorOverride ?? manifest color` — FR-007/FR-008/FR-011's
    precedence computed in exactly one place) threaded as a new, optional
    trailing parameter into all three extended pure encoding/trace-
    resolution functions. `PlotlyPanel.tsx` needed a genuinely new
    dedicated re-render effect (`lastRowsRef` cache + a scenario-display-
    only effect mirroring its own existing theme-only-re-render effect —
    this panel type's data-fetch is imperative, `Plotly.react()` inside a
    `.then()`) so a label/color change alone never triggers a new DuckDB
    query (FR-005/FR-012); `RechartsPanel.tsx` needed nothing beyond the
    hook call (fully declarative — `encodeRechartsData()` is called
    directly in the render body from `rows` state); `ObservablePlotPanel.tsx`
    added `scenarioDisplay` to its own already-existing redraw effect's
    dependency array (`rows` was already React state there too).
    `state/appState.ts` gained `colorOverride?: string` plus
    `setColorOverride()`/`clearColorOverride()`, mirroring `label`/
    `setLabel()`/`clearLabel()`'s exact shape (including the same
    `unregister()`-discards-it-for-free behavior, no special-cased
    cleanup) — added directly to the SAME per-scenario state object, not a
    new module (a real, confirmed correction to the feature request's own
    cited precedent: `state/navBarVisibilityState.ts` was deleted by
    `030-sidebar-navigation` and no longer exists; `state/appState.ts`
    itself, right next to `label`, is the applicable one).

    New Scenarios-tab control: a bare native `<input type="color">`
    swatch (`h-6 w-6`, matching the row's existing icon-button sizing —
    deliberately NOT `components/ui/input.tsx`, whose full-width text-input
    chrome is the wrong shape here) in the same trailing actions cluster
    as the existing baseline star/reorder/remove controls, plus a
    conditional `X`-icon clear button shown only once an override is set.

    Full regression confirmation: `npm run typecheck` clean; `npm run
    test:unit` 426/426 passing (up from 403 — `tests/unit/
    scenarioDisplay.test.ts` new, 6 tests; `plotlyTraces.test.ts`/
    `rechartsEncoding.test.ts`/`observablePlotEncoding.test.ts` extended,
    17 new cases across the three); `npm run build` clean, no new
    warnings. The FULL `tests/integration/` Playwright suite: 306 passed,
    18 failed on the first full-suite run, spread across 10 files. Every
    failure investigated individually — 17 of 18 passed cleanly on
    isolated re-run (including this feature's own new tests and every
    directly-touched file: `observablePlotPanel.spec.ts`,
    `settingsModal.spec.ts` full file 41/41, `scenarioManager.spec.ts`).
    The 18th — `flowmapPanel.spec.ts`'s deck.gl hover-tooltip test, this
    project's own already-documented real-hardware-timing-sensitive flake
    (`033`/`034`'s own CLAUDE.md entries) — failed twice in a row on first
    isolated re-run, so it got a rigorous 3-run-each comparison rather than
    being dismissed on one data point: this branch passed 2/3, a clean
    `git stash`'d tree passed 0/3 in the same session — conclusively
    pre-existing and uncorrelated with this feature (`FlowMapPanel.tsx`/
    `flowmapData.ts`/`mapTooltip.ts` are untouched by any of this
    feature's changes). Zero real regressions found.

23. ✅ Deployer scenario palette & redesigned color picker — done
    (`036-scenario-color-picker`). A deliberate revision of `035`'s
    just-shipped Part B, not a bug fix — two independent parts.

    **Part A** replaces `035`'s "manifest.yaml `color` is the default"
    resolution with a three-tier chain: viewer `colorOverride` (unchanged)
    → a new, deployer-configured `scenarioPalette` → this app's own
    shipped `--chart-1..5` default. Real research grounded the shipped
    default choice: Recharts has no real built-in categorical palette to
    compare against at all (confirmed by reading the installed package —
    `Line`/`Bar` default to single hardcoded colors, not a cycling
    scheme), while `schemeObservable10` is real and already the basis of
    this app's own existing, WCAG-verified `--chart-1..5` tokens — so the
    shipped default reuses those tokens BY REFERENCE
    (`var(--chart-N)`, not copied hex values), rather than introducing a
    new, unverified palette. `scenarioPalette` lives on the SAME existing
    deployer-configurable surface `028-dashboard-branding` already
    established (`dashboard-config/index.json`'s `title`/`logoUrl`/
    `logoUrlDark` fields), same precedence rules, no new config
    mechanism. The actual code change is genuinely surgical, exactly as
    planned: `hooks/useScenarioDisplay.ts`'s own `s.colorOverride ?? s.color`
    line becomes `s.colorOverride ?? resolveDefaultScenarioColor(index)`
    — `panels/scenarioDisplay.ts`'s `resolveScenarioColor()`, all three
    chart panel types' own color-consuming branches, and
    `scenarioDiscovery.ts`'s manifest fetch are all confirmed unchanged.

    **A real reactivity gap found during planning** (not in the original
    request): a `var(--chart-N)` reference needs a CONCRETE value before
    it can safely reach Plotly (confirmed against `PlotlyPanel.tsx`'s own
    existing `getComputedStyle()`-based workaround — Plotly's SVG
    rendering doesn't reliably honor raw `var()` the way Recharts' normal
    DOM cascade does), and that resolution must re-run on a theme flip.
    Fixed by resolving `var(--x)` via `getComputedStyle(document.
    documentElement)` inside `useScenarioDisplay()` itself (the one place
    with real DOM access), and by having that hook also call
    `useColorScheme()` internally, folding its value into the hook's own
    existing cache-invalidation check — a theme change now correctly
    re-renders every scenario's resolved color, no reload.

    **Part B** replaces `035`'s plain native `<input type="color">`
    swatch with a proper swatch+hex+RGB color picker. Initial research
    wrongly concluded no shadcn-ecosystem color-picker pattern existed
    (checked shadcn's own official registry and this project's own
    established `gropaul/dash-ui` reference repo — neither has one) —
    corrected mid-spec after the user pointed to `shadcn.io`, whose
    gated download endpoint traced back to a real, public, MIT-licensed
    OSS repo, `shadcnblocks/kibo`. Its real `color-picker` package (a
    genuine "Figma-style" picker: 2D saturation/lightness canvas,
    hue/alpha sliders, an eyedropper, mode-switchable hex/RGB/CSS/HSL
    display) was adopted as `components/ui/color-picker.tsx` — with one
    real, confirmed mismatch surfaced by reading the actual source: its
    own hex/RGB fields are `readOnly` (color is set only by
    dragging/sliding), conflicting with this project's own explicit
    editable-entry requirement. Presented to the user as a real trade-off
    (`AskUserQuestion`) before building anything — the user chose to
    adopt kibo's component in full and make its hex/RGB fields genuinely
    editable, a deliberate, documented adaptation. Two new dependencies
    follow directly from the real source (`color`, `@radix-ui/
    react-slider`), plus `@radix-ui/react-popover` (a genuine planning
    oversight caught and fixed during implementation, not a later
    discovery) for the swatch-triggered popover this project's own usage
    needed that kibo's real example doesn't (it renders uncontrolled,
    inline, no popover at all). `@radix-ui/react-slider` is used directly
    inline inside the picker (matching the real source's own file
    structure) rather than extracted into a separate shared
    `components/ui/slider.tsx` — deliberate, no second consumer exists
    yet.

    **Three real, confirmed bugs found and fixed during implementation,
    all via direct live reproduction, not assumed:**
    1. `Color.hsl(h, s, l, alpha/100)`'s 4-argument form silently DROPS
       alpha (confirmed via a live Node REPL check against the actual
       installed `color` package — always resolves to `alpha() === 1`
       regardless of the 4th argument). The real source's own chained
       `.hsl(h,s,l).alpha(a)` form is the only one that actually works;
       an early draft of the new, editable `ColorPickerFormat` used the
       broken 4-arg form specifically there (the faithfully-copied
       `onChange` effect elsewhere in the same file already used the
       correct chained form) — fixed to match.
    2. A genuine circular-update bug specific to this project's own
       FULLY-controlled `value`+`onChange` usage (the real kibo source
       never does this — its own example renders `<ColorPicker>`
       uncontrolled): committing an edit fires `onChange` → the caller
       writes to `appState` → the resolved color echoes back as a NEW
       `value` prop → the sync effect re-derives hue/saturation/lightness
       FROM that echo, which itself re-fires `onChange` with the same
       value — for "Reset to default" specifically, this instantly
       re-created the override the click had just cleared. Found via
       live Playwright reproduction (not assumed), fixed with a
       `lastEmittedHex` ref (skip the value-sync when the incoming value
       matches what this component itself most recently emitted) plus an
       `isSyncingFromValue` ref (suppress `onChange` firing as a reaction
       to ANY value-driven sync, echo or genuine reset alike).
    3. The SAME class of race, one layer deeper: editing three RGB fields
       in rapid succession (R, then G, then B) lost the earlier edits —
       traced to the "sync rgbDraft from computed color" effect firing as
       a side-effect of R's own commit and overwriting G's just-typed,
       not-yet-committed draft with a stale, R-only-reflecting value.
       Fixed with the same self-edit-suppression pattern applied one
       level deeper, inside `ColorPickerFormat` itself. Verified stable
       across 3 consecutive full test runs after the fix, not just one
       passing attempt — this class of bug is exactly the kind that can
       look fixed on a lucky run.

    Full regression confirmation: `npm run typecheck` clean; `npm run
    test:unit` 443/443 passing (up from 426 — `scenarioDisplay.test.ts`
    extended with 5 new palette-resolution cases, `colorFormat.test.ts`
    new with 12); `npm run build` clean, no new warning categories (the
    main chunk grew ~70KB from the 3 new dependencies, expected). Full
    `settingsModal.spec.ts` + `scenarioColorOverride.spec.ts` together:
    50/50 passing, including a substantial, deliberate rework of `035`'s
    own existing tests in both files (they asserted the now-retired
    manifest-color-default behavior — spec.md's own "revision, not a bug
    fix" framing applied to the test suite too, not left stale). The FULL
    `tests/integration/` Playwright suite: 321 passed, 9 failed on the
    first full run, spread across 5 files this feature never touches.
    Given `useScenarioDisplay()`'s broader reach into every chart panel
    type, each failure was checked individually rather than assumed —
    8 of 9 passed cleanly in isolation; the 9th
    (`flowmapPanel.spec.ts`'s deck.gl hover-tooltip test) is the SAME
    already-documented real-hardware-timing-sensitive flake this
    session's own `035` work already confirmed pre-existing via a
    3-run-each comparison. Zero real regressions.

    **Part C** (folded into this same feature, on the same branch, after
    Parts A/B had already shipped — a real, additive UI/UX refinement of
    the Scenarios tab row itself, touching neither Part A's palette
    resolution chain nor Part B's color picker at all): three sub-changes
    to `layout/settings/scenariosTab.tsx`.
    1. **Row status treatment** — the small status dot alone read as
       plain default styling, not genuinely prominent. `layout/settings/
       scenarioStatusColor.ts`'s `ScenarioStatusTreatment` gained two new
       fields, `rowBorderClassName` (a plain `border-l-4 border-l-{token}`
       Tailwind utility) and `rowBackgroundStyle` (a real `color-mix(in
       srgb, var(--token) 6%, transparent)` inline style), both still
       resolved from the SAME three existing `--success`/`--destructive`/
       `--muted-foreground` tokens the dot already used — no new color
       anywhere. `rowBorderClassName` deliberately stays a plain utility
       class rather than a slash-opacity form — confirmed via the
       `wftdm-design-system` skill that an opacity modifier against this
       app's plain-hex custom properties generates no CSS at all, but a
       solid border needs no transparency, so a plain class costs nothing
       here; `rowBackgroundStyle` genuinely needs partial transparency and
       therefore uses a real `color-mix()` inline style instead.
       `registering` gets no background wash at all — its pulsing dot
       already carries that state's own signal, and a wash on a fast-
       changing/transient row would be motion-y noise rather than
       clarity.
    2. **Active/inactive toggle** — a real, substantial capability this
       app had deferred since `009-scenario-manager`'s original scope. A
       `Switch` (`components/ui/switch.tsx`, `033-shadcn-default-theme`,
       `size="sm"`) added to the actions cluster, wired DIRECTLY to
       `state/appState.ts`'s existing `active` field and `setActive()` —
       no new mechanism, per the user's own explicit instruction.
       Toggling it reactively affects every `$scenario.`-driven panel's
       query via the existing, unmodified `useActiveScenarios()` hook,
       exactly like removing a scenario does today — confirmed live via a
       real Playwright test that toggles `observed` off/on against
       `dashboard-1-summary.yaml`'s own `row_scenario_display` fixture
       panel (a bare `$scenario` union) and asserts the rendered table
       row count drops from 4 to 2 and back, with no reload. Applies to
       every scenario regardless of `source` (`url` or `handle`) — the
       user's own explicit scope decision that this replaces the need for
       a new removal capability for published scenarios; a
       `source: 'handle'` (local) scenario keeps its own separate remove
       button unchanged alongside the new toggle.
    3. **Baseline indicator redesign** — the small, easy-to-miss `Star`
       icon is no longer the PRIMARY indicator; a `Badge`
       (`components/ui/badge.tsx`, `034-metric-panel-redesign`, `variant=
       "default"`) reading "Baseline" now renders inline next to the
       baseline scenario's own label input, in the identity block's own
       real horizontal slack (confirmed during this Part C's own research
       — no row restructuring was needed to fit it). The `Star` `Button`
       itself — its `aria-label`/`aria-pressed`/`onClick={() =>
       appState.setBaseline(s.name)}` — is completely UNCHANGED; this is
       a visual change to how the CURRENT baseline is indicated, not a
       change to how one gets set.

    **A real, confirmed reactivity non-finding worth naming**: unlike
    `035`'s own original `colorOverride` plumbing (which needed a real
    fix to `hooks/useScenarioList.ts` for exactly this reason), the new
    `Switch` needed NO reactivity fix — `useScenarioList()`'s own existing
    change-detection already covers `active` (its own header comment
    already lists it among the fields it watches), confirmed by direct
    re-read before writing any code, not assumed.

    **A real fixture-activation detail surfaced while writing the new
    Playwright coverage**: `state/appState.ts`'s `registerPublishedScenarios()`
    never calls `setActive()` for a published scenario at all — only
    `observed` is forced active at registration, and every other
    published scenario needs either an explicit `?s=` URL param
    (`applyURLParams()`) or a viewer's own later action. The new active-
    toggle test therefore boots via `?s=good_scenario`, matching
    `scenarioColorOverride.spec.ts`'s own already-established convention
    for this exact fixture panel — not a new discovery, but a real detail
    this Part C's own test had to get right on its second attempt (the
    first attempt assumed `good_scenario` was already active by default
    and saw 2 rows instead of the expected 4).

    Full regression confirmation (Part C only — Parts A/B's own numbers
    above are unchanged by this addendum): `npm run typecheck` clean;
    `npm run test:unit` 447/447 passing (up from 443 —
    `scenarioStatusColor.test.ts` extended with 4 new row-treatment
    cases); `npm run build` clean, no new warning categories; 3 new
    `settingsModal.spec.ts` tests (row border/background in both themes,
    the active-toggle reactivity round-trip, the Baseline badge appearing/
    moving) all passing, plus the full `settingsModal.spec.ts` file
    (45/45) and `scenarioColorOverride.spec.ts` (8/8, confirming Parts A/B
    unaffected) both re-run clean. The FULL `tests/integration/`
    Playwright suite (333 tests): 327 passed, 6 failed on the first run,
    spread across `dashboardShell.spec.ts`/`flowmapPanel.spec.ts` (×2)/
    `observablePlotPanel.spec.ts`/`rechartsPanel.spec.ts`/
    `zonemapPanel.spec.ts` — none in any file this Part C touches. Every
    failure re-run individually: 4 of 6 passed cleanly in isolation
    (genuine multi-worker resource-contention flakiness); the other 2 are
    the SAME already-extensively-documented pre-existing flakes this
    project's own history already records (the dark-mode Plotly
    re-query-count off-by-one; the deck.gl hover-tooltip real-hardware-
    timing-sensitive flake) — `scenarioStatusColor.ts`/`scenariosTab.tsx`
    are untouched by either. Zero real regressions.

    **Part C, refinement** (same feature/branch, folded in immediately
    after Part C above had already shipped — direct, real research this
    time, not invented). The Badge-based baseline indicator and the
    always-textual "(ready)"/"(failed)" status shipped above were
    correctly identified as still ambiguous: two separate controls (a
    floating Badge, a plain outline/filled Star elsewhere in the row) both
    claiming to indicate/set the SAME thing. Studied two real, well-
    established cross-industry examples of exactly this "one designated
    item among many, clearly marked, user-changeable" problem before
    redesigning, both fetched directly rather than assumed from memory:
    GitHub's own default-branch indication
    (`github.com/{owner}/{repo}/branches`) and Stripe's own real,
    documented `invoice_settings.default_payment_method`/`default_source`
    convention (`docs.stripe.com/api/customers/object`). The common
    thread confirmed in both: a text label paired with an icon TOGETHER,
    immediately adjacent, as one unit — never an icon standing alone,
    never a label floating elsewhere in the row.

    Fixed by removing the separate Badge entirely and pairing the Star
    with its own label directly, in the Star's own existing location
    (not moved into the identity block): the baseline row renders one
    `Button` containing a filled, `text-primary` Star immediately followed
    by the text "Baseline"; every other row keeps the existing outline
    Star alone (no persistent text — an empty state doesn't need
    explaining the way an active one does), now wrapped in a `Tooltip`
    reading "Set as baseline" on hover, matching both real references' own
    "clarify the action on hover" convention. The click-to-mark
    interaction itself — `onClick`/`aria-label`/`aria-pressed` text — is
    byte-for-byte unchanged from the original Star button.

    Same pass also drops the redundant trailing `"(ready)"`/`"(failed)"`
    text entirely — the row's own border+background treatment (already
    shipped, above) already communicates those two states without it.
    `"registering"` keeps a visible text cue — research judged the
    pulsing dot alone not loud enough on its own for an in-progress
    state — reusing `scenarioStatusColor.ts`'s own existing
    `treatment.label` ("Loading") rather than a new hardcoded string,
    shown inline right next to the dot (not at the row's far trailing
    edge, which no longer exists as a distinct zone at all).

    **A real, confirmed test-authoring finding, found live while
    reproducing "before" state for comparison screenshots**: directly
    delaying a scenario's own `summary/index.json` fetch via
    `page.route()` to try to catch a live `'registering'` row was
    unreliable — by the time the Settings modal opened, registration had
    already resolved despite the injected delay, for reasons not worth
    chasing further (this project's own existing test comments already
    flag "a live 'registering' row is not reliably observable in a real
    browser" — this now has a second, independent confirmation). Fixed
    for illustration purposes with a deterministic alternative:
    `window.__wftdm.appState.register(...)` (the real, already-exposed
    debug hook — `appState` is the full, live module, not a snapshot)
    creates a brand-new scenario entry that starts, and stays, at
    `'registering'` forever, since nothing ever calls `setStatus()` for
    it — no network race at all.

    A second, unrelated finding from the same screenshot session: a
    `Tooltip`'s content renders via a Radix portal at `document.body`,
    a SIBLING of the row list, not a descendant — a `locator.screenshot()`
    scoped to the row list container therefore can never include it,
    regardless of z-index/position; only a full-page (or a container
    genuinely ancestor-to-both) screenshot captures it. The real,
    automated Playwright assertion (`getByRole('tooltip')`) already
    proved the tooltip works correctly throughout — this was purely a
    screenshot-composition artifact, not a functional gap.

    Full regression confirmation (this refinement only — Part C's own
    numbers above are otherwise unchanged): `npm run typecheck` clean;
    `npm run test:unit` 447/447 passing (unchanged — this refinement
    touches no unit-tested pure module); `npm run build` clean. The full
    `settingsModal.spec.ts` file (46/46, including 4 Part C tests — one
    new, for the non-baseline row's outline-Star-plus-tooltip state) and
    `scenarioColorOverride.spec.ts` (8/8) both re-run clean. The FULL
    `tests/integration/` suite (333 tests): a first pass returned an
    alarming 18 failures spread across files this refinement never
    touched (basemap/reorder/label/color-picker tests) — investigated
    before concluding anything, and traced to a real, SELF-INFLICTED
    cause, not a regression: two `npx playwright test` invocations were
    running concurrently (this refinement's own screenshot-capture spec
    alongside a full-suite run), each running its own
    `global-setup.js`/`global-teardown.js` independently against the SAME
    shared `public/` fixture files with no coordination between the two
    processes — exactly the class of hazard `tests/integration/
    _sharedFixtureLock.ts` exists to prevent for same-file races, but
    which does nothing for two entirely separate `playwright test`
    process invocations each performing their own global setup/teardown.
    Confirmed by re-running the full suite cleanly, one invocation at a
    time: 327 passed, 6 failed — all 6 re-checked individually, 5 of 6
    passed cleanly in isolation (resource-contention flakiness) and the
    6th is the same already-documented deck.gl hover-tooltip flake.
    A SECOND full clean run (after this refinement's own file swaps for
    screenshot capture) returned 12 failures spread across 7 files this
    refinement never touches (`boot.spec.ts`/`flowmapPanel.spec.ts`/
    `graphicWalkerPanel.spec.ts`/`observablePlotPanel.spec.ts`/
    `panelExpand.spec.ts`/`sankeyPanel.spec.ts`/`zonemapPanel.spec.ts`) —
    11 of 12 passed cleanly in isolation (the `zonemapPanel.spec.ts`
    failures re-confirmed via a full 30/30 file re-run), and the 12th is
    again the same deck.gl hover-tooltip flake. Zero real regressions
    across either full-suite pass.

    **Part C, second refinement — a real, confirmed layout bug fixed
    (same feature/branch)**: the Star+"Baseline"-text control built in
    the first refinement above is wider than a plain Star on every other
    row. With the actions cluster right-aligned (`shrink-0`) and the
    identity block absorbing the difference (`flex-1`), that width delta
    shrinks the identity block by a DIFFERENT amount on the baseline row
    specifically — visibly shifting the Switch/color-swatch/reorder-
    arrows LEFT relative to every other row, confirmed in a real
    screenshot before fixing anything. Fixed by rendering the exact SAME
    markup (Star icon + a `"Baseline"` text `<span>`) on every row
    regardless of baseline state — the text span gets Tailwind's
    `invisible` class (not conditionally omitted) on a non-baseline row,
    which reserves its full layout width without rendering visually. This
    makes the control's width — and therefore every action's x-position
    to its left — bit-for-bit identical across all rows. Deliberately NOT
    a hardcoded pixel width (`w-[88px]`-style): the "always render the
    same content, hide only visually" technique is robust to font-size/
    zoom changes a magic literal wouldn't be, and needs no measurement or
    tuning to get right.

    Verified with real pixel measurements, not eyeballing (per the user's
    own explicit instruction): a temporary, since-deleted Playwright spec
    read `getBoundingClientRect()`-derived `x` positions for the Switch,
    color swatch, first reorder arrow, and Star button across all three
    real fixture rows, in both themes — every value matched its own
    column across rows to sub-pixel precision (`805.6875`/`835.6875`/
    `861.6875`/`883.6875` px, identical on every row including the
    baseline row, in both light and dark). Screenshots taken and visually
    confirmed the same alignment.

    **A real, confirmed test-authoring fallout from this fix**: two
    `settingsModal.spec.ts` Part C tests asserted the "Baseline" text
    literally didn't EXIST in the DOM on a non-baseline row
    (`toHaveCount(0)`) — now false, since the text node always exists,
    just invisible. Fixed both to assert `.not.toBeVisible()` instead of
    `toHaveCount(0)`/a count-based branch, which is what those tests
    actually meant to prove all along (no VISIBLE persistent text, not no
    DOM node at all).

    Full regression confirmation: `npm run typecheck` clean; `npm run
    test:unit` 447/447 (unchanged); `npm run build` clean. The full
    `settingsModal.spec.ts` file re-run clean at 46/46 after the two test
    updates above. The FULL `tests/integration/` suite, run cleanly (a
    single invocation — two earlier attempts at this same regression pass
    were themselves corrupted by the SAME self-inflicted concurrent-
    invocation hazard the prior refinement's own entry already documents,
    confirmed again by the telltale `index.json.original-during-tests`
    already-exists error and a spread of failures across files with no
    relationship to this change): 5 failures on the clean run, all
    individually triaged — 1 is the same already-documented dark-mode
    Plotly re-query-count flake, and the other 4 (three `flowmapPanel.spec.ts`
    reset-to-view/basemap-pin cases, one `zonemapPanel.spec.ts` basemap-
    inheritance case) all passed cleanly in isolation. A separate, later
    isolated re-run of the full `flowmapPanel.spec.ts` file surfaced 4
    DIFFERENT failures, all real-UGRC-vector-tile-service-dependent tests
    (`016-fix-ugrc-dark-mode`/`017-multi-sprite-support`) — confirmed via
    a direct `curl` that UGRC's own real endpoint was genuinely
    unreachable from this environment at that moment (`000`, vs. a
    control CARTO endpoint's real `200`) — a transient external-network
    condition, not a code regression, and not overlapping at all with the
    original 5-failure list. `scenariosTab.tsx`/`settingsModal.spec.ts`
    are untouched by any of these. Zero real regressions.

24. ✅ Scenarios tab redesign — drag-and-drop reorder, consolidated
    baseline chip, verified active toggle — done
    (`037-scenarios-tab-redesign`). Five parts over `035`/`036`'s
    already-shipped Scenarios-tab state.

    **Part A — no bug.** Investigated whether the active/inactive `Switch`
    was wired backwards (a screenshot appeared to show every row "off").
    Confirmed via live DOM/attribute/state comparison that it is NOT:
    `checked={s.active}` with no negation, and `observed` renders
    `aria-checked=true`/`data-state=checked` because it is the ONLY
    force-active scenario by default — `services/scenarioDiscovery.ts`'s
    `registerPublishedScenarios()` has never called `setActive()` (a real,
    pre-existing, already-documented fact from `035`). On a plain `/`
    boot, 2 of 3 fixture rows are genuinely, correctly inactive, which
    skims as "everything is off." FR-001's new regression test
    (`settingsModal.spec.ts`, both themes) locks the correct wiring in
    permanently — asserting the Switch's `aria-checked` equals the real
    `active` value for an active AND an inactive scenario together.

    **Part B** — the up/down move buttons moved from the trailing actions
    cluster to the row's LEADING edge, next to a new drag handle, before
    the status dot. Behavior (disabled at boundaries, `appState.
    moveScenario`, `aria-label` text) unchanged.

    **Part C** — real drag-and-drop reordering via `@dnd-kit/core` +
    `@dnd-kit/sortable` + `@dnd-kit/utilities` + `@dnd-kit/modifiers`
    (`restrictToVerticalAxis` only — `restrictToParentElement` was
    dropped, it broke the KeyboardSensor). Chosen after evaluating real,
    current npm-registry data: `react-beautiful-dnd` is officially
    deprecated (and already only a transitive dep of graphic-walker);
    `react-dnd` is lower-level and last published mid-2022; `@dnd-kit` is
    actively maintained, React-18-compatible, and the only option with
    documented built-in keyboard sensor + live-region screen-reader
    announcements. **Constitution Principle VI analysis**: `@dnd-kit` is
    a headless behavior toolkit, NOT a "component library / CSS framework
    / icon set" — same category as Radix UI itself, `d3-sankey`, `color`,
    deck.gl, `@observablehq/plot` already in this tree; it ships no
    styled components, no tokens, no icons, and replaces no shadcn/Radix/
    Tailwind/`lucide-react` role. No amendment required. Each row is now
    its own component (`src/layout/settings/scenarioRow.tsx`) so
    `useSortable()` has a clean per-row call site; `scenariosTab.tsx`
    holds the `DndContext`/`SortableContext`. A `GripVertical`
    (`lucide-react`) handle — not the whole row — carries the drag
    listeners. `onDragEnd` funnels through a NEW `appState.reorderScenario(
    name, targetIndex)` (a full `order` re-sequence for an arbitrary
    from→to move); the existing `appState.moveScenario('up'|'down')` was
    reimplemented as a thin wrapper over it, so there is genuinely ONE
    reordering code path (FR-004), unit-tested in `tests/unit/appState.
    test.ts` (11 new cases). The relocated arrow buttons remain a
    complete, crisp keyboard-accessible fallback (FR-005).

    **A real `@dnd-kit`-in-a-transformed-dialog finding**: the built-in
    `sortableKeyboardCoordinates` absorbs the FIRST arrow press per
    keyboard drag inside a CSS-transformed ancestor — the Settings
    `DialogContent` centres with `-translate-x-1/2 -translate-y-1/2` —
    then advances one row per press after that. A custom transform-robust
    `coordinateGetter` was tried and behaved identically, so it was
    reverted; the built-in getter is kept. Keyboard reordering is fully
    functional (lift / move / drop / Escape-cancel all work, with
    position-based announcements); it is just not pixel-1:1 on the first
    press. The dedicated arrow buttons are the crisp 1-press-per-step
    keyboard path. Documented in `scenariosTab.tsx` and the test.

    **Part D** — the Star / Star+"Baseline"-text control (`036`) is
    removed entirely, replaced by ONE chip in the identity block beside
    the name (`BaselineChip` in `scenarioRow.tsx`): the current baseline
    row shows a filled, non-interactive `<Badge variant="default">Baseline
    </Badge>` (no `onClick`, no tooltip — FR-009/FR-011); every other row
    shows an outline `<Badge variant="outline">Set as baseline</Badge>`
    wrapped in a `<button>` that calls the same `appState.setBaseline()`
    the Star used to (FR-010). Both states occupy an identical reserved
    width via an invisible sizer rendering the wider "Set as baseline"
    label in the same CSS-grid cell — so the identity block never shifts
    width between a baseline and a non-baseline row (FR-015). No `Star`
    icon, no separate `Badge`, anywhere else in the row. `scenarioManager.
    spec.ts`'s own `018-baseline-scenario-designation` UI-flow tests were
    a real regression from this change (their `baselineStar()` helper
    targeted the old Star's `aria-label`) — updated to target the chip
    (filled "Baseline" text for the baseline row; the "Mark … as baseline
    scenario" button elsewhere), and the "re-mark the current baseline"
    idempotency case now asserts at the state level since the baseline
    row's own chip is intentionally not clickable.

    **Part E** — a scoped `Tooltip` on the active/inactive `Switch`
    ("Include this scenario in comparisons and queries"). **A real bug
    caught by the full suite**: `<TooltipTrigger asChild>` writes its own
    `data-state` (`closed`/`delayed-open`/…) onto the element it wraps —
    applied directly to the `Switch` it CLOBBERED the Switch's own
    `data-[state=checked|unchecked]` styling (the FR-001 test's
    `data-state` assertion caught it; the real cost would have been the
    Switch losing its checked/unchecked background colour). Fixed by
    wrapping the `Switch` in a `<span>` and putting the trigger on the
    span — hover still triggers the tooltip (FR-012); the Switch keeps
    its `aria-label`/`checked`/`onCheckedChange`/`data-state` untouched
    (FR-013).

    Full regression: `npm run typecheck` clean; `npm run test:unit`
    457/457 (up from 447 — the `reorderScenario` cases); `npm run build`
    clean (`@dnd-kit` adds ~48 KB to the main chunk — not worth a
    dedicated `manualChunks` entry). Full `tests/integration/` suite: a
    first run surfaced 10 failures — 6 real, caused-by-this-feature and
    all fixed (`scenarioManager` baseline helper ×4, the Switch
    `data-state` clobber ×2), 4 pre-existing flakes. A clean re-run:
    341 passed, 4 failed — `flowmapPanel:551`/`graphicWalkerPanel:278`/
    `settingsModal:497` each pass in isolation (multi-worker contention),
    and `flowmapPanel:713` is the same already-documented deck.gl
    hover-tooltip real-hardware-timing flake. Zero real regressions in
    the clean run.

    **037 follow-up (item 5) — row-layout refinement, shipped:** the
    green/red ready/failed status DOT is removed entirely (the row's own
    left-border colour + background-wash treatment from 036 Part C
    already carries those two states — the dot was redundant); only
    `'registering'` keeps a dedicated signal, its "Loading…" text, now
    rendered where the dot sat. The colour swatch
    (`ScenarioColorControl`) moves out of the trailing actions cluster to
    the LEFT of the whole two-line identity block (name on line 1, path
    on line 2), vertically centred against both lines together by the
    row's own `items-center` — the "leading avatar/icon beside a two-line
    title+subtitle" list-row pattern (a first pass placed it beside the
    name on line 1 only; a follow-up moved it to lead the whole block).
    A legend-key "this colour = this scenario" association. Verified via
    `getBoundingClientRect()`: the swatch's vertical centre lands within
    2 px of the name-line/path-line midpoint and is genuinely below the
    name line's own centre, both themes, every row (`settingsModal.spec.ts`
    T011b); horizontal alignment across rows re-verified by T011. Tests
    updated: the "distinct status dots" test now asserts the row's
    border/background treatment; the FR-005 test and the 036-Part-C
    `scenarioRow()` helper drop the `scenario-status-dot` anchor for the
    row's own `data-testid`.

    **037 follow-up (item 2) — Switch tooltip honesty fix, shipped:**
    Part E's tooltip copy went from "Include this scenario in comparisons
    and queries" (which implies the Switch controls everything a viewer
    sees) to **"Include this scenario when panels aren't pinned to a
    specific scenario"** — accurate per the 037 investigation: a panel
    with a `scenario:`/`scenarios:` key names its data directly and is
    independent of `appState.active` by design (`services/sqlExpander.ts`).
    The Switch's actual behaviour is unchanged.

    **037 follow-up (item 4) — INVESTIGATED, NOT SHIPPED:** flipping
    `registerObserved()` from `setActive('observed', true)` to `false`.
    Confirmed directly that observed's registered data IS a placeholder
    everywhere (`public/observed/` ships no content in the demo/prod
    deployment — the demo `dashboard-*.yaml` comments say so and record
    the Catalog Errors it caused; the test fixture's own observed data is
    explicitly "a fixture stand-in ... synthetic"). But the flag was NOT
    flipped: the entire fixture dashboard-config (12 unpinned
    `$scenario`-union panels on the Summary tab alone) and, per its own
    comments, the demo dashboard-config are authored assuming
    observed-is-always-active. A full-suite run with the flag flipped
    produced **33 failures across 10 spec files** (unpinned panels
    rendering a "no active scenarios" error on a `?s=`-less boot), for
    **zero user-visible benefit** while every demo panel stays
    `scenario:`-pinned. The change is the first step of unpinning the
    demo content (the 037 item-3 architectural question), not an
    isolated flag flip — reverted, left for that decision. The
    `setActive('observed', true)` line carries a comment recording this.

    **The 037 item-1/2/3 investigation finding (reported, no code
    change):** across `public/demo-dashboard-config/`'s 7 tabs, **41 of
    46 panels** carry an explicit `scenario:`/`scenarios:` pin; the other
    5 are all `markdown` panels (no data query). **Zero data-rendering
    demo panels use the dynamic active-scenario `$scenario` union** —
    so the active/inactive Switch has no visible effect on anything a
    viewer sees in the demo dashboards. `services/sqlExpander.ts`'s
    resolution rules make this correct-by-design: `config.scenario`
    (singular) → a direct `"{scenario}__{metric}"` view reference,
    `$scenario` placeholder bypassed; `config.scenarios` (list) →
    `resolveActiveScenarios()` returns `config.scenarios ??
    activeScenarioNames`, so an explicit list also wins over the active
    set. Only a panel with NEITHER key consults `appState.active`. The
    demo pins so heavily *because* observed is force-active with no data
    (an unpinned union would `UNION` a nonexistent `observed__<metric>`
    view and throw). So the Switch's real scope, and whether the demo
    should rely less on pinning, is a genuine architecture question —
    left for a deliberate decision, not changed here. As an interim,
    Part E's Switch tooltip could be made explicit that it only affects
    panels not pinned to a specific scenario.

25. ✅ All loaded scenarios participate by default — done
    (`038-all-loaded-scenarios`, the deliberate decision item 24's
    investigation deferred). Two parts.

    **Part 1 — the discovery rule** (`services/scenarioDiscovery.ts`, ~6
    lines across 3 functions): every scenario whose registration reaches
    `status === 'ready'` is `setActive(name, true)` in its own success
    branch — uniformly for `registerObserved()` /
    `registerPublishedScenarios()` / `registerDemoScenarios()`, with
    **no** fixture-vs-demo branching (the only honest discriminator is
    each scenario's own `status`; a context-dependent default could only
    be a hack). `registerObserved()`'s old **unconditional**
    `setActive('observed', true)` (which fired even on `status ===
    'failed'`) is gone — an empty `public/observed/` in a real
    deployment now registers `failed` and is never activated, so it
    never poisons an unpinned `$scenario` union. That single fact is
    what made 032's heavy `scenario:`-pinning necessary and what makes
    unpinning safe now. `applyURLParams()` is unchanged (still add-only,
    still last) — `?s=` can only widen the auto-activated set.
    `getBaseline()` is untouched (resolves on `pinned`/`status`, never
    `active`). No `appState` shape change, no new module, no new
    dependency. See `specs/038-all-loaded-scenarios/contracts/
    discovery-activation.md` (DA-1..DA-8).

    **Part 2 — the demo content** (`public/demo-dashboard-config/`, 8 tab
    files; the authoritative per-panel list is
    `contracts/demo-panel-disposition.md`). Of 41 previously-pinned
    panels: **27 unpinned**, **14 kept pinned** (each gains a
    baseline-scope `description`). No demo panel uses `comparison: diff`
    / `$baseline` — the "legitimate pin for baseline comparison"
    category the request anticipated is **empty** for the demo. The 14
    that stay pinned: 6 KPI `valuebox` (renders `rows[0]` only — an
    unpinned union would surface an arbitrary scenario's row), 3
    `zonemap`/`flowmap` (one draw per dataset), and **5** `observable-
    plot`/`recharts` whose `fill`/`series` channel is already committed
    to a real categorical breakdown (`school_segment` /
    `primary_purpose` ×3 / `tour_mode`) — converting those needs
    faceting, out of scope. The genuine "unpin + add a per-scenario
    channel" set is **3** panels (`fill: scenario` ×1, `name:
    $scenario` ×2); 2 more panels that carried a redundant `scenarios:
    [all 3]` list already had `name: $scenario` in their `traces:`
    block (an initial `js-yaml` parse checked only top-level `p.name`
    and missed the trace-level channel — a real, recorded correction to
    the spec's own §2 estimate; totals unchanged).

    **A real, necessary refinement found during testing (T020)**: a
    `table` with an explicit `columns:` list renders ONLY the listed
    fields (`tableLogic.ts`). All 18 unpinned demo tables have such a
    list, none naming `scenario` — so unpinning alone produced a
    3-scenario union with no visible discriminator column. Every one
    gained `- { field: scenario, label: "Scenario" }` prepended to its
    `columns:`. (`Scenario Split (Table)` in the fixture works without
    this only because it has no `columns:` override.)

    **A pre-existing limitation surfaced, NOT a 038 regression, NOT
    fixed** (`research.md` §6b): with **zero** active scenarios, an
    unpinned panel's `$scenario` expansion throws synchronously in the
    fetch-effect body (before `.then()/.catch()`), so `panelCard.tsx`'s
    error boundary replaces the body and does not auto-reset on a later
    prop change — the panel needs a remount to recover. Before 038 this
    was only reachable by toggling `observed` off when it was the sole
    active scenario (no test hit it). "Must not crash" holds; the
    "recovers when you re-activate one" part is a follow-up (would need
    every panel type's effect to catch-and-map the throw, or a boundary
    reset key). DA-4/DA-7 reactive pickup (a scenario activating while
    ≥1 was already active — the panel never hits the throw) works and is
    covered.

    **Test remediation** (FR-012 / SC-005 — much smaller than item 24's
    "~33": that figure was from flipping `observed` fully *inactive*;
    here `observed` stays active whenever its fixture data is present):
    `boot.spec.ts` (2 active-set assertions + 1 test title — plain boot
    is now `['good_scenario','observed']`), `settingsModal.spec.ts`
    (037's FR-001 test — `good_scenario` is now auto-active, so the
    "inactive scenario" side uses `broken_scenario` = `failed`),
    `graphicWalkerPanel.spec.ts` (one stale comment).
    `scenarioManager.spec.ts` needed **no** change (all its `.active`
    assertions concern local-folder-load scenarios — unchanged path — or
    `observed`/failed folders). Fixture `Total Households`/`Total
    Trips`/`Average Trip Distance` valueboxes pinned `scenarios:
    [observed]` (explicit declaration — a valuebox shouldn't be an
    unpinned union anyway). `demoContentAllPanels.spec.ts` +
    `demoMultiScenario.spec.ts` (new) route the fixture discovery
    endpoints (`observed/summary/index.json`, `scenarios/index.json`,
    `dashboard-config/index.json`) to 404 so they run against the demo
    content alone — a real demo deployment shape — which also retires
    that spec's 032-era cross-root "two Summary tabs" `.last()`
    workaround. New `scenarioAutoActivation.spec.ts` (DA-1..DA-8),
    `switchControlsUnpinnedPanels.spec.ts` (US1 against the fixture's own
    unpinned `Scenario Split (*)` panels), `demoMultiScenario.spec.ts`
    (US3 + dual-theme: unpinned plotly/recharts/observable-plot each
    render 3 theme-correct per-scenario series in light AND dark).

    `npm run typecheck` clean; `npm run test:unit` 457/457 (unchanged —
    `appState` shape untouched).

---

## Reference implementations — copy patterns, don't re-derive

| Repo | What to copy |
|---|---|
| `ar-puuk/omx-viewer` | DuckDB-WASM init, Arrow handoff, Vite config, coi-serviceworker, GH Actions |
| `WFRCAnalytics/APP-Commute-Explorer` | MapboxOverlay + FlowmapLayer + MapLibre wiring, hover/pick pattern |
| `ar-puuk/spatial-sql-explorer` | DuckDB spatial extension lazy-load, MapLibre choropleth, basemap switching |
| `ar-puuk/parquet-viewer` | GeoParquet metadata detection, registerFileBuffer, spatial extension fallback, buffer-pool collision fix |

---

## Do not

- Use Vue, Svelte, or any component framework other than React — React is
  the only framework this project may ever adopt, and it is adopted:
  `002-design-tokens` brought it in for the component foundation; panels
  are the next consumer (constitution v2.2.0)
- Add new plain `.js` files to `src/` — TypeScript (`.ts`) is the standard
- Use Mapbox GL — MapLibre only
- Use Webpack — Vite only
- Read OMX/CSV/GeoJSON in the browser — Parquet only
- Put DuckDB-WASM on the main thread
- Use localStorage/sessionStorage
- Create `topsheet.yaml` — the first dashboard-*.yaml is the landing page
- Create `summarize-preprocessor.yaml` — join logic lives in sql_fragments
- Create `dashboard-config.yaml` — does not exist (the `public/dashboard-config/` directory is unrelated — see Config file set above)
- Create `services/observedRegistry.ts` — replaced by `services/scenarioDiscovery.ts`
