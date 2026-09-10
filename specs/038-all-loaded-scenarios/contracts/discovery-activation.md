# Contract: Scenario auto-activation during discovery

**Surface**: `src/services/scenarioDiscovery.ts` — the boot-time
`discoverScenarios()` sequence. This is an internal application contract (no
public API, no CLI, no network endpoint) governing which scenarios are `active`
after boot.

## Rule

> A scenario is marked `active` at boot **if and only if** its own registration
> reaches `status === 'ready'`. This holds uniformly for all three discovery
> paths — `registerObserved()`, `registerPublishedScenarios()`,
> `registerDemoScenarios()`. There is no other condition and no branching on
> content root (fixture vs. demo vs. production).

## Behavioural requirements

| ID | Given | When | Then |
|---|---|---|---|
| DA-1 | `observed/summary/index.json` fetches OK and its Parquet views register | `registerObserved()` completes | `appState.get('observed').active === true`, `status === 'ready'` |
| DA-2 | `observed/` is empty (no `summary/index.json`) — the real demo | `registerObserved()` completes | `status === 'failed'`, `active === false` (was `true` before this feature) |
| DA-3 | `scenarios/index.json` lists `["good_scenario", "broken_scenario"]`; `good_scenario` registers OK, `broken_scenario` throws | `registerPublishedScenarios()` completes | `good_scenario.active === true`; `broken_scenario.active === false`, `status === 'failed'` |
| DA-4 | `demo-scenarios/index.json` lists the three `activitysim-*` runs, all register OK | `registerDemoScenarios()` completes | all three `.active === true`, `status === 'ready'` |
| DA-5 | Boot with `?s=broken_scenario` (a `failed` entry) | `applyURLParams()` runs after the three registration functions | `broken_scenario.active === true` (param is add-only and honoured for any registered entry), but its `$scenario` union still errors per-panel exactly as today — unchanged behaviour |
| DA-6 | Boot with `?s=good_scenario` when `good_scenario` already auto-activated | `applyURLParams()` runs | no change — `setActive(name, true)` is idempotent; the param never *reduces* the set (FR-003) |
| DA-7 | A scenario transitions to `status === 'ready'` after first paint (slow fetch / local folder load) | its registration success branch runs | it is `setActive(…, true)` in that branch; `useActiveScenarios()` subscribers (unpinned panels) re-render with no reload (FR-004) |
| DA-8 | Zero scenarios reach `ready` (all folders failed) | boot completes | active set is empty; every unpinned `$scenario` panel shows its existing per-panel empty/error state; **no crash** (unchanged from today) |

## Non-requirements (explicitly not changed)

- `applyURLParams()` logic, ordering (last), and add-only semantics.
- `scenario/scenarioManager.ts`'s local-folder load path (already activates on
  success).
- `getBaseline()` — resolves on `pinned`/`status`, never `active`.
- The `$scenario` expansion in `services/sqlExpander.ts` and the
  `missing("scenario.{metric} (no active scenarios)")` error it throws when the
  active set is empty.

## Verification

- Unit: not applicable (discovery is integration-level; `appState` shape
  unchanged so no `appState.test.ts` change).
- Integration (`tests/integration/boot.spec.ts` + `scenarioManager.spec.ts` +
  `settingsModal.spec.ts`): assert DA-1..DA-8 against the fixture content root
  (fixture `observed` + `good_scenario` are `ready`, `broken_scenario` is
  `failed`). Existing assertions that expected "only `observed` active" on a
  plain boot are updated to expect the fixture ready-set (`observed` +
  `good_scenario`) — this is the contract's own output, not a workaround.
