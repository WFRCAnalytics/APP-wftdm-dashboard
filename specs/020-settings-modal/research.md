# Research: Unified Settings Modal

All decisions below were made by reading the real, current files named —
not assumed from the spec's own description or from how similar-sounding
features elsewhere might work.

## 1. Reusable modal/tab chrome — confirmed, reused, nothing new built

**Decision**: Compose the settings modal from `components/ui/dialog.tsx`
(Radix `Dialog`, added by `004-panel-expand-dialog`) for the modal shell,
and `components/ui/tabs.tsx` (Radix `Tabs`, added by `002-design-tokens`
and already used by `navBar.tsx`) for the four-tab internal navigation.
`components/ui/dropdown-menu.tsx` (015-theme-toggle) is NOT reused here —
its `DropdownMenuRadioGroup` shape fits a compact single-choice popover
(the reason `ThemeToggle` uses it today), not a persistent multi-tab
content switcher; `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` is the
better-fitting existing primitive and is already proven for exactly this
job (`navBar.tsx`'s own tab strip).

**Rationale**: `Dialog` is already a battle-tested, dark-mode-correct
primitive (its own header comments in `dialog.tsx` record two real bugs
already found and fixed there — the `text-card-foreground` dark-mode
fix and the `p-6` padding regression) — reusing it means this feature
inherits those fixes for free rather than risking reintroducing either
one in new modal chrome.

**Alternatives considered**: Building new modal chrome from scratch —
rejected outright per the feature's own explicit research requirement,
and there is no gap `Dialog` doesn't already cover (it already supports
`hideClose`, a scoped `DialogTitle`/`DialogDescription`, and correct
Escape/overlay-click/close-button dismissal — everything FR-016 needs).

## 2. Where the trigger and its tabs' logic move to

**Decision**: `shell.tsx`'s header replaces its `<ScenarioLoader />` +
`<ThemeToggle />` pair with a single `<SettingsModal />` (new file,
`layout/settingsModal.tsx`). The modal's four tabs are their own small
components under a new `layout/settings/` directory
(`appearanceTab.tsx`, `scenariosTab.tsx`, `basemapTab.tsx`,
`documentationTab.tsx`), composed by `settingsModal.tsx` inside
`Tabs`/`TabsContent`. `themeToggle.tsx` and `scenarioLoader.tsx` are
deleted — their logic is *moved* into `appearanceTab.tsx` and
`scenariosTab.tsx` respectively, not duplicated alongside the originals
(FR-002's "removed entirely, not hidden").

**Rationale**: matches this codebase's existing per-concern file
granularity (`layout/` already splits `shell.tsx`/`navBar.tsx`/
`panelCard.tsx`/`panelExpandHost.tsx`/`scenarioLoader.tsx`/
`themeToggle.tsx` as separate files rather than one large header
component) and keeps each tab's own test surface separately targetable,
the same way `themeToggle.spec.ts` and `scenarioManager.spec.ts` already
test their current standalone components independently today.

## 3. Scenario reordering — data shape

**Decision**: `state/appState.ts`'s `Scenario` gains a numeric `order`
field, assigned at `register()` time from a module-level, ever-
incrementing counter (`order: nextOrder++`). A new `moveScenario(name,
direction: 'up' | 'down')` mutator finds `name`'s neighbor in
*display*-order and swaps their two `order` values (a no-op at either
boundary). A new `listByDisplayOrder(): Scenario[]` read accessor
returns `list()` sorted by `order` ascending, for the Scenarios tab to
render.

**Confirmed critical property, not assumed**: `getBaseline()`
(`state/appState.ts:177`) iterates `scenarios.values()` directly — Map
insertion order — and is completely untouched by this change; it never
reads `order` at all. This satisfies FR-008 ("reordering must not
silently change the automatic-default baseline pick") *by construction*
— there is no guard to add or maintain, because the two concepts
literally never touch the same code path. `unregister()`
(`state/appState.ts:128`) also needs no change: `order`/the new `label`
field (§4 below) live directly on the `Scenario` object, so
`scenarios.delete(name)` already discards both along with the rest of
that scenario's entry — no separate cleanup, unlike `explicitBaseline`
(which needed its own clearing step specifically because it lives
*outside* the `Scenario` object it points at).

**Confirmed for FR-018 (new scenario mid-reorder), not assumed**: because
`nextOrder` only ever increases and `moveScenario()` only ever swaps
values *already* assigned to existing scenarios (never assigns a value
`>= nextOrder`), a newly `register()`-ed scenario's `order` is guaranteed
to be strictly greater than every existing scenario's — it always sorts
to the end of `listByDisplayOrder()`. This is free, structural correctness,
not a special case that needs its own branch or test-only guard.

**Alternatives considered**: a separate ordered array of scenario names
(`orderedNames: string[]`) alongside the `Map`, mutated on
register/unregister/move. Rejected: it duplicates the `Map`'s own key set
in a second data structure that must be kept in sync on every
register/unregister call (two sources of truth for "which scenarios
exist"), where the counter-based `order` field keeps a single source of
truth (`scenarios` alone) and only adds one field + one derived sort.

## 4. Custom scenario label

**Decision**: `Scenario` gains an optional `label?: string`. New
`setLabel(name, label: string)` / `clearLabel(name)` mutators (mirroring
`setBaseline()`'s existing shape: look up the entry, throw on an
unregistered name, mutate, `notify()`). Display sites read
`s.label ?? s.name`.

**Rationale**: FR-010 requires the label never substitute for the real
name in query/resolution paths — since `label` is a field ONLY read by
the Scenarios tab's own rendering, and every resolution path
(`sqlExpander.ts`'s `$scenario`/`$baseline` expansion, `panelQuery.ts`'s
`resolveComparisonScenarioName()`) keys exclusively off `Scenario.name`
already, this guarantee holds with zero new code to enforce it — there is
no code path that could accidentally read `.label` where `.name` belongs,
since nothing outside the new Scenarios tab component ever reads `.label`
at all.

## 5. "Real file path" (FR-005) — two genuinely different real values

**Confirmed by reading `services/scenarioDiscovery.ts` and
`scenario/scenarioManager.ts` directly, not assumed**: no `path`-shaped
field exists anywhere in `Scenario`/`ScenarioMetadata` today, and the two
existing scenario sources have two different real answers for what "path"
even means:

- **`source: 'url'`** (`scenarioDiscovery.ts`'s `registerObserved()` /
  `registerPublishedScenarios()`): the real value already exists as a
  local variable at the registration call site — the folder URL
  (`` `${base}observed/summary` `` or
  `` `${base}scenarios/${name}/summary` ``) passed into
  `registerSummaryFolder()`. This is a genuine, fully-known path.
- **`source: 'handle'`** (`scenario/scenarioManager.ts`'s
  `loadLocalScenario()`): the File System Access API's
  `FileSystemDirectoryHandle` deliberately exposes **no** absolute
  filesystem path at all — this is a browser security boundary, not a
  gap in this app's own code, and cannot be worked around. The only real,
  available value is the handle's own `dirHandle.name` (the local
  folder's name) — already read once today (as the fallback scenario
  name when no `manifest.yaml` is present), but not currently threaded
  through as a separately-displayed value even when a manifest DOES
  override the display name.

**Decision**: add `path: string` to `ScenarioMetadata`/`Scenario`,
populated at both existing `register()` call sites from the value each
already has in scope (the folder URL for `url` sources, `dirHandle.name`
for `handle` sources) — no new lookup or API call needed anywhere.
`registerObserved()`/`registerPublishedScenarios()` are the sole callers
for `source: 'url'`; `loadLocalScenario()` is the sole caller for
`source: 'handle'` — both already have their respective value in hand at
the exact line `appState.register()` is called.

## 6. Global basemap selection — where it lives, and how it composes

**Confirmed by reading `panels/basemap/resolveEffectiveBasemap.ts`,
`registry.ts`, and both call sites (`FlowMapPanel.tsx:375`,
`ZoneMapPanel.tsx:439`) directly**:

- `resolveEffectiveBasemap(panelBasemap, tabDefaultBasemap, theme)` is a
  pure function with exactly two real call sites, both already reading
  `colorScheme` via `useColorScheme()` and calling the resolver the same
  way at render time (not inside an effect) before keying their basemap-
  application effect on `basemapKey(effectiveBasemap.selection)`.
- Its only two callers, `FlowMapPanel.tsx` and `ZoneMapPanel.tsx`, already
  independently import `useColorScheme()` (a `useSyncExternalStore` hook)
  the same way — confirming a new sibling hook, read the same way at the
  same two call sites, is a well-precedented, symmetric change, not a
  novel integration.

**Decision (resolves the spec's own flagged highest-risk question)**: add
a fourth, optional parameter to `resolveEffectiveBasemap()`:
`globalBasemap?: BasemapPresetName`. The fallback chain becomes panel →
tab → **global** → app-default:

```
if (isSet(panelBasemap)) return { selection: panelBasemap, source: 'panel' }
if (isSet(tabDefaultBasemap)) return { selection: tabDefaultBasemap, source: 'tab' }
if (isSet(globalBasemap)) return { selection: globalBasemap, source: 'global' }
return { selection: theme === 'dark' ? APP_DEFAULT_DARK : APP_DEFAULT_LIGHT, source: 'app-default' }
```

`BasemapSource` (`panels/basemap/types.ts`) gains a fourth literal,
`'global'` — additive; the three existing literals and every existing
consumer that compares against them is unaffected, since nothing
currently produces or expects `'global'`. This is exactly the
"replace what the app-default fallback resolves to, don't add a new
higher-priority tier" design the spec's own Assumptions section already
committed to — confirmed achievable with no restructuring, just one new
parameter and one new branch in an already-pure, already fully unit-
tested function (`resolveEffectiveBasemap.test.ts`'s existing four-row
truth table stays valid unchanged; a fifth row is added for the new
branch).

**Where the value itself lives**: a new module,
`state/basemapState.ts`, mirroring `state/filterState.ts`'s /
`state/appState.ts`'s own established shape exactly (module-level
variable, `subscribe()`/`notify()`, a getter, a setter) — NOT added onto
`appState.ts` itself, since that module's own header comment already
scopes it explicitly to "scenario metadata and selection state," and a
global basemap choice is not scenario-scoped at all. A new hook,
`hooks/useGlobalBasemap.ts`, mirrors `useBaseline.ts`'s exact shape
(`useSyncExternalStore(subscribe, getGlobalBasemap)`, no memoized cache
needed) rather than `useActiveScenarios.ts`'s cached-array shape — safe
for the same reason `useBaseline.ts` itself gives: the stored value is
compared by `useSyncExternalStore`'s default `Object.is`, which is
correct as long as the stored type is a primitive.

**Confirmed this stays a primitive, closing the one remaining risk**:
`BasemapSelection` is a union of `BasemapPresetName` (a plain string) and
`BasemapComposition` (`{ layers: string[] }`, an object — which
`Object.is` would NOT compare correctly across re-renders). The viewer-
facing Basemap tab picker only ever offers presets from
`registry.ts`'s `BUILT_IN_PRESETS` — a `Record<BasemapPresetName, ...>`
containing **only** preset names, no compositions at all (compositions
are, per `types.ts`'s own comment, "a downstream-authoring-only escape
hatch," never a registry entry a viewer could pick from a list). So the
global basemap store's value type is narrowed to
`BasemapPresetName | undefined` specifically — not the full
`BasemapSelection` union — which avoids the object-identity problem
entirely rather than needing a cache workaround for it.

**Call-site change**: both `FlowMapPanel.tsx` and `ZoneMapPanel.tsx` add
one hook call (`const globalBasemap = useGlobalBasemap()`) and thread it
as the resolver's new fourth argument — a one-line change to each
existing `resolveEffectiveBasemap(...)` call, symmetric with how both
already independently call `useColorScheme()`.

**Failure fallback (FR-017)**: confirmed no change needed anywhere in
`panels/basemap/loadBasemapStyle.ts` at all. That module already treats
its input as "whatever `EffectiveBasemap.selection` resolved to" with no
branching on *how* it was resolved (`.source` is read by nothing inside
`loadBasemapStyle.ts` — confirmed by direct read) — a selection that
came from the new `'global'` source is handled by the exact same
preset-name resolution path (`resolvePresetName()`) a `'panel'`- or
`'tab'`-sourced preset name already goes through, with the exact same
`BLANK_STYLE` fallback on failure. This is why FR-017 needs no new code:
the existing fallback mechanism was never source-aware to begin with.

**Recommendation on scope (per the feature's own explicit instruction to
flag this plainly if it doesn't fit)**: it fits. The change to
`resolveEffectiveBasemap()` is one additive parameter behind an existing,
already-tested truth table; the change to its two call sites is
one-line-each and symmetric with an already-proven pattern
(`useColorScheme()`); the new store/hook pair is a direct copy of an
already-established, already-reviewed shape
(`state/appState.ts`+`hooks/useBaseline.ts`'s pattern, applied to
`state/basemapState.ts`+`hooks/useGlobalBasemap.ts`); and the
failure-fallback question resolves to "no change needed" once the real
`loadBasemapStyle.ts` is read. None of this rises to the "needs its own
dedicated research/testing rigor disproportionate to the other three
tabs" bar the feature description named as the split trigger — this
stays one feature.

## 8. "Load Local Scenario" in LOCAL deployment mode — corrected from hidden to disabled+tooltip

**Confirmed by reading `layout/scenarioLoader.tsx` directly**: the
current component returns `null` entirely — the whole scenario list,
baseline star, and every control — the moment `isLocalDeployment()` is
true (`if (isLocalDeployment()) return null`, line 35). That same file
already has a second, different disabled-state pattern for a genuinely
different condition (a browser lacking File System Access API support,
`supportsLocalFolderLoading()` false): the button stays rendered but
`disabled`, wrapped in a `TooltipProvider`/`Tooltip` explaining why
(`data-testid="scenario-load-trigger-disabled-wrapper"` on the
hoverable wrapping `<span>`, needed specifically because Tailwind's
`disabled:pointer-events-none` on the `<button>` itself blocks the
hover Radix's `Tooltip.Trigger` needs — confirmed empirically per that
file's own comment).

**Decision**: the Settings modal's Scenarios tab uses the SECOND pattern
for BOTH conditions, not the first. `isLocalDeployment()` no longer gates
the whole tab/list/controls — only the "Load Local Scenario" trigger
itself, using the exact same `TooltipProvider`/`Tooltip`/disabled-span
shape already proven for the browser-capability case, with its own
tooltip text (e.g. "This deployment already loads scenarios directly").
The list, baseline star, remove, reorder, and label controls all render
identically in LOCAL and WEB mode.

**Rationale**: FR-019 (new) states the general principle this
implements — the Settings modal and every tab in it must always be
reachable; only a control that genuinely doesn't apply gets grayed out,
never the surrounding tab or unrelated controls. The previous
`ScenarioLoader`'s all-or-nothing hide made sense as a standalone header
control (an empty header slot is harmless), but is wrong for a modal tab
a viewer explicitly navigated to — hiding the tab's own content out from
under them, with no visible reason why, is a materially worse experience
than a single grayed-out button with an explanation.

## 9. Appearance tab reverts to the original three-visible-option design

**Confirmed by reading `layout/themeToggle.tsx`'s own header comment
directly**: the compact icon-only `DropdownMenu` shape was NOT the
original design — the file's own comment records it as a **post-shipping
revision**, made specifically because `ScenarioLoader` (this control's
own header neighbor in the shared header row) is variable-width in WEB
mode (grows by one chip per locally-loaded scenario), and three
always-visible buttons risked visual crowding/wrapping next to it. The
comment also records that a true Radix `Switch` was considered and
rejected (binary, can't represent "System" as a third state) — that
constraint is orthogonal to the dropdown-vs-three-buttons choice and
still holds regardless of which visual form is used.

**Decision**: inside the Settings modal's own Appearance tab, there is no
competing header content at all — the tab has the full modal body to
itself, alone. The specific constraint that motivated the dropdown
redesign (competing width in a shared header row) is gone. The
Appearance tab therefore reverts to the ORIGINAL three-directly-visible-
option design (a horizontal Light/Dark/System control), not the
dropdown. The underlying `mode` state and its mount/mode effect
(`matchMedia` listener lifecycle, `.dark` class application) are reused
completely unchanged — this is a presentation-only reversion, confirmed
to have zero effect on FR-004's "same behavior" requirement.

**Alternatives considered**: keeping the dropdown for visual consistency
with... nothing, in fact — since `ThemeToggle` itself is deleted by this
feature (research.md §2), there is no remaining dropdown-styled sibling
control anywhere in the header for the Appearance tab to stay consistent
with. Rejected: there is no actual benefit to keeping the more compact,
less discoverable form once its own original justification no longer
applies.

## 10. Scenario active/inactive toggle — considered, deliberately deferred

**The gap, confirmed real**: `state/appState.ts`'s `active` field and
`setActive()` mutator directly drive `panels/panelQuery.ts`'s
`resolveActiveScenarios()`, which drives every unpinned panel's
`$scenario.<metric>` UNION-ALL query construction. No UI anywhere in this
app today lets a viewer toggle a published/observed scenario's `active`
flag — `009-scenario-manager`'s own spec explicitly named this as
deferred scope ("a sidebar toggle for published scenarios"), and nothing
built since has closed it. The Scenarios tab this feature builds would be
a natural place to add one.

**Decision: deferred, not included in this feature.** Two reasons, both
checked against the real, current codebase rather than assumed:

1. **Different kind of change, not just a bigger one.** This feature's
   other three Scenarios-tab additions (reorder, label, and — confirmed
   directly, §3/§4 above — the `path` display field) touch zero
   query-affecting code: `order`/`label` are read by nothing outside the
   tab's own rendering, and `getBaseline()` never reads `order` at all.
   An active/inactive toggle is fundamentally different — flipping it
   changes REAL rows returned by REAL queries across every
   `$scenario.`-driven panel on every tab, immediately. That is a
   correctness-and-testing-rigor tier this feature's other additions
   never had to clear.
2. **Not part of the feature as originally scoped.** The original
   request enumerated exactly what the Scenarios tab should contain
   (list with path/status, add/remove/baseline relocated, reorder,
   label) and separately, explicitly, called out the Basemap tab as
   `NEW, genuinely novel`. Active/inactive toggling was named in neither
   place — unlike the Basemap tab, it was never actually in scope to
   begin with, so building it now would be scope growth mid-feature, not
   scope clarification.

**One real, confirmed technical finding recorded here for whoever picks
this up as its own future feature**: the reactive plumbing this would
need already exists and is already proven, not hypothetical. Every
data-bound panel type already consumes `hooks/useActiveScenarios.ts`
(confirmed directly — `FlowMapPanel.tsx`'s own data-fetch effect already
lists `activeScenarioNames` in its dependency array, and `CLAUDE.md`'s
own file-tree history confirms this is true of every panel type, not
just flowmap). `useActiveScenarios()` is a `useSyncExternalStore` hook
over `appState.subscribe()`, and `setActive()` already calls `notify()`
— so a future toggle control would only need to call the ALREADY-EXISTING
`appState.setActive(name, !active)`, and every panel already reactively
recomputes with no reload, no new dependency-array work needed anywhere.
This is the same "expose already-correct plumbing through new UI, don't
build new reactivity" shape this feature's own basemap/baseline
precedent already relies on (research.md §6) — meaning a future
active/inactive-toggle feature is likely lower-risk than its
query-correctness stakes might suggest, even though those stakes are
real enough to keep it out of this feature.

## 11. Test conventions to follow

Existing precedent confirmed directly: `resolveEffectiveBasemap.test.ts`
(Vitest, pure-function truth table), `scenarioManager.test.ts` +
`scenarioManager.spec.ts` (Vitest for pure logic, Playwright for the
full picker/list flow), `themeToggle.spec.ts` (Playwright, dropdown
open/select/verify-class). This feature's own tests follow the same
split: `appState.test.ts` (existing file) gains cases for
`moveScenario()`/`setLabel()`/`listByDisplayOrder()`/FR-008/FR-018;
`resolveEffectiveBasemap.test.ts` gains the fifth truth-table row; a new
`tests/integration/settingsModal.spec.ts` replaces
`themeToggle.spec.ts` + `scenarioManager.spec.ts`'s UI-facing coverage
(both files' *logic*-level Vitest coverage, where separate from the
removed components, stays where it is).
