# Phase 0 Research: Left Sidebar Navigation, Accordion Sub-Sections, and a Chromeless Full-Page Panel Mode

Every decision below is grounded in a real, direct check performed during
this planning session — against this repo's own installed packages, its
own existing components, and shadcn/ui's real, current source — not
assumed from memory or from the spec's own framing alone.

## §1. Hand-author `sidebar.tsx`, adapted to this repo's legacy-registry/Tailwind-v3 conventions — do not port shadcn's `new-york-v4` source verbatim

**Decision**: `components/ui/sidebar.tsx` is a new, hand-authored file
(matching every existing `components/ui/*.tsx` in this repo except
`chart.tsx`'s own documented CLI-sourced exception), built against the
**structure and API surface** of shadcn's real `Sidebar` component
(`SidebarProvider`/`Sidebar`/`SidebarHeader`/`SidebarContent`/
`SidebarFooter`/`SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton`/
`SidebarTrigger`/`useSidebar`, `collapsible="icon"` mode) — but using this
repo's own individual `@radix-ui/react-*` package convention and
Tailwind v3-compatible class syntax, not the source fetched verbatim.

**Rationale**: `apps/v4/registry/new-york-v4/ui/sidebar.tsx` (fetched and
read directly this session) imports from the unified `radix-ui` meta-package
(`import { Slot } from "radix-ui"`), not the individual `@radix-ui/
react-slot` package every existing file in this repo's `components/ui/`
uses. This is the **exact same dual-registry-track distinction
`029-shadcn-chart-panel`'s own research.md §5/§13 already found and
documented** for `chart.tsx`: this repo's `components.json` has
`"style": "default"`, which resolves against shadcn's legacy registry
track — confirmed there, via a real `--dry-run`, to never serve the
`new-york-v4`-track source at all. Porting the `new-york-v4` `sidebar.tsx`
verbatim would introduce a second, inconsistent Radix-import convention
into this codebase and likely Tailwind v4-only class syntax this repo
(pinned to Tailwind `^3.4.15`) doesn't support — the same category of
mismatch `chart.tsx`'s own research explicitly investigated and avoided.

**Alternatives considered**:
- *Port `new-york-v4`'s `sidebar.tsx` verbatim.* Rejected — real,
  confirmed import/Tailwind-version mismatch above.
- *Run `npx shadcn@latest add sidebar` against this repo's own
  `components.json`.* Not attempted directly this session (no live CLI
  invocation was run for this specific research pass), but `029`'s own
  already-confirmed finding — this repo's legacy registry track still
  serves 2.x-generation source for other components it was checked
  against — makes it very unlikely to serve a Tailwind-v3-compatible,
  individually-imported `sidebar.tsx` either. Treated as unproven, not
  reached for, consistent with `chart.tsx`'s own "hand-author against the
  structure, don't trust the CLI for this repo's track" precedent.

## §2. New dependency surface is smaller than shadcn's generic `sidebar.tsx` implies — only `@radix-ui/react-separator` is genuinely new

**Decision**: Add exactly one new explicit `package.json` dependency,
`@radix-ui/react-separator` (already present transitively in
`node_modules/@radix-ui/` — confirmed via direct listing — but not
declared explicitly by any current file; this feature's own `sidebar.tsx`
imports it directly, so it needs its own explicit entry, matching how
every other `components/ui/*.tsx` file already declares its own Radix
dependency explicitly rather than relying on an undeclared transitive
one). No other new package is added.

**Rationale, checked package-by-package against what this app's own
architecture actually needs** (not what a generic Sidebar implementation
might use):

- **`@radix-ui/react-slot` — not needed.** Its whole purpose is letting a
  styled component (`SidebarMenuButton`) polymorphically render as a
  different element (`asChild`, e.g. a router `<Link>`) while keeping its
  own classes. This app has no client-side router — `NavBar`'s existing
  tab-switch mechanism is a local `activeTab` React state setter
  (`shell.tsx`), confirmed by direct read; the new sidebar items switch
  tabs the identical way. A plain `<button onClick={...}>` (or this
  repo's own existing `Button` component) needs no polymorphic-render
  capability here.
- **`@radix-ui/react-collapsible` — not needed.** shadcn's own docs use it
  for a GENERAL collapsible sidebar group, where each group has its own
  independent open/closed toggle state. This feature's actual requirement
  (FR-014–FR-017) is narrower and already has a single source of truth:
  exactly one tab's sections show at a time, driven entirely by which tab
  is already-tracked as active — never independent per-item toggle state.
  A plain conditional render (`{isActive && <SectionList />}`) with
  manually-applied `aria-expanded`/`role="group"` attributes covers the
  real requirement without the general-case machinery Radix's Collapsible
  exists to solve a harder, different problem (independent multi-region
  toggle state) than this feature has. This matches this project's own
  established pattern of hand-building simple, correctly-scoped
  interactions rather than reaching for a heavier primitive when the
  primitive's own generality isn't needed (e.g., `resetViewControl.ts`/
  `zonemap3dControl.ts` hand-build MapLibre `IControl`s rather than
  reaching for a UI library).
- **`Sheet` (mobile off-canvas overlay), and therefore no NEW use of
  `@radix-ui/react-dialog` beyond what's already installed — scoped out,
  not just deferred.** See §4 below for the full reasoning; the short
  version is that this repo has no established mobile/responsive
  precedent anywhere (`project-docs/ARCHITECTURE.md`/`project-docs/SPEC.md` never name it
  as a goal) and the existing icon-collapsed state already serves the
  narrow-viewport case without a second, structurally different overlay
  interaction.
- **`Skeleton` (per-menu-item loading placeholder) — not needed.** This
  app's dashboard list is already fully resolved (via `loadDashboards()`)
  before `ReactDOM.createRoot(...).render(...)` is ever called — confirmed
  by direct read of `main.ts`'s boot sequence and `wftdm-design-system`'s
  own already-documented app-boot-skeleton section, which exists
  specifically because no React tree is mounted during that window. By
  the time `Shell`/the sidebar renders, there is no per-item async loading
  state to skeleton — the whole primary-item list is already a resolved,
  synchronous array.
- **`Input` (an optional sidebar search box) — not needed.** No
  requirement in spec.md asks for a searchable sidebar; omitted rather
  than built speculatively (this project's own established discipline
  against unrequested scope, e.g. `wftdm-design-system`'s own "don't
  invent a new one-off value" rule applied here to component surface, not
  just CSS values).

**Alternatives considered**: Installing the full generic set (`Slot`,
`Collapsible`, `Sheet`'s `Dialog` reliance, `Skeleton`, `Input`) to match
shadcn's own reference implementation exactly. Rejected — every one of
the five was checked against this app's own real architecture and found
either already covered by an existing primitive, or solving a problem
this feature doesn't actually have; adding them regardless would be
scope/dependency-footprint creep with no corresponding requirement.

## §3. Sidebar expand/collapse state is in-memory only — no cookie, no Web Storage

**Decision**: `useSidebar`'s `open`/`setOpen` state is plain React state
(`useState`, scoped to `SidebarProvider`), reset to a sensible default on
every load. No `document.cookie` write (shadcn's own real default
mechanism — confirmed via direct source read: `SIDEBAR_COOKIE_NAME =
"sidebar_state"`, a 7-day-`max-age` cookie written on every `setOpen`
call), no `localStorage`/`sessionStorage`.

**Rationale**: this app has an already-established, consistent
"UI-preference state does not persist across reloads" convention —
`state/basemapState.ts`'s own real precedent explicitly states "No
persistence (FR-015)" for the exact same class of decision (a
viewer-set, non-content preference). Constitution Principle VI names
`localStorage`/`sessionStorage` specifically, not cookies literally, but
introducing a NEW persistence mechanism this app has never used, for a
class of state this app has consistently chosen not to persist at all,
would contradict the same rationale the principle exists for ("keeps
state explicit and inspectable... avoids Web Storage") without actually
being blocked by its literal wording — the stricter, more consistent
choice is the one taken here.

**Alternatives considered**: Keep shadcn's own cookie default (simplest
port). Rejected — inconsistent with this app's own established pattern,
and a genuinely new persistence mechanism (cookies) this codebase has
never used anywhere, for no stated requirement (nothing in spec.md asks
for the sidebar's collapsed state to survive a reload).

## §4. No dedicated mobile off-canvas experience — the existing icon-collapsed state also covers narrow viewports

**Decision**: Below a chosen narrow-viewport breakpoint, the sidebar
automatically applies the SAME icon-collapsed state the manual toggle
already produces (a plain CSS/`matchMedia`-driven default, not a second,
different interaction). No `Sheet`/off-canvas-overlay component is built.

**Rationale**: this project's own architecture docs (`project-docs/ARCHITECTURE.md`,
`project-docs/SPEC.md`) never name mobile/responsive support as a goal anywhere —
this is a desk-based calibration-analyst tool, not a consumer app with an
established mobile audience. Building a genuinely different third
interaction mode (a full-screen slide-over) for a scenario this project
has no stated need for would be real, unrequested scope. Reusing the
icon-collapsed state at narrow widths is the smaller, more consistent
choice — it introduces no new component, no new Radix dependency (§2),
and no new interaction model a viewer has to learn; it simply applies an
existing state under an additional trigger condition (narrow viewport)
alongside the existing one (manual click).

**Note — this refines, and slightly narrows, spec.md's own Edge Cases
wording** ("the sidebar's own built-in responsive behavior (collapsing to
an off-canvas/sheet overlay) applies unmodified"), which was written
before this planning session's own dependency-by-dependency check. The
spec's underlying INTENT — "this feature does not invent a separate,
custom breakpoint or mobile-specific interaction of its own" — is fully
honored by this decision; the specific mechanism named there (an
off-canvas sheet) is what's being narrowed, on the grounds that it would
actually be a NEW, separate interaction this app has no precedent or
stated need for, not simply "applying the primitive's own built-in
behavior unmodified" the way the spec assumed before this check.

**Alternatives considered**: Port shadcn's own `Sheet`-based mobile
behavior verbatim. Rejected per the reasoning above — real, unrequested
scope with no corresponding need, and a new dependency-adjacent build
(`components/ui/sheet.tsx`) this feature doesn't otherwise require.

## §5. `shell.tsx`'s `ResizeObserver`/`headerHeight`/`paddingTop` measurement machinery is removed, not adapted

**Decision**: The entire header-height-measurement mechanism (`headerRef`,
`useLayoutEffect`, the `ResizeObserver`, `headerHeight` state, `<main
style={{ paddingTop: headerHeight }}>`) is deleted along with
`useNavBarVisibilityMode`/`useScrollDirection` — not carried forward in
any adapted form.

**Rationale**: that whole mechanism exists for exactly one reason,
confirmed by its own extensive code comments (read directly this
session): compensating `<main>`'s layout for a `position: fixed` header
that has been removed from normal document flow — including a real,
previously-fixed border-box-vs-content-box measurement bug specific to
that fixed-positioning approach. A sidebar-based layout (`SidebarProvider`/
`Sidebar`/`SidebarInset`) is an ordinary flex/grid sibling arrangement —
nothing overlaps page content, so nothing needs pixel-measured
compensation. This is a structural consequence of the layout change
itself, not a decision requiring its own separate justification beyond
noting it plainly (so the removal of a real, previously hard-won piece of
code isn't mistaken for a regression later).

**Alternatives considered**: Keep the measurement machinery in case a
slim top bar is still needed for something. Rejected — nothing in
spec.md requires any top-bar content once `DashboardBrand` (→
`SidebarHeader`) and `Settings` (→ `SidebarFooter`) both relocate into
the sidebar (FR-004/FR-005); there is nothing left needing a horizontal
bar of its own.

## §6. `navBar.tsx` is deleted, not kept as an unused primitive

**Decision**: `layout/navBar.tsx` is deleted once `sidebarNav.tsx`
supersedes it.

**Rationale**: distinguished directly against this project's own real
precedent for the opposite choice. `components/ui/dropdown-menu.tsx` was
kept through a real zero-consumer period (after both its original
callers were superseded) specifically because it is a generic, reusable
shadcn/ui *primitive* — the same category of thing this project keeps
"unused until needed" elsewhere. `navBar.tsx` is not that: it's a
bespoke, single-purpose *composition* wiring this app's own tab-switching
logic to `components/ui/tabs.tsx`, tied specifically to the horizontal
top-nav shell this feature removes. `scenarioLoader.tsx`/`themeToggle.tsx`
(both deleted outright when `020-settings-modal` superseded them) are the
directly matching precedent, not `dropdown-menu.tsx`.

## §7. The `graphic-walker` height-chain fix is expected to live entirely in the new full-page ancestor chain — not inside `GraphicWalkerPanel.tsx`/`graphicWalkerPanel.css`

**Decision (design-time expectation, to be confirmed or corrected during
implementation, not assumed final here)**: the new chromeless full-page
rendering path gives its own container a real, definite height (e.g. the
`<main>`/wrapper for a `full_page` tab sized via flex against the
sidebar-layout's own real viewport height, no `position: fixed`
compensation needed per §5). `GraphicWalkerPanel.tsx`'s existing
`.graphic-walker-panel-host { height: 100%; ... }` rule (already added by
the prior expand-dialog height fix) should then resolve correctly against
that real ancestor height with zero change to `GraphicWalkerPanel.tsx` or
`graphicWalkerPanel.css` themselves.

**Rationale**: this session's own live measurement (spec.md's Research
Findings) traced the 635px collapse to the ancestor chain having NO
definite height anywhere (`portalHostRef`/`inlineAnchor` are both `auto`)
— never to anything wrong inside `GraphicWalkerPanel.tsx`'s own styling,
which already correctly asks for `height: 100%` and already has the
matching CSS child-selector override in `graphicWalkerPanel.css`. Fixing
the ancestor is therefore expected to be sufficient on its own — the same
"the ancestor needs a definite height, not this component" diagnosis
`graphicWalkerPanel.css`'s own existing comment already reached for the
expand-dialog case.

**Verification requirement carried into Phase 1/tasks**: this MUST be
confirmed empirically (a live measurement, the same technique this
session's own investigation used, repeated against the actual
implementation) before being treated as done — not assumed correct from
this reasoning alone, matching this project's own "confirm before
concluding" discipline. If the ancestor-only fix turns out insufficient,
the fallback is a small, explicit height rule scoped to the full-page
case specifically (not a general change to `GraphicWalkerPanel.tsx`'s
existing inline/dialog behavior, which must remain unaffected).

## §8. Scroll-to-section uses the native `Element.scrollIntoView()` — no new dependency

**Decision**: FR-016's "selecting a section sub-item scrolls to that
section's content" is implemented via each section's own row-group
wrapper carrying a stable DOM `id` (derived from the section's own `id`
field) and a plain `element.scrollIntoView({ behavior: 'smooth', block:
'start' })` call on click.

**Rationale**: a native browser API, zero new dependency, matching this
project's own preference for native platform capability over a library
where one already does the job (e.g. `mapTooltip.ts`'s own plain-DOM
tooltip, `SankeyPanel.tsx`'s raw `document.createElementNS` SVG
construction). No smooth-scroll polyfill is needed — every browser this
project already targets (confirmed via existing Playwright
`devices['Desktop Chrome']` usage and this app's own no-legacy-browser
stance) supports it natively.

## §9. Twelfths-grid convention (FR-019) is documentation-only — zero runtime change

**Decision**: `project-docs/GRAMMAR.md` gains a documented convention ("author
`width:` as a fraction of twelfths — e.g. `0.5` = 6/12 half-width,
`0.25` = 3/12 quarter-width — so panels sharing a twelfths-based fraction
scheme align across different rows on the same tab"). No change to
`dashboardRenderer.tsx`'s existing `gridTemplateColumns: panels.map((p) =>
\`${(p.width ?? 1) * 100}fr\`).join(' ')` math.

**Rationale**: confirmed directly — that expression already accepts any
fraction and produces gap-aware, correctly-proportioned columns for it
(the real flexbox-gap bug this Grid-based approach was originally built
to fix, per `dashboardRenderer.tsx`'s own existing comment, has nothing
to do with which specific fractions are chosen). Cross-row alignment is
already a natural consequence of two rows both using the same fraction
set — the only thing missing is a NAME for the convention so authors
converge on it deliberately rather than by coincidence, exactly the same
"name what's already possible so it stops being reinvented ad hoc"
formalization move `wftdm-design-system`'s own spacing-scale section
already made once for `p-6`/`gap-6`.

## §10. Metric Strip row detection is a pure, testable predicate

**Decision**: `layout/dashboardLayout.ts` exports `isMetricStripRow(panels:
PanelConfig[]): boolean` — true when `panels.length > 0 && panels.every(p
=> p.type === 'valuebox')`. `dashboardRenderer.tsx` branches on this per
row: `true` → `grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6`
(the 200px minimum and `gap-6` anchor both taken directly from
`project-docs/UX-REDESIGN-PROPOSAL.md`'s own §4/§1 research — Vercel/Grafana/
Stripe convergence on a 200-280px card minimum, and this app's own
already-established `gap-6`/24px spacing anchor); `false` → the existing
fraction-based `gridTemplateColumns` unchanged.

**Rationale**: a one-line predicate, but split into its own pure module
rather than inlined, matching this project's own established convention
of splitting non-trivial-but-pure layout/data logic out for direct unit
testability (`tableLogic.ts`, `sankeyGraph.ts`, `zonemapColor.ts`) rather
than folding it into a React component body where it can only be
exercised through a full render.
