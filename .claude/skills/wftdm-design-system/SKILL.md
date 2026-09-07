---
name: wftdm-design-system
description: This dashboard's OWN concrete, decided design-system foundation — the real typography scale, spacing scale, elevation/shadow tiers, iconography sizing, color-token rules, BRAND IDENTITY rules (the WFRC blue must stay this app's one signature accent — never diluted toward generic SaaS blue), and a NON-NEGOTIABLE dual-theme (light AND dark) verification requirement — established for the app-wide UI/UX redesign (Phase 1, 2026-09-06). Consult this BEFORE writing or reviewing ANY Tailwind classes for a heading, panel title, card, form label, spacing/gap, shadow, icon, or color anywhere in this app — the nav bar, dashboard shell, Settings modal, or any panel type. Use it whenever the user asks to redesign, restyle, polish the visuals of, or bring visual/brand consistency to any part of this dashboard, or asks about dark-mode correctness, even if they don't name "design system" explicitly. This is this project's own answer, not generic advice — it names real values already grounded in this app's existing tokens.css/tailwind.config.js and in direct research against Supabase Studio, Vercel/Geist, shadcn/ui's dashboard example, and gropaul/dash.
---

# WFTDM Dashboard Design System

The concrete, decided visual foundation for this app's app-wide redesign. Every value below is either (a) something this app **already does**, now named and formalized so it stops being reinvented ad hoc per component, or (b) a small, deliberate, evidence-grounded change — never an arbitrary new invention. See `references/research.md` for the full research trail (real fetched source/screenshots-via-teardown from each reference) if you want the "why," not just the "what."

**Scope discipline this skill itself was authored under, and that later phases should keep**: Phase 1 (this skill's own origin) was research + token/system definition only — it deliberately did not touch panel/nav/shell code. Phase 2 (shell/nav) and Phase 3 (panel-by-panel) are where the values below actually get applied to real components. When you're doing that application work, this skill tells you the target value; it doesn't authorize skipping the real component-by-component review each phase still needs.

## How to use this skill

1. Before adding or changing any Tailwind classes that control text size/weight, spacing, shadow, or icon size anywhere in `src/`, check the tables below for the semantic role that applies (page title? panel title? caption? a card's padding? a floating control's shadow?).
2. If a role you need isn't listed, don't invent a new one-off value — that's exactly the drift this skill exists to stop. Extend this file's tables the same disciplined way `--success` was added to `tokens.css` (one new row, following the existing pattern, only once a real, repeated need is confirmed) and say so in your own commit/PR description.
3. This skill does NOT introduce any new CSS custom property, Tailwind config key, or npm dependency — every value below already resolves through this app's existing `src/styles/tokens.css` + `tailwind.config.js`. If a future need genuinely requires a new token, that's a deliberate, separate decision to make explicitly (matching how `--success` was added), not something to bury inside a "just following the design system" edit.

## Dual-theme requirement (non-negotiable)

**Every value this skill names — typography, spacing, shadow, iconography, color usage — must be verified correct in BOTH light and dark mode before it's considered final. A value checked in one theme and assumed to carry over to the other is not done.** This isn't a hypothetical risk for this app — it's already the single most common real bug class this project has hit and fixed, repeatedly, in this very session and before it:

- **Plotly's hardcoded backgrounds** — `paper_bgcolor`/`plot_bgcolor` default to opaque white and are not theme-aware on their own; every Plotly panel showed a bright white card in dark mode until `PlotlyPanel.tsx` was fixed to resolve them from real tokens (`015-theme-toggle`).
- **Observable Plot's dark-mode tip-tooltip contrast** — fixed this session (`c6fffbd`) alongside legend overflow and a font-size mismatch against Plotly.
- **Dialog text inheritance** — a real bug found live: `DialogPrimitive.Content` set `bg-card` but never paired it with a text color, and because Radix's `DialogPortal` renders into `document.body` (outside `shell.tsx`'s own `text-foreground`-setting wrapper), nothing inside a dialog actually inherited this app's token-driven text color at all — it silently fell back to the plain browser default (black), confirmed via `getComputedStyle()` reading a hardcoded black in dark mode before the fix (`components/ui/dialog.tsx`, `015-theme-toggle`). This also broke every `currentColor`-based child relocated into a dialog (Observable Plot's own axis/tick text).
- **Native form control styling** — a bare `<select>`/`<option>` is rendered by the OS/browser itself, following the CSS `color-scheme` property, not `var(--foreground)`/any class; with no `color-scheme` declared, native controls rendered illegibly once the app went dark (`tokens.css`'s own `color-scheme: light`/`dark` declarations, `015-theme-toggle`).
- **The WFRC blue's own dark-mode-adjusted value** — `--primary` is NOT the same hex in both themes: `:root` resolves it to `--brand-wfrc-blue` (`#023c5b`), `.dark` resolves it to the lighter `--brand-wfrc-secondary-blue` (`#52b6d5`) instead — a deliberate, already-correct swap (a dark navy blue would fail contrast against this app's own dark background), not an oversight to "fix" toward a single value.

**The standard verification technique for Phase 2/3 — not visual spot-checking alone**: this app already has a real, established, automatable pattern for proving a color/contrast claim, rather than eyeballing a screenshot. `tests/unit/tokenContrast.test.ts` reads `tokens.css`'s actual custom-property values and computes real WCAG contrast ratios for every `-foreground`/base pairing, in both `:root` and `.dark`, failing loudly if either drifts. `tests/integration/graphicWalkerPanel.spec.ts`'s own theme test does the live-DOM equivalent: it calls `getComputedStyle()` against a real rendered element, asserts the exact expected `rgb(...)` value in light mode, flips `document.documentElement.classList.add('dark')`, and re-asserts the exact expected dark-mode `rgb(...)` value. **Every Phase 2/3 component change that touches color, text-on-a-surface, or a token consumed differently per theme should get this same treatment**: a real computed-style assertion in both themes (extending an existing Playwright spec, or a new one), not just "I looked at it in dark mode and it seemed fine." Dialog text inheritance above is the cautionary example of exactly what "seemed fine in light mode" misses.

## Brand Identity

This redesign's own explicit goal — feel like a polished, professional SaaS product — must NOT come at the cost of WFRC's own visual identity. The two goals are not in tension if handled correctly: polish is spacing/typography/shadow/consistency (everything else in this skill); brand identity is color, and color is being deliberately held separate.

**The full real set of WFRC brand tokens** (`tokens.css` — confirmed directly, not assumed to be just the one blue):

| Token | Value | Role |
|---|---|---|
| `--brand-wfrc-blue` | `#023c5b` | `--primary` in light mode; also used directly (not via `--primary`) as the sequential-data-color anchor in `tableLogic.ts`'s cell-shading and `zonemapColor.ts`'s choropleth fill (`color-mix(in srgb, var(--brand-wfrc-blue) X%, var(--muted))`) |
| `--brand-wfrc-secondary-blue` | `#52b6d5` | `--primary` in dark mode (see Dual-theme section above); also a `SankeyPanel.tsx` categorical fallback color |
| `--brand-wfrc-yellow` | `#f8b93e` | `--accent` in both themes |
| `--brand-wfrc-gray` | `#7f7a76` | A `SankeyPanel.tsx` categorical fallback color |
| `--brand-white` / `--brand-black` / `--brand-background-dark` | `#ffffff` / `#151515` / `#081b26` | The light/dark `--background`/`--foreground` pair |

**This is this app's ONE signature accent family, throughout every phase of this redesign — light AND dark.** No reference product's own accent color replaces or dilutes it: not Vercel/Geist's blue (`#0072F5`), not any hue from Supabase's own 14-family accent palette, not a "cleaner" generic blue picked because it looks more like a typical SaaS dashboard. Every reference researched for this redesign (`references/research.md`) was consulted for STRUCTURE — scale steps, spacing rhythm, weight discipline, shadow tiers — never for its own specific hue. Refining this app's spacing/typography/shadow scales toward something more polished must never become an occasion to also quietly genericize color usage: the WFRC blue's specific hue/saturation, in both its light (`#023c5b`) and dark-mode-adjusted (`#52b6d5`) values, is the one piece of visual identity this app should keep recognizably its own even as everything else gets measurably more refined. If a future phase's own polish work ever seems to call for a different blue "for consistency with X reference," that's a signal to re-read this paragraph, not a reason to proceed.

**Connected, still-deferred work**: the configurable navbar logo/title capability (`028-dashboard-branding` — `DashboardBrand`/`layout/dashboardBrand.tsx`, already shipped and real, not hypothetical) is the natural, connected next step for brand identity specifically, once Phase 2 (shell/nav) begins. It's explicitly IN SCOPE for Phase 2, not forgotten — the shell/nav phase is exactly where a deployer-configured logo and this section's own "keep the WFRC blue accent" rule meet in the same surface area (the header). Phase 2 should treat them as one connected piece of work, not two unrelated items that happen to share a file.

## Typography scale

Three font families, unchanged from `002-design-tokens` (WFRC brand choice, not up for revision here): `font-body` (Poppins), `font-heading` (Inter), `font-mono` (Fira Code). **Exactly three font weights project-wide: 400 (regular), 500 (medium), 600 (semibold) — never 700/bold.** This isn't a new rule invented for this skill: `CardTitle` already uses `font-semibold` and form labels already use `font-medium`; Vercel/Geist and Linear independently converge on the identical "no more than 3 weights, skip bold, communicate emphasis through size/spacing instead" discipline (see `references/research.md`). Formalizing it here just makes it official and prevents `font-bold` creeping in later.

| Role | Tailwind classes | Real size / line-height | Weight | Status |
|---|---|---|---|---|
| **Page title** | `font-heading text-xl font-semibold tracking-tight` | 20px / 28px | 600 | **Applied, Phase 2.** Two real consumers: `layout/dashboardRenderer.tsx`'s new heading, rendering the active tab's own `header.title`/`header.description` (real, validated fields that had zero rendering consumer anywhere in the app before Phase 2 — confirmed via a full `src/` search); and `layout/dashboardBrand.tsx`'s text-only fallback (the app's own name, shown when no logo is configured) — previously an ad hoc `text-lg`/18px with no home in this scale at all. |
| **Panel title** | `font-heading text-base font-semibold tracking-tight` | 16px / 24px | 600 | **Applied, Phase 2** (moved up from an originally-planned Phase 3 deferral). `components/ui/card.tsx`'s `CardTitle` — every panel title in the app — previously rendered at `text-2xl` (24px), the shadcn default for a single standalone hero card, never tuned for this app's dense multi-panel grid. Fixed during Phase 2, not deferred, because Phase 2's own new Page Title heading made the resulting hierarchy inversion directly visible in a real screenshot (every panel title rendering LARGER than the page title above it) — `card.tsx` is shared shell-adjacent chrome, not an individual panel's own internals, so this stayed within Phase 2's own scope boundary rather than crossing into Phase 3's per-panel-type work. |
| **Section label** | `font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground` | 12px / 16px | 600 | Already real and correct — `layout/settings/basemapTab.tsx`'s catalog section headers. Formalized, not changed. |
| **Body** | `font-body text-sm` | 14px / 20px | 400 | Already real and correct — `CardDescription`, most panel body copy. Matches Vercel/Geist's and Grafana's own default body size (both 14px). |
| **Form label** | `font-body text-sm font-medium text-foreground` | 14px / 20px | 500 | Already real and correct — `layout/settings/appearanceTab.tsx`'s "Theme"/"Top Bar Behavior" labels. |
| **Caption / meta** | `font-body text-xs text-muted-foreground` | 12px / 16px | 400 | Already real and correct — `layout/settings/scenariosTab.tsx`'s scenario counts, status text. |
| **Mono / technical** | `font-mono text-xs` | 12px / 16px | 400 | Already real and correct — `scenariosTab.tsx`'s scenario file-path display. |

## Spacing scale

Not a new scale — **this is Tailwind's own default 4px-based spacing already in use everywhere in this app**; the table below just names the semantic anchor at each step so a future author picks the right one instead of guessing. No `tailwind.config.js` change needed — nothing here overrides the default `spacing` theme key.

| Step | Classes | Real value | Use for |
|---|---|---|---|
| 1 | `gap-1` / `p-1` | 4px | Tight inline gaps — an icon sitting directly next to its own label |
| 2 | `gap-2` / `p-2` | 8px | Compact control clusters — a row of small buttons |
| 3 | `gap-3` / `p-3` | 12px | Related-but-visually-distinct items within one component |
| 4 | `gap-4` / `p-4` | 16px | Standard internal padding for a form field, list row, or compact card |
| 6 | `gap-6` / `p-6` | **24px — this app's PRIMARY anchor** | Card padding (`CardHeader`/`CardContent` already both use `p-6`), dashboard grid gutters (`dashboardRenderer.tsx` already uses `gap-6 p-6`) |
| 8 | `gap-8` / `p-8` | 32px | Section-level separation — space between distinct groups of cards, not within one |
| 12+ | `gap-12`+ | 48px+ | Rare — large layout breathing room only |

The 24px anchor at step 6 isn't arbitrary — it's independently confirmed as the right "card-level" unit by **three** separate sources agreeing: this app's own existing, unmodified code (`p-6` on `CardHeader`/`CardContent`/the dashboard grid), Vercel/Geist's own published token scale (`[4, 8, 12, 16, 24, 32, 48, 64]`, "default card padding of 24px"), and Grafana's own 8px-grid spacing scale (`x3 = 24px`). See `references/research.md` for the real fetched values behind each.

## Elevation / shadow language

Already real, already correctly implemented in `src/styles/tokens.css` (`--shadow-sm`/`--shadow-md`/`--shadow-lg`, wired into Tailwind's `shadow-sm`/`shadow`/`shadow-md`/`shadow-lg` utilities in `tailwind.config.js`) — this section formalizes the semantic ladder that was already being followed ad hoc, so it stops needing to be re-derived per component.

| Tier | Class | Real box-shadow | Use for | Already used in |
|---|---|---|---|---|
| Low | `shadow-sm` | `0 1px 3px rgb(var(--shadow-color) / 0.12)` (+ dark-mode ring) | A small control resting directly on a busy surface (a map) | `panels/mapControls.css` |
| Default | `shadow-md` | `0 4px 12px rgb(var(--shadow-color) / 0.14)` (+ dark-mode ring) | The app's default "resting" elevation — cards, dropdown menus, inline floating tooltips, and (Phase 2) the fixed shell header itself | `components/ui/card.tsx`, `components/ui/dropdown-menu.tsx`, `panels/mapTooltip.ts`, `layout/shell.tsx`'s `<header>` (Phase 2 — a `position: fixed` bar with real content scrolling underneath it had only a flat `border-b` before, no elevation cue at all) |
| High | `shadow-lg` | `0 12px 32px rgb(var(--shadow-color) / 0.22)` (+ dark-mode ring) | The highest-elevation surfaces — modals/dialogs, Radix tooltip content | `components/ui/dialog.tsx`, `components/ui/tooltip.tsx` |

**Dark mode is not just a darker shadow** — `tokens.css`'s `.dark` block replaces the drop shadow's own color mechanism with an edge-highlight ring (`--shadow-ring: 0 0 0 1px color-mix(in srgb, var(--foreground) 12%, transparent)`) layered underneath the same blur/spread values, because a plain drop shadow reads too weakly against an already-dark page. This was already correctly researched and built (`research.md §9` from `002-design-tokens`) — nothing to change, just don't accidentally regress it by hand-writing a shadow value anywhere instead of using the `shadow-*` classes.

**Never write a literal `shadow-[...]` arbitrary value or an inline `boxShadow` style anywhere in this app** — confirmed via a full `src/` search that this has never happened once; keep it that way. Every shadow need fits one of the three tiers above.

## Skeleton (loading placeholder) pattern

Formalized in Phase 2, from a real, already-existing precedent — not invented from scratch. Before designing anything new, this app's own `layout/settings/basemapTab.tsx` was checked directly: its raster-provider loading state (`data-testid="raster-loading-skeleton"`) is

```
className="h-9 w-full animate-pulse rounded-md bg-muted"
```

— a single shimmering, theme-aware rectangle. A full `src/` search found this EXACT treatment (`animate-pulse rounded-md bg-muted`, only the height changing) already independently used, consistently, in **seven** different panel types' own inline loading states: `FlowMapPanel.tsx`, `SankeyPanel.tsx`, `PlotlyPanel.tsx`, `ValueBoxPanel.tsx`, `TablePanel.tsx`, `ZoneMapPanel.tsx`, `ObservablePlotPanel.tsx`. So the "shimmer" primitive itself was never actually inconsistent — every panel type already agrees on it. What none of them do yet is compose more than one shimmer block into something **shaped** like the real content it's standing in for, rather than one plain rectangle.

**The shimmer primitive** (the one already-correct building block — reuse this exact class combination for every new shimmer element, never a variant):

```
animate-pulse rounded-{sm|md|lg} bg-muted
```

Add `border border-border` when the real element it stands in for has a border (e.g. a card), and `shadow-{sm|md|lg}` matching that real element's own elevation tier (Elevation section above) — so the transition from placeholder to real content never involves a shadow/border popping in or out.

**The app-boot skeleton** (Phase 2's own new, real application): `main.tsx`'s boot sequence (`initDuckDB()` → `discoverScenarios()` → `loadDashboards()`) runs entirely before `ReactDOM.createRoot(...).render(...)` is ever called — confirmed directly, there is no React tree mounted at all during this window, so a React-rendered skeleton component isn't possible for this specific case. The placeholder lives as static markup directly in `index.html`, inside `<div id="app">`, shaped to mirror the real shell: a header bar (logo-shaped block + a row of pill-shaped tab placeholders inside a `bg-muted` rail, mirroring `TabsList`'s own real `h-10 rounded-md bg-muted p-1` shape + a settings-button-shaped square), a page-title-shaped bar, then a grid of card-shaped rectangles matching `dashboardRenderer.tsx`'s own real `gap-6 p-6` rhythm. `ReactDOM.createRoot()` (not `hydrateRoot()`) unconditionally replaces a container's existing children on first render, so this markup needs no manual cleanup — it's simply discarded the instant the real `Shell` mounts. `role="status" aria-label="Loading dashboard"` plus a `sr-only` label makes this announced to assistive tech, not just visually present.

**Phase 3 requirement — not optional, logged here so it isn't lost**: each panel type's own existing inline loading state (the seven files listed above) MUST be upgraded to this same real, shaped skeleton pattern when Phase 3 touches that panel type — composing multiple shimmer blocks into that panel type's own real internal shape (e.g. a value box's own icon-circle + number-bar + label-bar, a table's own header-row + several body-rows, a chart's own axis-line + plot-area), the same way the boot skeleton composes shimmer blocks into a header+grid shape. A single plain rectangle is the CURRENT, pre-Phase-3 state for every panel type — acceptable as an interim state (it already uses the correct shimmer primitive, just not yet shaped), but Phase 3 is explicitly NOT done for a panel type until its own loading state is genuinely shaped, not left as the one-rectangle placeholder it has today.

## Iconography

`lucide-react` is the only icon library (constitution Principle VI) — this section is about SIZE/weight consistency, not which library.

| Tier | How to write it | Real size | Use for | Status |
|---|---|---|---|---|
| Ultra-compact | `className="h-3 w-3"` | 12px | Tight inline controls — reorder chevrons | Already correct — `scenariosTab.tsx` |
| **Default — use this unless you have a specific reason not to** | `className="h-4 w-4"` | 16px | Inline UI icons: buttons, triggers, form controls | Already the dominant convention — ~15 of ~20 current icon call sites already use this |
| Decorative / semi-prominent | `className="h-5 w-5"` | 20px | A standalone, slightly-larger icon paired with a short label — e.g. a category tile | Target tier — `layout/settings/basemapTab.tsx`'s catalog tiles already use this |
| Illustrative (state icons) | `size={28} strokeWidth={1.5}` | 28px, thinner stroke | A large icon accompanying an empty/error-state message | Target tier — `panels/PanelEmptyState.tsx` already uses this |

**Always prefer the `h-X w-X` Tailwind-class form over the `size`/`strokeWidth` props** for any new icon usage — it's the majority convention already and keeps icon sizing in the same utility-class system as everything else. The prop form is a legacy exception in a small number of existing files, not the pattern to copy forward.

**Two concrete inconsistencies found during this skill's own research, flagged for Phase 3 (panel-by-panel) to actually fix — not fixed here**:
- `panels/PanelErrorState.tsx`'s `TriangleAlert` renders at `size={18}` with the default stroke-width (2), sitting awkwardly between the "default" (16px) and "illustrative" (28px) tiers with none of either tier's own treatment. It should move to the Illustrative tier (`size={28} strokeWidth={1.5}`) to match `PanelEmptyState.tsx`'s sibling treatment — these two states are conceptually parallel (an alternate outcome of the same panel load) and should look parallel.
- `panels/ValueBoxPanel.tsx`'s configurable `Icon` renders at `size={24}`, a one-off between the Decorative (20px) and Illustrative (28px) tiers. It should move to the Decorative tier (20px) to match `basemapTab.tsx`'s own tile icons, which serve the same "friendly icon next to a short label" role.

## Color tokens

**Audited, not extended.** `tokens.css`'s eight existing semantic pairs — `primary`/`secondary`/`muted`/`accent`/`destructive`/`success` plus `border`/`input`/`ring` — are each used correctly and sufficiently across the app today. No new token is added by this skill. (See the **Brand Identity** section above first — `primary`/`accent` specifically resolve to the WFRC blue/yellow brand tokens, and that section's "never dilute it" rule governs any future change to those two roles specifically; this section covers the remaining six.)

- `accent` is confirmed to mean "interactive hover/focus/selected background" (the active tab in `navBar.tsx`'s `Tabs`, the selected tile in `basemapTab.tsx`, the focused item in `dropdown-menu.tsx`) — never a decorative brand-yellow fill. Keep using it that way; don't repurpose it for emphasis/branding elsewhere.
- No "warning"/"info" token exists, and none is added here. This was already investigated and deliberately rejected once before (the `024-settings-modal-visual-redesign` era found no real `ScenarioStatus` value that would map to a "warning" state) — that finding still holds; nothing discovered during this redesign's own research changes it.
- If a genuinely new semantic need for color ever surfaces, add it exactly the way `--success` was added: one new token pair, in both `:root` and `.dark`, following the existing `DEFAULT`/`foreground` shape, verified for WCAG contrast the same way `tokenContrast.test.ts` already checks every other pair — not a special case.

## Provenance

Researched and decided 2026-09-06 against: Supabase Studio (real source — `packages/config/css/theme.css`/`typography.css`/`colors.css`, `packages/config/typography.config.js`), Vercel/Geist (published token scale), shadcn/ui's `dashboard-01` block (real source), gropaul/dash-ui (real `tailwind.config.ts` — confirmed to already use the identical shadcn/Radix semantic-token architecture this app does), and secondarily Linear, Grafana (real source — `packages/grafana-data/src/themes/createTypography.ts`/`createSpacing.ts`), Tremor (real published type scale). GeoLibre was checked and deliberately weighted as one weak data point only (flagged as likely AI-generated), contributing nothing beyond the general "elevation ladder" vocabulary term already independently justified by this app's own real shadow tiers above. Full detail, real fetched values, and direct quotes: `references/research.md`.
