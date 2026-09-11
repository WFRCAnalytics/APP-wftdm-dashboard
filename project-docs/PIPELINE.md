# PIPELINE.md — Explored, Not-Yet-Scoped Feature Backlog

Record of ideas discussed and explored on 2026-09-04, kept here so the
reasoning behind each one survives past the conversation it came out of.
None of what follows is scoped, speculatively planned, or committed to —
this is a backlog of starting points, not a roadmap. Picking any one of
these up for real still means running it through `/speckit-specify` →
`/speckit-plan` → `/speckit-tasks` → `/speckit-implement` like every other
feature in this project's history, checking the real, current state of
whatever it touches before designing anything (the same discipline every
entry in `CLAUDE.md`'s own file-tree history already documents).

---

## Unified settings modal

Right now theme and scenario management are two separate, independently
mounted controls in `shell.tsx`'s header — `ThemeToggle` (015-theme-toggle)
and `ScenarioLoader` (009-scenario-manager, later extended by
020-baseline-scenario for the baseline star control). As more
dashboard-wide, not panel-specific, controls accumulate there, that
header risks becoming a growing row of independent icon buttons rather
than one coherent place a viewer goes to manage the dashboard's own
settings.

The idea: one "Settings" (or "Manage") button opening a single tabbed
modal, consolidating what already exists rather than inventing new
mechanisms:

- **Appearance tab** — the existing `ThemeToggle` control relocated here
  unchanged (System/Light/Dark), not rebuilt.
- **Scenarios tab** — the existing scenario list (currently
  `ScenarioLoader`'s own rendering of `appState.list()`) relocated here,
  showing each scenario's file path, status (`registering`/`ready`/`failed`,
  plus whatever pass/warn/fail validation state a scenario surfaces
  elsewhere), and the existing baseline-marking star and add/remove
  controls — all relocated, not reimplemented. Two capabilities NOT yet
  built anywhere in this app would be genuinely new work here, not a
  relocation: **reordering** scenarios (nothing in `appState.ts` currently
  tracks or exposes anything beyond `Map` insertion order — a real
  reorder feature would need an explicit order field and a mutator, the
  same kind of new-state-plus-new-UI work `020-baseline-scenario`'s own
  `explicitBaseline` pointer was), and giving a scenario a **custom
  label/shortname** distinct from its underlying filename/folder name
  (again nothing in the current `Scenario`/`ScenarioMetadata` shape
  carries this — a new field, a new setter, and a rendering change
  everywhere a scenario's name is currently shown as both its identity
  and its display label).
- **Possible future tabs** — a basemap-preset picker, once
  `panels/basemap/`'s own registry (011-basemap-style-system) has a UI
  surface at all (today it's config-only, resolved from
  `dashboard-*.yaml`, with no viewer-facing picker anywhere); a link out
  to a documentation page.

This is a consolidation feature more than an invention — most of its
value is moving already-correct, already-tested logic into one place a
viewer expects to find it, with the reorder/custom-label capabilities as
the one genuinely new slice inside it. A reasonably well-scoped feature
whenever it's picked up.

---

## SimWrapper-inspired temporary fixture data

`simwrapper/simwrapper` (github.com/simwrapper/simwrapper) is already a
real, confirmed-active project and a standing "consider" tier reference
in this project's own constitution (Principle VIII) — a real production
peer solving the same domain problem (ABM/TDM model-output
visualization), even though its underlying stack (Vue, CSV-based) is
architecturally unrelated to this app's own fixed choices.

The idea here is narrower than "learn from SimWrapper's architecture" —
it's borrowing SimWrapper's own file-detection and variable-naming
conventions specifically to go find and fetch real example
ActivitySim/PopulationSim model-run outputs (aiming for roughly three
example scenarios), and use them as temporary, meaningfully more
realistic fixture data than this project's own synthetic
`tests/fixtures/generate.py` output. The concrete purpose: exercise this
app's real functionality — real column names, real value distributions,
real edge cases a hand-written synthetic fixture wouldn't happen to
include — while the actual WFRC TDM model output pipeline (the
`summarize.yaml`/post-processor side of this project, authored in the
separate TDM repo) is still under development and has no real output to
point at yet.

Explicitly a bridge, not a substitute: this does not replace or advance
this project's own long-deferred "real-data track" — the eventual work
of validating against genuine WFRC model output once the TDM repo side
is ready. It's a way to make the intervening development period more
realistic, not a way to skip the real integration work later.

---

## Charting-library consolidation — deferred, not part of the current visual redesign

An open question about whether this project's charting should eventually
consolidate onto fewer (or one) underlying rendering engine, instead of
the three it has today: Plotly (`003-dashboard-shell-navigation`),
Observable Plot (`007-observable-plot-panel`), and D3 itself, already
present via `d3-sankey`/`d3-scale-chromatic` underneath `SankeyPanel.tsx`
(`008-sankey-panel`). Each candidate/incumbent was discussed with a
specific, stated reason, not just general enthusiasm:

- **D3 / Observable** — reactivity, compositionality (building a chart
  out of small, combinable pieces rather than one monolithic
  config object), and the sheer breadth of chart types reachable once
  you're working with D3's primitives directly. The candidate with the
  most explicitly acknowledged personal interest behind it.
- **Recharts** — SVG rendering quality specifically called out as a
  strength (crisp output, real DOM elements rather than a canvas/WebGL
  surface).
- **ECharts** (`echarts.js`) — breadth of chart types out of the box,
  the same axis Plotly/Observable Plot are being compared against.
- **Plotly** (the incumbent for most panel types today) — reliability,
  and an interactive legend with per-category toggling (click a legend
  entry to show/hide that series) that's already relied on and working
  well in production.

**Deliberately a large, separate, deferred architectural decision — NOT
part of the current visual redesign in progress.** This project already
has three charting technologies deeply embedded, each with its own
grammar, its own test suite, and its own already-built theming/dark-mode
integration: Plotly (`plotly` panel type, `PlotlyPanel.tsx`'s
`resolveThemeLayout()`, dozens of passing unit/Playwright tests), Observable
Plot (`observable-plot` panel type, `ObservablePlotPanel.tsx`'s own
theming, its own test suite), and D3 via `d3-sankey` (`sankey` panel type,
`panels/sankeyGraph.ts`'s layout wrapper, `panels/sankeyColor.ts`). Real
`project-docs/GRAMMAR.md` grammar authors already depend on spans all three.
Consolidating onto fewer engines — whether that means adopting one of
D3/Observable, Recharts, or ECharts as a new common base, or something
else — is a cross-cutting rebuild touching every chart-rendering panel
type this app has, not a drop-in library substitution, and not something
to scope without a **specific, compelling capability gap** named first:
something the current three genuinely cannot do, or do noticeably worse,
for a real calibration/validation use case this project actually has.
"A different library might be nicer" is not, on its own, that bar.

**Real research since logged, still no decision or plan**: shadcn/ui's own
official chart component (a themed Recharts wrapper) was researched
directly — real source, real chart-type coverage, real legend-interactivity
behavior — as one candidate this deferred decision would eventually need to
weigh. Honest finding: meaningful overlap exists for the Plotly/Observable
Plot portion of this app's charting (bar/line/scatter), but two real gaps
remain unresolved — Sankey sits outside shadcn's own showcased chart types
entirely, and its own `ChartLegendContent` ships with no click-to-toggle
legend behavior at all (a real, closed-without-a-fix upstream issue,
`shadcn-ui/ui#4188`), unlike Plotly's own zero-effort default. Full detail:
the `wftdm-design-system` skill's own "Charting research" section and
`references/research.md`. This is additional research feeding the same
still-fully-deferred decision above — not a change to the deferral itself,
and not a migration plan.

**Stated future direction (2026-09-06, after the shadcn/Recharts research
above) — five total chart technologies, tiered by role, not a single
consolidated replacement**. This is a real decision about where charting is
headed, superseding the earlier "should we consolidate onto ONE engine at
all" framing above with a more concrete shape — still not part of the
current visual redesign's own three phases, and only one of the five tiers
below is actually scoped to be built next:

1. **shadcn/Recharts** — the new default/primary engine for whichever chart
   types it covers (per the research above: bar/line/scatter-shaped charts,
   matching most of this app's real, current Plotly/Observable Plot
   grammar). **This is the first of the five to actually get built, as its
   own separate feature** — not a sub-task of the current redesign's
   Phase 1/2/3, and not scoped by this note itself; a real feature still
   needs its own `/speckit-specify` treatment when picked up.
2. **Observable Plot** — kept, not replaced — as a secondary/extension
   engine for cases shadcn's Recharts doesn't cover.
3. **Plotly** — kept, not replaced — as a secondary/extension engine for
   the same reason, explicitly INCLUDING Plotly's own interactive
   per-category legend toggle (click a legend entry to show/hide that
   series). The user has explicitly accepted losing that specific
   capability for any NEW chart built on shadcn/Recharts, rather than
   requiring shadcn's own `ChartLegendContent` to replicate it (the real,
   confirmed gap the research above already found) — a chart that
   genuinely needs that interaction stays a Plotly chart, it doesn't force
   shadcn's own component to grow the capability it doesn't have.
4. **A custom D3-composition framework** — explicitly **NOT YET SCOPED**.
   No decision has been made about which specific chart types it would
   cover or what its actual bounds are. Nothing should be designed for
   this yet — it's a named future idea, not a spec-ready direction.
5. **ECharts** — also explicitly **NOT YET SCOPED**, same status as (4).

Tiers 1-3 are the real, current shape (shadcn/Recharts as the new default,
Observable Plot/Plotly kept deliberately as named fallbacks rather than
targets for removal); tiers 4-5 are acknowledged future possibilities with
zero design work done or authorized. Sankey's own real gap (found in the
shadcn research above) is not solved by this five-technology direction
either — it isn't covered by shadcn/Recharts, isn't Observable Plot's or
Plotly's own territory today, and isn't assigned to the unscoped D3-
composition/ECharts ideas by this note — it stays exactly where the
research above left it, an open question the eventual first shadcn/Recharts
feature will need to either accept (Sankey stays `d3-sankey`-based,
untouched) or explicitly take on, not something this note resolves.

**Interim approach, actually in scope for the current visual redesign**:
rather than replacing any underlying rendering engine, build a shared
tooltip/legend/color **presentation layer** across the three existing
libraries — common visual treatment (tooltip styling, legend layout and
interaction, the color tokens/ramps each panel type resolves against)
applied consistently on top of Plotly/Observable Plot/D3-sankey as they
exist today. This is a step toward visual unification across panel types
without touching any rendering engine, grammar, or test suite the three
libraries already have — the actual consolidation question above stays
fully deferred regardless of how this interim layer turns out.

---

## DuckDB "Dash" extension — investigated, not a fit as an embeddable replacement

`gropaul/dash` (github.com/gropaul/dash) was investigated as a possible
aesthetic inspiration or embeddable replacement for the `graphic-walker`
panel type (`014-graphic-walker-panel`). Confirmed real during
investigation: MIT-licensed, browser-based, DuckDB-powered, describing
itself as a "local-first SQL workbench" with an interactive, canvas-based
UI.

**Confirmed not suitable as a literal embed or replacement.** Unlike
`@kanaries/graphic-walker` — packaged specifically as a small, embeddable
React component this app already renders as ordinary JSX inside its own
tree (`014`'s own corrected design, see `CLAUDE.md`'s history note on why
`embedGraphicWalker` was rejected in favor of the plain `<GraphicWalker>`
component) — Dash is architected as a complete, self-contained
application. It's loaded as a real DuckDB *extension* that starts its own
HTTP server and serves its own full UI shell; it exposes no "embed this
one component with your own data" API at all. This is directly consistent
with `project-docs/ARCHITECTURE.md`'s own existing "What was rejected and why"
table, which already lists "DuckDB DASH in browser" as rejected for a
related but distinct reason (requires a native DuckDB process, cannot run
in WASM) — this investigation confirms the same project is unsuitable for
a second, different reason (no embeddable surface) in addition to the
first.

Its actual, legitimate use here: as potential **visual/aesthetic
inspiration** for this app's OWN broader design and UX direction (the
dashboard shell, panel presentation, general visual language) where it
fits — NOT specifically tied to `graphic-walker`'s own presentation.
This is a loose, exploratory design note, not a commitment to adopt
Dash's specific visual style anywhere in particular.

**First actually acted on: `024-settings-modal-visual-redesign`.** This
note sat as an exploratory pointer until this feature's Scenarios-tab and
Basemap-tab redesigns, which fetched Dash's own real, installed UI source
directly (`gropaul/dash-ui`, a separate, real repo — the actual Next.js/
React/Tailwind/Radix app Dash's extension serves, confirmed to use nearly
the same UI stack this app already does) rather than treating the note as
abstract inspiration. Two of its real components were read in full and
reused as concrete layout references, not copied verbatim:
`connections-view.tsx` (a list of named things each with attached/error
status — the same domain shape as this app's own Scenarios tab: one card
surface, hairline-separated rows, a leading status dot, a two-line
identity block, a trailing colored status word) and
`view-mode-picker.tsx` (a grid of icon-topped selectable tiles — the same
domain shape as this app's own Basemap catalog: a responsive
`grid-cols-[repeat(auto-fit,minmax(_,1fr))]`, the selected tile using the
accent color pair). See `specs/024-settings-modal-visual-redesign/` and
`CLAUDE.md`'s own `scenariosTab.tsx`/`basemapTab.tsx` entries for the full
account, including what was deliberately NOT copied (Dash has no per-row
reorder/pin; this app's own tile icons are honest category glyphs, not a
port of any thumbnail Dash itself doesn't use here either).

---

## Map synchronization and comparison features

Two related but distinct map-panel capabilities, discussed together but
worth keeping conceptually separate when this is eventually scoped:

1. **Multi-map sync** — e.g. four `zonemap` panels shown together
   (scenario 1, scenario 2, absolute difference, percent difference — the
   same four-way comparison `019-baseline-diff-consumption`'s own
   `comparison: diff`/`$baseline` grammar now makes authorable), with
   synchronized pan/zoom across all four so panning one moves all four
   together.
2. **Scenario-swap compare** — a single map with a swipe/toggle control
   comparing two scenarios directly on one map surface, the pattern
   MapLibre's own official `maplibre-gl-compare` plugin already provides
   for exactly this.

This is almost certainly the single largest, most technically demanding
item on this whole list, and it directly intersects with an already-open
question this project has logged before: the WebGL context-budget problem
`012-webgl-context-management` fought to keep under control for a single
tab's worth of map panels. Every real map panel costs a real GPU
context; showing four synced maps simultaneously multiplies that cost by
four, on top of whatever else is already on the same tab. Confirmed
during this session's own research: even MapLibre's own official examples
for synchronizing multiple maps use N fully independent `Map` instances
kept in sync via event listeners — not a shared, cheaper context of any
kind — meaning the multiplied-cost math is real, not an implementation
detail this project could sidestep with a cleverer approach MapLibre
itself doesn't already use.

This needs real, dedicated research — specifically including whether that
confirmed N-independent-instances reality changes the answer to the
context-budget question at all — before any part of it is scoped as an
actual feature.

---

## Known, accepted limitation: FlowMapPanel's flow lines render jagged

`FlowMapPanel.tsx`'s rendered flow lines/arrows are visibly
jagged/aliased, especially on diagonal lines. Investigated, root-caused,
and a fix was attempted — this is a record of why it isn't applied.

**Confirmed root cause** (checked in order, nothing assumed): (1) device
pixel ratio is NOT the cause — MapLibre's own `getPixelRatio()` already
returns the real `devicePixelRatio` automatically; nothing in this app
overrides it. (2) WebGL context antialiasing IS the cause — MapLibre's
`Map` class forces the underlying WebGL context's `antialias` to `false`
unless the constructor option is explicitly set `true` (confirmed
directly against the installed `maplibre-gl` source), and `@flowmap.gl/
layers`' own `FlowLinesLayer` fragment shader has zero antialiasing/edge-
smoothing logic of its own for a flow line's outer silhouette (confirmed
by reading the shader directly) — so the line's smoothness depends
entirely on that one context-level flag. (3) This is specifically a side
effect of `012-webgl-context-management`'s `interleaved: true` choice:
under interleaved mode, deck.gl renders directly into MapLibre's own
shared canvas/context, so MapLibre's forced-off default drags deck.gl's
rendering down with it. In non-interleaved mode, deck.gl would create its
own separate canvas/context, which neither `@deck.gl/core` nor its
`luma.gl` rendering engine explicitly overrides (confirmed via grep) —
that context would have kept the browser's own native `antialias: true`
default (per the WebGL spec, `true` is the default when a context-
attributes object omits it).

**Confirmed against a real production reference, not assumed unique to
this project**: `simwrapper/simwrapper`'s own real, live flowmap
implementation (`src/plugins/flowmap/FlowmapDeckMapComponent.vue` +
`src/layers/flowmap/`, fetched and read directly) has the **identical**
gap — it also uses `interleaved: true`, also never sets `antialias` on
its `maplibregl.Map` constructor, and its own vendored `FlowLinesLayer`
fragment shader is simpler than the npm package's (no edge-smoothing at
all). The one `antialiasing: true` found anywhere in their flowmap module
is on a `ScatterplotLayer` used for a location-highlight ring — a
different sub-layer, using a real deck.gl capability (SDF-based circle
antialiasing) that has no line/path equivalent. SimWrapper does not solve
this problem; it ships with the same rendering gap.

**The fix that was attempted, and why it isn't applied**: setting
`antialias: true` on `FlowMapPanel.tsx`'s `maplibregl.Map` constructor
does visibly fix the jaggedness. At the time this was tried, it also
measurably degraded `012-webgl-context-management`'s own WebGL context-
loss recovery — repeated test runs showed the recovery test's pass rate
drop from an already-flaky ~37% (unrelated, pre-existing baseline
flakiness, confirmed via repeated clean-baseline runs) to 0/5 with
`antialias: true` applied, and one run's screenshot showed a genuinely
blank canvas after context restoration, not just a flaky pixel-readback
check. An antialias-free alternative (`setPixelRatio()` supersampling)
was also tried and hit the identical failure, suggesting the conflict was
with any deviation from MapLibre's default canvas configuration
interacting with the context-loss/restore cycle, not something specific
to the `antialias` flag itself. Investigating SimWrapper for a working
pattern (above) found no such pattern to copy — they never attempt
context-loss recovery at all, so they never exercise this interaction
either way. Both experiments were fully reverted at the time; nothing
was shipped.

**Current status, now that the picture has changed**: `012`'s own
context-loss-recovery mechanism — the thing the `antialias: true` fix
was found to conflict with — has since been removed from
`FlowMapPanel.tsx` entirely, as a separate, deliberate project decision
(unrelated to this investigation — see `CLAUDE.md`'s own "Map panels"
section and `specs/012-webgl-context-management/spec.md`'s own removal
note for that story). That means the specific blocker this investigation
hit — `antialias: true` degrading a recovery path — no longer has a
recovery path to degrade. This strongly suggests `antialias: true` could
now be applied safely, but **it has not been re-tried or re-applied as
part of this documentation update** — that's a distinct piece of future
work, not something to assume safe without actually re-running the same
empirical check (repeated test runs, not a single pass/fail) against the
current, recovery-free code. Until that re-check happens, the jagged
lines remain a known, accepted, documented limitation, not a fixed one.

---

## Configurable dashboard logo

Let whoever deploys this dashboard configure which logo it displays,
rather than a hardcoded one; for WFRC's own deployment specifically, use
the real logo from `github.com/wfrcanalytics/wfrc-brand`. Small,
well-scoped, low-risk — likely one of the easiest items on this entire
list whenever it's actually picked up.

---

## Deployment split: docs on GitHub Pages, app on WFRC's own FTP server

An infrastructure/deployment decision, independent of every feature idea
above. The proposal: host user-facing documentation via GitHub Pages
while the running dashboard app itself deploys to WFRC's own FTP-hosted
server infrastructure, rather than (or alongside) GitHub Pages.

Worth grounding before this gets scoped: `project-docs/ARCHITECTURE.md` already
documents **two** coexisting hosting targets today, not a single
GitHub-Pages-only target — `wfrcanalytics.github.io/APP-wftdm-dashboard`
and `wfrc.utah.gov/wftdm-dashboard` are both named as real deployment
modes of the same static build in the current deployment model, and
`vite.config.ts`'s own `base:` setting already has to account for exactly
that split (one commented-out `base:` value per target). So this isn't
introducing a first alternate hosting target from scratch — it's a
question of whether *documentation specifically* should live somewhere
distinct from either existing app target, and whether WFRC's own FTP
infrastructure should replace or supplement the `wfrc.utah.gov` target
already named. Needs its own dedicated discussion of what, if anything,
this actually changes about build/deployment configuration — plausibly
very little, given the existing multi-target `base:` pattern already
exists to be extended, but not confirmed either way here.

---

## Boot-performance findings deferred by `042-boot-performance-fix`

The `042` investigation (real, measured Playwright/CDP evidence against
the live deployed site) identified five candidate causes of slow cold-
cache load; two were confirmed real and dominant (sequential scenario-
file registration, no code-splitting by panel type) and fixed by that
feature. Three more real, confirmed findings came out of the
investigation and this feature's own implementation/verification —
each real, each worth its own dedicated look, none rushed into this fix.

**1. coi-serviceworker double-registration reload.** Confirmed real via
direct console-log/frame-navigation capture: the service worker
registers, then triggers exactly one genuine full-page reload
(`"Reloading page to make use of updated COOP/COEP Service Worker."`,
two real `framenavigated` events). Every hashed entry-point asset (JS/
CSS/font — 17 distinct files at the time of the investigation) gets
requested twice as a result. Flagged in the investigation as real but
secondary/bounded — not this fix's dominant cause — and confirmed to
stay bounded under fast/near-zero-latency conditions. **A new, sharper
finding from this fix's own verification**: under realistic per-request
latency (a local A/B test with ~40ms artificial server latency, isolating
the code change from real-world network variance), the double-fetch
compounds badly with a LARGE eager payload — the pre-042 build's own
`graphic-walker`/`maps`/`index` chunks (4.17MB/1.71MB/1.44MB) each showed
up twice in one real page load, inflating total transferred bytes to
21.6MB for that single visit. Post-042, the same double-fetch still
happens (untouched, out of this feature's scope) but costs far less in
absolute terms since the chunks it duplicates are now much smaller
(`index`/`maps` only, at 1.03MB/0.84MB — `recharts`/`flowmap-deck`/
`graphic-walker`/`plotly` are excluded from the double-fetch entirely
since they no longer load eagerly at all). This is a real, positive
interaction between the two fixes, but the underlying double-reload
itself is unfixed and will keep taxing whatever IS still eager.

**2. `MANUAL_BUNDLES` never configures a threaded DuckDB-WASM bundle.**
`services/duckdb.ts`'s `MANUAL_BUNDLES` only registers `mvp`/`eh` — no
`coi` (threaded, SharedArrayBuffer-based) bundle exists in the config at
all, confirmed by direct read. The coi-serviceworker's entire purpose
(enabling cross-origin isolation for `SharedArrayBuffer`) currently has
no real consumer — `window.crossOriginIsolated` measures `true` after
boot, but nothing in this app's DuckDB initialization path ever requests
or benefits from it.

**3. DuckDB-WASM's single shared connection serializes query execution
internally, regardless of caller-side concurrency — found during this
feature's own verification, not anticipated by the investigation.**
`042` converted `scenarioDiscovery.ts`'s sequential per-file
`registerFileURL()` loop to `Promise.all()`, confirmed functionally safe
via a real, live test (12 real demo Parquet files registered concurrently
vs. sequentially against the actual running DuckDB-WASM connection —
byte-identical row counts, zero errors). But a follow-up real-network
test (the same local latency-injecting server used for the double-reload
finding above) showed the ACTUAL HTTP requests triggered by those
`Promise.all()`-wrapped calls still land strictly one at a time —
confirmed not a bug in `042`'s own code by bypassing it entirely: a raw
`Promise.all()` of 12 `registerFileURL()` calls fired directly via
`window.__wftdm` (the app's own debug hook) against the same latency
server showed the identical serialized pattern (each request starting
the instant the previous one finished), while a control test — 12 plain
`fetch()` calls against the same server — correctly overlapped (Chrome's
real per-origin HTTP/1.1 connection limit, ~6 concurrent). This is
normal, expected behavior for a single database connection (every SQL
engine serializes statement execution within one connection — DuckDB is
no exception), not a defect in DuckDB-WASM. It does mean `042`'s own
Promise.all() conversion, while correct and the right code-level change
for what was asked (no ordering-dependency regression, structurally
ready to benefit automatically if the connection model ever changes), 
delivers a smaller real-world network-parallelism win for the file-
registration phase specifically than a naive "N requests × RTT" model
would predict. Unlocking the full benefit would need multiple DuckDB
connections (`db.connect()` can be called more than once) — a separate,
materially more invasive change (concurrent-connection lifecycle/error-
handling, thread-safety against the one shared `AsyncDuckDB` instance)
that deserves its own dedicated design and testing, not a rushed addition
here.
