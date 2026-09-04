# Feature Specification: $baseline consumption across panel types (diff/percent-diff rendering)

**Feature Branch**: `019-baseline-diff-consumption`

**Created**: 2026-09-04

**Status**: RESOLVED. One shared `comparison`/`compare_on` grammar (mirroring `MapRenderingPanelConfig`'s mixin pattern) now spans `plotly`/`table`/`observable-plot`/`zonemap` — `$baseline` resolves via `panels/panelQuery.ts`'s `resolveComparisonScenarioName()`, a generalized `buildComparisonDiffQuery()` (byte-for-byte identical output for zonemap's existing single-column case, verified by regression test), and `useBaseline()` in each panel's own fetch-effect dependency array (FR-016). Two real bugs found and fixed during implementation, not merely planned: `formatValue(null, ...)` returned the literal string `"null"`; Observable Plot's `barY` rendered a null value as a real zero-height rect at the real-0 position (this spec's own original "no code needed" claim for that library was empirically wrong — corrected in `research.md` §6 with the full record, not silently). Verified: 240/240 unit tests, 8/8 new integration tests across all four panel types, full suite 200/202 (both remaining failures independently confirmed pre-existing and unrelated), `npx tsc --noEmit` and `npm run build` both clean. `013-zonemap-panel`'s existing hardcoded-name `comparison: diff` behavior confirmed completely unaffected (FR-005/SC-004).

**Input**: User description: "Teach plotly, table, observable-plot, and zonemap to actually USE the $baseline SQL placeholder built in 018-baseline-scenario-designation (currently resolves correctly but is consumed by zero panel types — FR-011 of that feature deliberately excluded consumption). Design ONE consistent authoring convention across all four panel types for expressing 'show this metric as an absolute difference or percent difference from the current baseline scenario' — not four independently invented mechanisms. [...] The percent-diff formula's degenerate case: what happens when the baseline scenario's own value is zero (division by zero)? This MUST be resolved explicitly, the same rigor 005-table-panel's own diverging-scale-zero-anchoring and 013-zonemap-panel's computeAutoDomain()'s [0,0] fallback both required — do not leave this to silently produce [NOTE: the user's own request text was cut off mid-sentence at exactly this point. The clear intent, given the two named precedents — both of which resolve a degenerate case to a distinct, defined, non-crashing value rather than an undefined/garbage one — is completed below as 'a NaN/Infinity value silently rendered as if it were a normal number'; resolved explicitly per FR-013/FR-014 using this codebase's own existing, already-shipped precedent for exactly this formula (summarize.yaml's screenlines metric: (a.volume - o.aadt) * 1.0 / NULLIF(o.aadt, 0) AS pct_error), not a newly-invented mechanism.]"

## Grammar & architecture findings (pre-spec verification)

Verified directly against the real, current `src/panels/panelQuery.ts`, `src/layout/types.ts`, `src/panels/ZoneMapPanel.tsx`, `src/panels/zonemapColor.ts`, `src/panels/tableLogic.ts`, and `docs/GRAMMAR.md` before writing this spec — the same discipline every prior feature in this project has required, directly answering all three of the user's own "REQUIRED RESEARCH" questions.

1. **`ComparisonDiff` (`layout/types.ts`) is parsed with zero runtime validation** — `parseDashboardConfig()` casts `obj.layout` straight through as `Record<string, PanelConfig[]>` with no per-field type-checking of `comparison`/`a`/`b`/`expr` at all. This means `a`/`b` accepting a new literal sentinel string (`'$baseline'`) alongside an ordinary scenario name requires **zero parser changes** — only a resolution-time check in the query-building code. This directly answers the user's own Research Question 1: a special sentinel value on the *existing* `a`/`b` fields (both already typed `string`) is the correct fit, not a new comparison mode — it reuses `ComparisonDiff`'s type completely unchanged.

2. **`comparison: diff` completely bypasses `sqlExpander.expand()` today, deliberately** — confirmed via `ZoneMapPanel.tsx`'s own comment: `buildComparisonDiffQuery()`'s output "has no $filters/$scenario placeholders to expand," so the panel's data-fetch effect calls it directly, never through `sqlExpander.expand()`. `diff.a`/`diff.b` are interpolated as bare, unvalidated view-name-prefix strings (`` `"${diff.a}__${config.metric}"` ``); an unresolvable name fails naturally when DuckDB runs the query (a "table does not exist" error), caught by the panel's existing `.catch()`. **This means `$baseline` sentinel resolution for `a`/`b` must happen in the CALLER, before `buildComparisonDiffQuery()` is invoked** — the same "caller pre-resolves, function stays pure" convention `activeScenarios`/`018`'s own `baselineScenario` parameter already establish for `sqlExpander.expand()` — not by routing this query through `sqlExpander.expand()` for the first time.

3. **The output column name is already a fixed, hardcoded convention**: `buildComparisonDiffQuery()` always names its computed column `diff_value` (`` `(${diff.expr}) AS diff_value` ``), and `ZoneMapPanel.tsx` already branches its own field-binding on this exact name (`` isComparisonDiff(config.comparison) ? 'diff_value' : config.column ``). **This is the "ONE consistent authoring convention" the user asked for, already half-built**: every panel type this feature touches produces a column literally named `diff_value`, referenced through each panel type's own EXISTING field-binding grammar (`column:` for a future valuebox, `field:` for table, `x:`/`y:`/`color:` for plotly, `x:`/`y:`/`fill:`/`stroke:` for observable-plot) — no new per-panel-type binding keys are needed at all, only the shared mechanism that produces the column.

4. **`comparison: diff` currently ignores the panel's own `filter:` (global sidebar filters) entirely** — a direct, confirmed consequence of finding #2 (no `sqlExpander.expand()` call at all in that code path today). This is this project's own existing, deliberate behavior for zonemap, not something this feature introduces — preserved unchanged for all four panel types (Assumptions).

5. **Research Question 2, resolved**: plotly/table/observable-plot have no existing `metric_id`-equivalent "this column uniquely identifies a comparable row" concept — `zonemap`'s own `metric_id` plays double duty (geometry join key AND, once generalized, the row-matching key for a scenario-vs-baseline diff) only because zonemap's grammar guarantees exactly one row per zone. A generalized mechanism needs an explicit, author-named list of "which column(s) identify a comparable row between the panel's own data and the baseline's" — this spec calls that `compare_on` (Key Entities, FR-006/FR-007) — required for plotly/table/observable-plot, defaulting to `[metric_id]` for zonemap so **existing zonemap `comparison: diff` YAML needs zero changes** to keep working. One shared, generalized query-building mechanism (a generalized form of `buildComparisonDiffQuery()`, taking `compare_on` instead of assuming `metric_id`) is used by all four panel types — not four separate implementations — directly answering Research Question 2's own framing.

6. **Research Question 3, resolved using an already-shipped precedent in this exact codebase**, not a new invention: `docs/GRAMMAR.md`'s own `summarize.yaml` `screenlines` metric already computes a percent-error-style ratio defensively — `` (a.volume - o.aadt) * 1.0 / NULLIF(o.aadt, 0) AS pct_error `` — DuckDB's `NULLIF(x, 0)` turns a zero denominator into `NULL` rather than `Infinity`/`NaN`, and NULL arithmetic propagates to a defined `NULL` result rather than crashing. Since `comparison: diff`'s `expr:` field is *already* a fully free-form SQL string (unchanged grammar), an author authoring a percent-difference formula can already use this exact idiom today — no new formula-computing mechanism is needed. What IS new, and required (FR-013/FR-014): every panel type's own rendering of `diff_value` must treat a `NULL` result as a distinct, defined "not computable" state — the same principle `zonemapColor.ts`'s `resolveZoneFillColor()` already established for a missing metric value (`value === null` → a dedicated "no data" color, never silently blended into the normal color scale or coerced to 0) — extended here to `diff_value` specifically, across all four panel types' own rendering.

7. **New required research question, confirmed directly against all four panel types' real, current source before assuming it — not left as a plan-phase risk**: does each panel type's own data-fetch `useEffect` reactively re-run when the resolved baseline scenario changes (via `hooks/useBaseline.ts`, `018-baseline-scenario-designation`), or would a one-time `appState.getBaseline()` read at mount silently fail to satisfy User Story 1 Acceptance Scenario 2 (recompute on baseline change) and User Story 4 Acceptance Scenario 2 (recover automatically once baseline resolves, no reload)? Checked directly: **all four panel types already follow one identical, established pattern** — call a reactive hook near the top of the component (`useActiveScenarios()`, returning `activeScenarioNames`/`activeScenarios`), then include its return value in the data-fetch effect's own dependency array:
   - `PlotlyPanel.tsx`: fetch effect deps `[config, filters, activeScenarioNames]`
   - `TablePanel.tsx`: fetch effect deps `[config, filters, activeScenarioNames]`
   - `ObservablePlotPanel.tsx`: fetch effect deps `[config, filters, inputValues, activeScenarios]`
   - `ZoneMapPanel.tsx`: fetch effect deps `[config, filters, activeScenarioNames]` — this is the SAME effect that already branches on `isComparisonDiff(config.comparison)` to call `buildComparisonDiffQuery()` (finding #2 above), so the `$baseline`-consuming code path lives in exactly this one existing effect for zonemap, no second effect needed.

   Every one of the four already has a clean, established slot for a fifth reactive dependency — adding `useBaseline()`'s return value to each effect's own array is a direct, structurally-unsurprising extension of a pattern each file already uses for exactly this purpose (reacting to state living outside the panel's own config), not a new pattern being introduced. No panel type's real effect structure presents an obstacle to this. This is formalized as FR-016 below, since FR-002 states the required *outcome* (resolves fresh on every refresh) without explicitly mandating *how* that refresh gets triggered — without FR-016, an implementer could satisfy FR-002's literal wording with a one-time mount read that happens to look correct until a viewer changes baseline without also changing filters/scenarios, silently failing both acceptance scenarios named above.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analyst sees a metric's absolute change from the baseline scenario (Priority: P1)

A calibration analyst has a scenario marked baseline (018-baseline-scenario-designation) and wants a chart/table to show, per row, how much a metric changed relative to that baseline — without hardcoding which scenario is "the baseline" into the panel's own config, so the same dashboard keeps working correctly even after a viewer changes which scenario is marked baseline.

**Why this priority**: This is the core value the entire feature exists to deliver — a working absolute-difference display, dynamically tracking whichever scenario is currently baseline.

**Independent Test**: Author a `plotly`/`table`/`observable-plot` panel referencing `$baseline` for one side of a `comparison: diff`, with a known baseline scenario set; confirm the rendered `diff_value` values equal (this panel's own scenario value − the baseline scenario's value) for each matched row.

**Acceptance Scenarios**:

1. **Given** a panel configured with `comparison: { type: diff, a: '$baseline', b: <this panel's own scenario>, expr: 'b.<column> - a.<column>' }` and a known baseline scenario, **When** the panel renders, **Then** its `diff_value` column/field/trace values equal the correct per-row difference.
2. **Given** the baseline designation later changes to a different scenario, **When** the panel's data next refreshes, **Then** its `diff_value` values are recomputed against the NEW baseline scenario, not the old one.
3. **Given** `013-zonemap-panel`'s existing `comparison: diff` with hardcoded `a`/`b` scenario names (no `$baseline` reference), **When** this feature ships, **Then** it continues to render exactly as before — unaffected.

---

### User Story 2 - Analyst sees a metric's percent change from the baseline scenario (Priority: P1)

The same analyst wants a percent-difference view instead of (or alongside) an absolute one — the standard way calibration/validation work expresses "how far off is this scenario from the reference point."

**Why this priority**: Percent-difference is at least as common a request as absolute difference in calibration work (this app's own existing `threshold_warn`/`threshold_fail`/`pct_error` conventions are already percent-based) — without it, the feature only half-delivers on its own stated purpose.

**Independent Test**: Author a percent-difference `expr:` using the zero-guarded formula (Grammar finding #6); with a baseline scenario whose value is non-zero for some rows and exactly zero for others, confirm non-zero-baseline rows show a correct percentage and zero-baseline rows show a distinct, defined "not computable" state — never `Infinity`, `NaN`, or a silently blank/broken value.

**Acceptance Scenarios**:

1. **Given** a baseline value is non-zero for a given row, **When** the panel renders that row's percent difference, **Then** the value is `(this panel's own value − baseline value) / baseline value`, correctly computed.
2. **Given** a baseline value is exactly zero for a given row, **When** the panel renders that row, **Then** it shows a distinct, defined "not computable" state for that row specifically — never `Infinity`/`NaN`/a broken-looking number, and never silently treated the same as a real `0%` (no change).
3. **Given** a mix of zero- and non-zero-baseline rows in the same result, **When** the panel renders, **Then** each row is judged independently — one row's undefined percent-difference never affects any other row's correctly-computed one.

---

### User Story 3 - The four panel types share one authoring convention, not four (Priority: P2)

A dashboard author who has already learned `comparison: diff` for a `zonemap` panel (from `013-zonemap-panel`) can apply the same mental model — `comparison:`, `a`/`b` (optionally `$baseline`), `expr:`, and a `compare_on:` row-matching key — to a `plotly`, `table`, or `observable-plot` panel with no new concepts to learn beyond the one new `compare_on:` key these three need (zonemap already has an equivalent, `metric_id`, so it needs no new key at all for its own existing use).

**Why this priority**: The user's own explicit requirement — one consistent convention, not four independently invented ones. This is a design-quality bar the whole feature is measured against, not a separable slice of value on its own, hence P2 rather than P1 (User Stories 1 and 2 are what an analyst actually sees; this one is what makes the authoring experience coherent).

**Independent Test**: Compare the `comparison:`/`compare_on:` grammar accepted by all four panel types side by side; confirm identical field names, identical accepted `a`/`b` shapes (hardcoded name or `$baseline`), and an identically-named output column (`diff_value`) across all four.

**Acceptance Scenarios**:

1. **Given** the same `comparison: diff` shape (with `$baseline`) is authored on a `plotly`, `table`, `observable-plot`, and `zonemap` panel, each pointed at a metric with a genuine matching row-identity column, **When** each renders, **Then** each panel's own result set contains a `diff_value` column computed the identical way, referenced through that panel type's own pre-existing field-binding grammar — no panel-type-specific diff-computation quirk.

---

### User Story 4 - The baseline is genuinely unresolved (Priority: P3)

A viewer opens a dashboard before any scenario has finished loading (or after unloading the only eligible scenario), and a panel on screen references `$baseline`.

**Why this priority**: A real, correctly-handled edge case (explicitly required by the user's own brief and `018`'s own established convention), but not the common case — most dashboards will have a resolved baseline by the time a viewer sees them.

**Independent Test**: Load a dashboard with a `$baseline`-referencing panel before any non-`observed` scenario is loaded (or after removing the only one); confirm the panel shows its existing, defined error state — never attempts a query built from an unresolved/undefined scenario name.

**Acceptance Scenarios**:

1. **Given** `appState.getBaseline()` currently resolves to nothing, **When** a panel referencing `$baseline` (directly, in `comparison.a`/`comparison.b`) would otherwise run its query, **Then** it shows its existing error state instead — the same one every other unresolvable panel configuration already produces, not a new, different failure mode.
2. **Given** the baseline later resolves (a scenario finishes loading), **When** the panel's data next refreshes, **Then** it recovers and renders correctly, with no manual reload required.

---

### Edge Cases

- What happens when a row exists in the panel's own scenario's result but has no matching row in the baseline's result (by `compare_on`), or vice versa? Resolved as an inner-join semantics, matching `013-zonemap-panel`'s own existing `buildComparisonDiffQuery()` behavior (a plain SQL `JOIN`, not `LEFT JOIN`) — a row with no match on either side is simply absent from the diffed result, not shown with a fabricated zero/blank value. This is existing, unchanged zonemap behavior generalized, not a new decision.
- What happens when `compare_on` is omitted on `plotly`/`table`/`observable-plot`? See FR-007 — this is a required field for these three when `comparison: diff` is used (no reasonable single-column default exists, unlike zonemap's `metric_id`); its absence is a config-authoring error, surfaced the same defined way as any other missing-required-field misconfiguration.
- What happens when `comparison: diff`'s `a`/`b` are used with `$baseline` but the panel's OWN `scenario:`/`scenarios:` config also restricts to a specific scenario? `b` (or `a`, whichever isn't `$baseline`) is expected to name that same scenario explicitly when comparing "this panel's one scenario vs. baseline" — this feature does not add implicit cross-referencing between `comparison.b` and `config.scenario`; an author names both explicitly, matching zonemap's own existing, fully-explicit `a`/`b` authoring today.
- What happens if BOTH `a` and `b` are `'$baseline'`? Resolves to comparing the baseline scenario against itself — every `diff_value` is trivially zero (or the percent-diff formula's own zero-vs-zero case, per FR-014). Not blocked — a real but degenerate authoring choice, no different in kind from an author hardcoding the same scenario name as both `a` and `b` today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow `comparison: diff`'s existing `a`/`b` fields (on any of `plotly`, `table`, `observable-plot`, `zonemap`) to accept the literal value `$baseline` as a sentinel meaning "whichever scenario currently holds the baseline designation," resolved at query time — coexisting with, not replacing, the existing hardcoded-scenario-name form.
- **FR-002**: System MUST resolve the `$baseline` sentinel to the CURRENT baseline scenario every time a panel's data is (re-)fetched — a change to which scenario is baseline MUST be reflected on the panel's next refresh, not require a page reload.
- **FR-003**: System MUST extend `comparison: diff` (and its `side_by_side`/omitted default, unchanged) to `plotly`, `table`, and `observable-plot` panel types, using the identical field name and shape `zonemap` already uses — not three separately-named or separately-shaped mechanisms.
- **FR-004**: System MUST produce the computed comparison result under a single, consistently-named column (`diff_value`) across all four panel types, referenced through each panel type's own existing, unmodified field-binding grammar (no new per-panel-type binding key is introduced for referencing the result itself).
- **FR-005**: System MUST NOT modify, replace, or regress `013-zonemap-panel`'s existing `comparison: diff` behavior for any panel that does not reference `$baseline` — a hardcoded-name `a`/`b` pair continues to behave exactly as it does today.
- **FR-006**: System MUST provide a single, shared query-building mechanism for computing a `comparison: diff` result, used by all four panel types — not four independent implementations — generalizing `013-zonemap-panel`'s existing `buildComparisonDiffQuery()` rather than duplicating its logic.
- **FR-007**: System MUST let an author specify which column(s) uniquely identify a "comparable row" between the panel's own scenario and the comparison's other side (`compare_on`) — required for `plotly`/`table`/`observable-plot` when using `comparison: diff`; for `zonemap`, this MUST default to its existing `metric_id` when omitted, so no existing zonemap `comparison: diff` configuration needs to change.
- **FR-008**: The comparison-diff query MUST join rows from the panel's own side and the comparison's other side on every column named in `compare_on` — a row present on only one side MUST be excluded from the result (inner-join semantics), matching `013-zonemap-panel`'s own existing, unchanged behavior.
- **FR-009**: `expr:` MUST remain a free-form SQL expression string, unchanged from its existing `zonemap`-only grammar — no new formula-specific mini-language is introduced; an author writes their own absolute-difference or percent-difference formula exactly as `zonemap` authors already do today.
- **FR-010**: System MUST continue to interpolate `expr`/resolved-`a`/resolved-`b` as literal string substitution only — never `eval()`/dynamic code execution (constitution Principle III, unchanged from `013-zonemap-panel`'s own existing convention).
- **FR-011**: When `$baseline` is referenced (in `comparison.a`/`comparison.b`) and no scenario currently resolves as baseline, the panel MUST show its existing, defined error state — the query MUST NOT be built or run against an unresolved/placeholder scenario name.
- **FR-012**: `comparison: diff`'s existing filter-independence (it does not apply the panel's own global `filter:` bindings today, `013-zonemap-panel`'s own current, deliberate behavior) is preserved, unchanged, for all four panel types — this feature does not add filter-awareness to comparison-diff queries.
- **FR-013**: A percent-difference (or any) formula that divides by a value that may legitimately be zero MUST be authored using a zero-guarding idiom that yields a defined `NULL` rather than `Infinity`/`NaN` (the same idiom `summarize.yaml`'s own existing `screenlines` metric already uses: `NULLIF(<denominator>, 0)`) — this is authoring guidance backed by existing SQL-engine behavior, not a new app-level formula mechanism.
- **FR-014**: Every panel type's own rendering of `diff_value` MUST treat a `NULL` value as a distinct, defined "not computable" state — never silently coerced to `0`, never blended into a color scale's normal range the same way a real value would be, and never left to render as a raw `NaN`/`Infinity`/blank artifact — extending `zonemapColor.ts`'s existing `resolveZoneFillColor()` "missing value gets a dedicated color, never the scale's zero/minimum" principle to `diff_value` specifically, across all four panel types.
- **FR-015**: This feature does not alter `docs/GRAMMAR.md`'s panel-type grammar for any field OTHER than adding `comparison`/`compare_on` to `plotly`/`table`/`observable-plot` and the `$baseline` sentinel value to `a`/`b` wherever `comparison: diff` already exists — no other panel-type grammar changes.
- **FR-016**: Every one of the four panel types' own data-fetch effect MUST reactively re-run when the resolved baseline scenario changes, for any panel whose `comparison.a`/`comparison.b` references `$baseline` — a one-time read of the baseline scenario at mount/config-change is insufficient (Grammar finding #7). Concretely: each panel type's own data-fetch effect MUST include `hooks/useBaseline.ts`'s return value in its dependency array, the same established pattern each already uses for `useActiveScenarios()`'s return value — not a new, different reactivity mechanism. This is what makes FR-002's required outcome (resolves fresh on every refresh, tracks a live baseline change with no reload) actually true in the running app, not merely a stated intent.

### Key Entities

- **Baseline-referencing comparison**: The existing `ComparisonDiff` entity (`type: diff`, `a`, `b`, `expr`), unchanged in shape, with one addition in meaning: `a`/`b` may now be the literal string `$baseline` in addition to a hardcoded scenario name — resolved to the current baseline scenario at query time, every refresh.
- **Row-matching key (`compare_on`)**: An author-named list of column(s) that uniquely identify a "comparable row" between the panel's own scenario and the comparison's other side — generalizes `zonemap`'s existing `metric_id` (which remains its own default) to the three panel types that have no equivalent single well-known identity column.
- **`diff_value`**: The single, consistently-named computed result column every comparison-diff query produces, across all four panel types — referenced through each type's own pre-existing field-binding grammar, with `NULL` as its own defined "not computable" state (distinct from a real, computed value, per FR-014).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An analyst can author an absolute-difference view on any of `plotly`/`table`/`observable-plot`/`zonemap` referencing `$baseline`, and see correct, per-row difference values that track the current baseline scenario without further config changes.
- **SC-002**: An analyst can author a percent-difference view the same way, and every row where the baseline value is genuinely zero shows a distinct, defined "not computable" indication — 0% of such rows ever display `Infinity`, `NaN`, or a value that reads as a plausible-but-wrong percentage.
- **SC-003**: The SAME `comparison`/`compare_on`/`$baseline` grammar, with identical field names and shapes, works across all four panel types — confirmed by a side-by-side authoring comparison producing the identically-named `diff_value` output column in every case.
- **SC-004**: 100% of `013-zonemap-panel`'s existing `comparison: diff` test coverage (hardcoded `a`/`b`, no `$baseline`) continues to pass unchanged after this feature ships.
- **SC-005**: Changing which scenario is marked baseline (`018-baseline-scenario-designation`'s own UI) and refreshing a `$baseline`-referencing panel's data shows the recomputed diff against the NEW baseline, with no page reload and no stale value from the previous baseline.

## Assumptions

- `compare_on` accepts one or more column names (a list, even for the common single-column case) — matching `TableColumnConfig.field`'s and every other author-facing field-mapping key's existing "author names real, literal columns present in the queried result" convention in this codebase; the exact YAML shape (a bare string vs. always a list) is confirmed during planning against this project's own established single-vs-list grammar conventions elsewhere, not fixed here.
- This feature's own scope is exactly the four panel types the user named (`plotly`, `table`, `observable-plot`, `zonemap`) — `valuebox`, `sankey`, `flowmap`, `markdown`, and `graphic-walker` are out of scope; none of them gain `comparison`/`compare_on` grammar in this feature.
- `comparison: diff`'s existing filter-independence (FR-012) and inner-join-only semantics (FR-008) are both existing `zonemap` behavior this feature deliberately preserves rather than reconsiders — revisiting either is explicitly out of this feature's scope, a separate future decision if ever needed.
- The shared query-building mechanism (FR-006) is a generalization of `panelQuery.ts`'s existing `buildComparisonDiffQuery()` — the exact resulting function signature/module boundary is a planning-phase decision, not fixed here; this spec only requires that ONE mechanism exists, not where its code lives.
- `$baseline` resolution for `comparison.a`/`comparison.b` reuses `appState.getBaseline()` directly (the same function `018-baseline-scenario-designation` built) — no new baseline-resolution logic of its own.
