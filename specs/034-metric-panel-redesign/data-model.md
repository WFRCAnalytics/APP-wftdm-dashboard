# Data Model: Redesigned Metric Panels, Scoped Expandability, and Trend Indicators

## 1. Panel-type expand-ability (Part A)

A new exported constant, `EXPANDABLE_PANEL_TYPES: Set<string>`, in its own new file, `panels/expandablePanelTypes.ts` — **not** co-located inside `panels/registry.tsx` (a real, confirmed correction made during implementation, not the original plan: `registry.tsx` eagerly imports every one of the ten real panel components, and `FlowMapPanel.tsx`'s own `@flowmap.gl/layers` dependency fails to resolve under Vitest's plain-Node `environment: 'node'` unit-test config — a real "directory import is not supported resolving ES modules" error, confirmed live. A dedicated, dependency-free module lets this Set be unit-tested directly with zero risk of pulling in a heavy panel component's own browser-only dependencies, matching `vitest.config.js`'s own documented intent, "Pure-logic unit tests only... no browser"):

```ts
export const EXPANDABLE_PANEL_TYPES = new Set([
  'table', 'markdown', 'plotly', 'observable-plot', 'sankey', 'recharts', 'flowmap', 'zonemap',
])
```

Deliberately NOT `Object.keys(registry).filter(...)`-derived — a plain, explicit list is easier to audit at a glance against spec.md's own explicit include/exclude lists (FR-001/FR-002/FR-003), and doesn't silently change behavior for a future eleventh panel type added to `registry` without an explicit decision about its own expand-ability (a new type would need an explicit entry here, defaulting to NOT expandable if omitted — the safer default per FR-001/FR-002's own "remove, don't add" framing).

`'graphic-walker'` is intentionally absent from this set (FR-002) — its own chromeless full-page Explore mode already renders outside `PanelCard`/`registry` lookup entirely (`layout/dashboardRenderer.tsx`'s `FullPagePanel`, per `030-sidebar-navigation`), so this only affects a graphic-walker panel used as an ordinary card, which today gets the same unconditional expand control every other type does.

**Design change (spec.md's Part A addendum, FR-023–FR-025)**: `EXPANDABLE_PANEL_TYPES` is no longer the SOLE source of truth — it is now the **default** table, overridable per individual panel via a new optional field on `PanelConfigBase` (§1a below). Every existing consumer/reasoning above (the explicit-list rationale, the `graphic-walker` exclusion) is unchanged; it now describes the DEFAULT specifically, not the only possible outcome.

**Validation rule**: none for the constant itself — still a compile-time table, not authored YAML. See §1a for the new field's own validation.

## 1a. Per-panel expand-ability override (spec.md's Part A addendum)

A new optional field on `PanelConfigBase` — `layout/types.ts` — the shared base every one of the ten panel types already extends, so this is available to all of them uniformly, not re-declared per type:

```ts
export interface PanelConfigBase {
  title: string
  height?: number
  width?: number
  expandable?: boolean // 034-metric-panel-redesign Part A addendum (FR-023–FR-025)
}
```

Resolution in `layout/panelCard.tsx`:

```ts
const isExpandable = config.expandable ?? EXPANDABLE_PANEL_TYPES.has(config.type)
```

`config.expandable`'s presence (even `false`) always wins over the type-level default via `??` (nullish coalescing — `undefined`, not `false`, is the only value that falls through to the default; a real, deliberate distinction, since `false` is a legitimate, meaningful override value, not "unset"). A panel with no `expandable` key in its YAML parses to `undefined` (`js-yaml` never invents a key that wasn't written), so every existing `dashboard-*.yaml` file — with zero edits — resolves through the exact same `EXPANDABLE_PANEL_TYPES.has(config.type)` default Part A's original design already specified (FR-025's own literal requirement).

**Validation rule**: none beyond ordinary TypeScript `boolean | undefined` typing — any other authored value (a string, a number) is a real, YAML-authoring bug this project's own "YAML parsed at runtime, no schema" convention already accepts as a general risk class, not something this one field needs to newly guard against.

**Full-page graphic-walker**: an `expandable` override on a panel rendered via `FullPagePanel` (chromeless, no `PanelCard`/registry lookup at all) has no effect — there is no expand-control mechanism on that render path for an override to turn on or off (FR-004's own "an override configured on a full-page panel has no effect" — the field is still validly parsed, just never consulted by that code path).

## 2. Value-box config additions (Parts B/C)

`ValueBoxPanelConfig` (`layout/types.ts`) gains two new, independent, optional fields. No existing field changes shape or meaning.

```ts
export interface ValueBoxSparklineConfig {
  metric: string
  x: string
  y: string
  chart_type?: 'bar' | 'line'   // default: 'bar'
}

export interface ValueBoxBaselineTrendConfig {
  expr: string
  format?: string               // default: the panel's own `format`
}

export interface ValueBoxPanelConfig extends DataBoundPanelConfigBase {
  type: 'valuebox'
  column: string
  format: string
  unit?: string
  icon?: string
  observed?: number
  threshold_warn?: number
  threshold_fail?: number
  sparkline?: ValueBoxSparklineConfig
  baseline_trend?: ValueBoxBaselineTrendConfig
}
```

### Field semantics

| Field | Required when present | Meaning |
|---|---|---|
| `sparkline.metric` | yes | The grouped metric (a different table than the panel's own `metric`) whose rows the mini-chart summarizes. |
| `sparkline.x` | yes | Category column from `sparkline.metric` — becomes the mini-chart's category axis. |
| `sparkline.y` | yes | Value column from `sparkline.metric` — becomes the mini-chart's plotted value. |
| `sparkline.chart_type` | no | `'bar'` (default) or `'line'` — reuses the same two Recharts mark components `recharts` panels already use. |
| `baseline_trend.expr` | yes | Free-form SQL expression, referencing `a`/`b` table aliases (the panel's own resolved scenario, and the resolved baseline scenario, respectively) — identical convention to `ComparisonDiff.expr`. |
| `baseline_trend.format` | no | Python-style format string (`formatValue.ts`'s existing syntax) for the displayed diff magnitude; defaults to the panel's own `format`. |

### Validation rules (author-facing failure modes, all at runtime — YAML has no build-time schema per this project's own non-negotiable)

- `baseline_trend` configured with no `config.scenario` set → a configuration error, surfaced via the same `PanelErrorState` every other unresolvable-configuration case already uses (research.md §3's own documented constraint — a value box's "current" side is always its pinned `scenario`).
- `baseline_trend` configured but no scenario currently resolves as baseline (`useBaseline()` returns `undefined`) → the SAME "no baseline resolved" treatment `RechartsPanel.tsx`/`TablePanel.tsx` already show for their own `comparison: diff` cases with an unresolved `'$baseline'` — not a new state, not a crash.
- `sparkline` or `baseline_trend` referencing a metric/column that doesn't exist, or whose underlying query fails → the sparkline/trend indicator's OWN failure state (a small, contained message or icon inside its own slot), never propagated to break the panel's primary scalar value (FR-013) — the primary value has its own independent fetch and rendering path, unaffected by either trend indicator's fetch outcome.
- Both `sparkline` and `baseline_trend` may be present together, independently of each other (FR-021) — each has its own fetch effect, its own loading/error/empty handling, and neither reads the other's state.

## 3. New UI primitive: Badge

`components/ui/badge.tsx` does not exist in this app today (confirmed via direct listing of `src/components/ui/`) — this feature's baseline-trend indicator is its first real consumer. Adapted from shadcn's real, current `new-york-v4` registry source (`apps/v4/registry/new-york-v4/ui/badge.tsx`, fetched directly), following this project's own established Radix/plain-element adaptation convention (no Radix primitive involved here — a plain `<span>`, matching `input.tsx`'s own precedent for a non-Radix primitive): `forwardRef`, `@/lib/utils` `cn`, single quotes, no `"use client"`, `class-variance-authority` (already an installed dependency — confirmed via `package.json`, used by `button.tsx` already) for the `variant` prop. `outline`/`default`/`secondary`/`destructive` variants carried over from the real source; `ghost`/`link` variants omitted (no real consumer needs them yet, matching this project's own "only what's needed" convention already applied to `dropdown-menu.tsx`'s trimmed export list).

## 4. Rendering model — redesigned ValueBoxPanel

Four independent visual zones inside the card, each with its own data-readiness state:

1. **Label + icon** (existing `title`/`icon`, restyled per FR-005 — smaller, secondary text above the value, `tabular-nums` value).
2. **Primary value** (existing `column`/`format`/`unit` — FR-006/FR-007, unchanged data/formatting, restyled placement).
3. **Baseline-trend badge** (new, optional, FR-015–FR-020) — sits beside the primary value, matching shadcn's own real badge-beside-value placement (research.md §4): a `TrendingUp`/`TrendingDown`/`Minus` icon (the last for a real "no change" diff, per spec.md's own baseline-equals-current edge case) plus the formatted magnitude. Deliberately NEUTRAL styling (`outline` badge variant) rather than green-for-up/red-for-down — this app has no per-metric "which direction is good" metadata, and asserting one would misrepresent a metric where a decrease is the desired outcome (e.g. VMT).
4. **Sparkline** (new, optional, FR-010–FR-014) — a small, fixed-height chart region below the primary value, rendered via bare Recharts primitives + `encodeRechartsData()` (research.md §2), no axes/tooltip/legend/grid chrome.

Each zone's own loading state is a `bg-muted animate-pulse` placeholder matching the app's existing skeleton convention (`wftdm-design-system` skill), sized to that zone's own real footprint — never a full-card skeleton replacing zones 3/4 that were never going to render at all for a panel that didn't configure them.

## 5. Query builder additions (`panels/panelQuery.ts`)

Two new, purely additive exports. **No existing exported function in this file changes signature, behavior, or output** (confirmed requirement, research.md §3).

```ts
export function buildSparklineQuery(
  config: Pick<ValueBoxPanelConfig, 'filter' | 'scenario' | 'scenarios'>,
  sparkline: ValueBoxSparklineConfig,
  filters: Record<FilterId, FilterValue>,
): string
// Delegates to the EXISTING buildPanelQuery(), called with a synthetic
// { metric: sparkline.metric, filter, scenario, scenarios } object that
// deliberately carries no `column` key, so buildPanelQuery()'s own
// existing branch falls through to `SELECT *` — the correct multi-row
// shape — with zero change to that function.

export function buildValueBoxBaselineTrendQuery(
  metric: string,
  column: string,
  currentScenario: string,
  baselineScenario: string,
  expr: string,
): string
// SELECT a."<column>" AS current_value, b."<column>" AS baseline_value,
//        (<expr>) AS diff_value
// FROM "<currentScenario>__<metric>" a, "<baselineScenario>__<metric>" b
// A plain cross join — correct because both sides are guaranteed exactly
// one row (research.md §3).
```

## 6. State transitions — ValueBoxPanel (per zone)

Primary value (unchanged from today): `loading → ready | empty | error`.

Sparkline (new, independent): `loading → ready | empty | error` — driven by its own fetch effect, keyed on `config.sparkline` + the same filters/active-scenario deps the primary value's effect already uses.

Baseline-trend (new, independent): `loading → ready | no-baseline | error` — `no-baseline` is a distinct, non-error terminal state (matches spec.md's Acceptance Scenario 2 for User Story 4: "shows the same established 'no baseline resolved' state," not an error), reached when `resolveComparisonScenarioName('$baseline', useBaseline())` returns `undefined`; recomputes automatically (via `useBaseline()`'s own `useSyncExternalStore` subscription) the moment a baseline scenario resolves, transitioning `no-baseline → loading → ready` with no viewer action needed.
