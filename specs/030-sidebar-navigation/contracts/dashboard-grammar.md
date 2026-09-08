# Contract: `dashboard-*.yaml` Grammar Additions

Three new, purely additive fields — no existing field changes shape or
meaning, no existing file's rendered output changes (except a row
composed entirely of `valuebox` panels, FR-018 — a rendering
classification, not a grammar addition, see below).

## `header.icon` (optional)

```yaml
header:
  tab:   Person/Household Models
  title: Person / Household Models
  icon:  users            # NEW — lucide-react icon name, kebab-case
```

- A `lucide-react` icon name, same kebab-case-to-PascalCase resolution
  `type: valuebox`'s existing `icon:` field already uses
  (`iconComponentFor()`, `ValueBoxPanel.tsx`).
- Optional. Absent → the sidebar item for this tab renders with no icon.
- Purely presentational — read only by `sidebarNav.tsx`; no query/data
  layer code ever consults it.

## `header.full_page` (optional)

```yaml
header:
  tab:       Explore Data
  title:     Explore Data
  full_page: true          # NEW

layout:
  row_explore:
    - type:     graphic-walker
      title:    Free-form Visual Analytics
      dataset:  trip_mode_share
      width:    1.0
```

- A boolean flag. Optional, default `false`.
- Requires `layout` to resolve to EXACTLY one panel across all its rows
  for the flag to take effect — `full_page: true` with zero or 2+ panels
  falls back to ordinary rendering (a config-authoring warning, not a
  crash).
- When effective: no page-title block, no panel `Card` chrome (border/
  shadow/rounded corners/title bar), no expand-to-dialog control — the
  one panel renders edge-to-edge below the app header/sidebar.
- `header.description`, if also authored, is simply not rendered
  anywhere for a full-page tab (not an error — just not consulted by
  that render path).
- Generic across panel types at the mechanism level — any panel type may
  be configured this way; `graphic-walker` is this feature's own
  required, validated example (see this repo's own fixture/demo content).

## `sections` (optional, tab-level, alongside `header`/`filters`/`layout`)

```yaml
header:
  tab:   Person/Household Models
  title: Person / Household Models
  icon:  users

layout:
  row_auto_ownership_kpi:
    - type: valuebox
      ...
  row_auto_ownership_chart:
    - type: plotly
      ...
  row_work_from_home:
    - type: plotly
      ...
  # ...one or more rows per real submodel...

sections:                              # NEW
  - id:    auto_ownership
    label: Auto Ownership
    rows:  [row_auto_ownership_kpi, row_auto_ownership_chart]
  - id:    work_from_home
    label: Work from Home
    rows:  [row_work_from_home]
  # ...one entry per accordion sub-nav item this tab should show...
```

- A list of `{ id, label, rows }` objects. Optional; absent or empty →
  no accordion sub-navigation for this tab (today's behavior, unchanged
  for every existing file).
- `id` — a stable identifier, becomes the DOM scroll-to anchor
  (`section-${id}`). Author-chosen (like `FilterDefinition.id`), not
  auto-generated.
- `label` — the sidebar sub-item's viewer-facing text.
- `rows` — one or more of this SAME tab's own `layout:` row names (its
  object keys). A name with no matching row is dropped from that section
  with a console warning (never a crash); a `layout` row not referenced
  by any section still renders normally, just with no sidebar sub-nav
  entry pointing at it.
- `sections` never reorders rows — row render order remains exactly
  `layout`'s own object-key order, unaffected by which section (if any)
  groups a given row.
- Works identically for ANY tab's own author-defined sections — nothing
  in this grammar addition references ActivitySim submodel names, a
  specific tab, or a specific section count (spec.md's "Explicit scope
  boundary" section).

## `width:` twelfths convention (documentation only — FR-019)

Not a new field — a documented AUTHORING convention for the existing
`width:` field (`PanelConfigBase.width`, unchanged type/behavior):

> Author `width:` as a fraction of twelfths (e.g. `0.5` = 6/12 half-width,
> `0.25` = 3/12 quarter-width, `0.3333` ≈ 4/12 third-width) so that panels
> in different rows on the same tab, when authored to the same twelfths
> scheme, align their column boundaries vertically down the page.

No runtime behavior changes — `dashboardRenderer.tsx`'s existing
`gridTemplateColumns: panels.map((p) => \`${(p.width ?? 1) * 100}fr\`)`
math already produces this alignment for any two rows sharing the same
fraction set; this is guidance for authors, not a parser/renderer change.

## Metric Strip (rendering classification only — not a grammar field, FR-018)

Not authored — `dashboardRenderer.tsx` classifies a `layout` row as a
"Metric Strip" automatically whenever every panel in that row has
`type: valuebox` (`dashboardLayout.ts::isMetricStripRow()`), and lays it
out as an auto-filling minimum-card-width grid instead of the ordinary
fraction-based columns. An author does not opt into this — it is a
direct, deterministic consequence of a row's own panel-type composition,
exactly like every other panel-type-driven rendering decision in this
app (e.g. a `graphic-walker` panel always getting its own dedicated
handling regardless of any config flag).

## Backward compatibility

Every field above is optional and additive. An existing, unmodified
`dashboard-*.yaml` file parses and renders exactly as it does today,
with one automatic exception: a row composed entirely of `valuebox`
panels now renders as a Metric Strip instead of an equal-fraction row
(FR-018/FR-020) — a rendering-only change, not a grammar/parsing change,
and not something an author needs to do anything to receive or avoid.
