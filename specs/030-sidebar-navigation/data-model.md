# Phase 1 Data Model: Left Sidebar Navigation, Accordion Sub-Sections, and a Chromeless Full-Page Panel Mode

Extends `layout/types.ts`'s real, existing shape (read directly this
session, quoted below where relevant) — every addition below is additive
to that file, following its own established conventions exactly (a
fail-soft `parseDashboardConfig()` branch per new field, matching
`default_basemap`'s own existing `parseBasemapSelection()` pattern).

## 1. `DashboardTabConfig.header` — two new optional fields

**Existing shape** (`layout/types.ts`, unchanged fields shown for
context):

```ts
export interface DashboardTabConfig {
  header: { tab: string; title: string; description?: string }
  filters: FilterDefinition[]
  default_basemap?: BasemapSelection
  layout: Record<string, PanelConfig[]>
}
```

**New shape**:

```ts
export interface DashboardTabConfig {
  header: {
    tab: string
    title: string
    description?: string
    /** NEW (FR-007) — a lucide-react icon name, kebab-case, resolved via
     * the SAME convention ValueBoxPanelConfig.icon/iconComponentFor()
     * already uses (ValueBoxPanel.tsx). Optional; absent → the sidebar
     * item renders with no icon (never a default/placeholder one — Edge
     * Cases). Purely presentational; carries no meaning to any query/
     * data-layer code. */
    icon?: string
    /** NEW (FR-008) — opts this tab into the chromeless full-page
     * rendering mode. Requires layout to resolve to exactly one panel
     * (validated by dashboardLayout.ts's findFullPagePanel(), not here —
     * parsing stays permissive/fail-soft; the RENDERING layer is where a
     * misconfiguration (0 or 2+ panels) falls back to ordinary rendering
     * with a console warning, per spec.md's Edge Cases). Default false/
     * absent — every existing dashboard-*.yaml is unaffected. */
    full_page?: boolean
  }
  filters: FilterDefinition[]
  default_basemap?: BasemapSelection
  layout: Record<string, PanelConfig[]>
  /** NEW (FR-013) — optional, additive, tab-level accordion sub-navigation
   * grouping. Absent/empty → no sidebar sub-navigation for this tab
   * (today's behavior, unchanged). See SectionConfig below. */
  sections?: SectionConfig[]
}
```

**Parsing** (`parseDashboardConfig()`): both `header.icon` and
`header.full_page` follow the exact same fail-soft optional-field pattern
`header.description` already uses (`typeof x === 'string' ? x :
undefined` / `typeof x === 'boolean' ? x : undefined`) — a malformed or
wrong-type value in the raw YAML is treated as absent, never a thrown
parse error (parsing stays permissive; `header.tab`/`header.title` remain
the only two fields whose absence throws, unchanged). `sections` parses
permissively too (`Array.isArray(obj.sections) ? ... : []`) — a
malformed individual entry is filtered out during resolution
(`dashboardLayout.ts`), not at parse time, matching `layout`'s own
existing "parse permissively, validate contextually" split.

## 2. `SectionConfig` — new entity

The unit the accordion sub-navigation (User Story 3) and its scroll-to
behavior operate on. Groups one or more of a tab's own existing
`layout:` row names under one viewer-facing label.

```ts
export interface SectionConfig {
  /** Stable identifier — becomes the DOM anchor id
   * (`section-${id}`, dashboardRenderer.tsx) the sidebar's scroll-to
   * behavior (FR-016, research.md §8) targets directly via
   * Element.scrollIntoView(). Author-chosen, not auto-generated —
   * matching FilterDefinition.id/ObservablePlotInputConfig.id's own
   * existing author-supplied-identifier convention elsewhere in this
   * same file. */
  id: string
  /** Viewer-facing sidebar sub-item text (FR-014). */
  label: string
  /** One or more of this SAME tab's own `layout:` row names (the object
   * keys DashboardTabConfig.layout already carries) — the rows this
   * section groups together, in the order they should still render
   * (row RENDER order remains `layout`'s own object key order,
   * unmodified — `sections` never reorders rows, only groups/labels
   * them for sidebar-navigation purposes). A name with no matching row
   * is a config-authoring error (Edge Cases) — resolved and warned on
   * by dashboardLayout.ts's resolveSections(), not thrown as a parse
   * error. */
  rows: string[]
}
```

**Validation rules** (enforced by `dashboardLayout.ts::resolveSections()`,
called from `dashboardRenderer.tsx` — NOT inside `parseDashboardConfig()`,
consistent with that function's own "parsing stays permissive, contextual
validation happens where the data is actually used" split, already
established by e.g. `ZoneMapPanelConfig`'s boundaries/boundaries_id pair
being parsed permissively and validated later in `zoneGeometry.ts`):

- A `sections[].rows[]` entry naming a row not present in this tab's own
  `layout` is dropped from that section with a `console.warn` naming the
  missing row and the section — the section still renders with its
  remaining valid rows (or is omitted entirely if it ends up with zero).
- A `layout` row not referenced by ANY section is unaffected — it still
  renders in its normal position; it simply has no accordion sub-nav
  entry pointing at it (this is the expected, common case for a tab like
  Summary with no `sections:` at all, and is also valid for a `sections:`-
  using tab that has some ungrouped rows).

## 3. Full-Page Tab resolution — a derived, not stored, concept

Not a new stored field beyond `header.full_page` itself — `full_page:
true` is validated/resolved at render time by
`dashboardLayout.ts::findFullPagePanel(tab: DashboardTabConfig):
PanelConfig | null`:

- Flattens every row in `tab.layout` into one panel list; returns that
  single panel only when the flattened list has EXACTLY one entry.
- Returns `null` for zero or 2+ panels — `dashboardRenderer.tsx`'s
  full-page branch treats `null` as "fall back to ordinary multi-row
  rendering," logging the same class of `console.warn` misconfiguration
  notice `resolveSections()` above uses, per spec.md's Edge Cases.
- A `full_page: true` tab's `header.title`/`header.description` are
  simply not read by the full-page render branch at all (not blanked —
  never consulted), per FR-008/Edge Cases.

## 4. Sidebar Item — a purely derived, render-time concept (no new stored type)

Not a `DashboardTabConfig` field — the sidebar's own primary-item list is
computed directly from the SAME `DashboardTabConfig[]` array
`shell.tsx` already holds (`dashboards`), one item per array entry, in
array order — exactly `navBar.tsx`'s own existing derivation, per
research.md §1's confirmed parity requirement. No new "Sidebar Item"
interface is introduced; `sidebarNav.tsx` reads `tab.header.tab` /
`tab.header.icon` / `tab.sections` directly off each `DashboardTabConfig`
it's handed.

## 5. Metric Strip — a pure predicate, no new config field

`layout/dashboardLayout.ts::isMetricStripRow(panels: PanelConfig[]):
boolean` — `panels.length > 0 && panels.every((p) => p.type ===
'valuebox')`. Not a stored/authored concept at all (no new YAML field) —
purely a rendering-time classification `dashboardRenderer.tsx` applies to
each already-existing `layout` row, per FR-018/research.md §10.

## Summary of `layout/types.ts` changes

| Change | Kind | Backward compatible? |
|---|---|---|
| `header.icon?: string` | New optional field | Yes — absent in every existing file, parses as `undefined` |
| `header.full_page?: boolean` | New optional field | Yes — absent → `false`/ordinary rendering, unchanged |
| `DashboardTabConfig.sections?: SectionConfig[]` | New optional field | Yes — absent/empty → no sidebar sub-nav, unchanged |
| `SectionConfig` (new interface) | New type | N/A — additive |

No existing field, interface, or the `PanelConfig` union itself is
modified — every change in this feature is additive to `layout/types.ts`,
matching FR-020's own explicit requirement that an existing, unmodified
`dashboard-*.yaml` file's rendered layout is unaffected.
