# Phase 1 Data Model: Baseline scenario designation (foundation)

## Entity: Baseline designation

Not a new field on `Scenario` (`state/appState.ts`'s existing interface, unchanged) — a separate, module-level pointer alongside the existing `scenarios: Map<string, Scenario>`, mirroring how `subscribers: Set<ScenarioSubscriber>` already lives alongside it.

```ts
// state/appState.ts — new module-level state
let explicitBaseline: string | null = null
```

| Field | Type | Meaning |
|---|---|---|
| `explicitBaseline` | `string \| null` | The scenario name a viewer explicitly marked baseline, or `null` if nothing has ever been explicitly chosen (or the choice was cleared — see resolution rule below). Never read directly by any consumer outside `appState.ts` itself — always read through `getBaseline()`. |

### Resolution rule (`getBaseline()`)

Computed fresh on every call — never cached, never a second stored "resolved" value that could go stale:

1. If `explicitBaseline !== null` **and** `scenarios.has(explicitBaseline)` → return `explicitBaseline`.
2. Else, find the earliest-inserted (`Map` iteration order) entry in `scenarios` where `pinned === false && status === 'ready'` → return its `name`.
3. Else → return `undefined` (no scenario is baseline).

Step 1's existence check is what makes removal (`unregister()`) safe without any dedicated "shift to next" logic — see Mutation Rules below and `research.md` §3.

### Mutation rules

| Operation | Effect on `explicitBaseline` |
|---|---|
| `setBaseline(name)` | Throws if `name` is not a registered scenario (matches `setActive()`/`setStatus()`'s existing "throw on unknown name" convention). Otherwise sets `explicitBaseline = name` and calls `notify()`. Setting it to the name it already holds is a harmless no-op write (still calls `notify()` — subscribers re-rendering on an unchanged value is cheap and matches every other `appState.ts` mutator's behavior, none of which special-case a no-op write today). |
| `unregister(name)` | If `explicitBaseline === name`, sets `explicitBaseline = null` **before** deleting the Map entry (order matters only for clarity, not correctness — `getBaseline()`'s own existence check in step 1 would catch a stale pointer either way, but clearing it explicitly documents the intent directly at the mutation site rather than relying solely on the read-side guard). Then proceeds exactly as today (`scenarios.delete(name)`, `notify()`). |
| `register(name, ...)` | Unchanged — never touches `explicitBaseline`. A newly-registered scenario becomes eligible for the *automatic default* (resolution rule step 2) purely as a side effect of now existing in `scenarios` with the right `pinned`/`status` — no explicit-baseline-related code needed here at all. |
| `setStatus(name, status)` | Unchanged — a scenario transitioning to `'ready'` becomes eligible for the automatic default purely as a side effect of the resolution rule re-evaluating `status` fresh on every call; no dedicated code path needed. |

No other existing `appState.ts` function (`setActive`, `get`, `list`, `getActive`) needs any change.

## Entity: Baseline SQL placeholder

Not a stored entity — a query-time text-expansion rule, structurally identical in shape to the five existing placeholder kinds in `services/sqlExpander.ts`.

| Written in metric SQL | Expands to |
|---|---|
| `$baseline.<metric>` | `"<baseline-scenario-name>__<metric>"` — a single bare, double-quoted view reference |

Resolution source: the caller-supplied `baselineScenario?: string` parameter to `expand()` — itself expected to be `appState.getBaseline()`'s return value at query time, resolved by the caller **before** calling `expand()` (matching `activeScenarios: string[]`'s existing caller-resolves-first convention — `expand()` itself remains a pure function with no direct dependency on `appState.ts`, preserving `sqlExpander.ts`'s existing decoupling, per its own file-header comment and `FilterStateLike`'s duck-typed design).

Failure mode: `baselineScenario === undefined` → `expand()` throws (`missing('baseline.<metric> (no baseline scenario)')`), matching `expandScenario()`'s existing empty-state convention. This feature does not add any new panel-facing config key that supplies this value — no `dashboard-*.yaml` grammar change (FR-011) — only the expander mechanism itself and a direct unit test proving it resolves correctly.

## State transition summary

```
                    ┌─────────────────────────────┐
                    │  explicitBaseline === null   │
                    │  (never chosen, or cleared   │
                    │   by removal)                │
                    └──────────────┬───────────────┘
                                   │ setBaseline(name)
                                   ▼
                    ┌─────────────────────────────┐
        ┌──────────▶│  explicitBaseline === name  │
        │           └──────────────┬───────────────┘
        │                          │
        │ setBaseline(otherName)   │ unregister(name)
        │ (moves, doesn't clear)   │ (clears back to null)
        └──────────────────────────┘
```

`getBaseline()`'s resolution rule (above) is what's actually queried by every consumer at all times — this diagram describes only the `explicitBaseline` pointer's own lifecycle, which is one input to that rule, not the full resolved-baseline lifecycle (the automatic default portion of the rule has no "state" of its own — it's recomputed from `scenarios` on every call).
