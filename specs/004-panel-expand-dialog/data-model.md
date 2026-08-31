# Data Model: Panel Expand-to-Dialog

**Feature**: `004-panel-expand-dialog` | **Date**: 2026-08-31

No new persisted data, no new config file, no new config file type
(constitution Principle VII unaffected — the expand affordance requires no
`dashboard-*.yaml` key of its own; it is uniform and always-on per FR-002,
so there is nothing for a config author to opt into or out of). This
feature's "data model" is purely the transient UI state and component
contracts `panelExpandHost.tsx`/`panelCard.tsx`/`dialog.tsx` introduce.

---

## ExpandState (conceptual, not a named type)

| Field | Type | Scope | Notes |
|---|---|---|---|
| `expanded` | `boolean` | Local `useState`, one instance per `panelExpandHost.tsx` | Not lifted to a dashboard-level store — research.md §5 |
| `inlineAnchor` | `HTMLDivElement \| null` | Local `useState`, set via callback ref | Ordinary React-rendered `<div>` in the card body — a visible destination, not a portal target itself |
| `dialogAnchor` | `HTMLDivElement \| null` | Local `useState`, set via callback ref | Ordinary React-rendered `<div>` inside `DialogContent` — only exists in the DOM while `expanded` is `true` (no `forceMount` — research.md §1a) |
| `portalHostRef.current` | `HTMLDivElement` (never `null` after first render) | `useRef`, lazily created once via `document.createElement('div')`, never replaced | The actual `createPortal` container — its identity never changes across renders, which is the entire fix for research.md §1b's finding |

**Derived, via `useLayoutEffect`**: the target anchor is
`expanded && dialogAnchor ? dialogAnchor : inlineAnchor`; whenever it
differs from `portalHostRef.current`'s actual current DOM parent, the
effect calls `target.appendChild(portalHostRef.current)` — a plain,
imperative DOM move, outside React's own reconciliation. The single
mounted `<PanelComponent config={config} />` instance (passed in as
`children`) is portaled into `portalHostRef.current` via
`ReactDOM.createPortal(children, portalHostRef.current)` — this call's
second argument never changes, so React only ever sees `children`
updates, never a container change (research.md §1b — the original
design portaled directly into `inlineHost`/`dialogHost`, i.e. swapped
`createPortal`'s own target between renders; that was found, empirically,
to unmount and remount `children` on every expand/collapse, which is the
opposite of what Candidate C exists to guarantee).

**Invariant**: `portalHostRef.current` has exactly one DOM parent at any
time — either `inlineAnchor` or `dialogAnchor`, never both, never neither
once the first `useLayoutEffect` run completes.

---

## `usePanelExpandHost` signature

`src/layout/panelExpandHost.tsx`'s public contract — a hook, not a
component (shape correction found during implementation, contracts/
panel-expand-host.md: a single component invocation can't place its
output in two different tree locations a caller controls; a hook can hand
back multiple independent pieces of UI from one persistent set of state).

| Param/return | Type | Notes |
|---|---|---|
| `title` (param) | `string` | `config.title` — becomes the Dialog's visible `DialogTitle` |
| `children` (param) | `ReactNode` | Exactly one `<PanelComponent config={config} />` element (or `null`), rendered by `panelCard.tsx` and passed through unmodified |
| `options.height` (param, optional) | `number \| undefined` | `config.height` — a common `PanelConfig` field, not plotly-specific; sizes only the inline (collapsed) anchor, so a panel with no height opinion (e.g. `valuebox`) stays naturally auto-sized exactly as before this feature |
| `trigger` (return) | `ReactNode` | The icon-only expand `Button` — placed in `CardHeader` |
| `body` (return) | `ReactNode` | The inline anchor `<div>` + `Dialog` + the portaled `children` (via the persistent host node) — placed in `CardContent` |

**Contract**: `panelExpandHost.tsx` never inspects `children`'s type or
props — it has no knowledge of panel types, config shapes, or the registry.
This is what keeps the mechanism generic (FR-002/FR-009): it operates
identically whether `children` is a `ValueBoxPanel`, a `PlotlyPanel`, or any
future registry entry.

---

## Modified: PanelCard

`src/layout/panelCard.tsx` — existing component, modified.

| Change | Notes |
|---|---|
| `CardHeader` gains an expand-trigger `Button` (icon-only, `Maximize2`) alongside the existing `CardTitle`, rendered from `usePanelExpandHost`'s `trigger` return value | research.md §4 |
| The resolved `<PanelComponent config={config} />` (previously rendered directly inside `PanelErrorBoundary`) is now wrapped in `PanelErrorBoundary` and passed as the hook's `children` argument; `CardContent` renders the hook's `body` return value | `PanelErrorBoundary` still wraps the panel component — a render-time throw in either the inline or expanded presentation is caught the same way, since it's the same mounted element either way |

No other existing `panelCard.tsx` behavior changes — the "unknown panel
type" error state (FR-010's registry-miss case) still renders directly in
`CardContent` (not `body`, since there is no `PanelComponent` for the hook
to have portaled), and gets no expand trigger (nothing to expand for a
panel that never rendered).

---

## New: Dialog primitive (`src/components/ui/dialog.tsx`)

| Export | Wraps | Notes |
|---|---|---|
| `Dialog` | `DialogPrimitive.Root` | — |
| `DialogTrigger` | `DialogPrimitive.Trigger` | Unused by `panelExpandHost.tsx` — its own `Button` calls `setExpanded(true)` instead, since `trigger`/`body` are two independent pieces of UI this hook returns, not nested under one `<Dialog>` the way `<DialogTrigger>` requires (research.md, `contracts/panel-expand-host.md`) |
| `DialogPortal` | `DialogPrimitive.Portal` | — |
| `DialogOverlay` | `DialogPrimitive.Overlay` | Conditionally mounted, exactly like `DialogContent` — decorative only, holds no panel state |
| `DialogContent` | `DialogPrimitive.Content` | No `forceMount` — tried, found to break page accessibility outside the dialog (Radix's `hideOthers()` runs unconditionally on mount for the modal variant; research.md §1a). Mounts/unmounts normally via Radix's own Presence. Leaves `aria-describedby` unset unless a caller explicitly passes one — Radix's own internal default already computes it correctly when a `DialogDescription` is present (verified against source; research.md §3) |
| `DialogClose` | `DialogPrimitive.Close` | Rendered inside `DialogContent` as the explicit close control (FR-004) |
| `DialogTitle` | `DialogPrimitive.Title` | Always rendered visibly with `config.title` (research.md §3) |
| `DialogDescription` | `DialogPrimitive.Description` | Not used by this feature — exported for completeness/future use, matching how `002`'s primitives export the full Radix surface even where not every piece is consumed yet |

---

## Relationships

```
panelCard.tsx
  |
  +-- registry[config.type] lookup (unchanged, panels/registry.tsx)
  |
  +-- children arg: <PanelErrorBoundary><PanelComponent config={config} /></PanelErrorBoundary>
  |
  +-- usePanelExpandHost(config.title, children, { height: config.height })
        |                                              -> { trigger, body }
        +-- trigger  --> rendered in CardHeader
        |
        +-- body     --> rendered in CardContent
              |
              +-- inlineAnchor <div>  (style: height = options.height)
              |         ^
              |         | appendChild, in a useLayoutEffect
              |         | (imperative, outside React reconciliation)
              |         v
              +-- portalHostRef.current <div>  <----- createPortal(children, portalHostRef.current)
              |         ^                              (container identity never changes)
              |         | appendChild, same effect
              |         v
              +-- Dialog (no forceMount)
                    |
                    +-- DialogContent  (mounted only while expanded)
                          |
                          +-- DialogTitle (config.title)
                          +-- DialogClose
                          +-- dialogAnchor <div>
```

`PanelComponent` itself (`ValueBoxPanel.tsx`/any future registry entry) is
unmodified by this feature and has no relationship to `usePanelExpandHost`
beyond being (wrapped in `PanelErrorBoundary`) the `children` it portals —
the panel pattern (constitution v2.2.0) is unchanged. `PlotlyPanel.tsx` is
the one exception: its container's `height` style changed from a
hardcoded pixel default to `100%`, so it correctly fills whichever real
anchor `portalHostRef.current` is currently attached to (`contracts/
panel-card.md`) — a sizing fix, not a new relationship to this mechanism;
`PlotlyPanel.tsx` still has no idea `usePanelExpandHost` exists.
