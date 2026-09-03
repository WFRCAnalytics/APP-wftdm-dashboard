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
| Explore tab | Graphic Walker (`embedGraphicWalker`) |
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
- Parquet outputs live in `{scenario-dir}/summary/` — written by the post-processor
- Published scenarios are manually copied into `public/scenarios/` in the dashboard repo

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
│   └── wftdm_dashboard/        # Python package
│       ├── __init__.py
│       ├── cli.py              # wftdm-dashboard serve / here / init
│       ├── server.py           # Flask/uvicorn file server with CORS headers
│       ├── static/             # built dist/ embedded at package build time
│       └── templates/          # default configs copied by `init` (never overwrites existing files)
│           ├── summarize.yaml          # pre-filled with standard WFRC segmentations
│           ├── dashboard-1-summary.yaml
│           └── ...                     # dashboard-2-person.yaml through dashboard-7-explore.yaml
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
    │   │                       # broken (research.md §1)
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
    │   ├── sqlExpander.ts       # expand $mappings/$bins/$sql/$filters/$scenario
    │   └── scenarioDiscovery.ts # register observed/ + public/scenarios/ at startup
    ├── hooks/
    │   ├── useFilterState.ts   # wraps state/filterState.ts with
    │   │                       # useSyncExternalStore (constitution v2.2.0)
    │   ├── useActiveScenarios.ts # done (009-scenario-manager) — same
    │   │                       # useSyncExternalStore shape, wrapping
    │   │                       # appState.ts's new subscribe() instead;
    │   │                       # every data-bound panel type consumes
    │   │                       # this now, not appState.getActive()
    │   │                       # directly (research.md §1)
    │   └── useColorScheme.ts   # done (011-basemap-style-system) — reads
    │                           # (never sets) the Tailwind `.dark` class
    │                           # on document.documentElement via a
    │                           # MutationObserver + useSyncExternalStore,
    │                           # same shape as the two hooks above. No
    │                           # real theme-toggle UI exists in the app
    │                           # yet — only src/demo/DesignTokenDemo.tsx
    │                           # (an out-of-band demo page) sets the
    │                           # class today; this hook is the read side
    │                           # of a feature (a real toggle) that hasn't
    │                           # been built, same situation
    │                           # registerScenario() was in from 001 until
    │                           # 009 built its own caller.
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
    │   # DuckDB-spatial feature). graphic-walker remains the only panel
    │   # type not yet built. scenario/scenarioManager.ts + manifestReader.ts are
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
    │   ├── navBar.tsx            # shadcn Tabs-based tab navigation
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
    │   │                         # parsed from yamlLoader's DashboardConfig.raw
    │   ├── scenarioLoader.tsx    # done (009-scenario-manager) — the
    │   │                         # "Load Local Scenario" trigger +
    │   │                         # loaded-scenario list, mounted in
    │   │                         # shell.tsx's header alongside NavBar;
    │   │                         # hidden entirely in LOCAL deployment
    │   │                         # mode (hostname === 'localhost')
    │   └── sidebar.tsx           # not built yet — no feature has needed it
    ├── panels/
    │   ├── registry.tsx          # type -> component map: valuebox, plotly
    │   ├── panelQuery.ts         # PanelConfig + filters -> SQL template
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
    │   ├── basemap/              # done (011-basemap-style-system) — shared
    │   │   │                     # basemap registry/resolution, consumed by
    │   │   │                     # FlowMapPanel.tsx AND (013-zonemap-panel)
    │   │   │                     # ZoneMapPanel.tsx unmodified — confirming
    │   │   │                     # this module's own generic-across-map-
    │   │   │                     # panel-types design intent for real,
    │   │   │                     # not merely assumed
    │   │   ├── types.ts          # BasemapSelection/BasemapComposition/
    │   │   │                     # EffectiveBasemap
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
    │   │   ├── resolveEffectiveBasemap.ts # pure panel > tab > app-default
    │   │   │                     # precedence resolver + basemapKey()
    │   │   │                     # (the content-stable identity
    │   │   │                     # FlowMapPanel.tsx's own basemap effect
    │   │   │                     # keys its dependency array on, so a
    │   │   │                     # pinned basemap's resolved value never
    │   │   │                     # changes across a theme flip)
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
    │   ├── ZoneMapPanel.tsx      # done (013-zonemap-panel) — the eighth
    │   │                         # and final originally-listed panel
    │   │                         # type. Pure MapLibre choropleth + real
    │   │                         # GeoParquet (this codebase's first) —
    │   │                         # confirmed no deck.gl/MapboxOverlay
    │   │                         # capability gap (a data-driven
    │   │                         # fill-color paint expression + native
    │   │                         # mousemove/click cover fill + hover),
    │   │                         # the ONE map-rendering panel type
    │   │                         # outside 012's interleaved-mode/
    │   │                         # context-loss scope entirely.
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
    │   └── GraphicWalkerPanel.tsx # not built yet
    ├── components/
    │   └── ui/                   # shadcn-pattern primitives (002-design-
    │                              # tokens onward): button.tsx, card.tsx,
    │                              # tabs.tsx, tooltip.tsx, dialog.tsx (004)
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
await discoverScenarios()                   // register observed/ + public/scenarios/*
applyURLParams()                            // pre-select ?s= scenarios from URL
const dashboards = await loadDashboards()   // fetch public/dashboard-config/index.json, then each listed dashboard-*.yaml
renderShell(dashboards)                     // nav tabs, sidebar, scenario manager
renderDashboard(dashboards[0])              // first tab (Summary) as landing page
```

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
}
```

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
calls `preventDefault()` and rebuilds its own painter internally) now
drive a `contextLost` panel state, rendering a distinct "Map context
lost" banner overlaid on the still-mounted map container — the container
must never unmount while it's true, since MapLibre's automatic
restoration rebuilds resources against the SAME canvas element. A real,
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
outside `012-webgl-context-management`'s interleaved-mode/context-loss
scope. Geometry itself loads via `registerFileURL()` + plain
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

```tsx
import { embedGraphicWalker } from '@kanaries/graphic-walker'

export function GraphicWalkerPanel({ config }: PanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    query(
      `SELECT * FROM ${config.scenario}__${config.dataset} LIMIT ${config.limit ?? 100000}`
    ).then((rows) => {
      if (!cancelled && containerRef.current) {
        containerRef.current.innerHTML = ''
        embedGraphicWalker(containerRef.current, { data: rows, fields: config.fields ?? [] })
      }
    })
    return () => { cancelled = true }
  }, [config])

  return <div ref={containerRef} style={{ height: config.height ?? 700 }} />
}
```

Graphic Walker is a snapshot — does not share DuckDB connection or respond to
global filters. Intentional — Explore tab is an open-ended sandbox.

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
  "@kanaries/graphic-walker": "latest",
  "@observablehq/plot": "latest",
  "apache-arrow": "^18.0.0",
  "js-yaml": "latest",
  "maplibre-gl": "^4.7.1",
  "plotly.js-dist-min": "latest"
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
     list remains not-started (`graphic-walker`, item 10 below, is a
     separate, always-deferred Explore-tab feature, never part of this
     eight). This project's first GeoParquet/DuckDB-spatial feature —
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
     `012-webgl-context-management`'s interleaved-mode/context-loss
     scope by design. Reuses `panels/basemap/` (011) completely
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
10. ❌ `GraphicWalkerPanel` (Explore tab) — not started;
    `@kanaries/graphic-walker` isn't in `package.json` yet either
11. ✅ `src/styles/tokens.css` (Tailwind CSS variables) — done
    (`002-design-tokens`). This **supersedes** the `styles/wfrc-theme.css`
    filename/approach this line originally named — that plan was replaced
    by `002`'s actual Tailwind + shadcn/ui token approach, not merely
    not-yet-built under the old name
12. 🟡 Python package (`python/`) — started but essentially empty:
    `python/wftdm_dashboard/` currently holds only `__init__.py` — no
    `cli.py`, `server.py`, `static/`, or `templates/` yet
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
