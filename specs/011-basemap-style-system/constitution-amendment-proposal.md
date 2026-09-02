# Proposed Constitution Amendment: Add `APP-WFRC-Commute-Patterns` to Principle VIII

**Status**: SUPERSEDED — do not merge from this file. This proposal's own
change (adding `APP-WFRC-Commute-Patterns` to Principle VIII's mandate-tier
reference table) was incorporated into, and merged as part of,
`specs/012-webgl-context-management/constitution-amendment-proposal.md`
(the 2.3.0 → 2.4.0 amendment, which also added a separate `simwrapper/
simwrapper` consider-tier entry). That amendment has since been applied to
`.specify/memory/constitution.md` directly. This file is kept only as a
historical record of the original single-repo proposal; merging it
separately would double-add the same table entry.

**Original status (below, for historical record)**: Draft — NOT merged into `.specify/memory/constitution.md`. Per
the constitution's own Governance section, an amendment requires a
proposal, an update to the affected section, a version bump per the
versioning policy, and a Sync Impact Report — that's a separate review
step this document stages for, not performs. Flagged during
`011-basemap-style-system`'s own plan phase (`plan.md`'s Complexity
Tracking note) and drafted here during implementation, per that task.

## Why

`011-basemap-style-system` used `WFRCAnalytics/APP-WFRC-Commute-Patterns`'
own real, production `src/map.js` as a reference implementation for the
`setStyle()` + `transformStyle` + non-interleaved `MapboxOverlay` survival
pattern — fetched and read directly (not assumed), and reused directly in
`FlowMapPanel.tsx`'s own basemap-application effect (`research.md` §1,
`CLAUDE.md`'s own `FlowMapPanel.tsx` tree comment). This is exactly the
category of reuse Principle VIII exists to require and reward — but that
repository isn't in the principle's own named table yet, alongside
`ar-puuk/omx-viewer`, `WFRCAnalytics/APP-Commute-Explorer`,
`ar-puuk/spatial-sql-explorer`, and `ar-puuk/parquet-viewer`. Adding it
records a precedent this feature already relied on, for future features
to find without re-deriving it.

## Proposed change

Add one row to Principle VIII's reference table, and add one sentence
naming the specific pattern this feature copied from it:

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
```

## Versioning

This is additive guidance to an existing principle's own reference
table — per the constitution's own versioning policy ("MINOR — a new
principle or section is added, or existing guidance is materially
expanded"), this is a MINOR bump (matching the precedent already set by
2.3.0's own `@deck.gl/layers` addition to the Technology Stack Reference,
itself justified the same way: a real, confirmed gap found while
verifying a Principle VIII reference against the real repo). Proposed:
2.3.0 → 2.4.0.

## What this proposal does NOT do

- Does not touch any other principle or section.
- Does not remove or replace any existing reference — all four current
  entries stay exactly as they are.
- Does not merge itself — a separate amendment step (updating
  `.specify/memory/constitution.md` directly, bumping the version, and
  writing the Sync Impact Report comment per that file's own established
  pattern) is required before this takes effect.
