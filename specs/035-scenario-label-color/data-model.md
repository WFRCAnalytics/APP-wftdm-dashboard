# Data Model: Scenario Label Propagation & Color Override

## §1. `Scenario` (extended) — `state/appState.ts`

One new optional field, alongside the existing `label?: string`:

```ts
export interface Scenario {
  // ...existing fields unchanged: name, source, path, status, active,
  // pinned, order, label, color (manifest-sourced, existing since
  // 025-python-postprocessor/009-scenario-manager)...

  /** 035-scenario-label-color (FR-009/FR-013): a viewer-chosen color
   * override for this scenario's display, for the current session only.
   * `undefined` means "no override — use the manifest `color` field
   * instead (§2 below), or that panel type's own default cycling if
   * `color` is also absent." A CSS color string, e.g. "#4e79a7" — the
   * exact shape a native `<input type="color">`'s `onChange` produces.
   * Lives directly on this object (not a separate Map/module) so
   * unregister() discards it for free, mirroring `label`'s own
   * confirmed behavior — no special-cased cleanup path exists or is
   * needed. */
  colorOverride?: string
}
```

New exports, mirroring `setLabel()`/`clearLabel()` exactly (look up by
name, throw if not found, mutate in place, `notify()`):

```ts
export function setColorOverride(name: string, color: string): void
export function clearColorOverride(name: string): void
```

## §2. `ScenarioDisplayMap` — `panels/scenarioDisplay.ts` (new)

```ts
export interface ScenarioDisplay {
  /** label ?? name is NOT pre-applied here — callers resolve it via
   * resolveScenarioLabel() below, so a map entry with `label: undefined`
   * still round-trips correctly to the real name. */
  label?: string
  /** Already fully resolved: colorOverride ?? manifest color ?? undefined
   * (FR-007/FR-008/FR-011's precedence, computed once in
   * hooks/useScenarioDisplay.ts — never re-derived per call site). */
  color?: string
}

export type ScenarioDisplayMap = ReadonlyMap<string, ScenarioDisplay>

/** display.get(name)?.label ?? name — the one substitution rule every
 * display surface in this feature uses (FR-001). Safe to call with a
 * name not present in the map (falls through to the real name, same as
 * "no scenario registered under this name yet"). */
export function resolveScenarioLabel(name: string, display: ScenarioDisplayMap): string

/** display.get(name)?.color — undefined when no override AND no manifest
 * color exist, letting the caller fall through to its own panel type's
 * default palette behavior (FR-008). Never invents a color. */
export function resolveScenarioColor(name: string, display: ScenarioDisplayMap): string | undefined
```

Both functions are pure, synchronous, and side-effect-free — no `state/
appState.ts` import, no React import (research.md §2).

## §3. `hooks/useScenarioDisplay.ts` (new)

```ts
export function useScenarioDisplay(): ScenarioDisplayMap
```

`useSyncExternalStore(appState.subscribe, getSnapshot)`, mirroring
`hooks/useActiveScenarios.ts`'s existing shape (a memoized-cache
`getSnapshot`, since `appState.list()` builds a new array every call —
the same reason that hook's own cache exists). `getSnapshot` builds a
fresh `Map<string, ScenarioDisplay>` from `appState.list()`, one entry per
registered scenario (not just active ones — a `comparison: diff` panel or
a Recharts panel including a currently-inactive-but-just-deactivated
scenario in its last-fetched rows should still resolve correctly rather
than silently falling back to the raw name mid-transition), with `color:
s.colorOverride ?? s.color` already resolved (§2's `ScenarioDisplay.color`
contract).

## §4. Extended pure-function signatures (all additive, all optional 3rd/4th params — every existing call site with no 3rd/4th argument keeps its exact current behavior)

```ts
// panels/plotlyTraces.ts
export function resolveTraces(
  trace: PlotlyTraceConfig,
  rows: Record<string, unknown>[],
  scenarioDisplay?: ScenarioDisplayMap,   // NEW, optional
): Partial<Plotly.PlotData>[]

// panels/rechartsEncoding.ts
export function encodeRechartsData(
  rows: readonly Record<string, unknown>[],
  config: Pick<RechartsPanelConfig, 'x' | 'y' | 'series'>,
  scenarioDisplay?: ScenarioDisplayMap,   // NEW, optional
): EncodedRechartsData

// panels/observablePlotEncoding.ts
export function resolveObservablePlotEncoding(
  config: ObservablePlotPanelConfig,
  rows: Record<string, unknown>[],
  scenarioDisplay?: ScenarioDisplayMap,   // NEW, optional
): ResolvedObservablePlotEncoding
```

`TablePanel.tsx`'s own cell-render branch is not a shared pure-function
signature change — it's a direct, local conditional in that component's
existing render loop (`layout tree, §5 of plan.md`'s Project Structure
table already documents `tableLogic.ts` itself is unchanged).

## §4a. Where `Scenario.color` actually comes from (real, confirmed during implementation)

`Scenario.color` is populated at registration time by `services/
scenarioDiscovery.ts`'s new `fetchScenarioManifest()` helper (for the
`public/observed/`/`public/scenarios/*`/`public/demo-scenarios/*`
discovery paths) or by `scenario/scenarioManager.ts`'s existing
`manifest?.color` read (for a locally-loaded folder) — both now share one
extraction function, `scenario/manifestReader.ts`'s `manifestFromObject()`.
Before this feature, only the local-folder path ever populated this field
at all (research.md §8 has the full, real finding).

## §5. State transitions

- **Set/change a label** (`appState.setLabel`, unchanged from `020`):
  `Scenario.label` updates → `notify()` → `useScenarioDisplay()`'s
  snapshot changes → every subscribed panel component re-renders → the
  four extended pure functions re-run with the new `ScenarioDisplayMap` →
  FR-005 (reactive, no reload).
- **Set/clear a color override** (`appState.setColorOverride`/
  `clearColorOverride`, new): identical propagation path, one hop later
  in the same map (`color` instead of `label`) → FR-012 (reactive, no
  reload).
- **Unregister a scenario**: `Scenario` object is deleted from the
  `scenarios` Map in full — `label` and `colorOverride` both discarded
  with it, no separate step (FR-014, `§1`'s own inline comment).
- **Page reload**: `state/appState.ts` is a fresh module load — `label`/
  `colorOverride` both start `undefined` again on every scenario as it
  re-registers, matching FR-013/SC-005 (never persisted).
