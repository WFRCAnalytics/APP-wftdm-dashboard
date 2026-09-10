# Phase 1 Data Model: All Loaded Scenarios Participate by Default

This feature introduces **no new entity and no schema change**. It changes *when*
one existing field is set during discovery, and it edits the values of existing
optional keys on existing panel-config objects. Both are documented below.

---

## Entity: `Scenario` (`src/state/appState.ts`) — unchanged shape

| Field | Type | Change |
|---|---|---|
| `name` | `string` | none |
| `active` | `boolean` | **activation timing changes** (see below). Field, type, `setActive()` API all unchanged. |
| `status` | `'registering' \| 'ready' \| 'failed'` | none — now *read by* `scenarioDiscovery.ts` to gate activation |
| `pinned` | `boolean` | none (`observed` stays `pinned: true`) |
| `source` | `'url' \| 'handle'` | none |
| `path`, `order`, `label`, `colorOverride`, `color`, `runDate`, `notes` | — | none |

### State transition change — `active`

**Today** (`services/scenarioDiscovery.ts`):

```
registerObserved()        → setActive('observed', true)   UNCONDITIONALLY (even on status 'failed')
registerPublishedScenarios() → (never calls setActive)
registerDemoScenarios()   → (never calls setActive)
applyURLParams()          → setActive(name, true) for each ?s= that matches a registered entry
```

**After**:

```
registerObserved()        → setActive('observed', true)   ONLY in the status-'ready' success branch
registerPublishedScenarios() → setActive(name, true)      in the status-'ready' success branch, per scenario
registerDemoScenarios()   → setActive(name, true)         in the status-'ready' success branch, per scenario
applyURLParams()          → UNCHANGED (still add-only, still last)
scenario/scenarioManager.ts (local folder load) → UNCHANGED (already setActive on success)
```

Invariant after this change: **`active === true` ⇒ the scenario reached
`status === 'ready'` at least once** (a later viewer `setActive(name, false)` via
the Switch can make a `ready` scenario inactive; nothing makes a `failed`
scenario active except an explicit `?s=` naming it — and a `failed` entry has no
views, so that union still errors per-panel exactly as today, unchanged).

Derived state `getBaseline()` is **unaffected** — it already resolves against
`pinned === false && status === 'ready'`, independent of `active`, and this
feature does not touch it (confirmed: no `$baseline` panel in the demo).

---

## Config object: panel entry in `dashboard-*.yaml` — key-value edits only

The `scenario` / `scenarios` / `color` / `name` / `series` / `fill` keys are all
**pre-existing**, with unchanged meaning (`layout/types.ts`,
`panels/panelQuery.ts`, `services/sqlExpander.ts`). This feature only edits their
presence/value on demo and fixture panels, per
`contracts/demo-panel-disposition.md`.

| Disposition | Key edit | Semantic effect |
|---|---|---|
| `UNPIN` | delete `scenario:` (or `scenarios:`) | panel's query switches from `"{scenario}__{metric}"` direct view ref to `$scenario` `UNION ALL` across the active set; `TablePanel`/`GraphicWalkerPanel` render the added `scenario` discriminator column/field |
| `UNPIN+CH` | delete `scenario:`; **add** `name: $scenario` (plotly) or `fill: scenario` (observable-plot) | as `UNPIN`, **plus** the renderer splits one series per distinct scenario value instead of overplotting |
| `UNLIST` | replace `scenarios: [a, b, c]` with no key | panel's query switches from `resolveActiveScenarios()` returning the explicit list to returning `activeScenarioNames`; existing `series:`/(sankey none) channel unchanged |
| `KEEP+NOTE` | keep `scenario: activitysim-baseline` (rewrite a list to this singular form if needed); **add/extend** `description:` | query unchanged (direct view ref); panel gains a plain-text baseline-scope caption |

No key is added that `layout/types.ts` does not already parse. `description` is an
existing optional field on every panel config.

### Fixture config edits (`tests/fixtures/dashboard-config/*.yaml`)

| Panel | Edit | Reason |
|---|---|---|
| `Total Households`, `Total Trips` (dashboard-1) | add `scenarios: [observed]` | make the test's single-scenario expectation explicit (FR-012), now that `good_scenario` also auto-activates |
| `Average Trip Distance` (dashboard-2) | add `scenarios: [observed]` | same |
| `Scenario Split (*)` ×4, `Free-form Visual Analytics (Multi-Scenario)` ×2 | **no edit** | these panels' tests already declare `?s=good_scenario`; they exist to exercise the union |
| `*(intentional)` / `*Broken*` ×3 | **no edit** | error-state tests, independent of the active set |

---

## No changes to

- `state/filterState.ts`, `hooks/useActiveScenarios.ts`, `hooks/useBaseline.ts`,
  `hooks/useScenarioList.ts`, `hooks/useScenarioDisplay.ts` — the reactive
  Switch → panel path already exists and is used unchanged.
- `services/sqlExpander.ts` `$scenario` / `$baseline` expansion.
- `panels/panelQuery.ts` `resolveActiveScenarios()` /
  `buildComparisonDiffQuery()` / `resolveComparisonScenarioName()`.
- Any panel component (`TablePanel`, `PlotlyPanel`, `RechartsPanel`,
  `ObservablePlotPanel`, `SankeyPanel`, `ValueBoxPanel`, `ZoneMapPanel`,
  `FlowMapPanel`, `GraphicWalkerPanel`) — all already handle their
  disposition-category behaviour; this feature only feeds them different config.
- `state/appState.ts` — `setActive()` / `active` unchanged; no new export.
