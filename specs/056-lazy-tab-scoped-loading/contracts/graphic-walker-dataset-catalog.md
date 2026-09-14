# Contract: GraphicWalker dataset picker under lazy loading

Amends `panels/graphicWalkerDatasets.ts`'s existing `listSelectableDatasets()`
contract (028-graphic-walker-dataset-picker) — signature and intersection
semantics unchanged, **input source changed**.

## Before (current, eager-boot behavior)

```ts
listSelectableDatasets(viewNames: readonly string[], scenarioNames: readonly string[]): string[]
```

`viewNames` came from `services/duckdb.ts#listViews()` — safe only because
eager boot guaranteed every real metric was already registered by the time
any panel rendered.

## After (this feature)

```ts
listSelectableDatasets(availableMetricsByScenario: ReadonlyMap<string, readonly string[]>, scenarioNames: readonly string[]): string[]
```

`availableMetricsByScenario` is built by the caller (`GraphicWalkerPanel.tsx`)
from each active scenario's `appState.get(name)?.availableMetrics` (data-
model.md entity 3) — real, complete, and available regardless of load
state. The function's own intersection-across-scenarios logic is
**unchanged** — same exclusion of non-metric names is unnecessary in the
new source (the catalog only ever contains real per-scenario metric
filenames), so the `zonemap-geom__` prefix-filtering this function
currently does becomes dead code for this path and should be removed only
if `listViews()` has no other caller needing that filter after this change
(check before deleting — do not assume).

## Selection behavior (new)

On selecting a catalog entry not yet `loaded` (`getMetricLoadState`,
contract above), `GraphicWalkerPanel.tsx`'s existing fetch effect gains the
same `await ensureRegistered([...])` step every other panel type gains —
no new mechanism specific to this panel type, satisfying spec.md FR-008
via the shared primitive rather than a bespoke one.

## Regression guard

`filterSchemaConsistent()` (the existing second pass that excludes a
metric whose real columns differ between scenarios — confirmed real via
`vmt_by_home_taz`'s 2-vs-3-column mismatch, 028's own finding) still needs
each candidate's real column list to check consistency, which today comes
from a live `information_schema.columns` query against an already-
registered view. Under lazy loading, a catalog entry offered but not yet
loaded has no such live schema to check yet. **Decision, not yet resolved
by this document — flag for `/speckit-tasks`**: either (a) defer this
check until the moment of selection (query `information_schema.columns`
only after `ensureRegistered()` resolves, and warn/fall back if the
just-loaded metric turns out schema-inconsistent with an already-loaded
sibling scenario's copy), or (b) accept that an unloaded catalog entry is
offered without this guard and let the resulting `$scenario.` UNION query
fail with today's existing error surface if it's truly inconsistent,
same as any other real query failure. Needs a decision during `/speckit-
tasks`/implementation, informed by how often this mismatch is expected to
occur in practice (028's own research: currently exactly one real metric,
`vmt_by_home_taz`, in the fixture data) — not decided here because it is a
UX trade-off (silent narrower offering vs. a real but rare load-time
failure), not a technical constraint either option is blocked on.
