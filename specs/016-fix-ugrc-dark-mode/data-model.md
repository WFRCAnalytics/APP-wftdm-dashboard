# Phase 1 Data Model: Fix UGRC map compositions rendering incorrectly in dark mode

No new persisted data entities, Parquet columns, or YAML grammar fields
are introduced by this feature — it is a rendering-correctness fix, not a
data feature. The existing entities it touches are reused unmodified:

## Existing entities reused (unmodified)

- **`BasemapSelection`** / **`BasemapComposition`** / **`EffectiveBasemap`**
  (`src/panels/basemap/types.ts`, `011-basemap-style-system`) — the merged
  MapLibre style document a flowmap/zonemap panel resolves and renders.
  Confirmed theme-blind (research.md §1); no field changes anticipated
  under Branch A or the diagnostic-only outcome. Branch C (the FR-008
  fallback) reads this type's existing shape as-is — it does not need a
  new field, since the fallback is keyed on the panel's own `title`/
  `basemap.layers` identity already present in `PanelConfig`, not a new
  config property (see `contracts/map-canvas-color-scheme-scope.md` and
  `contracts/diagnostic-protocol.md` for why no new grammar is needed
  under any branch).
- **Theme mode** (`useColorScheme()`, `015-theme-toggle`) — the resolved
  light/dark display state. Unchanged; still the single source every map
  panel's basemap-application effect already reads.

## New conceptual entities (process artifacts, not app data)

These exist only as documentation/process artifacts produced by this
feature — they are never serialized into the app's own data model, YAML
grammar, or Parquet output:

- **Diagnostic Protocol Run**: one execution, by a human on real
  hardware, of `contracts/diagnostic-protocol.md`'s numbered steps.
  Step 0 (extension check, via Edge Incognito) is already recorded as
  done — result: corruption still reproduced, extension ruled out.
  Fields still to report for steps 1–3: machine/OS, browser + version,
  each step's outcome (pass/fail/not-applicable), and — if step 2
  (Chromium force-dark flag) applies — its prior value and whether
  disabling it changes anything in BOTH Chromium and Firefox (research.md
  §3a's own caution against a Chromium-only positive result being
  mistaken for the complete explanation).
- **Fix Branch Decision**: the outcome of research.md §7's decision
  table — exactly one of `no-fix-possible`, `branch-a-scoped-css`, or
  `branch-c-panel-fallback`. Recorded in this feature's own `tasks.md`
  completion notes once the Diagnostic Protocol Run resolves it; not a
  runtime value the app itself branches on (Branch A's CSS is static and
  general; Branch C's fallback, if adopted, is a static per-panel
  exception in code, not a decision made at runtime by inspecting a
  "Fix Branch Decision" value).

## Key entities *(feature spec's own section, reconciled)*

The feature spec's Key Entities section names "Basemap composition" and
"Theme mode" conceptually — both map directly to the existing entities
above; no new entity is required to satisfy any functional requirement
in `spec.md`.
