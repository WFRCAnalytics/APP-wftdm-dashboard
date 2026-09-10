# Phase 0 Research: $baseline consumption across panel types

`spec.md`'s own "Grammar & architecture findings" section (§1–§7) already resolved the three questions the user's original brief posed, plus the effect-reactivity question added afterward. This document covers the remaining decisions needed to move from spec to implementation.

## §1. `compare_on`'s exact YAML shape: always `string[]`, never a flexible singular-or-list union

**Finding**: Surveyed every existing multi-value field in this app's grammar (`project-docs/GRAMMAR.md`) — `scenarios: [a, b]`, `traces: [...]`, `columns: [...]`, `inputs: [...]` — every one is **always** an array, never a "bare value OR array" polymorphic union. Where this project wants a genuine singular/plural distinction, it uses two *differently-named* fields instead (`scenario` singular vs. `scenarios` plural on `DataBoundPanelConfigBase` itself) rather than one field accepting either shape.

**Decision**: `compare_on: string[]`, always an array, even for the common single-column case (`compare_on: [taz_id]`).

**Rationale**: Matches this app's own consistent existing convention exactly — no precedent anywhere in this grammar for a flexible singular-or-list field, so introducing one here would be a new, inconsistent pattern for no real benefit.

## §2. The generalized query-builder signature

**Finding**: `013-zonemap-panel`'s existing `buildComparisonDiffQuery(config: ZoneMapPanelConfig, diff: ComparisonDiff)` hardcodes `config.metric_id` as both the SELECT column and the JOIN key, and `config.metric` as the sole metric name. Every other input it needs (`diff.a`, `diff.b`, `diff.expr`) already comes from `diff`, not `config` — `config` is used ONLY for `metric` and `metric_id`.

**Decision**: Generalize to:

```ts
function buildComparisonDiffQuery(
  metric: string,
  aScenario: string,
  bScenario: string,
  compareOn: string[],
  expr: string,
): string {
  const aView = `"${aScenario}__${metric}"`
  const bView = `"${bScenario}__${metric}"`
  const selectCols = compareOn.map((c) => `a."${c}" AS "${c}"`).join(', ')
  const joinCond = compareOn.map((c) => `a."${c}" = b."${c}"`).join(' AND ')
  return [
    `SELECT ${selectCols}, (${expr}) AS diff_value`,
    `FROM ${aView} a`,
    `JOIN ${bView} b ON ${joinCond}`,
  ].join('\n')
}
```

`zonemap`'s own call site becomes `buildComparisonDiffQuery(config.metric, resolvedA, resolvedB, config.compare_on ?? [config.metric_id], diff.expr)` — `aScenario`/`bScenario` are already-resolved (§4 below), never `'$baseline'` literally, by the time this function runs. Byte-for-byte identical output to today's function when `compareOn` is `[metric_id]` (single-column SELECT/JOIN, same clause shape) — confirmed by inspection, verified by a regression test (quickstart.md).

**Rationale**: Every input this function actually needs is now a plain parameter, not a config object — this is what makes it genuinely shared across all four panel types (FR-006) rather than zonemap-specific with three copies elsewhere. `compareOn` generalizes `metric_id` cleanly: multiple JOIN/SELECT columns are just `compareOn.map(...)` instead of one hardcoded field reference.

**Alternative considered**: Keep accepting a config object, typed as a union or a new shared interface. Rejected — the function doesn't need anything else from config beyond what's now explicit parameters, and a plain-parameter signature is more directly testable (quickstart.md's own multi-column test doesn't need to construct a full panel config to exercise it).

## §3. Any additional dimension columns beyond `compare_on` — resolved: none needed, `compare_on` IS the full binding surface

**Finding**: A chart author using `diff_value` for `y` also typically wants some OTHER column for `x`/`color` (e.g. `mode`) — is that column selected by this query at all, if it isn't in `compare_on`?

**Decision**: No new "extra SELECT columns" concept. Any column an author wants to bind (`x`/`color`/`field`/etc.) on a diff view MUST be named in `compare_on` — `compare_on` doubles as both the join key AND the full list of dimension columns available to bind against, generalizing `zonemap`'s existing one-column case (`metric_id` alone) rather than adding a second, separate config concept.

**Rationale**: This is not a limitation, it's the semantically correct requirement — a column NOT in `compare_on` isn't guaranteed to match between the panel's own scenario and the baseline's rows at all (e.g. binding `x: mode` while joining only on `taz_id` could pair "SOV in scenario A, TAZ 5" with "HOV in baseline, TAZ 5" — wrong data). Requiring every bound dimension column to also be a join column is the only way the resulting `diff_value` is actually meaningful per-row. No new mechanism needed — `compare_on`'s existing SELECT-every-join-column shape (§2) already provides this for free.

## §4. `$baseline` resolution: a shared helper, resolved by the caller, gating on an unresolved baseline (FR-011)

**Finding**: Per spec Grammar finding #2, `comparison: diff` queries never go through `sqlExpander.expand()` — so `$baseline` cannot be resolved via `PLACEHOLDER_RE`/`expand()`'s existing mechanism (that's `018`'s own, separate `$baseline.<metric>` placeholder, used in ordinary metric SQL text — a DIFFERENT consumption path from this feature's `comparison.a`/`comparison.b` sentinel, which never touches `sqlExpander.ts` at all). These are two independent things that happen to share the word "baseline": `018`'s `$baseline.<metric>` (a `sqlExpander.expand()` placeholder) and this feature's `'$baseline'` sentinel (a literal `ComparisonDiff.a`/`.b` value, resolved directly against `appState.getBaseline()`/`useBaseline()`, never through `expand()`).

**Decision**: A small, shared, pure resolver in `panelQuery.ts`:

```ts
const BASELINE_SENTINEL = '$baseline'

function resolveComparisonScenarioName(name: string, baseline: string | undefined): string | undefined {
  return name === BASELINE_SENTINEL ? baseline : name
}
```

Returns `undefined` when `name === '$baseline'` and no baseline is currently resolved — the CALLER (each panel component) checks for `undefined` on either resolved side BEFORE calling `buildComparisonDiffQuery()`, and shows its existing error state instead (FR-011), the same way every other unresolvable-config case in this codebase already short-circuits before running a doomed query, rather than letting a malformed view name reach DuckDB and fail there. This is a deliberate difference from `expandScenario()`'s own "throw and let the panel's `.catch()` handle it" convention (`018`'s own precedent) — because here, the caller already HAS the information needed (`baseline === undefined`) before ever building a SQL string at all, so failing earlier, without ever attempting a query, is both possible and clearer.

**Rationale**: One function, reused identically by all four panel types' own fetch effects (FR-006's "one shared mechanism" bar extends to this resolver too, not just the query-builder). Keeping it a pure function (no direct `appState` import) matches `sqlExpander.ts`'s own established "caller resolves, function stays decoupled" convention (cited directly in that file's header comment) — carried forward here for consistency, not coincidence.

## §5. `isComparisonDiff()` — moved from `ZoneMapPanel.tsx`-local to shared

**Finding**: `isComparisonDiff()` (`` typeof comparison === 'object' && comparison !== null && comparison.type === 'diff' ``) is currently a local function inside `ZoneMapPanel.tsx`. All four panel types now need the identical check.

**Decision**: Move it to `panelQuery.ts`, exported, alongside the generalized query-builder and resolver. `ZoneMapPanel.tsx` imports it instead of redeclaring it.

**Rationale**: Trivial, but real — avoids four copies of the same three-line type guard; `panelQuery.ts` is already the shared home for every other piece of this mechanism (§2, §4).

## §6. `diff_value: null` rendering — two real, confirmed gaps found and fixed; two panel types need no code change

**Finding, `formatValue.ts`**: `formatValue(value, format)`'s first line is `` if (typeof value !== 'number') return String(value) ``. For `value === null`, `String(null)` returns the literal three-character string `"null"` — a real, confirmed bug (not hypothetical): a `TablePanel` cell bound to a null `diff_value` would display the text `null` today, exactly the kind of "raw artifact" FR-014 explicitly forbids.

**Decision**: Add an explicit branch: `if (value === null || value === undefined) return 'N/A'` (checked before the `typeof !== 'number'` branch, so it takes precedence over the generic stringify fallback).

**Finding, `tableLogic.ts`'s `cellColor()`**: `` if (!colorScale || !domain || typeof value !== 'number') return undefined ``. A `null` value already avoids crashing (falls through to `undefined` — no color applied), but this is NOT a "distinct, defined 'not computable' state" the way FR-014 requires — it's indistinguishable from "this column has no `color_scale` configured at all." `zonemapColor.ts`'s own `resolveZoneFillColor()` already established the correct pattern for exactly this situation: a dedicated, visibly-distinct color (`NO_DATA_COLOR = 'color-mix(in srgb, var(--muted-foreground) 25%, var(--muted))'`) for a missing value, never blended into the real scale.

**Decision**: `cellColor()` gains its own explicit null branch, returning a token-consistent equivalent of `zonemapColor.ts`'s `NO_DATA_COLOR` (not imported directly — `zonemapColor.ts`'s constant is unexported/module-private by design, and duplicating one short, token-driven CSS string is simpler and less coupling than exporting a zonemap-named constant for a table-panel consumer; both modules already independently derive their own color tokens from the same design-token CSS variables, e.g. `tableLogic.ts`'s own existing `--brand-wfrc-blue`/`--destructive`/`--muted` usage).

**Finding, `plotlyTraces.ts`**: No existing null-handling code (confirmed: zero matches for `null`), and none needed — empirically verified during implementation (not merely assumed): a `Plotly VMT Diff via $baseline` fixture panel's real, rendered trace `.data[0].y` array genuinely contains a JS `null` at the zero-baseline row's index, and Plotly.js's own bar rendering leaves a visible gap there — never coerced to `0`, never blended into a color scale. No code change needed here; the original claim holds for Plotly specifically.

**Finding, `observablePlotEncoding.ts` — the original claim below was WRONG, corrected during implementation, not merely revised in planning**: this document's own first draft asserted Observable Plot's native null-handling would omit a null-valued `barY` mark "the same way Plotly's does." Empirically false, confirmed by inspecting the real, rendered SVG directly (`getAttribute('height')` on each `<rect>`): a null y value renders as a genuine `<rect height="0">`, positioned at the EXACT x-coordinate a real `0`-valued bar would occupy — visually indistinguishable from "no change," which is exactly the silent-coercion-to-0 outcome FR-014 forbids. This was caught only because the Playwright integration test asserting "6 rects, not 7" failed against the real running app — a Vitest-only or code-review-only pass would not have surfaced it, since nothing in `observablePlotEncoding.ts`'s own pure-function contract hinted at the gap; it's a real, `@observablehq/plot`-internal rendering behavior, not a logic error visible from this module's own source.

**Decision (corrected)**: `resolveObservablePlotEncoding()` now filters `rows` to exclude any row where the configured `y` field's value is `null`, unconditionally, whenever `config.y` is set — a real code change, not "zero new app code" as originally claimed. Rather than special-case per mark type (whether `lineY`'s own null-handling genuinely differs from `barY`'s was not exhaustively re-verified either, given the `barY` finding already disproved the blanket "both libraries already handle every mark type correctly" assumption), filtering unconditionally on the `y` channel guarantees the same visual outcome across every mark type this panel type supports, rather than depending on each mark's own possibly-inconsistent native behavior.

**Rationale for the chart/table split (still holds for Plotly, corrected for Observable Plot)**: A table cell or a map polygon (`zonemap`, already fixed in `013`) always renders SOME visible content for every row/zone — "omit it" isn't an available option, so an explicit "N/A"/dedicated-color treatment is required. Plotly's own native omission genuinely satisfies the same visual guarantee for that library specifically, confirmed empirically. Observable Plot needed this feature's own explicit filter to reach the identical guarantee — the END STATE (a cleanly omitted mark, never a silent zero) is the same deliberate split originally intended; the MEANS (native library behavior vs. an explicit app-level filter) differs by library, and only empirical, real-hardware-equivalent verification (a live Playwright run against the real rendered SVG, not a read of either library's documentation) revealed that difference.

## §7. Migrating `ZoneMapPanel.tsx` onto the generalized builder without regressing `013`'s own behavior

**Finding**: `ZoneMapPanel.tsx`'s fetch effect today calls `buildComparisonDiffQuery(config, config.comparison)` directly whenever `isComparisonDiff(config.comparison)` — no `$baseline` involved in any of its own existing tests.

**Decision**: The migrated call becomes:
```ts
const diff = config.comparison // already known to be ComparisonDiff here
const resolvedA = resolveComparisonScenarioName(diff.a, baseline)
const resolvedB = resolveComparisonScenarioName(diff.b, baseline)
if (resolvedA === undefined || resolvedB === undefined) {
  setStatus('error') // FR-011 — never reached when neither a nor b is '$baseline',
  return             // since resolveComparisonScenarioName passes non-sentinel names through unchanged
}
const sql = buildComparisonDiffQuery(
  config.metric, resolvedA, resolvedB, config.compare_on ?? [config.metric_id], diff.expr,
)
```
For every existing zonemap `comparison: diff` fixture/test (hardcoded `a`/`b`, no `$baseline`), `resolveComparisonScenarioName()` is a pure pass-through (`name !== '$baseline'` → returns `name` unchanged) and `config.compare_on ?? [config.metric_id]` evaluates to `[config.metric_id]` exactly as today — the generated SQL is byte-for-byte identical to before this feature (§2's own claim, verified by a dedicated regression test in quickstart.md).

**Rationale**: Confirms FR-005/SC-004 concretely, not just as an intention — the migration is structured so the existing-behavior code path is a literal identity transformation of today's code, not a reimplementation that merely intends to match it.
