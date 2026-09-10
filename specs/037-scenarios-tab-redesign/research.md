# Research: Scenarios Tab Redesign

## §1. Part A — is the active/inactive Switch wired backwards?

**Decision**: No code change. The Switch is correct; add a regression test only
(FR-001).

**Rationale**: A temporary, since-deleted Playwright spec booted a plain `/`
(no `?s=` param), opened the Scenarios tab, and for each fixture scenario read
the real `appState.get(name).active` value, the rendered Switch's
`aria-checked`/`data-state` attributes, and a screenshot:

| Scenario | `appState.active` | `aria-checked` | `data-state` |
|---|---|---|---|
| `observed` | `true` | `true` | `checked` |
| `good_scenario` | `false` | `false` | `unchecked` |
| `broken_scenario` | `false` | `false` | `unchecked` |

All three agree in both directions. Source-level: `checked={s.active}` with no
negation; `onCheckedChange={(checked) => appState.setActive(s.name, checked)}`
with no negation. The screenshot's "every row looks off" impression is explained
by `services/scenarioDiscovery.ts`'s `registerPublishedScenarios()` never
calling `setActive()` — only `observed` is force-active by default (a real,
already-documented fact from `035-scenario-label-color`'s own CLAUDE.md entry).
On a default load, 2 of 3 fixture rows are genuinely, correctly inactive.

**Alternatives considered**: (a) "fix" a non-existent inversion — rejected, the
data proves there's nothing to fix; (b) change the default so all scenarios
start active — rejected, out of scope and a behavioral change to a long-
standing, deliberate design; (c) improve the ON-state Switch's visual contrast
so it reads more clearly at a glance — noted as a reasonable future follow-up
in the spec's Assumptions, but not requested and out of scope here.

## §2. Part C — drag-and-drop library

**Decision**: `@dnd-kit/core` `^6.3.1` + `@dnd-kit/sortable` `^10.0.0` +
`@dnd-kit/utilities` `^3.2.2` (imported directly for `CSS.Transform`).
`@dnd-kit/modifiers` `^9.0.0` is recommended but optional (`restrictToVerticalAxis`
+ `restrictToParentElement` for a cleaner vertical-list feel).

**Rationale** (all data fetched directly from the npm registry / official docs,
not recalled):

| Package | Latest | Deprecated? | React peer | Last publish |
|---|---|---|---|---|
| `@dnd-kit/core` | 6.3.1 | No | `>=16.8.0` | 2024-12-05 |
| `@dnd-kit/sortable` | 10.0.0 | No | `>=16.8.0` | 2024-12-04 |
| `react-beautiful-dnd` | 13.1.1 | **Yes** (npm registry metadata) | `>=16.8.0` | retired |
| `react-dnd` | 16.0.1 | No | `>=16.14` | 2022-06-25 |

- `react-beautiful-dnd`: officially deprecated by its own maintainer; already
  present only as `@kanaries/graphic-walker`'s transitive dep — never adopt a
  second, direct dependency for new work.
- `react-dnd`: maintained but lower-level (backend adapters, manual drag-preview
  wiring), last published mid-2022 — a meaningfully staler cadence.
- `@dnd-kit`: actively maintained, React-18-compatible, and per its own
  `dndkit.com/guides/accessibility` (fetched directly): a built-in
  `KeyboardSensor` (Enter/Space to pick up, arrows to move, Escape to cancel,
  documented as adhering to W3C guidance), a live-region mechanism announcing
  pick-up/move/drop/cancel (customizable via `DndContext`'s `announcements`
  prop, docs recommend position-based phrasing), and default draggable ARIA
  (`role="button"`, `aria-roledescription="draggable"`, `aria-describedby`
  pointing at real off-screen instructions). It satisfies FR-006 out of the
  box; the others do not without significant custom work.

**Constitution Principle VI note**: `@dnd-kit` is a headless behavior toolkit,
not a component library / CSS framework / icon set — same category as Radix UI
itself (which shadcn/ui is built on) and other focused libraries already in
this tree (`d3-sankey`, `marked`, `color`, deck.gl, `@observablehq/plot`). It
introduces no styled components, no design tokens, no icons, and replaces no
shadcn/Radix/Tailwind/`lucide-react` role. See plan.md's Constitution Check
table for the full analysis. No amendment required.

**Alternatives considered**: `react-beautiful-dnd` (deprecated — eliminated),
`react-dnd` (maintained but lower-level + stale + no built-in a11y —
rejected), a hand-rolled pointer-events reorder (rejected — reimplementing
keyboard sensor + live-region announcements + collision detection is exactly
the "re-deriving a solved problem" this project's Principle VIII warns against,
even though VIII's specific reference list doesn't cover DnD).

## §3. Part C — how a drag maps to `appState`

**Decision**: Add `appState.reorderScenario(name, targetIndex)` — a full
re-sequence of every scenario's `order` field to reflect `name` landing at
`targetIndex` in display order. Reimplement the existing
`moveScenario(name, 'up'|'down')` to call `reorderScenario(name, currentIndex ±
1)`. Both the drag-end handler and the relocated arrow buttons then funnel
through the single `reorderScenario` mutator (FR-004).

**Rationale**: today's `moveScenario` does a neighbor **swap** of two `order`
values — correct for a one-step move, but a drag from index 0 to index 4 is not
a neighbor swap. A full re-sequence (assign `order = 0, 1, 2, …` across the
reordered list) is the simplest correct operation for an arbitrary move, and
makes `moveScenario` a thin special case of it rather than a parallel
implementation. `notify()` fires once, as today. `getBaseline()` still never
reads `order` (unchanged — the automatic-baseline guarantee holds structurally).

**Alternatives considered**: (a) keep `moveScenario` as-is and have the drag
handler call it in a loop of N neighbor swaps — rejected, N × `notify()` and
genuinely two code paths; (b) a list-setter `setScenarioOrder(orderedNames[])`
— viable, but `reorderScenario(name, targetIndex)` maps more directly to what
both a drag-end event (`{active, over}` → indices) and an arrow click
(`index ± 1`) actually produce.

## §4. Part C — drag handle vs whole-row draggable

**Decision**: A dedicated drag handle (`GripVertical`, `lucide-react`) at the
row's leading edge, next to the relocated up/down arrows. The row itself is NOT
the drag surface.

**Rationale**: the row contains multiple interactive controls (the name
`<input>`, the Switch, the color swatch popover trigger, the baseline chip
button, the remove button). A whole-row drag surface would swallow or race
those interactions. `@dnd-kit`'s own docs recommend a dedicated handle for
exactly this case (`useSortable`'s `listeners` spread onto a handle element,
not the whole sortable node). The handle also gives the keyboard sensor a
single, focusable, `aria-describedby`-annotated target.

## §5. Part B — leading-edge layout, keeping pixel alignment

**Decision**: The leading edge becomes `[drag handle][up/down arrow column]`
then the existing `[status dot + loading text]`, then the identity block. The
whole leading group is `shrink-0`. Re-verify pixel alignment of every
downstream control across all rows with real `getBoundingClientRect()`
(FR-015) — this row has had two real column-misalignment bugs this session,
both caught only by measurement.

**Rationale**: the arrows and drag handle are fixed-size (`h-*/w-*` utility
classes, like the existing arrow buttons), so the leading group's width is
constant across rows — alignment holds by construction, but must still be
proven, per this component's own history.

## §6. Part D — the single baseline chip

**Decision**: One chip in the identity block, on the same line as the name
`<input>` (`<input>` becomes `flex-1 min-w-0 truncate`, chip is a `shrink-0`
sibling). Baseline row: `<Badge variant="default">Baseline</Badge>`, not
interactive. Non-baseline row: a `<button onClick={() =>
appState.setBaseline(name)} aria-label="Mark {name} as baseline scenario">`
wrapping `<Badge variant="outline">Set as baseline</Badge>` with a
`cursor-pointer hover:bg-muted` affordance. Fixed reserved width sized to the
wider "Set as baseline" label, using the same "render an invisible sizer / keep
identical width across both states" technique this session already proved for
the Star control — so the chip never changes the identity block's own width
between baseline and non-baseline rows.

**Rationale**: `Badge` (shadcn/ui, `034-metric-panel-redesign`) already has
exactly the `default` (filled) / `outline` variants this needs. Wrapping only
the non-baseline Badge in a `<button>` keeps the visual identical between
states (same `Badge` component) while making only the actionable state
actually actionable — matching FR-009 ("no `onClick` wired" on the baseline
row) and FR-010 ("same `appState.setBaseline()` call" elsewhere). No `Star`
icon, no separate `Badge`-elsewhere — the chip is the sole baseline control
(FR-008).

**Alternatives considered**: (a) a `<Button variant="outline">` styled as a
pill instead of `Badge`-in-a-button — viable, but reuses less of the existing
`Badge` visual language; (b) always a `<button>`, disabled on the baseline row
— rejected, a disabled button reads as "temporarily unavailable," not "this is
a status, not an action."

## §7. Part E — Switch tooltip

**Decision**: Wrap the `Switch` in `Tooltip`/`TooltipTrigger asChild`/
`TooltipContent`, with a per-row-scoped `TooltipProvider` (matching this file's
existing convention for the disabled "Load Local Scenario" trigger and the
former baseline star). Text: e.g. "Include this scenario in comparisons and
queries" / a single sentence naming the effect. No change to the Switch's
`aria-label`, `checked`, or `onCheckedChange` (FR-013).

**Rationale**: Radix `Tooltip` with `asChild` forwards to the `Switch`'s own
Radix Root button — a proven pattern already used elsewhere in this same file.

## §8. Testing approach for a real drag

**Decision**: Playwright pointer-drag via manual `mouse.move`/`mouse.down`/
`mouse.up` steps with intermediate moves (dnd-kit's `PointerSensor` has a
default activation constraint — a small distance — so a single `dragTo()` can
miss; a stepped move is reliable). Keyboard drag via `focus()` the handle →
`keyboard.press('Space')` → `keyboard.press('ArrowDown')` → `keyboard.press('Space')`.
Assert both against `appState.listByDisplayOrder()` names AND the rendered row
order. This mirrors `014-graphic-walker-panel`'s own finding that
`react-beautiful-dnd` needed a keyboard-drag test technique rather than
native HTML5 DnD simulation — `@dnd-kit` is the same: not native HTML5 DnD, so
`dragTo()`/`dataTransfer` simulation does not apply; a real pointer sequence
(or the keyboard sensor) is the correct test driver.

**Rationale**: confirmed against `@dnd-kit`'s sensor model — it listens to
pointer/keyboard events, not the native `dragstart`/`drop` events Playwright's
`dragTo()` synthesizes.
