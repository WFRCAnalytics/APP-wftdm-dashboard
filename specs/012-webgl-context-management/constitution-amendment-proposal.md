# Proposed Constitution Amendment: Principle VIII reference table —
# add `simwrapper/simwrapper` (consider-tier) and `WFRCAnalytics/APP-WFRC-Commute-Patterns`
# (mandate-tier); `WFRCAnalytics/APP-Commute-Explorer` is already present

**Status**: Draft — NOT merged into `.specify/memory/constitution.md`. Per
the constitution's own Governance section, an amendment requires a
proposal, an update to the affected section, a version bump per the
versioning policy, and a Sync Impact Report — that's a separate review
step this document stages for, not performs. Same procedure precedent as
`specs/011-basemap-style-system/constitution-amendment-proposal.md`.

**Supersedes**: this proposal incorporates and supersedes the still-unmerged
`specs/011-basemap-style-system/constitution-amendment-proposal.md` (the
`APP-WFRC-Commute-Patterns` half of the change below is that same proposal,
carried forward unmerged rather than duplicated into a second competing
amendment — both target the same principle/table). That file is left as-is
on disk; it should be treated as closed once/if this proposal merges.

## Correction to the request that triggered this draft

`WFRCAnalytics/APP-Commute-Explorer` is **already** in Principle VIII's
table — present since the constitution's initial ratification (v1.0.0), not
a gap. Verified directly against `.specify/memory/constitution.md`'s current
text (v2.3.0):

> `ar-puuk/omx-viewer` ..., `WFRCAnalytics/APP-Commute-Explorer`
> (MapboxOverlay + FlowmapLayer + MapLibre wiring, hover/pick pattern),
> `ar-puuk/spatial-sql-explorer` ..., and `ar-puuk/parquet-viewer` ...

Only two real gaps exist: `WFRCAnalytics/APP-WFRC-Commute-Patterns` (missing
from the table; already flagged in `011-basemap-style-system/plan.md`'s
Complexity Tracking note and reused directly as a reference in that
feature's `FlowMapPanel.tsx` work) and `simwrapper/simwrapper` (never
flagged in any prior feature — new to this proposal).

## Why

**`WFRCAnalytics/APP-WFRC-Commute-Patterns`**: same justification as the
011 proposal it carries forward — `011-basemap-style-system` used this
repo's real, production `src/map.js` as the reference for the `setStyle()`
+ `transformStyle` + non-interleaved `MapboxOverlay` survival pattern,
fetched and read directly, and reused directly in `FlowMapPanel.tsx`'s own
basemap-application effect (`011`'s `research.md` §1). `012-webgl-context-
management`'s own `plan.md` (Phase 0 research) names it again alongside
`APP-Commute-Explorer` as "the reference implementations for `MapboxOverlay`/
MapLibre" — a second feature relying on it without it being in the table.

**`simwrapper/simwrapper`**: confirmed directly against the real repository
(`github.com/simwrapper/simwrapper`, fetched live, not assumed) — active
(2,393+ commits on `master`, 76 open issues, ongoing development), real
production tool at `simwrapper.app`, built by VSP-TU-Berlin (a
transportation research institute) specifically to visualize ABM/TDM
simulation outputs (deck.gl-based map layers, Python postprocessing
scripts feeding it, project/config-file discovery — the same domain
problem this app solves). Stack differs materially: Vue, not React; its
own file/project-discovery convention, not this project's DuckDB-WASM +
Parquet + `dashboard-*.yaml` set; GPL-3.0. Per the user's own framing: "the
only thing we are changing is the components: duckdb, parquet files, and
maybe how the app looks, feels, and shows" — SimWrapper is a real,
production peer solving the identical domain problem with different
underlying data/storage technology, making it architecturally *comparable*
for panel/UX/navigation decisions even where its specific implementation
choices (Vue, its own config format) diverge from this project's own fixed
ones (Principle VI). That is a genuinely different, lighter relationship
than the existing table's entries, which this app's implementers are
required to copy patterns from directly — SimWrapper is not being proposed
as a fifth pattern-to-copy source; it's a standing peer to consult when a
design question has more than one reasonable answer.

## Proposed change

Two edits to Principle VIII: (1) add `APP-WFRC-Commute-Patterns` to the
existing mandate-tier list, exactly as 011's own draft proposed; (2) add a
new paragraph establishing a second, explicitly lighter-weight tier for
SimWrapper, rather than appending it to the existing MUST-copy list (doing
that would silently upgrade it to the same mandate weight the request
explicitly said it should not carry).

```diff
 ### VIII. Reuse Proven Reference Implementations
 When implementing DuckDB-WASM/Arrow wiring, MapLibre + flowmap.gl/deck.gl
 overlays, spatial-SQL/GeoParquet handling, or Vite + coi-serviceworker setup,
 implementers MUST first look to copy the proven pattern from the designated
 reference repositories rather than re-deriving the approach from scratch:
 `ar-puuk/omx-viewer` (DuckDB-WASM init, Arrow handoff, Vite config,
 coi-serviceworker, GH Actions), `WFRCAnalytics/APP-Commute-Explorer`
 (MapboxOverlay + FlowmapLayer + MapLibre wiring, hover/pick pattern),
 `ar-puuk/spatial-sql-explorer` (DuckDB spatial extension lazy-load, MapLibre
-choropleth, basemap switching), and `ar-puuk/parquet-viewer` (GeoParquet metadata
-detection, `registerFileBuffer`, spatial extension fallback, buffer-pool
-collision fix).
+choropleth, basemap switching), `ar-puuk/parquet-viewer` (GeoParquet metadata
+detection, `registerFileBuffer`, spatial extension fallback, buffer-pool
+collision fix), and `WFRCAnalytics/APP-WFRC-Commute-Patterns` (real,
+production `setStyle()` + `transformStyle` basemap switching alongside a
+non-interleaved `MapboxOverlay`, confirmed to survive the switch without
+explicit remove/re-add — the pattern `011-basemap-style-system`'s own
+`FlowMapPanel.tsx` basemap-application effect reuses directly).
+
+Separately, `simwrapper/simwrapper` (github.com/simwrapper/simwrapper) is a
+standing reference to CONSIDER — not a mandate to adopt — for
+architectural and UX decisions on future dashboard/panel features. It
+solves the same domain problem this app does (ABM/TDM model-output
+visualization) with different underlying data/storage technology (Vue, not
+React; its own project/config-discovery convention, not this project's
+DuckDB-WASM + Parquet + `dashboard-*.yaml` set), which makes it
+architecturally comparable for panel-layout, navigation, and UX questions
+even where its specific implementation choices diverge from this project's
+own fixed ones (Principle VI). Implementers MAY consult it when a
+design decision has more than one reasonable answer; nothing in this
+principle requires copying any of its patterns, and it does not relax or
+extend the MUST-copy requirement above, which applies only to the
+first list.
 **Rationale**: these patterns are already validated in production-like use;
 re-deriving them risks reintroducing bugs (e.g., buffer-pool collisions) those
-repos already fixed.
+repos already fixed. `simwrapper/simwrapper` carries a different, lighter
+weight deliberately: it is a proven production peer solving the same
+domain problem, not a pattern validated against this project's own stack,
+so it informs design judgment rather than supplying code to copy.
```

## Versioning

Checked against this file's own versioning policy text (Governance
section), not assumed:

> MINOR — a new principle or section is added, **or existing guidance is
> materially expanded**; PATCH — wording clarifications, typo fixes, or
> other non-semantic refinements.

This changes WHEN a reference gets checked (SimWrapper becomes a standing
repo to consult; `APP-WFRC-Commute-Patterns` becomes a named pattern
source) and WHAT weight it carries (a new "consider" tier, distinct from
the existing "MUST copy" tier) — it does not redefine any principle's
actual requirement: the existing MUST-copy obligation for the original
four (now five) repos is untouched, and no principle is removed. That rules
out MAJOR. It is more than a non-semantic wording fix — two new named
reference sources and a new, real sub-mechanism (the consider/mandate
weight distinction) are added — which rules out PATCH. This is **MINOR**,
matching the precedent already set twice in this file's own history: the
2.2.0→2.3.0 `@deck.gl/layers` addition and 011's own (unmerged) single-repo
addition, both self-assessed MINOR under the identical "materially
expanded" clause. Proposed: **2.3.0 → 2.4.0**.

## What this proposal does NOT do

- Does not touch any other principle or section.
- Does not remove or replace any existing reference — all five entries in
  the mandate-tier list (four current + `APP-WFRC-Commute-Patterns`) stay
  exactly as proposed, none altered in force.
- Does not relax Principle VI's fixed technology choices (React, MapLibre,
  Vite, etc.) — SimWrapper's differing stack is explicitly named as *not*
  a reason to reconsider any of those.
- Does not obligate any future feature to adopt a SimWrapper pattern —
  "consider" is not "MUST," by design, per the request that triggered this
  draft.
- Does not merge itself — a separate amendment step (updating
  `.specify/memory/constitution.md` directly, bumping the version, and
  writing the Sync Impact Report comment per that file's own established
  pattern) is required before this takes effect, same as 011's own draft.
- Does not delete or edit `specs/011-basemap-style-system/
  constitution-amendment-proposal.md` — that file is superseded in intent
  by this one but left on disk untouched; whoever performs the actual
  merge should treat it as closed rather than merge it separately (merging
  both would double-add the `APP-WFRC-Commute-Patterns` diff hunk).
