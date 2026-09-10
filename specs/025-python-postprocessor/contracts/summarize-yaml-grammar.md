# Contract: `summarize.yaml` grammar conformance

This feature does not define a new grammar — it is an *implementation* of
the grammar `project-docs/GRAMMAR.md` already documents under "`summarize.yaml`"
(lines ~121–722 as read this session) and "SQL placeholder reference"
(`$mappings.x`, `$bins.x`, `$sql.x` rows only — `$filters`/`$scenario`/
`$inputs`/`$baseline` belong to `dashboard-*.yaml` and are explicitly out of
this pipeline's scope, since `summarize.yaml` is never read by the browser).

**The contract is**: given any `summarize.yaml` that conforms to
`project-docs/GRAMMAR.md`'s documented grammar, this pipeline MUST parse it without
error and produce correct output for every metric, for arbitrarily-named
sources/mappings/bins/fragments/metrics (FR-007's genericity requirement).
`project-docs/GRAMMAR.md` itself is the authoritative grammar reference — this
document does not duplicate it, only points at the specific sections a
conforming implementation must satisfy, plus records the one confirmed gap
in that document's own worked example:

- **Confirmed gap in `project-docs/GRAMMAR.md`'s own example** (not a contract this
  pipeline needs to bridge, recorded here so it isn't lost): the example
  `screenlines`/`vmt_by_facility`/`vmt_by_home_taz` metrics reference
  `assignment` and `observed_counts` tables that never appear under the
  example's own `sources:` block. A real `summarize.yaml` author must
  declare every table any metric's SQL touches under `sources:` — this
  pipeline has no fallback that guesses a table exists just because a
  metric mentions it (spec.md Edge Cases, data-model.md's `Source` entity).

## Placeholder expansion — must match `services/sqlExpander.ts` output shape

For the three placeholder kinds `summarize.yaml` uses (`$mappings.x`,
`$bins.x`, `$sql.x`), this pipeline's Python expansion functions
(`postprocessor/expand.py`) must produce SQL text equivalent in structure
and semantics to what `services/sqlExpander.ts`'s `expandMappings()`/
`expandBins()`/`expandSqlFragment()` produce for the same input — confirmed
directly against that file's real source this session, not assumed from
`project-docs/GRAMMAR.md`'s prose alone (research.md §4 records the one place the
doc's own illustration and the real code diverge: no `ELSE` clause is
emitted by `$mappings.x` itself).

## What is explicitly NOT part of this contract

- `dashboard-*.yaml`'s own grammar (panel types, `$filters`/`$scenario`/
  `$inputs`/`$baseline`) — untouched by this feature (spec.md "Does not
  include").
- `manifest.yaml`'s grammar is a contract this feature *produces against*
  (see `data-model.md`'s `Manifest` entity), not one it *reads* — this
  pipeline never reads an existing `manifest.yaml`.
