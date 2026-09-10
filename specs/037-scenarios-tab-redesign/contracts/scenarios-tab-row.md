# UI Contract: Redesigned Scenarios Tab Row

The Scenarios tab (`layout/settings/scenariosTab.tsx`) renders one row per
registered scenario, in `appState.listByDisplayOrder()` order, inside a single
`bg-card` surface with a summary band above. This contract specifies the
redesigned row; regions not listed are carried over from `036` unchanged.

## Row anatomy (left → right)

1. **Drag handle** — a `GripVertical` (`lucide-react`) icon button, `shrink-0`,
   at the row's leading edge.
   - Spreads `@dnd-kit/sortable` `useSortable()` `attributes` + `listeners`.
   - `aria-label`: `Reorder ${name}` (or equivalent); focusable; part of the
     tab order.
   - Cursor `grab` at rest, `grabbing` while dragging.
2. **Up/down arrow column** — the existing two `ChevronUp`/`ChevronDown` ghost
   icon buttons, `shrink-0`, immediately after the drag handle.
   - `aria-label` text UNCHANGED: `Move ${name} up` / `Move ${name} down`.
   - `disabled` when at the first / last display position (UNCHANGED).
   - `onClick` calls `appState.moveScenario(name, 'up'|'down')` (UNCHANGED
     call site; the function is reimplemented internally, §3 of data-model.md).
3. **Status indicator** — dot (`role="status"`, `aria-label` = the status
   label, `data-testid="scenario-status-dot-${name}"`) + a `"Loading…"` text
   span only while `status === 'registering'`. UNCHANGED from `036`.
4. **Identity block** (`min-w-0 flex-1`):
   - **Line 1** — a flex row: name `<input data-testid="scenario-name">`
     (`flex-1 min-w-0 truncate`) + the **baseline chip** (`shrink-0`).
   - **Line 2** — monospace path (`font-mono text-xs text-muted-foreground`,
     `title={path}`). UNCHANGED.
5. **Actions cluster** (`shrink-0`, trailing):
   - **Active/inactive Switch** — `checked={s.active}` (NOT negated),
     `onCheckedChange={(c) => appState.setActive(name, c)}`, `aria-label`
     UNCHANGED. **NEW**: wrapped in a scoped `Tooltip` (Part E).
   - **Color swatch** — `<ScenarioColorControl scenario={s} />`. UNCHANGED.
   - **Remove button** — only when `source === 'handle'`, `aria-label`
     `Remove ${name}`, calls `removeLocalScenario(name)`. UNCHANGED.
   - *(the up/down arrows and the Star baseline control are GONE from here.)*
6. **Row container** — keeps `036`'s status border/background treatment
   (`treatment.rowBorderClassName` class + `treatment.rowBackgroundStyle`
   inline style). Also the `useSortable` sortable node: while dragging, its
   `transform`/`transition` come from `CSS.Transform.toString(transform)` /
   the sortable `transition`; a subtle raised affordance (shadow / opacity)
   MAY be applied to the actively-dragged row.

## Baseline chip contract (Part D)

Exactly one element, in the identity block line 1, beside the name. It fully
replaces both the `036` Star and the `036` Part-C Star+"Baseline"-text control
— **no `Star` icon and no separate `Badge` appears anywhere else in the row.**

| Condition | Element | Variant / style | Text | Interactive? | `aria` |
|---|---|---|---|---|---|
| `name === baseline` | `<Badge>` (no wrapping button) | `variant="default"` (filled) | `Baseline` | **No** — no `onClick`, no tooltip | none beyond the Badge text |
| `name !== baseline` | `<button>` wrapping `<Badge variant="outline">` | outline/muted, `cursor-pointer hover:bg-muted` | `Set as baseline` | **Yes** — `onClick` → `appState.setBaseline(name)` | `aria-label="Mark ${name} as baseline scenario"` |

- Both states occupy an **identical reserved width** (sized to the wider "Set
  as baseline" label) — the identity block's own width MUST NOT shift between a
  baseline and a non-baseline row.
- Clicking the non-baseline chip performs the exact same state change the `036`
  Star's `onClick` did; re-marking the current baseline is not possible from
  its own row (the chip there is not a button) and is a harmless no-op if
  reached any other way (unchanged precedent).

## Switch tooltip contract (Part E)

- Hovering (or keyboard-focusing) the Switch shows a `TooltipContent` whose
  text states that the toggle controls whether the scenario is included in
  comparisons/queries (one sentence).
- The tooltip changes nothing about the Switch's `aria-label`, `checked`, or
  `onCheckedChange` (FR-013).
- The baseline chip has NO tooltip (FR-011).

## Reorder behavior contract (Parts B + C)

- **Pointer drag**: pressing the drag handle and moving past `@dnd-kit`'s
  activation distance starts a sort; dropping over another row reorders the
  list via `appState.reorderScenario(name, overIndex)`; the DOM order and
  `appState.listByDisplayOrder()` reflect it immediately, no reload.
- **Keyboard drag**: focus the drag handle, `Space`/`Enter` to lift, arrow
  keys to move, `Space`/`Enter` to drop, `Escape` to cancel. A live-region
  announcement is emitted on lift / move / drop / cancel, using position-based
  phrasing.
- **Arrow buttons**: unchanged one-step move, now at the leading edge, still a
  complete independent path to the same reordering (funnels through the same
  `reorderScenario`).
- **Drop outside any valid target**: list returns to its pre-drag order, no
  partial state.
- **Boundary**: a scenario at the top cannot be dragged above the first
  position nor moved up by the (disabled) arrow; symmetrically at the bottom.
- **Reordering never changes the resolved baseline** — `getBaseline()` does not
  read `order` (unchanged guarantee).

## Invariants (regression-tested)

- **FR-001**: for every scenario, the Switch's rendered `aria-checked` /
  `data-state` equals `appState.get(name).active` — asserted for an active
  (`observed`) and an inactive scenario together, in both themes.
- **FR-015**: the `x` (left) coordinate of the status dot, the identity block,
  the Switch, the color swatch, and the baseline chip is pixel-identical across
  every row, in both themes — asserted with real `getBoundingClientRect()`.
- Every pre-existing `settingsModal.spec.ts` / `scenarioColorOverride.spec.ts`
  assertion that this row participates in continues to pass.
