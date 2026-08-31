# Research: Panel Expand-to-Dialog

**Feature**: `004-panel-expand-dialog` | **Date**: 2026-08-31

---

## 1. Mount strategy — stay-mounted-and-hide vs. unmount/remount-with-lifted-state

This is the feature's central technical risk (spec.md FR-007/FR-008, and the
user's explicit instruction to weigh it, not pick whichever is fastest to
implement). Three candidate shapes were considered, not two — the third
surfaced while actually working through what "stay mounted" can mean in
React.

**Candidate A — Two mounted instances, query state lifted out of the panel
component.** The panel card always renders `<PanelComponent config={config}
/>` inline as it does today; the Dialog, when open, renders a *second*
`<PanelComponent config={config} />` instance inside `DialogContent`. To
satisfy FR-007/FR-008 (no reset, no duplicate query), the query/fetch logic
currently owned by each panel component's own `useEffect` (CLAUDE.md's panel
pattern) would have to move out into a shared cache keyed by
`(config, filters)` — e.g. a module-level `Map` or a small store — that both
instances read from, with only one of them responsible for actually firing
the query.

- Cost: this rewrites the panel pattern itself, not just `panelCard.tsx`.
  Every current panel (`ValueBoxPanel.tsx`, `PlotlyPanel.tsx`) and every
  future one would need to be authored against a new
  "fetch-through-a-shared-cache" contract instead of the simple
  "do your own fetch in your own effect" contract CLAUDE.md documents and
  `003` already implemented. That is a constitution-level Development
  Workflow change, not a change scoped to `panelCard.tsx` — directly at odds
  with the feature's own framing ("a generic capability, at the
  `panelCard.tsx` level... no per-type wiring").
- Cost: for a chart panel specifically, two mounted `PlotlyPanel` instances
  means two real `Plotly.react()` calls against two separate DOM containers,
  reading the same cached rows — i.e. the expensive part (SVG/canvas
  construction, Plotly's internal figure state, its own event listeners)
  really is duplicated, exactly the "double mounted" cost the user asked to
  weigh, and it lands on the heaviest part of the system, not the lightest.
- Cost: two independent effects watching the same cache entry is a second,
  self-inflicted source of the exact race-condition class `003`'s FR-011
  already had to close once (which instance "owns" firing the fetch on
  first mount; what happens if both fire before the cache is populated).
  Strictly more surface area for that bug class than a design where only one
  effect can ever exist per panel card.

**Candidate B — One component instance, one render, with the JSX branching
internally between an inline shape and a Radix-`Dialog`-wrapped shape**
(the literal reading of the spec's own "toggling visibility" phrasing). On
its face this keeps one component instance (`useState`/`useEffect` survive,
no re-fetch) — but React's reconciliation unmounts and remounts a subtree
when the branch it sits under changes structurally (going from a plain
`<CardContent>` child to a `<DialogContent>` child is exactly that). For a
chart panel, the actual `<div ref={containerRef}>` Plotly draws into would
be destroyed and re-created on every expand/collapse, even though the
*component* instance never unmounts. That's not a data reset (no new query
fires — `rows` is still in React state), but it does force a full
`Plotly.react()` redraw into a brand-new container, silently dropping any
Plotly-internal UI state (zoom, pan, which legend entries are toggled off).
Not disqualifying on its own against the FRs as written, but strictly worse
than necessary for no offsetting benefit over Candidate C below, which pays
none of this cost.

**Candidate C (chosen, this is the shipped mechanism) — One component
instance, one stable DOM container, relocated (not recreated) between an
inline location and a Dialog location.** `panelCard.tsx` renders the
registry-resolved `<PanelComponent config={config} />` exactly once, as
`children` passed into `panelExpandHost.tsx`'s `usePanelExpandHost` hook.

The relocation itself works like this: `children` is portaled — via
React's `createPortal` — into **one persistent DOM node**
(`portalHostRef.current`), created once per panel card on first render via
a bare `document.createElement('div')` and never replaced for the
component's lifetime. Because that node's identity never changes,
`createPortal`'s container argument is `Object.is`-stable across every
render, and React's portal reconciliation only ever sees `children`
being updated — never a container change. Visual relocation happens
separately and imperatively: a `useLayoutEffect`, keyed on the panel's
`expanded` state, does a plain `target.appendChild(portalHostRef.current)`
to move that persistent node between two ordinary React-rendered anchor
elements — `inlineAnchor` (inside the card body) and `dialogAnchor`
(inside the Dialog's content) — entirely outside React's own
reconciliation. A layout effect specifically (not a passive one) matters
for two reasons: it runs synchronously before the browser paints (no
visible flash of the old position), and React flushes every layout effect
in a commit before any passive effect — so by the time a portaled panel's
own data-fetch/`Plotly.react()` effect (a passive effect) reads its
container's real layout dimensions, this hook's DOM move has already
attached it to a visible, correctly-sized anchor.

Concretely, for a chart panel this means `PlotlyPanel`'s `containerRef`
div is the exact same DOM node before and after expand/collapse: its own
`useEffect`s (the data-fetch effect, and `003`'s `ResizeObserver` effect)
never re-run, because neither `config`/`filters` (the fetch effect's
deps) nor the component's mounted-ness ever change — only the *parent* of
the stable container changes, which the `ResizeObserver` already built in
`003` reports as an ordinary size change, triggering
`Plotly.Plots.resize()` exactly as designed.

This is the technique libraries like `react-reverse-portal` implement for
the same class of problem (e.g. keeping a `<video>` playing across a
fullscreen transition) — hand-rolled here rather than adding the
dependency; see "Alternatives considered" below for why. **This design was
not the first one built** — §1a and §1b document two implementation-time
corrections (a `forceMount` approach, and a naive `createPortal`-target
swap) that were tried, found broken by real, measured evidence, and
replaced with what's described above. Both are kept as history/rationale
for future maintainers, not as competing descriptions of what shipped.

**Decision**: Candidate C, built as described above. It is the only option
that structurally *guarantees* FR-007/FR-008 (there is exactly one
component instance, one effect, full stop — nothing to keep in sync,
nothing that can race), pays no duplicated cost for the expensive part of
any panel (chart rendering, query execution), and is implemented once,
generically, in `panelExpandHost.tsx` — panel components themselves
(current and future) need zero awareness that this mechanism exists.

### 1a. Rejected approach: `forceMount` — tried, found unsafe, reverted (not part of the shipped design; kept as history)

The plan going into implementation was `forceMount`: keep `DialogContent`
permanently mounted (paired with a `data-[state=closed]:hidden` CSS class)
so the dialog-side portal target is populated synchronously the instant
`expanded` flips, with the stated cost being "Radix's lightweight Dialog
wrapper staying mounted per card, not a second copy of panel content."

That cost estimate was wrong — not in degree, but in kind. Empirically
(a real Playwright regression during implementation, not something caught
by reasoning first): with `forceMount`, every panel card's `DialogContent`
mounts immediately on page load. `@radix-ui/react-dialog`'s MODAL content
variant (`DialogContentModal`, the default) runs the `aria-hidden`
package's `hideOthers(content)` in a **mount-only effect** —
`React.useEffect(() => { ...hideOthers(content) }, [])`, empty deps, not
gated on `open` at all. With every panel's `DialogContent` mounting at
once, every one of them called `hideOthers()` immediately, each marking
everything *outside itself* `aria-hidden` — collectively hiding most of
the page from assistive tech (and from Playwright's `getByRole` queries,
which respect the accessibility tree) before any panel was ever expanded.
Confirmed directly by reading `node_modules/@radix-ui/react-dialog/dist/
index.mjs`, not just inferred from the test failure.

**Corrected decision**: don't force-mount. `DialogContent` mounts normally,
only once `expanded` is actually `true`, via Radix's own Presence —
exactly how the library is designed to be used. This is a **cheaper** fix
than `forceMount` was trying to buy: no CSS-hide class needed (Content
isn't in the DOM at all when closed, so there's nothing to hide), and the
`aria-hidden`-everything-permanently bug simply can't occur, since
`hideOthers()` now only ever runs while a panel is genuinely expanded (the
one time hiding the rest of the page from assistive tech is actually
correct modal behavior). `DialogContent` now exists in the DOM only while
a panel is actually expanded, same as any ordinary Radix dialog — no
"Radix wrapper mounted at all times" cost, genuinely free of the concern
the original estimate raised, not merely cheaper than feared.

**Verification, confirmed against source**: Radix's own implementation
gates focus-trap/`DismissableLayer` behavior (`trapFocus: context.open`,
`disableOutsidePointerEvents: context.open`, read directly from
`node_modules/@radix-ui/react-dialog/dist/index.mjs`) on its internal
`open` context value — `open={false}` behaves as a fully inert, normal
page with no stray focus trap or Escape hijack, confirmed both by reading
the source and by a dedicated Playwright assertion (§4).

Dropping `forceMount` reopens a timing question the original design used
it to sidestep: right after `expanded` flips `true`, `DialogContent`
hasn't mounted yet for one render, so the dialog-side relocation target
isn't available yet either. §1b's corrected mechanism resolves this the
same way it resolves everything else about target availability — by never
depending on a target being ready in the first place.

### 1b. Rejected approach: portal-target swap doesn't preserve mount state (not part of the shipped design; kept as history — this is why Candidate C's description above uses a persistent host node instead)

The original design's load-bearing claim was: `createPortal(children,
targetNode)`, called at the same position in the render tree, preserves
`children`'s mounted state (its component instance, `useState`,
`useEffect`s) when only `targetNode` changes between renders — React
reconciles `children` normally and merely re-parents the existing DOM
output.

That claim is **false**, discovered empirically during implementation
(not caught by reasoning first — this is exactly the class of assumption
this feature's own research repeatedly insisted on verifying for *other*
mechanisms, and this one didn't get the same scrutiny before being built
on). Two independent, concrete measurements proved it:

- A debug log of every SQL string passed to `services/duckdb.ts`'s
  `query()` (added for this feature's own no-duplicate-query test, §4)
  showed a panel's query count jump from 2 (React 18 StrictMode's normal
  dev-mode double-invoke on the one genuine initial mount) to 4 after
  expanding, to 6 after collapsing — each `+2` exactly matching another
  full StrictMode-doubled *mount* event, not a stable component receiving
  a prop update.
- A custom DOM attribute manually set on a chart panel's container
  element before expanding was gone after expanding — proof the container
  itself had been destroyed and a new one created, not merely moved.

Both are consistent with one real cause: React's reconciliation of a
portal keys on its container argument, and treats a *changed* container as
a different portal — unmounting the old one's subtree and mounting a new
one, not a lightweight reparent the way an ordinary host element's changed
prop would be. Changing `createPortal`'s target between renders reproduces
the exact problem Candidate C existed to avoid, just one layer removed
from where it was expected.

**Corrected mechanism**: the proven technique for this exact problem — the
same one `react-reverse-portal` (§1's "Alternatives considered," below)
implements — is to never change the portal's container at all. `children`
is portaled into **one persistent DOM node**
(`portalHostRef.current`, a bare `document.createElement('div')` created
lazily on first render and never replaced — `createPortal`'s container
argument is therefore `Object.is`-stable across every render, so React's
portal reconciliation only ever sees a children update). That persistent
node is then **imperatively moved** — a plain `appendChild`, entirely
outside React's own reconciliation — between two ordinary React-rendered
"anchor" elements (`inlineAnchor` in the card, `dialogAnchor` in the
Dialog), inside a `useLayoutEffect` keyed on `expanded`/the anchors. Using
a layout effect (not a passive one) matters for two reasons: it runs
synchronously before the browser paints (no visible flash of the old
position), and React flushes every layout effect in a commit before any
passive effect — so by the time a portaled panel's own data-fetch/
`Plotly.react()` effect (a passive effect) reads its container's real
layout dimensions, this hook's DOM move has already attached it to a
visible anchor, avoiding the "measuring a detached node" problem a naive
ordering would hit.

This also resolves §1a's reopened timing question for free: the persistent
host node doesn't care whether `dialogAnchor` exists yet on a given
render — the `useLayoutEffect` simply does nothing until an anchor is
available, and `children` stays portaled in the one stable host node the
entire time regardless, never losing its target even transiently.

**Re-verified after the fix**: the same debug query-count log now shows no
change across an expand/collapse round trip on an already-loaded panel;
the container-identity check now passes (a marker attribute survives
expand/collapse intact) — both via the actual Playwright suite, not
re-asserted from theory a second time.

**Alternatives considered and rejected**:
- *CSS-only relocation* (`position: fixed` on the panel's own container,
  no real Radix `Dialog` involved) — rejected outright: the spec (FR-004,
  FR-005, FR-012) explicitly requires Radix's actual focus-trap/
  Escape/outside-click behavior, "inherited free," not re-derived by hand.
  A CSS-only approach has no dialog to inherit that from.
- *`react-reverse-portal`* (a small library purpose-built for exactly this
  "move a live DOM subtree between two React trees" problem) — the
  original decision here declined it, reasoning that a plain `createPortal`
  target swap was directly expressible with React's own API "in well under
  the size of a new dependency." That reasoning wasn't wrong about the
  library being avoidable — it was wrong about the plain target swap
  actually working, per §1b above. The corrected mechanism is,
  functionally, the same technique that library provides (a stable portal
  host node, imperatively relocated) — hand-rolled directly rather than
  adding the dependency, since once the *correct* technique was known it
  was still small and self-contained enough not to need it, matching
  `003`'s research.md's same reasoning for declining
  `@testing-library/react`.

---

## 2. Radix outside-click detection vs. Plotly's own click interactivity (e.g. legend toggling)

FR-004 requires outside-click-to-close, inherited from Radix's
`DismissableLayer` (used internally by `Dialog.Content`). The specific risk
flagged: does clicking a Plotly legend entry (to toggle a trace's
visibility) get misidentified as "outside the dialog" and close it?

**Reasoning**: Radix's outside-click detection is a DOM-containment check —
on `pointerdown`, it asks whether `event.target` is a descendant of the
dialog content's own ref'd DOM node, not anything Plotly-specific. Once a
panel is expanded, its container (and everything Plotly draws inside it —
the legend included) is a real DOM descendant of `DialogContent` (portaled
to `document.body`, but still a descendant *of that portaled node*, which is
what Radix's containment check is against). A legend entry is not a
separate overlay Plotly portals elsewhere in the document — Plotly draws its
legend as ordinary SVG content inside the same chart container the rest of
the trace lives in, with a click handler bound directly on that in-tree
element. On DOM-containment grounds alone, this should not misfire.

The known real failure mode for this class of bug is different: a widget
that portals *its own* interactive surface to a location outside the
dialog's DOM subtree (e.g. a native `<select>`'s dropdown, or a third-party
picker appended directly to `document.body` as a sibling rather than a
descendant) — Radix's containment check would then correctly-by-its-own-
logic, but incorrectly-for-the-user, treat a click on that surface as
"outside." Plotly's legend isn't that shape for the specific interaction
this spec calls out (toggle-trace-visibility by clicking a legend entry).
Plotly *does* have features that behave more like true overlays in other
configurations (e.g. `config.editable`'s inline text-editing input,
certain modebar dropdown menus) — none of which this feature's scope
touches, but worth naming so a future feature enabling those doesn't
inherit an unverified assumption from this one.

**Decision**: Proceed with Radix's default outside-click handling — no
custom `onInteractOutside` override on `DialogContent`. This is a reasoned
expectation, not a verified fact, and the user was explicit that it must
not be treated as one. A dedicated Playwright test is a required part of
this feature (not optional/nice-to-have): expand a chart-type panel, click
a rendered legend entry, and assert (a) the traced legend toggle actually
took effect (trace visibility changed) and (b) the dialog is still open
afterward. This is written into `quickstart.md`'s validation scenarios and
must be part of `tasks.md`'s test coverage before this feature is
considered done — if the test fails, the fallback is a scoped
`onInteractOutside` handler that ignores events whose target is inside the
panel's own container ref, not a redesign of the mechanism.

---

## 3. Dialog primitive — `src/components/ui/dialog.tsx`

**Decision**: Hand-authored, following the exact pattern `tabs.tsx`/
`tooltip.tsx` already established (`002-design-tokens`) — a thin wrapper
around `@radix-ui/react-dialog`'s primitives styled with this project's own
tokens, not shadcn CLI output (there is no shadcn CLI step in this repo's
build; `002`'s own components were hand-authored to match shadcn's shape).
Exports: `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`,
`DialogContent`, `DialogClose`, `DialogTitle`, `DialogDescription`. No
`forceMount` handling — tried during implementation, reverted (§1a):
`DialogContent` just mounts/unmounts normally via Radix's own Presence.

Two correctness details worth stating explicitly, since they're easy to
silently get wrong:
- `DialogContent` leaves `aria-describedby` unset unless a caller
  explicitly passes one — Radix's own internal default
  (`context.descriptionPresent ? context.descriptionId : undefined`)
  already computes this correctly (verified against source during
  implementation; an earlier draft re-set it to `undefined`
  unconditionally, which would have broken the case where a
  `DialogDescription` *is* actually present).
- `DialogContent` always renders a visible `DialogTitle` showing the panel's
  own `config.title` — not a visually-hidden accessible-name-only title —
  so a user landing in the expanded view doesn't lose the "what am I
  looking at" context `panelCard.tsx`'s own `CardTitle` normally provides.

**Rationale**: Matches constitution Principle VI exactly (shadcn/ui, built
on Radix UI primitives) — this is the same component family already used
for `Tabs`/`Tooltip`, not a new UI pattern, per the user's own framing.

---

## 4. Sizing, trigger placement, and icon

**Decision**: The expand trigger is a small icon-only `Button`
(`variant="ghost" size="icon"`, matching the existing `button.tsx`
variants) placed in `panelCard.tsx`'s `CardHeader`, next to `CardTitle`,
using `lucide-react`'s `Maximize2` icon (`aria-label="Expand {title}"` — no
visible text label, consistent with how compact per-panel controls read in
a dense dashboard grid). `DialogContent` sizes to
`w-[95vw] h-[90vh] max-w-[1600px]` — large enough to read as
"near-fullscreen" per spec.md's Assumptions, capped so it doesn't stretch
absurdly wide on very large monitors, and naturally shrinks to fit narrow
viewports since it's expressed in viewport units, not a fixed pixel size.

**Rationale**: `Maximize2` is the conventional "expand to large/fullscreen"
icon (distinct from `Expand`, which reads more like "expand a tree/list
item" in common icon-set usage); reusing `button.tsx`'s existing `ghost`/
`icon` variant means no new button style is introduced for this one
control.

---

## 5. Expanded-panel state — local to each panel, not lifted/global

**Decision**: `expanded` is a plain `useState<boolean>` local to each
`panelExpandHost.tsx` instance — no dashboard-level "which panel is
currently expanded" store.

**Rationale**: spec.md's Assumptions state only one panel's expanded view
can be open at a time, with opening a second closing the first — but this
falls out for free rather than needing to be actively enforced: once one
panel's Dialog is open (`forceMount`'s DOM presence aside, it's only
*visually* full-screen and only *functionally* focus-trapping once
`open={true}`), its backdrop covers the entire viewport, so there is no way
for the user to reach a second panel's trigger button without first
dismissing the one already open (Escape, outside-click, or its own close
control) — each of which is handled by that panel's own local state.
Likewise, spec.md's tab-switch edge case (switching tabs closes any open
expanded view) requires no special handling: switching the active tab in
`dashboardRenderer.tsx` renders a different tab's panel list, which
unmounts the previous tab's `PanelCard`/`panelExpandHost.tsx` instances
entirely (including whichever one had `expanded: true`), so the dialog
disappears as a direct consequence of the component unmounting, not a
tracked case to handle explicitly.

**Alternatives considered**:
- *Lift to a single dashboard-level "expandedPanelId" store* — rejected:
  would add a new piece of shared state and a subscription mechanism for a
  guarantee that already holds structurally, for no behavior the local-state
  version doesn't already provide.

---

## 6. Testing strategy

**Decision**: No new pure-logic module exists to unit-test with Vitest this
time — the portal-target-swap mechanism is inherently DOM/React-dependent
(refs, `createPortal`, Radix's own internals), unlike `003`'s
`panelQuery.ts`/`plotlyTraces.ts`. All verification is a new Playwright
spec, `tests/integration/panelExpand.spec.ts`, extending the same
real-browser/real-fixture-data pattern `dashboardShell.spec.ts` already
established, covering:
- Expand opens the large view showing the same data as the card.
- Escape, outside-click, and the explicit close control each close it;
  focus returns to the trigger button afterward.
- Tab trapping: `Tab`/`Shift+Tab` cycle only within the dialog while open.
- No re-fetch across expand/collapse — asserted by instrumenting the
  panel's query call count (or, for the chart case, by asserting the
  `Plotly.react()` target DOM node's identity is unchanged across the
  round trip, which is only possible if the container was never recreated).
- The chart-container-identity/resize check from `003`'s own regression
  class: an expanded chart panel actually redraws to fill the larger
  container (not left at its small-card size).
- The Plotly-legend-click-does-not-close-the-dialog case from §2.
- A value-box panel (the "less obviously useful" case named in spec.md)
  expands with no per-type exception or missing control.

**Rationale**: Same reasoning `003`'s research.md §5 already established for
this codebase — Playwright already exercises the real render path against
real (fixture) data; adding `@testing-library/react` or similar for this
feature's DOM-heavy, portal-specific mechanism would be redundant with, not
complementary to, that existing coverage.

---

## 7. New dependency

**Decision**: Add `@radix-ui/react-dialog` to `package.json`, pinned to the
same `^1.1.x` major/minor line already used for `@radix-ui/react-tabs`
(`^1.1.1`) and `@radix-ui/react-tooltip` (`^1.1.4`) — consistent versioning
across the Radix primitives this project has adopted, exact patch resolved
at install time.

---

## Summary

| # | Decision |
|---|---|
| 1 | Single panel-component instance per card, relocated (not swapped via `createPortal`'s own target — tried, found to unmount/remount, §1b) between an inline location and a Dialog location via a persistent portal host node, imperatively moved by `useLayoutEffect` — chosen over lifting query state into a shared cache (would rewrite the panel pattern itself) and over literal dual-render-from-one-instance (silently recreates the chart container on every toggle) |
| 1a | `forceMount` (the original plan for keeping the dialog-side target always available) was tried and reverted — it caused Radix's MODAL `Content` variant to hide the whole page from assistive tech on mount, confirmed via a real Playwright regression, not just source-reading |
| 1b | The relocation mechanism itself needed correcting mid-implementation: `createPortal(children, targetNode)` with a changing `targetNode` does not preserve mounted state (verified via a query-count log and a container-identity marker, both showing a real remount) — replaced with a stable portal container, moved imperatively outside React's reconciliation (the same technique `react-reverse-portal` implements) |
| 2 | Radix's default outside-click handling is safe against Plotly legend clicks (confirmed via a real Playwright test, not just DOM-containment reasoning) — needed two real test-mechanics fixes along the way (removing Plotly's modebar overlay, polling for Plotly's own async trace-visibility update), not a mechanism change |
| 3 | New `src/components/ui/dialog.tsx`, hand-authored to match `tabs.tsx`/`tooltip.tsx`'s existing pattern; leaves `aria-describedby` to Radix's own correct default, always shows a visible title, no `forceMount` handling (§1a) |
| 4 | Expand trigger: `Maximize2` icon, ghost/icon `Button`, in `CardHeader`; `DialogContent` sized `w-[95vw] h-[90vh] max-w-[1600px]` — required adding an `icon` size variant to `button.tsx` (none of the existing variants fit a label-less trigger) |
| 5 | `expanded` state is local per panel card, not lifted to a dashboard-level store — single-open-at-a-time and tab-switch-closes-it both fall out for free (confirmed: switching tabs while expanded is structurally unreachable, not merely handled — Radix's modal blocks the click from ever landing on a nav tab) |
| 6 | Playwright-only (`tests/integration/panelExpand.spec.ts`, 16 tests) — no new pure-logic module to unit-test, no new component-testing library. One small, purely additive test instrumentation added: `services/duckdb.ts`'s `__debugQueryLog()`, for a deterministic (not timing-based) proof of FR-008 |
| 7 | `@radix-ui/react-dialog` `^1.1.x` (resolved to `1.1.23`), matching the existing Radix primitive version line |
| 8 | `PlotlyPanel.tsx`'s container height changed from a hardcoded pixel default to `100%` — found necessary for FR-009 (the container never grew into the dialog otherwise); the one place this feature's "zero panel-type awareness" goal didn't fully hold, and the only line actually changed in either panel component |
