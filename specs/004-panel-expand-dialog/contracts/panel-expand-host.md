# Contract: `layout/panelExpandHost.tsx`

Satisfies: FR-001 through FR-011. The generic mechanism this feature exists
to build — implemented once, panel-type-agnostic, per research.md §1.

**Two corrections found during implementation**, both explained in full in
research.md (§1 hook shape; §1a `forceMount`; §1b the portal mechanism
itself) — summarized here since they change this contract's actual shape:

1. This is a **hook** (`usePanelExpandHost`), not a wrapping component as
   originally sketched. The expand trigger button belongs visually in
   `panelCard.tsx`'s `CardHeader`; the panel's actual content must render
   in `CardContent`. A single component invocation can only place its
   whole rendered output as siblings at one point in the JSX tree — a hook
   can hold one persistent set of state/refs and hand back multiple
   independent pieces of UI (`{ trigger, body }`) for the caller to place
   wherever each visually belongs.
2. The relocation mechanism is **not** a `createPortal` target swap between
   two different DOM nodes — that was tried and found, empirically, to
   remount the portaled content on every expand/collapse (research.md
   §1b). The corrected mechanism portals into **one persistent DOM node**,
   created once and never replaced, which is then **imperatively moved**
   (`appendChild`, outside React's reconciliation) between two ordinary
   anchor elements.

## Shape

```tsx
export function usePanelExpandHost(
  title: string,
  children: ReactNode, // exactly one <PanelComponent config={config} /> element, or null
  options?: { height?: number }, // common PanelConfig field — sizes the inline (collapsed) presentation only
): { trigger: ReactNode; body: ReactNode } {
  const [expanded, setExpanded] = useState(false)
  const [inlineAnchor, setInlineAnchor] = useState<HTMLDivElement | null>(null)
  const [dialogAnchor, setDialogAnchor] = useState<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Created lazily, once, on first render — never replaced. createPortal's
  // container argument below is therefore Object.is-stable across every
  // render, which is the entire fix for research.md §1b's finding.
  const portalHostRef = useRef<HTMLDivElement | null>(null)
  if (!portalHostRef.current) {
    portalHostRef.current = document.createElement('div')
    portalHostRef.current.style.height = '100%'
    portalHostRef.current.style.width = '100%'
  }

  useLayoutEffect(() => {
    const host = portalHostRef.current
    const target = expanded && dialogAnchor ? dialogAnchor : inlineAnchor
    if (host && target && host.parentElement !== target) {
      target.appendChild(host) // imperative move — outside React's reconciliation
    }
  }, [expanded, inlineAnchor, dialogAnchor])

  const trigger = (
    <Button ref={triggerRef} variant="ghost" size="icon" aria-label={`Expand ${title}`} onClick={() => setExpanded(true)}>
      <Maximize2 />
    </Button>
  )

  const body = (
    <>
      <div ref={setInlineAnchor} style={{ height: options?.height, display: expanded ? 'none' : undefined }} />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          className="flex h-[90vh] w-[95vw] max-w-[1600px] flex-col"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus() // Radix's own default no-ops — see below
          }}
        >
          <DialogTitle>{title}</DialogTitle>
          <div ref={setDialogAnchor} className="min-h-0 flex-1" />
        </DialogContent>
      </Dialog>

      {createPortal(children, portalHostRef.current)}
    </>
  )

  return { trigger, body }
}
```

`panelCard.tsx` calls this hook unconditionally (React's rules of hooks —
even when `PanelComponent` doesn't resolve, `children` is just `null`),
placing `trigger` in `CardHeader` and `body` in `CardContent`, and passing
`{ height: config.height }` (`contracts/panel-card.md` shows the actual
call site).

**Why `onCloseAutoFocus` is set explicitly (FR-006)**: Radix's own default
focus-return refocuses whatever registered itself via `<DialogTrigger>`'s
ref. `trigger` and `body` here are deliberately two separate pieces of UI
this hook returns (placed by the caller in `CardHeader`/`CardContent`
respectively), not nested under one `<Dialog>` in the rendered tree the
way `<DialogTrigger>` requires — so Radix's own `triggerRef` is never
populated and its internal fallback silently no-ops. Managing it
explicitly here achieves the same user-visible guarantee without needing
`<DialogTrigger>`.

## Structural guarantees

- **Exactly one mounted `children` instance, ever.** `children` is the
  single `<PanelComponent config={config} />` element `panelCard.tsx`
  constructs once per render, passed into the hook; it is portaled into
  exactly one DOM node (`portalHostRef.current`), which itself is never
  duplicated, replaced, or removed while the hook is mounted.
- **The portal's container never changes, so React's portal reconciliation
  never sees anything but a children update.** This is the load-bearing
  fix for research.md §1b's finding — `createPortal(children,
  portalHostRef.current)`'s second argument is the exact same object
  reference on every render, by construction (lazy-created once via the
  `if (!portalHostRef.current)` guard, never reassigned).
- **Visual relocation is a plain DOM `appendChild`, entirely outside
  React's reconciliation**, run in a `useLayoutEffect` — synchronously
  before paint (no visible flash), and guaranteed to run before any
  passive effect in the same commit (React flushes all layout effects
  before any passive effect), which is what lets a portaled panel's own
  data-fetch/`Plotly.react()` effect safely measure real, attached-to-the-
  document layout dimensions rather than a still-detached node's.
- **No `forceMount`.** `DialogContent` mounts only while `expanded` is
  `true`, via Radix's own Presence — research.md §1a's correction. There
  is no "box hidden via CSS while permanently mounted" state to maintain;
  `DialogContent` simply isn't in the DOM at all while collapsed.
- **`panelCard.tsx`'s error boundary sits outside this hook's concern**,
  not wrapped by it — a render-time throw from `children` is caught the
  same way whether it happens while inline or while expanded, since it's
  the exact same mounted element in both cases (data-model.md's
  Relationships diagram; `panelCard.tsx` wraps `PanelComponent` in
  `PanelErrorBoundary` *before* passing it in as `children`).
- **No knowledge of panel types, `PanelConfig` shapes, or the registry**
  beyond the one common field (`height`) needed to keep the collapsed
  presentation's size unchanged from before this feature existed.
  `usePanelExpandHost` never inspects `children`'s type or props — this is
  what makes it correct for `ValueBoxPanel`, `PlotlyPanel`, and any future
  registry entry with zero changes to this file.

## Given/When/Then

- **Given** a panel card with data already loaded, **when** the user clicks
  its expand trigger, **then** the same rendered panel content (not a
  re-fetch, not a fresh loading state) appears inside a large dialog
  (FR-001, FR-003, FR-007) — verified via a query-call-count log across
  the round trip, not merely asserted (research.md §1b, `tests/
  integration/panelExpand.spec.ts`).
- **Given** the expanded dialog is open, **when** the user presses Escape,
  clicks outside it, or activates its close control, **then** it closes and
  the panel's content reappears inline at its normal card size, still
  showing the same data, with focus back on the trigger button (FR-004,
  FR-006, US2 acceptance scenario 1).
- **Given** a chart-type panel is expanded, **when** the dialog opens,
  **then** the chart redraws to fill the dialog's actual dimensions — its
  container DOM node identity is unchanged (verified via a marker
  attribute surviving the round trip), and `003`'s `ResizeObserver` effect
  (unmodified) reports the size change and triggers
  `Plotly.Plots.resize()` exactly as it would for any other container
  resize (FR-009) — this additionally required a small, in-scope fix to
  `PlotlyPanel.tsx` itself (its container's hardcoded pixel height
  couldn't grow into the dialog; changed to fill whatever real container
  it's placed in — see `contracts/panel-card.md`'s note and research.md).
- **Given** a panel's query is still in flight, **when** the user expands
  it before the query resolves, **then** the dialog shows the same loading
  state the card was already showing, and the query that eventually
  resolves is the same single query — never a second one triggered by the
  expand action (FR-008).
- **Given** the dialog is closed (`expanded: false`), **when** the rest of
  the page is used normally, **then** nothing about it is affected —
  `DialogContent` isn't even mounted, so there's no forceMount-style
  concern to verify here at all (research.md §1a).

## Non-goals for this feature

- No per-panel-type opt-out — every registry entry gets this mechanism
  uniformly (spec.md's ValueBoxPanel-inherits-it-too requirement).
- No resizable/draggable dialog — a single fixed near-fullscreen size
  (research.md §4).
- No deep-link/URL state for "this panel is expanded" — closing on tab
  switch (spec.md Edge Cases) is not something this mechanism actively
  handles; a modal Radix Dialog structurally prevents reaching the nav
  tabs at all while open (`disableOutsidePointerEvents`), so the scenario
  spec.md anticipated needing to clean up after never actually arises —
  the user must close the expanded view first, by construction.
