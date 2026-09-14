# 055-build-time-skeleton

Fixes the static boot skeleton baked into `index.html` (confirmed real
and already-deployed in `054`'s own investigation) to reflect the
current sidebar layout instead of the old top-nav bar it still visually
depicted, and to show this specific build's REAL configured tab
list/branding instead of a fixed, hardcoded shape.

---

## 1. The real, current skeleton, confirmed directly

Read `index.html` before assuming anything. It rendered a
`position: fixed` top `<header>` with a logo placeholder and a
horizontal row of 3 pill-shaped tab buttons (`h-8 w-16`/`w-20`/`w-16`)
— the OLD `navBar.tsx` shape. Confirmed via `git log` that the commit
which added this skeleton (`138c75d`, 2026-09-06) **predates**
`030-sidebar-navigation` (`d348953`), which replaced that top nav with
a persistent left `<Sidebar>` and deleted `navBar.tsx` entirely. The
skeleton was simply never updated after that later redesign — a real,
confirmed staleness bug, not a hypothetical one.

## 2. Build-time generation mechanism

Vite's own `transformIndexHtml` plugin hook is the correct, idiomatic
mechanism — it receives the full `index.html` string during processing
and can return a transformed version, running identically for `vite
build` and `vite dev` alike, with no per-target special-casing needed.
A new plugin, `scripts/viteBootSkeletonPlugin.ts`, reads the two real,
on-disk config roots (`public/dashboard-config/` — a real deployer's
own, gitignored; `public/demo-dashboard-config/` — this repo's own
git-tracked demo content) straight off `fs` at build time, using the
identical two-shape parsing `services/yamlLoader.ts`'s own
`loadDashboards()`/`loadDashboardBranding()` do at runtime (bare
filename array, or `{ dashboards, title, logoUrl, logoUrlDark }`) —
necessarily a separate, build-time-only reimplementation, since the
runtime versions are `fetch()`-based and cannot run in this plugin's
own Node context at all (the same kind of deliberate, independent
duplication this project's own `python/postprocessor/expand.py`
already established for re-implementing `sqlExpander.ts`'s SQL grammar
in a different runtime). Real precedence, matching `main.tsx`
exactly: tabs from both roots CONCATENATE (deployer's own tabs first),
branding fields resolve deployer-value `??` demo-value per field.

A single marker pair, `<!-- BOOT_SKELETON -->` / `<!-- /BOOT_SKELETON
-->`, replaces the old approach of regenerating the whole `<div
id="app">` block by content-matching — the plugin does a plain string
splice between the two markers, and warns (never throws) if they go
missing rather than guessing at a splice point. What's checked into
`index.html` between the markers is only ever seen if that warning
fires; `transformIndexHtml` always replaces it with a freshly-generated
skeleton otherwise, even one with zero tab rows if no config is found
at all (confirmed directly — see §3's fail-soft test) — a real, empty
sidebar shape (collapse trigger + the two permanent footer rows) rather
than a total content swap back to a generic spinner, since that's a
more honest "still real, just nothing known yet" state than special-
casing a second, different placeholder.

## 3. Confirmed working for both real build targets, plus the fail-soft path

- `npx vite build --outDir <tmp>` (matching plain `npm run build` →
  `dist/`) and `npm run build:pages` (→ `docs/`) both produce, checked
  by direct diff, **byte-identical** generated skeleton content — no
  target-specific code exists or was needed; `transformIndexHtml` is a
  plain Vite plugin hook, agnostic to `--outDir`.
- Temporarily removed `public/demo-dashboard-config/` entirely
  (restored immediately after, confirmed via `git status` afterward)
  and rebuilt: the plugin does not crash or fail the build — it
  generates a real, structurally-correct empty-tab-list sidebar shape,
  exactly as designed in §2.

## 4. The generated shape, grounded in the real Sidebar component

Read `layout/shell.tsx`, `layout/sidebarNav.tsx`, and
`components/ui/sidebar.tsx` directly before writing any skeleton markup
— not approximated from memory, per the wftdm-design-system skill's own
"ground every skeleton in the real component it stands in for"
convention. The generated skeleton reuses the REAL, confirmed values
from those files: `SIDEBAR_WIDTH_EXPANDED = 'w-64'`, the dedicated
`--sidebar`/`--sidebar-foreground`/`--sidebar-border` token set (not
this app's main `--card`/`--border` tokens, which the OLD top-nav
skeleton used and which are the WRONG tokens for sidebar-scoped
surfaces), `SidebarMenuButton`'s own real `px-2.5 py-2 gap-3` row
shape, and `shell.tsx`'s own real structure: `SidebarHeader`
(brand + collapse trigger) → separator → `SidebarContent` (one row per
REAL configured tab, icon placeholder only for a tab that actually has
`header.icon` set, matching `sidebarNav.tsx`'s own real "no icon
configured → nothing rendered" behavior exactly — confirmed correct in
the real build output for `dashboard-8-test.yaml`'s own real, icon-less
single-space sliver tab) → separator → `SidebarFooter` (Settings +
Documentation — the one part of this shape that's genuinely fixed,
since those two rows are `shell.tsx`'s own hardcoded structure, never
deployer-configurable). Each tab row's label placeholder width is
clamped to a real per-label-length proxy (56–168px) rather than a
uniform bar — a small, deliberately-approximate touch of fidelity
(there's no DOM/canvas available at build time for real text
measurement), not a claim of pixel accuracy.

## 5. Real screenshot verification, both themes

`tokens.css` has no `prefers-color-scheme` media query at all — dark
mode is driven entirely by the `.dark` class on `<html>`, applied by
`main.tsx`'s own first executable statement. To reliably observe the
skeleton in isolation (verifying it, not the timing of when JS
happens to arrive), every `.js` request was delayed 3s via
`page.route()`, freezing the page in its true pre-hydration state. A
real, confirmed Playwright/Chromium timing detail hit while building
this test: `addInitScript()` runs at `document_start` — BEFORE
`document.documentElement` itself exists (a bare `document.
documentElement.classList.add(...)` there throws "Cannot read
properties of null"), confirmed by direct reproduction, not assumed.
Fixed with a `requestAnimationFrame` retry until `documentElement`
exists, then applying the class immediately — reproduces exactly what
a real dark-mode visitor's own browser will already have done by first
paint (that class-toggle line runs essentially instantly in a real
load, before any network-fetched chunk arrives), without needing the
rest of `main.tsx` to run.

Both real screenshots (delivered to the user) confirm: a genuine
sidebar shape, all 8 real configured tabs from
`public/demo-dashboard-config/`, the real single-space test tab shown
correctly with no icon, a real logo placeholder (this deployment's
`index.json` sets `logoUrl`/`logoUrlDark`), the real two-row footer,
and full, correct dual-theme token resolution (sidebar-scoped tokens,
borders, shadows all correctly swap between light and dark).

## Regression check

`npx tsc --noEmit` clean; `npm run test:unit` 471/471 (unchanged — no
unit-tested pure module touched); `boot.spec.ts` +
`dashboardShell.spec.ts` 19/19 passing — no existing test referenced
the old skeleton's own markup at all (grepped first, confirmed), so
this change had nothing to break there beyond the real boot-sequence
behavior those specs already cover, which is unaffected (this plugin
only rewrites STATIC pre-hydration markup; `main.tsx`'s own boot logic
is completely untouched by this feature).

`docs/` was rebuilt locally to verify both real build targets (§3) and
to capture the real screenshots (§5), then reverted (`git checkout --
docs/` + `git clean -fd docs/`) before committing — matching this
session's own established pattern of not deploying as a side effect of
a fix commit. Rebuilding and shipping `docs/` is a natural next step,
left for an explicit request.
