# Phase 0 Research: Scenario Manager (local folder loading)

## §1. FR-008's reactivity mechanism — the decision the user required be weighed honestly

**Decision: extend `state/appState.ts` with a plain wildcard pub/sub
mechanism, and a new `hooks/useActiveScenarios.ts` mirroring
`useFilterState.ts`'s exact `useSyncExternalStore` shape — NOT a
key-based remount.**

### The two real candidates, weighed against FR-008's constraint

**Key-based remount** (a scenario-generation counter folded into the
active tab's `key`, forcing React to unmount/remount every panel on that
tab): requires zero `appState.ts` changes. But its real cost, confirmed by
reading every existing panel component, is not "simplicity" — every panel
type keeps meaningful state a remount destroys:
- `TablePanel.tsx` — current sort column/direction, search text, page
  number (`tableLogic.ts`'s pure state, held as component state today).
- `ObservablePlotPanel.tsx` — panel-local `inputs:` values (007's whole
  reason for existing).
- Any panel — an in-flight or just-failed query's loading/error status,
  reset back to a loading skeleton for data that hasn't actually changed.

This is a direct regression against `004-panel-expand-dialog`'s and
`007-observable-plot-panel`'s own hard-won guarantees that a panel's local
state survives a transition unrelated to its own data (dialog
expand/collapse; an unrelated filter changing). Scenario activation is
exactly that kind of unrelated transition from an individual panel's point
of view — the panel's `config` didn't change, and neither did any filter
it's bound to.

**`appState` pub/sub mirroring `filterState.ts`'s already-proven
pattern**: `filterState.ts` already solves precisely this class of problem
— notify subscribers on a store mutation, let `useSyncExternalStore`
re-render only what actually needs it — and every panel type already
imports `useFilterState`, which wraps exactly that shape. Extending
`appState.ts` the same way, and adding a `useActiveScenarios()` hook with
the same memoized-snapshot discipline `useFilterState.ts` already uses
(`useRef` cache, `Object.is`-comparable return), is not a new pattern to
invent — it is applying an existing, understood one to a second store.
The real cost is concrete and small: `appState.ts` gains a `subscribe()`
export and a `notify()` call at the end of `register`/`setStatus`/
`setActive`/`unregister`; the five existing data-bound panel components
(`ValueBoxPanel.tsx`, `PlotlyPanel.tsx`, `TablePanel.tsx`,
`ObservablePlotPanel.tsx`, `SankeyPanel.tsx`) each swap their in-effect
`appState.getActive().map((s) => s.name)` call for a top-level
`useActiveScenarios()` hook call, adding its return value to the
data-fetch effect's dependency array. Five mechanical, small, identically
shaped diffs — no panel's rendering logic, local state, or query-building
logic changes at all.

**Chosen because**: FR-008 explicitly rules out state loss as an
acceptable side effect, which rules out remount outright regardless of its
lower line count. Between the two candidates that satisfy FR-008, pub/sub
is the only one that does — it isn't being chosen for being more
thorough, it's the only option left once state-preservation is a hard
requirement, not a nice-to-have.

### Why `appState.ts`'s existing "pull-based, no pub/sub" comment doesn't block this

`appState.ts`'s current header comment ("No pub/sub here (unlike
`filterState.ts`) — no FR requires it") was accurate when `001-data-state-
layer` wrote it — no feature had a requirement forcing reactivity yet.
FR-008 is that requirement now. This is a deliberate, reasoned amendment
to a past design decision once its stated precondition ("no FR requires
it") stops holding, the same category of correction `007-observable-plot-
panel` made to `sqlExpander.ts`/`DataBoundPanelConfigBase`, not a
violation of anything `001` established.

### Granularity: no per-scenario-id subscription needed

Unlike `filterState.ts` (which supports subscribing to individual filter
ids, since panels bind to specific filters), every panel consumer of
`appState.getActive()` reads the **entire** active-scenario list as one
unit (`resolveActiveScenarios(config, activeScenarios)` — confirmed by
reading `PlotlyPanel.tsx`/`TablePanel.tsx`/`ValueBoxPanel.tsx`/
`ObservablePlotPanel.tsx`/`SankeyPanel.tsx`, all identical in this
respect). `appState.subscribe()` is therefore a single wildcard
subscriber list (`Set<() => void>`), notified on any mutating call — no
per-id targeting machinery to build, simpler than `filterState.ts`'s own
subscription shape because the actual consumption pattern doesn't need it.

## §2. Testing a `showDirectoryPicker()` flow in Playwright without a real OS dialog

**Decision**: inject a fake `window.showDirectoryPicker` via
`page.addInitScript()` before the app boots — the same mechanism
`tests/integration/boot.spec.ts` already uses to instrument the page
(confirmed: `boot.spec.ts:23` calls `page.addInitScript(...)`). The fake
implements only the surface `services/duckdb.ts`'s existing
`registerScenario()` and this feature's new `manifestReader.ts` actually
call against a directory handle — `getFileHandle(name)`,
`getDirectoryHandle(name)`, async `entries()`, `.getFile()`,
`.arrayBuffer()`/`.text()` — a plain JS object literal satisfies that
shape; nothing about the File System Access API's real implementation is
otherwise involved, so there is no browser-support gap in the test itself
(the init script defines `window.showDirectoryPicker` unconditionally,
independent of whether the real API exists in the Playwright-driven
Chromium instance).

**Correction found during implementation (US3's multi-folder tests)**:
`page.addInitScript()` only takes effect on the *next* navigation — it has
no effect on an already-loaded page. A test that picks two different
folders in one session (US3) cannot call `installFakePicker()` a second
time mid-test to retarget it; the second call silently did nothing, and
the second pick just re-invoked the first fake. Fixed by holding the
fake's config in a mutable `window.__fakePickerConfig` slot (set once via
`addInitScript`, before navigation) that `window.showDirectoryPicker`
reads fresh on every call, plus a separate `setFakePickerConfig()` helper
using `page.evaluate()` (which *does* run immediately against the current
page) to retarget it live within the same session — `installFakePicker()`
for the first pick, `setFakePickerConfig()` for every subsequent one.

**Alternatives considered**: a real native folder-picker interaction is
not automatable at all in a headless/CI Playwright run (no OS dialog
exists to drive) — not a viable alternative, not just a worse one. A
Playwright `page.on('filechooser')`-style interception doesn't apply
either — that's for `<input type="file">`, a different, unrelated browser
mechanism from the File System Access API's `showDirectoryPicker()`.

**Fixture data source**: the fake handle's `getFile().arrayBuffer()`
reads real bytes from `tests/fixtures/scenarios/good_scenario/summary/
*.parquet` (already generated by `tests/fixtures/generate.py` for every
prior feature's own Playwright suite), loaded via Node's `fs.readFileSync`
in the spec file itself and passed into the init script as a serializable
byte array — proving this feature's registration path against the exact
same real Parquet bytes `registerScenario()` already handles for the
`showDirectoryPicker()`-mode path documented in its own docstring.

## §3. Name-collision detection

**Decision**: `scenarioManager.ts`'s load flow calls `appState.get(name)`
(already exported, already used this way by nothing yet) before
registering. If an entry exists with `source === 'url'`, reject with a
visible error and register nothing (FR-006). If an entry exists with
`source === 'handle'`, proceed — `appState.register()`'s and
`services/duckdb.ts`'s `registerScenario()`'s own existing "replace
cleanly" behavior handles the rest with no new code needed on that path.

## §4. Reading `manifest.yaml` from a directory handle

**Decision**: `services/yamlLoader.ts` gains one small additive export —
`parseYAMLText(text: string, sourceLabel: string): unknown` — factored out
of `loadConfig`'s existing inline `try { raw = parseYAML(text) } catch`
block, with `loadConfig` itself calling the new function unchanged in
behavior. A new `src/scenario/manifestReader.ts` reads
`dirHandle.getFileHandle('manifest.yaml')` → `.getFile()` → `.text()`,
then calls the same `parseYAMLText`, so both the fetch-based and
handle-based reading paths share one parsing implementation rather than
duplicating the try/catch-with-context-message logic. This is
`yamlLoader.ts`'s first-ever modification — small, additive, and every
existing export's behavior is unchanged (mirrors `plan.md`'s own
"consumed, none altered in contract" framing from `004`, except here one
function *is* factored out, not just consumed, which is why it's called
out explicitly rather than assumed invisible).

On a missing file or parse failure, `manifestReader.ts` returns `null`
rather than throwing — `scenarioManager.ts`'s caller falls back to
`dirHandle.name` per FR-005, logging a `console.warn` (mirrors
`scenarioDiscovery.ts`'s existing fail-soft `catch` pattern for a
per-scenario problem).

## §5. Deployment-mode detection

**Decision**: a small exported `isLocalDeployment(): boolean` function
(`window.location.hostname === 'localhost'`, per `docs/SPEC.md`'s own
documented check) lives in `src/scenario/scenarioManager.ts` — the only
consumer is this feature's own UI-visibility gate (FR-001), and no other
module needs it yet, so it doesn't warrant a separate file. If a future
feature (the `wftdm-dashboard serve`/`here` local-server integration,
explicitly out of scope here) needs the same check, hoisting it to a
shared location is that feature's call to make, not a speculative
extraction now.

## §6. UI shape for the trigger + loaded-scenario list

**Decision**: no new `components/ui/` primitive. The trigger is a plain
`Button` (`variant="outline"`, existing component) wrapped in the existing
`Tooltip` component for US2's disabled-state explanation — both already
exist as `components/ui/` primitives.

**Correction found during implementation, not assumed here originally**:
this section's first draft claimed `Tooltip`/`Button` were "already used
together elsewhere in this codebase's pattern" — checked only that both
primitives existed, not that any *production* code actually combined
them. In fact `src/demo/DesignTokenDemo.tsx` is the *only* other consumer
of `Tooltip` in the whole codebase, and Radix's `Tooltip.Root` (the
installed `@radix-ui/react-tooltip` version) throws `` `Tooltip` must be
used within `TooltipProvider` `` without one — confirmed empirically via
a real uncaught error crashing the whole React tree in Playwright (no
error boundary around `Shell` to contain it), not found by inspection
first. `ScenarioLoader` wraps its own `Tooltip` usage in a locally scoped
`TooltipProvider` (`contracts/scenario-manager.md`) rather than assuming
Radix's `Tooltip.Root` works standalone. The loaded-scenario
list (FR-009) is a small inline list of plain styled `<div>`s (name +
status text + a small `X`-icon remove `Button` per entry,
`variant="ghost" size="icon"`) — not a new `Badge`/`Chip` primitive,
since none exists yet in `components/ui/` and this feature's own list is
small/simple enough not to justify introducing one (a future feature
that needs badges more broadly can add that primitive when it actually
needs it, per this project's own established "add framework/library
surface only when a real feature needs it" discipline — Principle I's own
stated rationale, applied here to a UI primitive rather than a framework).
Both live in a new `src/layout/scenarioLoader.tsx`, mounted in
`shell.tsx`'s header alongside `NavBar` (FR-001's "near the tab bar, not
inside any panel").
