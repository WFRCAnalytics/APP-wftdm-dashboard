# Contract: Scenario Display Resolution

Internal UI contract (this feature has no external API/CLI surface) —
governs how `panels/scenarioDisplay.ts` + `hooks/useScenarioDisplay.ts`
are consumed by the four extended panel types, and how
`layout/settings/scenariosTab.tsx`'s new swatch control writes back to
`state/appState.ts`.

## Read path — every chart/table panel

**Given** a `ScenarioDisplayMap` built from the current `appState.list()`
(one entry per registered scenario, `color` already resolved to
`colorOverride ?? manifest color ?? undefined`)

**When** a panel's own encoding/trace-resolution function runs with a
query result containing a `scenario` column, or a table column literally
named `scenario`

**Then**:

1. `plotly` — a trace split by the `scenario` column (`color`/`name`
   resolving to `$scenario`) gets, per distinct scenario value: `name =
   resolveScenarioLabel(scenarioName, map)`; `marker.color =
   resolveScenarioColor(scenarioName, map)` set ONLY when defined (an
   `undefined` `marker.color` is never explicitly assigned — Plotly's own
   default per-trace palette cycling applies exactly as it does today,
   FR-008).
2. `recharts` — when `config.series === 'scenario'`, each `seriesKey`'s
   `chartConfig[key]` gets `label = resolveScenarioLabel(key, map)` and
   `color = resolveScenarioColor(key, map) ?? \`var(--chart-${tokenNumber})\``
   (the existing token-cycling fallback, unchanged when no color
   resolves).
3. `observable-plot` — when `fill === 'scenario'` OR `stroke ===
   'scenario'`: every row's own `scenario` cell value in the RETURNED
   `data` (never the original `rows` array) is replaced with
   `resolveScenarioLabel(rawValue, map)`. Separately: if every DISTINCT
   real scenario value present in `rows` resolves to a defined color via
   `resolveScenarioColor()`, `plotOptions.color` gains `domain` (the
   resolved LABELS, in first-seen order) and a positionally-matched
   `range` (the resolved colors); if even one distinct scenario has no
   resolved color, neither `domain` nor `range` is set — the panel's
   existing `plotOptions.color = { legend: true }` (or its absence) is
   unchanged, letting Plot's own default cycling apply to every category
   in that panel (research.md §4 — this is a whole-panel, not
   per-category, fallback).
4. `table` — a column whose resolved `field === 'scenario'` renders each
   row's cell as `resolveScenarioLabel(String(row.scenario), map)`
   instead of the raw `String(value)`/`formatValue()` path. The column's
   own HEADER text (`ResolvedColumn.label`, from `tableLogic.ts`'s
   `resolveColumns()`) is never touched — it was always the literal field
   name `"scenario"`, never a scenario name, so there's nothing to
   substitute there.

**Given** a scenario name with no entry in the map (not yet registered,
or already unregistered) **When** either resolver function is called
**Then** `resolveScenarioLabel` returns the real name unchanged, and
`resolveScenarioColor` returns `undefined` — both fail open to today's
exact pre-feature behavior, never throw.

## Write path — Scenarios tab swatch control

**Given** a scenario row in `layout/settings/scenariosTab.tsx`

**When** a viewer picks a color from the row's native `<input
type="color">`

**Then** `appState.setColorOverride(s.name, newColor)` is called
directly on `onChange` (no local draft state — the same fully
store-driven pattern the row's existing label `<input>`/move buttons/
baseline star already use), the swatch's own `value` reflects
`s.colorOverride ?? s.color ?? '#000000'` (a native color input always
needs a valid hex value; the existing manifest `color` is the honest
current-effective value to show before any override, `#000000` only when
neither exists at all — a genuinely colorless scenario, which the swatch
still lets a viewer assign a real color to for the first time).

**Given** a scenario row with `s.colorOverride` set

**When** the row renders

**Then** a trailing `X`-icon ghost button appears immediately after the
swatch (hidden entirely when no override is set — never a disabled/inert
button); clicking it calls `appState.clearColorOverride(s.name)`,
reverting the swatch's own displayed value back to `s.color ?? '#000000'`
in the same render pass (no separate confirmation step — matches the
existing baseline star's own no-confirmation re-mark behavior).

## Non-goals (explicitly unchanged by this contract)

- `services/sqlExpander.ts`'s `$scenario.<metric>` UNION ALL — still
  always uses the real scenario name (spec.md FR-003).
- `panels/panelQuery.ts`'s `buildComparisonDiffQuery()`/
  `buildValueBoxBaselineTrendQuery()` — never read `label`/`colorOverride`
  at all, and their own output columns never embed a scenario name
  (confirmed in spec.md's research; unaffected by this feature).
- `sankey`, `flowmap`, `zonemap`, `graphic-walker`'s dataset picker,
  `valuebox`'s `baseline_trend` badge — none of the resolvers above are
  called from any of these panel types' own components (spec.md FR-006/
  FR-015).
