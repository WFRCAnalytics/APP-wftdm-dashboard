# Contract: Sidebar Shell, Full-Page Mode, and Accordion Sub-Navigation

## Shell composition (`layout/shell.tsx`)

- `shell.tsx` renders a `SidebarProvider` (`components/ui/sidebar.tsx`)
  wrapping a `Sidebar` + `SidebarInset` pair, replacing the previous
  `position: fixed <header>` + `<main style={{ paddingTop }}>` structure
  entirely. No `ResizeObserver`/`headerHeight`/`paddingTop` state remains
  (research.md §5).
- `SidebarProvider`'s `open`/`setOpen` state is plain in-memory React
  state — no cookie, no `localStorage`/`sessionStorage` write anywhere in
  this feature (research.md §3).
- `<Sidebar>` contains, top to bottom: `SidebarHeader` (`DashboardBrand`
  + a `SidebarTrigger` collapse/expand button), `SidebarContent`
  (`sidebarNav.tsx`'s primary item list), `SidebarFooter`
  (`SettingsModal`'s existing trigger, unchanged).
- `<SidebarInset>` renders either `DashboardRenderer` (the active tab's
  ordinary multi-row layout) or a new full-page render path (below),
  chosen by whether the active tab resolves a full-page panel
  (`dashboardLayout.ts::findFullPagePanel()`).

## Primary navigation (`layout/sidebarNav.tsx`, replacing `navBar.tsx`)

- Renders one `SidebarMenuItem` per entry in the SAME `DashboardTabConfig[]`
  array `shell.tsx` already holds, in array order — no tab name, count,
  or order is hardcoded anywhere in this file (spec.md's own "Explicit
  scope boundary" section; research.md §1's confirmed parity with
  `navBar.tsx`'s existing `{tabs.map(...)}`).
- Each item shows `tab.header.icon` (resolved via the same
  `iconComponentFor()`-style lookup `ValueBoxPanel.tsx` already uses) when
  present, and `tab.header.tab` as its label. No icon configured → no
  icon rendered (never a default/placeholder substitute).
- Clicking an item calls the SAME `onTabChange`/`setActiveTab` callback
  `navBar.tsx`'s `Tabs`'s `onValueChange` already calls today — no new
  navigation/routing mechanism, this app still has no client-side router.
- The currently active item is visually distinguished (matching this
  app's own existing active-tab convention, e.g. `components/ui/tabs.tsx`'s
  `data-[state=active]:bg-accent data-[state=active]:text-accent-foreground`
  pairing).

## Accordion sub-navigation (User Story 3)

- While a tab with one or more `sections` entries is the active item,
  its own `SidebarMenuItem` shows a sub-list (one entry per
  `SectionConfig`) directly beneath it. A tab's sub-list is shown ONLY
  while that tab is active — switching the active tab immediately hides
  the previous tab's sub-list (no lingering/duplicate sub-items for an
  inactive tab).
- Implemented via plain conditional rendering keyed on `tab.header.tab
  === activeTab`, with manually-applied `aria-expanded`/`role="group"`
  attributes on the parent item — NOT a general Radix Collapsible/
  Accordion primitive (research.md §2's explicit reasoning: this
  feature's actual requirement has a single source of truth, already
  tracked, not independent per-item toggle state).
- Clicking a section sub-item calls `document.getElementById(
  \`section-${section.id}\`)?.scrollIntoView({ behavior: 'smooth', block:
  'start' })` (research.md §8) — no page navigation/reload, no new
  dependency.
- When the sidebar is in its collapsed icon-only state, NO tab's sub-list
  is rendered, regardless of which tab is active (FR-017) — consistent
  with every primary item also losing its text label in that state.
- A tab with no `sections` (or an empty array) shows no expand
  affordance and no sub-list — this is the default, unchanged appearance
  for every existing `dashboard-*.yaml` file today.

## Chromeless full-page mode (User Story 2)

- `dashboardRenderer.tsx` (or a new sibling component it delegates to for
  this one case) checks `dashboardLayout.ts::findFullPagePanel(activeTab)`
  before its normal row-rendering path. A non-null result means:
  - `activeTab.header.title`/`.description` are NOT rendered anywhere
    (the redundant page-title block this session measured is simply
    absent for this path — not blanked, never consulted).
  - The resolved single `PanelConfig` renders via the SAME
    `registry[config.type]` lookup + `PanelErrorBoundary` every other
    panel already uses — but WITHOUT `components/ui/card.tsx`'s `Card`/
    `CardHeader`/`CardTitle`/`CardContent` wrapper (no border, no shadow,
    no rounded corners, no panel-title bar) and WITHOUT
    `usePanelExpandHost`'s expand trigger (FR-011 — already
    maximally-sized, an expand control would be redundant; this also
    means the 004 expand-to-dialog portal-host mechanism is not invoked
    at all for a full-page panel, a simpler code path than the ordinary
    `PanelCard`).
  - The rendered panel's own outer container has a REAL, definite CSS
    height (not `auto`, not a percentage against an indeterminate
    ancestor) — established by the `<SidebarInset>`/full-page-branch
    ancestor chain, per research.md §5/§7. This is what closes the
    measured 635px/238px-chrome gap; `GraphicWalkerPanel.tsx`'s own
    existing `height: 100%` styling is expected to then resolve
    correctly with no change to that file itself (research.md §7 — to be
    confirmed empirically during implementation, not assumed).
  - A misconfigured `full_page: true` tab (0 or 2+ panels) falls back to
    the ordinary multi-row `Card`-chromed rendering, with a
    `console.warn` naming the problem — never a blank/broken page.
- `findFullPagePanel()`/the chromeless render path are generic across
  panel types at the mechanism level — nothing in this contract or its
  implementation references `graphic-walker`/"Explore Data" by name.
  `graphic-walker` is this feature's only required, validated consumer
  (FR-010, FR-012).

## What does NOT change

- `PanelCard`'s existing behavior for every ordinary (non-full-page) row
  is unchanged — same `Card`/`CardHeader`/`CardTitle`/`CardContent`
  chrome, same `usePanelExpandHost` expand trigger, same error-boundary
  wrapping.
- `panels/registry.tsx`'s type-to-component map is unchanged — the
  full-page path resolves a panel component through the exact same
  lookup, not a parallel registry.
- No panel type's own internal data-fetch/rendering logic changes as
  part of this contract, beyond what the height-chain investigation
  (research.md §7) may require purely in the ancestor chain.
- `FlowMapPanel.tsx`/`ZoneMapPanel.tsx` — no WebGL/map-lifecycle code is
  touched by anything in this contract (FR-022).
