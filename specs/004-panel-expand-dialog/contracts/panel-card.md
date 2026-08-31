# Contract: `layout/panelCard.tsx` (modified)

Satisfies: FR-001, FR-002, FR-010, FR-011 (isolation — unchanged from
`003`, re-verified against the new expand mechanism). Supersedes the
`panelCard.tsx` shape documented in `003`'s
`contracts/panel-registry.md` for the parts this feature changes; that
file's registry/`navBar`/`dashboardRenderer` sections are unaffected and
still apply as written.

## Shape

```tsx
export function PanelCard({ config }: { config: PanelConfig }) {
  const PanelComponent = registry[config.type]

  // Called unconditionally (React's rules of hooks) — passing `null` as
  // children when PanelComponent didn't resolve is harmless, per
  // contracts/panel-expand-host.md's shape correction (hook, not a
  // wrapping component — resolves the DOM-placement problem this
  // section originally flagged as deferred to tasks.md).
  const { trigger, body } = usePanelExpandHost(
    config.title,
    PanelComponent ? (
      <PanelErrorBoundary panelTitle={config.title}>
        <PanelComponent config={config} />
      </PanelErrorBoundary>
    ) : null,
    { height: config.height },
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{config.title}</CardTitle>
        {/* No expand trigger for an "unknown panel type" card — nothing
            valid to expand at any size. */}
        {PanelComponent && trigger}
      </CardHeader>
      <CardContent>
        {PanelComponent ? body : <PanelErrorState message={`Unknown panel type: "${config.type}"`} />}
      </CardContent>
    </Card>
  )
}
```

`PanelErrorBoundary` wraps `PanelComponent` *before* it's passed as
`children` into the hook — both orderings would catch the same throws
equally well (a boundary catches errors from anything below it in the
tree regardless of what's between it and the throwing component), but
this ordering keeps `usePanelExpandHost` itself fully generic per its own
contract (it never needs to know a `PanelErrorBoundary` exists) — the
boundary is `panelCard.tsx`'s concern, not `panelExpandHost.tsx`'s.

The DOM-placement problem this section originally flagged as deferred
(the inline slot needing to visually sit in `CardContent` while the
trigger sits in `CardHeader`) is resolved by the hook shape itself: `body`
(containing the inline host `<div>`, unaffected by anything in
`CardHeader`) is rendered directly inside `CardContent`, and `trigger`
(just the icon `Button`) is rendered directly inside `CardHeader` — no
special CSS positioning trick needed, because each piece is placed exactly
where it's meant to live in the JSX tree, by the caller, not relocated
after the fact.

## Given/When/Then

- **Given** any panel card whose `type` resolves in the registry, **when**
  it renders, **then** its header shows an expand trigger the user can
  activate (FR-001, FR-002) — including a `valuebox` panel, per spec.md's
  explicit "no per-panel-type opt-out" requirement.
- **Given** a panel card whose `type` does not resolve in the registry,
  **when** it renders, **then** it shows the existing "unknown panel type"
  error state and no expand trigger (nothing valid to expand).
- **Given** one panel card is expanded, **when** its sibling panels on the
  same tab are inspected, **then** none of them show any state change —
  expanding one panel remains fully isolated (FR-010, FR-011, carried
  forward unmodified from `003`).

## Also touched: `components/ui/button.tsx`, `panels/PlotlyPanel.tsx`

Neither was in this feature's original planned scope (plan.md's Technical
Context originally stated `PlotlyPanel.tsx`/`ValueBoxPanel.tsx` would
require zero changes) — both corrections found necessary during
implementation, documented transparently rather than left unmentioned:

- **`components/ui/button.tsx`**: no existing `size` variant fit an
  icon-only, label-less trigger — added `icon: 'h-10 w-10'` alongside the
  existing `default`/`sm`/`lg` variants. A general-purpose addition to an
  existing shared primitive, not scoped to this feature specifically.
- **`panels/PlotlyPanel.tsx`**: its chart container had a hardcoded pixel
  `height: config.height ?? 350` — correct for the card-only world `003`
  built it in, but it meant relocating the same container into the much
  taller expand dialog (`contracts/panel-expand-host.md`) never actually
  grew it; `Plotly.Plots.resize()` would run but had nothing taller to
  resize into. Changed to `height: '100%'`, so the container fills
  whichever real ancestor it's currently placed in — the inline card slot
  (now explicitly sized via `usePanelExpandHost`'s `{ height: config.height
  }` option above, so the collapsed presentation is visually unchanged) or
  the dialog's own flex-driven height. This is the one place this
  feature's "zero panel-type awareness" goal didn't fully hold — `FR-009`
  turned out to require it, and the change is a single CSS value, not a
  new awareness of the expand mechanism inside the panel itself.

## Flagged for `tasks.md` (resolved — kept for record)

The original concern here was that positioning the inline content slot to
visually sit inside `CardContent` while the trigger sits in `CardHeader`
might require a risky CSS repositioning trick, subtly wrong and invisible
without actually looking. The hook-based shape correction
(`contracts/panel-expand-host.md`) removed that risk structurally — `body`
and `trigger` are each rendered exactly where they're meant to live, no
relocation trick involved. The remaining, more mundane risk — `CardHeader`
changed from a stacked (`flex-col`) title-only layout to a row layout with
a newly added icon button, which could shift title spacing/baseline even
though no content was structurally relocated — still warranted an actual
screenshot comparison of a non-expanded panel card against its pre-`004`
appearance, not just a passing test suite. Done: both screenshots were
captured against the same fixture data (pre-`004` via `git stash` of the
tracked source changes, post-`004` after restoring them) and compared —
identical spacing, card size, and title baseline; the only visible
difference is the new expand icon itself.

## Non-goals for this feature

- No change to how `registry[config.type]` is looked up, or to
  `PanelErrorBoundary`'s own catch behavior — both are `003`'s existing,
  unmodified mechanisms.
