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

## Charting library exploration (ECharts / Recharts / D3) — research only

An open question, raised with an acknowledged personal interest in D3
directly, about whether `echarts.js` or Recharts might serve this
project better than its two already-shipped charting panel types:
Plotly (`003-dashboard-shell-navigation`) and Observable Plot
(`007-observable-plot-panel`).

Deliberately scoped as **research only** — not a rebuild commitment, and
not close to becoming one without more. Both current libraries are
deeply integrated: dozens of passing unit and Playwright tests each, real
production panel types (`plotly`/`observable-plot` in
`panels/registry.tsx`), an established per-library dark-mode/theme-token
integration pattern (`PlotlyPanel.tsx`'s `resolveThemeLayout()`,
`ObservablePlotPanel.tsx`'s own theming), and real `docs/GRAMMAR.md`
grammar authors already depend on. Swapping either out is a large,
cross-cutting change, not a drop-in library substitution.

Any actual migration proposal would need a **specific, compelling
capability gap** in the current libraries — something Plotly or
Observable Plot genuinely cannot do, or does noticeably worse, for a real
calibration/validation use case this project actually has — found and
named before being justified. "A different library might be nicer"
is not, on its own, that bar.

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
with `docs/ARCHITECTURE.md`'s own existing "What was rejected and why"
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

Worth grounding before this gets scoped: `docs/ARCHITECTURE.md` already
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
