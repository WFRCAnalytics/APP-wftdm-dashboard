# Data Model: Scenarios Tab Redesign

This feature adds **no new entity and no new field**. It adds one new operation
on existing state and changes only presentation/interaction.

## §1. `Scenario` (existing, `state/appState.ts`) — unchanged

Every field is read/written as-is:

| Field | Type | Used by this feature |
|---|---|---|
| `name` | `string` | row identity, drag `id`, all mutator calls |
| `order` | `number` | **re-sequenced** by the new `reorderScenario()` (below) |
| `active` | `boolean` | Switch `checked` (FR-001 — verified correct, not changed) |
| `label` | `string \| undefined` | name `<input>` value (unchanged) |
| `color` / `colorOverride` | `string \| undefined` | color swatch (unchanged) |
| `status` | `'registering' \| 'ready' \| 'failed'` | status dot + border/bg treatment (unchanged) |
| `source` | `'url' \| 'handle'` | remove button visibility (unchanged) |
| `path` | `string` | monospace path line (unchanged) |

## §2. `appState.reorderScenario(name, targetIndex)` — NEW

```ts
/**
 * 037-scenarios-tab-redesign: moves `name` to `targetIndex` in DISPLAY
 * order (listByDisplayOrder()'s ordering), re-sequencing every scenario's
 * `order` field to `0, 1, 2, …` across the resulting arrangement. The
 * single source of truth for reordering — both drag-and-drop (drag-end
 * {active,over} indices) and the up/down arrow buttons (moveScenario,
 * reimplemented below) funnel through it (FR-004).
 *
 * `targetIndex` is clamped to [0, count-1]. Moving to the same index is a
 * no-op that still calls notify() (matching moveScenario()/setBaseline()'s
 * "harmless no-op still notifies" precedent). Throws on an unregistered
 * name, matching setActive()/setBaseline()/moveScenario()'s convention.
 *
 * Never touches `active`, `label`, `color`, `status`, or the baseline
 * pointer — getBaseline() still never reads `order`, so the automatic-
 * default baseline is structurally unaffected (unchanged guarantee).
 */
export function reorderScenario(name: string, targetIndex: number): void
```

**Behavior**:
1. `throw` if `scenarios.get(name)` is undefined.
2. `ordered = listByDisplayOrder()`; `from = ordered.findIndex(s => s.name === name)`.
3. `to = clamp(targetIndex, 0, ordered.length - 1)`.
4. If `from === to`: `notify()`, return.
5. Splice `name` out of `ordered` at `from`, insert at `to`.
6. Reassign `entry.order = i` for each `entry, i` in the new arrangement.
7. `notify()`.

## §3. `appState.moveScenario(name, direction)` — REIMPLEMENTED (same signature, same observable behavior)

```ts
export function moveScenario(name: string, direction: 'up' | 'down'): void {
  const entry = scenarios.get(name)
  if (!entry) throw new Error(`appState.moveScenario: "${name}" was never registered`)
  const ordered = listByDisplayOrder()
  const index = ordered.findIndex((s) => s.name === name)
  reorderScenario(name, index + (direction === 'up' ? -1 : 1))
}
```

- A boundary move (`up` at index 0, `down` at the last index) resolves to
  `reorderScenario(name, index)` after clamping — a `notify()`-only no-op,
  identical to today's boundary behavior.
- Every existing `moveScenario` unit + Playwright test MUST still pass
  unchanged after this reimplementation (regression gate).

## §4. UI element inventory for the redesigned row (contract detail in `contracts/scenarios-tab-row.md`)

| Region | Before (036) | After (037) |
|---|---|---|
| Leading edge | status dot + optional "Loading…" | **drag handle (`GripVertical`) + up/down arrow column**, then status dot + optional "Loading…" |
| Identity block, line 1 | name `<input>` (`w-full`) | name `<input>` (`flex-1 min-w-0`) + **baseline chip** (`shrink-0`) |
| Identity block, line 2 | monospace path | monospace path (unchanged) |
| Actions cluster | Switch, color swatch, **up/down arrows**, Star/Star+text baseline control, remove-if-handle | Switch (**+ tooltip**), color swatch, ~~up/down arrows~~ (moved to leading edge), ~~Star control~~ (replaced by the chip in the identity block), remove-if-handle |
| Row container | border/bg status treatment | unchanged; also the `@dnd-kit` sortable node (transform/transition styles applied while dragging) |

No field on `Scenario` and no module other than `appState.ts` +
`layout/settings/scenariosTab.tsx` (+ optional `scenarioRow.tsx`) changes.
