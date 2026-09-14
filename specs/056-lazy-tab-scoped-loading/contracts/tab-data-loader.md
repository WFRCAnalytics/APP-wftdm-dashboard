# Contract: `services/tabDataLoader.ts`

New module. The one new internal interface this feature introduces —
consumed by `layout/dashboardRenderer.tsx` and every data-bound panel
component's existing fetch effect.

## `computeTabDataRequirement(tab, activeScenarios): {scenario, metric}[]`

Pure function (no I/O), per data-model.md entity 1. Given a
`DashboardTabConfig` and the current active-scenario name list, returns the
deduplicated pair list. Same testing shape as `dashboardLayout.ts`'s
existing pure functions — a dedicated Vitest unit-test file, no DOM/network
needed.

**Contract**:
- Never mutates `tab` or any panel config.
- Deterministic — same `tab`/`activeScenarios` input always produces the
  same pair list, same order (sorted by `{scenario}__{metric}` string, for
  stable test snapshots).
- A panel referencing a metric that doesn't exist in any real scenario
  still produces a pair (this function does not validate existence — that
  is `ensureRegistered()`'s job, at load time, exactly mirroring how
  `buildPanelQuery()` today never validates a metric name either).

## `ensureRegistered(pairs): Promise<void>`

Per data-model.md entity 4.

**Contract**:
- Idempotent and safe to call concurrently/redundantly with overlapping
  `pairs` from multiple callers (`DashboardRenderer`'s tab-wide call and
  an individual panel's own narrower call) — no pair is ever registered
  twice, no caller's promise resolves before that pair's own real
  registration attempt (success or failure) completes.
- Resolves once every named pair has reached `loaded` **or** `failed` —
  never resolves early leaving a pair still `loading`.
- Rejects only when at least one named pair is `failed` after its retry —
  the rejection identifies which pair(s) failed, so a calling panel can
  distinguish "my specific metric failed" from an unrelated pair in the
  same batch failing (a batch call naming 6 pairs where only 1 fails must
  not fail the other 5's callers).
- Never throws synchronously — matches every existing `services/duckdb.ts`
  export's own all-async contract.
- A pair whose scenario is not currently registered in `appState` at all
  (e.g., a config typo naming a scenario that was never discovered) is
  treated as an immediate, non-retried failure for that pair only — same
  "fail fast, don't block siblings" shape as a genuinely missing metric
  file.

## `getMetricLoadState(scenario, metric): 'not-requested' | 'loading' | 'loaded' | 'failed'`

Read-only, synchronous. Exists for the one caller that needs it without
wanting to trigger a load itself: the GraphicWalker dataset picker, to
visually distinguish an already-loaded catalog entry from one that will
trigger a fresh load on selection (a presentational nicety, not required by
any FR — omit from a first implementation pass if it adds scope, since
`ensureRegistered()` alone already satisfies every functional requirement).

## Non-goals

- No unregister/evict path — out of scope (data-model.md's State
  Transitions: `loaded` never moves backward).
- No cross-tab prefetching/speculative loading — a tab's data loads only
  when that tab (or a newly-activated scenario while already on it) needs
  it, never ahead of time for a tab the viewer hasn't visited.
- Does not change `services/duckdb.ts`'s own exported contract at all —
  `registerFileURL()`, `query()`, `queryArrow()`, `listViews()` keep their
  exact existing signatures and behavior; this module is a new caller of
  the first of those, not a replacement for any of them.
