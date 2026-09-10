# Phase 0 Research: Redesigned Metric Panels, Scoped Expandability, and Trend Indicators

## 1. How expand-to-dialog capability is decided today (Required Research #1)

**Decision**: Add one new, small, exported constant — `EXPANDABLE_PANEL_TYPES` (a `Set<string>`) — next to `panels/registry.tsx`'s existing `registry` map, and have `layout/panelCard.tsx` consult it to decide which returned piece of `usePanelExpandHost()`'s output to actually render, WITHOUT calling the hook conditionally.

**Confirmed current shape** (read directly, not assumed): `panelCard.tsx`'s `PanelCard` calls `usePanelExpandHost(config.title, ..., { height: config.height })` **unconditionally**, for every resolved panel type. There is no per-type flag anywhere in `registry.tsx`/`panelCard.tsx`/`layout/types.ts` today — every one of the ten registered panel types gets the expand trigger and dialog identically. Scoping this is a genuine behavior change to an unconditional default, not flipping an existing per-type switch.

**Rationale for the exact mechanism**: `usePanelExpandHost()`'s own header comment is explicit that it's called unconditionally today specifically because of React's rules of hooks (a hook's call count/order must stay identical across a given component instance's own re-renders). `config.type` is fixed for the lifetime of one `PanelCard` instance (a panel's YAML-authored type never changes after mount), so conditionally skipping the hook call itself based on `config.type` would in fact be safe in practice — but it is a change to *when* a hook is called, which is exactly the pattern React's own lint rule (`react-hooks/rules-of-hooks`) cannot statically prove safe and will flag regardless of the real invariant. The lower-risk, equally-correct alternative: keep calling `usePanelExpandHost()` exactly as before (same call, same arguments, same position, on every render, for every panel type — zero risk of a hooks-rule violation), and simply choose, in the JSX `PanelCard` returns, whether to actually place its `trigger`/`body` output anywhere:

```tsx
const isExpandable = EXPANDABLE_PANEL_TYPES.has(config.type)
const { trigger, body } = usePanelExpandHost(config.title, panelElement, { height: config.height })
// CardHeader: {PanelComponent && isExpandable && trigger}
// CardContent: {isExpandable ? body : panelElement}
```

This is safe by construction, confirmed by reading `usePanelExpandHost()`'s own internals: the hook's returned `body` value is an *unrendered* React element tree (the `createPortal(children, portalHostRef.current)` call inside it does not execute/mount anything until the caller actually places `{body}` in its own returned JSX). When `isExpandable` is false, `PanelCard` never renders `body` at all — so the hook's internal `<div ref={setInlineAnchor}>`/`<div ref={setDialogAnchor}>` never mount, `inlineAnchor`/`dialogAnchor` state stays `null` forever, and the hook's own `useLayoutEffect` (gated on `host && target`) simply no-ops. `panelElement` (the same `PanelComponent` wrapped in the same `PanelErrorBoundary`) renders directly instead, exactly once — never twice. The only real cost for a non-expandable panel is a handful of bytes of inert React state and one never-attached `document.createElement('div')` — negligible, and far smaller in risk/scope than modifying `usePanelExpandHost()` itself (which stays completely untouched).

**Alternatives considered**:
- *Conditionally call the hook itself* (`if (isExpandable) { usePanelExpandHost(...) }`) — rejected: violates `react-hooks/rules-of-hooks` even though the underlying invariant (`config.type` stable per instance) would make it safe in practice; not worth the lint suppression or the precedent of a conditional hook call in this codebase.
- *Add an `expandable` field to every `PanelConfigBase`* — rejected: this is a per-panel-**type** fact (identical for every zonemap panel, every valuebox panel, etc.), not a per-panel-**instance** authoring choice; making it a YAML field would let an author accidentally re-enable/disable it per panel, which the request never asked for and which would need new validation/documentation for no real benefit.
- *A richer registry value shape* (`Record<string, { component, expandable }>`) — considered and rejected as unnecessarily invasive: `registry.tsx`'s existing `Record<string, ComponentType<...>>` shape has exactly one real consumer (`config.type` → component lookup in `panelCard.tsx`); a parallel, separately-exported `Set` is a smaller, more surgical diff that doesn't change the shape or every existing read of `registry` itself.

## 2. Sparkline mode's query shape (Required Research #2)

**Confirmed current shape**: `ValueBoxPanelConfig` (`layout/types.ts`) is scalar-oriented — `column: string` names the single column `ValueBoxPanel.tsx` reads off `rows[0]`. `buildPanelQuery()` (`panels/panelQuery.ts`) special-cases exactly this: `'column' in config` (and not `metric_id`, zonemap's own unrelated `column` field) produces `SELECT "<column>" FROM ...` instead of `SELECT *`. A sparkline needs the opposite shape — every row of a real grouped breakdown (e.g. `trip_mode_share`'s one row per `major_trip_mode`), not one scalar.

**Decision**: a new, optional, nested `sparkline` config object on `ValueBoxPanelConfig`:

```ts
export interface ValueBoxSparklineConfig {
  metric: string                    // a DIFFERENT metric than the panel's own scalar `metric` — the grouped dataset to summarize
  x: string                         // the category column (e.g. "major_trip_mode")
  y: string                         // the value column (e.g. "trips")
  chart_type?: 'bar' | 'line'       // default 'bar'
}
```

Built into a bare SQL template via the EXISTING, unmodified `buildPanelQuery()` — called a second time inside `ValueBoxPanel.tsx`, against a small synthetic object shaped like `{ metric: config.sparkline.metric, filter: config.filter, scenario: config.scenario, scenarios: config.scenarios }` (no `column` key, so `buildPanelQuery()`'s existing branch naturally falls through to `SELECT *` — exactly the multi-row shape needed, with zero change to that function). The sparkline deliberately shares the SAME `filter`/`scenario`/`scenarios` resolution as the panel's own primary value — reusing `extractGlobalFilterIds()`/`useFilterState()`/`resolveActiveScenarios()` already in scope in the same component — so a global filter narrowing the headline number also narrows what the mini-chart shows; showing an unfiltered breakdown next to a filtered headline number would be misleading. It is NOT reactive to anything the panel's own primary value isn't already reactive to — no new reactivity surface is introduced.

Rendering reuses `panels/rechartsEncoding.ts`'s existing, pure `encodeRechartsData(rows, { x, y })` (the same tested row→wide-row pivot every `recharts` panel already uses) feeding bare Recharts primitives (`BarChart`/`LineChart`, `Bar`/`Line`) directly — NOT the full `ChartContainer` chrome (`components/ui/chart.tsx`) `RechartsPanel.tsx` uses for a full-size chart panel, since a sparkline by definition has no axes, no tooltip, no legend, no grid: just the shape. This still satisfies "reuse existing chart-rendering capability (Recharts, already in this app) rather than building a new rendering engine" — the same library, the same tested data-transform function, a deliberately minimal-chrome rendering path (a real, different *use* of the same *capability*, not a new engine).

**Alternatives considered**:
- *Reuse the panel's own primary `metric`, adding a `group_by` field* — rejected: this app's Parquet metrics are pre-aggregated by the offline post-processor (`summarize.yaml`); a value box's own scalar `metric` (e.g. `summary_kpis`) is typically a genuinely single-row table with no further grouping dimension left inside it to group by at the browser layer. A distinct `metric:` reference (to an already-grouped dataset like `trip_mode_share`) matches how every other multi-row panel type already binds to a metric, and needs no new post-processor-side capability.
- *A shared/reused scalar query with client-side grouping* — rejected: DuckDB-WASM already does grouping/aggregation server-side (in-browser-but-off-main-thread) far more cheaply and consistently with how every other panel type works; there's no reason to fetch raw rows into JS and group them by hand.

## 3. Baseline-diff mode's grammar and query shape (Required Research #3)

**Confirmed current shape**: `ValueBoxPanelConfig` does NOT mix in `ComparisonCapablePanelConfig` today (`PlotlyPanelConfig`/`TablePanelConfig`/`ObservablePlotPanelConfig`/`ZoneMapPanelConfig` all do; value-box is the one data-bound panel type that doesn't). The existing shared query builder, `buildComparisonDiffQuery(metric, aScenario, bScenario, compareOn, expr)` (`panels/panelQuery.ts`, built by `019-baseline-diff-consumption` — the source request's own cited feature numbers, `018`/`021`, don't exactly match; this is the real function, confirmed by direct read, not assumed), always produces a real SQL `JOIN ... ON <compareOn columns>` between the two scenario views. **Every existing caller passes at least one `compareOn` column**, because every existing comparison-capable panel type's own data has multiple rows per scenario needing a real join key (a zone id, a mode, a link id). A value-box's own metric is the opposite: a genuinely single-row-per-scenario scalar table (e.g. `summary_kpis`), with no per-row identity column to join on at all — passing `compare_on: []` into the existing function produces `JOIN "b" ON ` (an empty, invalid `ON` clause). This is a real structural gap, not a detail to gloss over — flagged explicitly in spec.md's own Assumptions as "a real design detail for planning to resolve."

**Decision**: value-box's baseline-diff mode reuses every part of the existing mechanism that actually applies to a scalar, and adds one small, new, dedicated query-building function for the one part that doesn't (the row-matching JOIN, which a single-row table has no need for at all) — rather than either (a) forcing a fake `compare_on` entry through the existing join-based function, or (b) writing a parallel, competing comparison implementation.

Reused, byte-for-byte unmodified:
- `resolveComparisonScenarioName(name, baseline)` — resolves the `'$baseline'` sentinel exactly as every other comparison-capable panel type already does.
- `useBaseline()` — the same reactive baseline-scenario subscription `RechartsPanel.tsx`/`TablePanel.tsx`/etc. already use, so a baseline-scenario change elsewhere in the app recomputes this indicator automatically, with no new reactivity mechanism.
- The free-form `expr` convention — an author-supplied SQL expression string, interpolated verbatim (never `eval()`'d, matching constitution Principle III and `buildComparisonDiffQuery()`'s own existing docstring), referencing `a`/`b` table aliases exactly the way an existing `comparison: diff` config's `expr` already does.

New, small, and additive — `panelQuery.ts` gains one new function, `buildValueBoxBaselineTrendQuery(metric, column, currentScenario, baselineScenario, expr)`, a sibling to the existing `buildComparisonDiffQuery()`/`buildGraphicWalkerQuery()` (neither of which is modified):

```sql
SELECT a."<column>" AS current_value, b."<column>" AS baseline_value, (<expr>) AS diff_value
FROM "<currentScenario>__<metric>" a, "<baselineScenario>__<metric>" b
```

A plain comma cross join — correct and safe here specifically *because* both sides are guaranteed exactly one row (the same guarantee that makes a real `compare_on` join key unnecessary in the first place), producing exactly one result row. This is not a new *comparison mechanism* — the actual comparison (an author-authored `expr` over two scenario-scoped views, with `$baseline` resolution) is identical in spirit and technique to the existing one; only the SQL scaffolding connecting a single-row scalar table to that same technique is new, because the existing scaffolding assumes at least one join column exists.

**Grammar decision**: rather than requiring an author to write out a full `comparison: { type: diff, a: ..., b: '$baseline' }` block (redundant for a value box, whose "current" side is already unambiguous — it's whatever scenario `config.scenario` already pins, the same field every value box in this app's real demo content already sets), a new, small, nested `baseline_trend` config:

```ts
export interface ValueBoxBaselineTrendConfig {
  expr: string       // e.g. "(a.value - b.value) / NULLIF(b.value, 0)" — same free-form convention as ComparisonDiff.expr
  format?: string    // optional distinct format string for the diff magnitude (formatValue.ts's existing Python-style syntax); defaults to the panel's own `format`
}
```

`baseline_trend` requires `config.scenario` (the panel's existing singular-pin field) to be set — the "current" side of the comparison is always that pinned scenario; there is no ambiguity to resolve when the value box already shows exactly one scenario's value. A value box with `baseline_trend` configured but no `scenario` pinned is a configuration error, surfaced the same way this app's other unresolvable-configuration cases already are (a clear error state, never a silent wrong answer). This is a real, deliberate constraint — recorded here, not left implicit — and is the direct, minimal consequence of `ValueBoxPanel.tsx`'s own real current behavior (it reads `rows[0]` from whatever the query returns, with no per-scenario column-fanning despite `project-docs/GRAMMAR.md`'s stale, never-implemented "multi-scenario" note — see spec.md's own Assumptions).

**Alternatives considered**:
- *Force a synthetic `compare_on` column through `buildComparisonDiffQuery()` unmodified* (e.g. requiring the metric to carry a constant literal column both scenarios share) — rejected: no such column exists in real scalar metrics like `summary_kpis` today, and inventing one would mean changing the post-processor's own `summarize.yaml` output shape for every existing scalar metric, a far larger and more invasive change than one new query-building function.
- *Extend `buildComparisonDiffQuery()` itself to special-case an empty `compareOn` as a cross join* — considered, and rejected specifically because the source request's own explicit instruction is that "018-021's own code stays unmodified, only reused"; a new, purpose-built sibling function honors that literally, while an additive branch on the existing function — though technically backward-compatible for every existing caller — would still be a modification to code the request asked to leave alone.
- *Full `comparison: diff`-shaped grammar reused verbatim* (mixing in `ComparisonCapablePanelConfig` and requiring `a`/`b`/`compare_on`) — rejected: `compare_on` has no meaning for a single-row table (there is no second row to disambiguate from), and requiring an author to write `a: <same as config.scenario>, b: '$baseline'` is pure duplication of a value the panel already has.

## 4. shadcn's real, current metric-card pattern (Part B)

Already recorded in spec.md's own "Research performed before writing this spec" section — repeated here only for the presentation-level detail relevant to implementation, fetched from the same source (`apps/v4/app/(app)/examples/dashboard/components/section-cards.tsx`, the real, current shadcn dashboard example, same registry `033-shadcn-default-theme` used):

- A small label (shadcn's own `CardDescription`) directly above the value.
- The value itself large, bold, using tabular figures (`tabular-nums`) so digits align — this app's `ValueBoxPanel.tsx` already uses `font-heading text-3xl font-semibold`; `tabular-nums` is a genuinely new, real, worth-adopting detail this fetch surfaced (numbers in a KPI row visibly jitter in width without it whenever the digit count changes, e.g. between scenarios).
- A trend indicator rendered as a small badge beside the value — an icon (up/down triangle) plus a percentage — this app's own `components/ui/badge.tsx` does not exist yet (confirmed via `ls src/components/ui/`); this feature is this app's first real consumer of that pattern, addressed in data-model.md.
- Shadcn's own reference shows the trend as a badge only, never an embedded chart — confirming (as already noted in spec.md) that the sparkline concept is this app's own addition, not something being copied from shadcn's real pattern; only the label/value/badge/icon layout is being adopted, not a from-shadcn sparkline design (there isn't one to adopt).

**Decision**: adopt the label-above-value-with-tabular-nums layout and the badge-style trend-indicator presentation for both new trend modes (sparkline gets its own distinct placement — a small chart, not a badge — described in data-model.md); do not adopt shadcn's own `CardFooter` two-line context/description text, since this app's value boxes have no equivalent authored copy to put there and inventing placeholder text would be worse than omitting it.

## 5. Existing gaps confirmed out of scope

- `project-docs/GRAMMAR.md` documents `observed`/`threshold_warn`/`threshold_fail` fields for `type: valuebox`, and a "Multi-scenario: auto renders one column per loaded scenario + observed column" behavior — confirmed directly that `ValueBoxPanel.tsx`'s real, current code reads none of the three fields and does no per-scenario column-fanning at all (it renders `rows[0][config.column]` only). This is a pre-existing documentation/implementation gap, unrelated to this feature, and is not fixed here — noted so `baseline_trend` (a genuinely different, new comparison concept) is never confused with the older, unimplemented `observed:`-vs-modeled comparison idea.

## 6. A real, confirmed test-fixture consequence of Part A

`tests/integration/panelExpand.spec.ts` (confirmed by direct read, not assumed) uses a `valuebox` panel — "Total Households" — as the fixture for roughly ten of its ~eighteen tests: every *generic* expand-mechanism assertion (focus management on open/close, state preservation across expand/collapse, error/empty-state parity, background-interaction blocking while expanded) is written against that one valuebox panel. Its own *chart-specific* tests (legend interaction, resize-to-fill, container DOM-node identity) already correctly use a separate `plotly` fixture, "Mode Share by Purpose." Once `valuebox` loses its expand trigger (FR-001), every one of those ~ten generic tests needs its fixture swapped to a still-expandable panel type — the existing plotly fixture is the natural, already-present candidate, avoiding a new fixture panel just for this. This is real, necessary, mechanical migration work belonging to `/speckit-tasks`/implementation, not a design decision — recorded here so it isn't discovered as a surprise mid-implementation.
