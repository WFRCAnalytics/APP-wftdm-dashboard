# Phase 1 Data Model: Viewer-Selectable Dataset Picker for Graphic Walker Panels

No persisted entities — everything here is either (a) a config-file field
parsed at runtime (Principle IV) or (b) transient, derived, in-memory state
recomputed on demand. Nothing in this feature is written to storage of any
kind (Principle VI).

## 1. `GraphicWalkerPanelConfig` (extended)

Existing type, `src/layout/types.ts`. One new optional field:

```ts
export interface GraphicWalkerPanelConfig extends PanelConfigBase {
  type: 'graphic-walker'
  dataset: string          // unchanged — still required (research.md §6);
                            // the picker's initial/default selection when
                            // dataset_picker is true
  limit?: number
  scenario?: string        // unchanged
  fields?: GraphicWalkerFieldOverride[]  // unchanged
  dataset_picker?: boolean // NEW — opt-in, absent/false by default.
                            // When true, the panel shows a viewer-facing
                            // control listing every dataset queryable
                            // across the active scenario(s) (or, if
                            // `scenario` is also pinned, across that one
                            // scenario) and lets the viewer switch it.
}
```

**Validation rules**:
- `dataset_picker` is a plain boolean; any other value (per this app's
  existing loose-YAML-parsing convention — no schema validator exists for
  panel configs today) is treated as falsy, matching how every other
  optional boolean-shaped config field in this codebase is already
  consumed (no new validation layer introduced).
- No new relationship to `scenario`/`dataset` beyond what research.md §5/§6
  already describes — both remain valid alongside the new field with no
  additional constraint.

## 2. Selectable Dataset (derived, not stored)

Not a persisted entity — a computed value, recomputed by the new pure
module `panels/graphicWalkerDatasets.ts` every time it's consulted (on
mount, and whenever the active scenario set changes).

```ts
/**
 * Returns every metric name backed by a real `{scenario}__{metric}` view
 * for EVERY name in `scenarioNames` (intersection, not union — research.md
 * §3), excluding any view that isn't scenario-prefixed at all (research.md
 * §2). Pure — takes the current view list and scenario list as plain
 * arguments, no I/O of its own.
 *
 * @param viewNames   listViews()'s current output
 * @param scenarioNames  the scenario name(s) to intersect against — either
 *   useActiveScenarios()'s full result, or a single pinned `[config.scenario]`
 *   (research.md §5)
 * @returns metric names, sorted alphabetically (deterministic — FR-011)
 */
export function listSelectableDatasets(
  viewNames: readonly string[],
  scenarioNames: readonly string[],
): string[]
```

**Fields** (conceptual, not a stored record):
- `name: string` — the bare metric name a viewer sees and picks, identical
  in form to how a dashboard author already writes `dataset:` for any
  Graphic Walker panel.

**Lifecycle**: computed fresh on every call; never cached beyond a single
render's `useMemo` (if used) keyed on `(viewNames, scenarioNames)`. No
eviction/staleness concern — it's always derived from the current live
state, not snapshotted.

## 3. Component state (`GraphicWalkerPanel.tsx`)

Extends the existing state shape from `014-graphic-walker-panel`
(`status`, `rows`, `fields`) with one new piece:

- `selectedDataset: string` — initialized to `config.dataset`; updated only
  by the viewer choosing a different entry from the picker. **Never**
  persisted (page reload / panel remount resets it back to
  `config.dataset` — Principle VI, spec Assumptions).

**State transitions**:

```
mount
  └─ selectedDataset = config.dataset
  └─ query effect runs (status: loading → ready|empty|error)

viewer picks a different dataset from the picker
  └─ selectedDataset = <picked value>
  └─ query effect re-runs against the new effective config
  └─ status: loading → ready|empty|error
  └─ Graphic Walker's own internal chart-binding state is discarded as a
     natural consequence of `<GraphicWalker>` receiving entirely new
     `data`/`fields` props — no explicit "reset" call needed beyond
     letting the existing re-render happen (FR-008/SC-005)

active scenario set changes (elsewhere in the dashboard)
  └─ available-datasets list is recomputed
  └─ deactivating a scenario can only WIDEN the intersection (research.md
     §3) — never removes the currently selected dataset from
     selectability on its own
  └─ activating a NEW scenario that lacks a `{newScenario}__{selectedDataset}`
     view is the real failure case: selectedDataset drops out of the
     recomputed list, and the existing query effect's own `$scenario.`
     union (now spanning the newly-widened active set) fails to resolve
     that one added clause — its existing failure path already produces a
     clear error state (FR-012); no new state machine branch needed, since
     the underlying SQL simply stops resolving
```
