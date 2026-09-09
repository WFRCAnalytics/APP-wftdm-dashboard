---
name: wftdm-design-system
description: This dashboard's OWN concrete, decided design-system foundation — the real typography scale, spacing scale, elevation/shadow tiers, iconography sizing, color-token rules, BRAND IDENTITY rules (the WFRC blue must stay this app's one signature accent — never diluted toward generic SaaS blue), a NON-NEGOTIABLE dual-theme (light AND dark) verification requirement, and researched findings on shadcn/ui's own official chart component (Recharts-based) as a possible future charting-library direction — established for the app-wide UI/UX redesign (Phase 1, 2026-09-06). Consult this BEFORE writing or reviewing ANY Tailwind classes for a heading, panel title, card, form label, spacing/gap, shadow, icon, or color anywhere in this app — the nav bar, dashboard shell, Settings modal, or any panel type — and before discussing whether to adopt shadcn's chart component for any panel type. Use it whenever the user asks to redesign, restyle, polish the visuals of, or bring visual/brand consistency to any part of this dashboard, asks about dark-mode correctness, or asks about charting-library options, even if they don't name "design system" explicitly. This is this project's own answer, not generic advice — shadcn/ui is its PRIMARY reference (this app already shares its exact component/token architecture); Supabase Studio, Vercel/Geist, and gropaul/dash are secondary/corroborating sources, consulted directly, not assumed.
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
- **SankeyPanel's own node labels, hardcoded black by omission** — found during Phase 3 Batch 2's own audit, the same bug CLASS as Plotly/Observable Plot above but a different mechanism: `panels/SankeyPanel.tsx` builds its diagram's `<text>` elements via raw `document.createElementNS`, and never set a `fill` on them at all — confirmed live via `getComputedStyle()` reading a literal `rgb(0, 0, 0)` in dark mode (SVG's own initial/default `fill` value, per spec, when nothing in the cascade sets one). Only borderline-legible before the fix, and only by coincidence: these labels sit just outside each node's own colored rect, over the flow area, whose blended colors happened to still contrast against pure black — genuinely broken the moment a label would land over the plain dark page background instead. Fixed with `fill="currentColor"` (matching Observable Plot's own tip-mark fix exactly) — the SVG mounts in the normal light DOM with no shadow root, so it correctly inherits `shell.tsx`'s real `text-foreground` class through ordinary CSS cascade. Verified live: `rgb(21, 21, 21)` in light mode, `rgb(255, 255, 255)` in dark — both matching `--foreground`'s real per-theme value exactly.

**The standard verification technique for Phase 2/3 — not visual spot-checking alone**: this app already has a real, established, automatable pattern for proving a color/contrast claim, rather than eyeballing a screenshot. `tests/unit/tokenContrast.test.ts` reads `tokens.css`'s actual custom-property values and computes real WCAG contrast ratios for every `-foreground`/base pairing, in both `:root` and `.dark`, failing loudly if either drifts. `tests/integration/graphicWalkerPanel.spec.ts`'s own theme test does the live-DOM equivalent: it calls `getComputedStyle()` against a real rendered element, asserts the exact expected `rgb(...)` value in light mode, flips `document.documentElement.classList.add('dark')`, and re-asserts the exact expected dark-mode `rgb(...)` value. **Every Phase 2/3 component change that touches color, text-on-a-surface, or a token consumed differently per theme should get this same treatment**: a real computed-style assertion in both themes (extending an existing Playwright spec, or a new one), not just "I looked at it in dark mode and it seemed fine." Dialog text inheritance above is the cautionary example of exactly what "seemed fine in light mode" misses.

## Brand Identity

> **⚠️ SUSPENDED for `033-shadcn-default-theme` — READ THIS FIRST.**
>
> Everything below this notice, through the end of this section, describes
> the rule as it stood BEFORE `033-shadcn-default-theme` and as it will
> apply AGAIN once a future, separate re-branding feature restores it. It
> does **not** describe the app's current, real color values.
>
> On the user's own explicit, direct instruction (not a silent drift, not
> an oversight, not this skill's own judgment call), `033-shadcn-default-
> theme` deliberately REPLACED every WFRC brand color token in
> `tokens.css` — `--brand-wfrc-blue`/`-secondary-blue`/`-yellow`/`-gray`,
> `--brand-white`/`-black`/`-background-dark`, and everything downstream
> that resolved through them (`--primary`, `--accent`, `--background`/
> `--foreground`, `tableLogic.ts`'s/`zonemapColor.ts`'s cell-shading/
> choropleth anchors, `SankeyPanel.tsx`'s categorical fallback) — with
> shadcn/ui's own real, current default theme (the "Nova" preset:
> `neutral`/zinc palette, near-black `--primary`, no colored accent at
> all in light mode). The stated goal of that feature was full adoption
> of shadcn's own defaults, explicitly including color, with WFRC-specific
> branding intended to be REAPPLIED later as its own distinct, separate
> pass — not abandoned. See `specs/033-shadcn-default-theme/spec.md`'s own
> "EXPLICIT, DELIBERATE POLICY REVERSAL" note and `research.md`/
> `data-model.md` §1 for the full real token-value migration this caused.
>
> **What this means in practice, right now**: the "never dilute it" rule
> below is not currently being followed, on purpose, and that is
> correct — not a violation to flag or quietly work around. Do not "fix"
> `tokens.css` back toward WFRC blue/yellow to satisfy this section's own
> older text; do not cite this section as a reason to revert any of
> `033`'s real, shipped token values. The rule RESUMES governing real
> work the moment a future, separate re-branding feature reinstates WFRC
> color values — at which point this suspension notice itself should be
> removed (not the rule text below it, which stays as the standing policy
> both before and after this suspension window).

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

**One explicit, scoped exception (029-shadcn-chart-panel, post-completion polish passes)**: `--chart-1`..`--chart-5` (the `recharts` panel type's categorical data-series colors) are NOT WFRC-brand-derived. Two sources were used in sequence, both on the user's own explicit, direct requests, not oversights: shadcn's own real default categorical palette first (`ui.shadcn.com/docs/theming` — "bright categorical color palette... inspired by original recharts palette", `research.md` §8), then superseded by Observable Plot's own real default categorical scheme, `schemeObservable10` (read directly from this project's own already-installed `d3-scale-chromatic` package — the same real dependency `SankeyPanel.tsx` already uses for Tableau10 — "I would personally refer to Observable JS Plot gallery", `research.md` §11). Both times, values that failed this app's own 3:1 non-text contrast minimum were lightness-adjusted only (hue/chroma held fixed) to clear it — the reference scheme's own hue character is always kept, its exact lightness is not treated as sacred. The distinction that keeps this from contradicting the rule above: `--primary`/`--accent`/every other brand-facing token are untouched and remain WFRC blue/yellow; `--chart-N` is a categorical DATA-series palette, whose entire job is to be visually distinct across many hues, not brand-recognizable as one hue. If a future phase considers extending this same "an external reference's real default, not WFRC-derived" reasoning to any OTHER token — `--primary`, `--accent`, anything outside this one five-token chart family — that's exactly the "signal to re-read this paragraph, not a reason to proceed" the rule above already warns about.

**Connected, still-deferred work**: the configurable navbar logo/title capability (`028-dashboard-branding` — `DashboardBrand`/`layout/dashboardBrand.tsx`, already shipped and real, not hypothetical) is the natural, connected next step for brand identity specifically, once Phase 2 (shell/nav) begins. It's explicitly IN SCOPE for Phase 2, not forgotten — the shell/nav phase is exactly where a deployer-configured logo and this section's own "keep the WFRC blue accent" rule meet in the same surface area (the header). Phase 2 should treat them as one connected piece of work, not two unrelated items that happen to share a file.

## Typography scale

> **Note (`033-shadcn-default-theme`)**: the specific typeface names in the
> next sentence are now STALE — a real, confirmed factual change, not
> covered by the Brand Identity suspension notice above (that notice is
> color-only; this is a separate, additive correction). `033` replaced
> Poppins/Inter/Fira Code with shadcn's own real current font stack (Geist
> for both `font-body` AND `font-heading` — the "Nova" preset has no
> separate heading face at all — Geist Mono for `font-mono`; see
> `specs/033-shadcn-default-theme/data-model.md` §2). The Tailwind-facing
> class names (`font-body`/`font-heading`/`font-mono`) and every rule in
> the table below (which role gets which size/weight/status) are
> UNCHANGED — only the underlying typeface each class resolves to is
> different now.

Three font families, unchanged from `002-design-tokens` in ROLE (body/heading/mono) though not, as of `033-shadcn-default-theme`, in specific typeface (see the note above) — originally the WFRC brand choice: `font-body` (Poppins), `font-heading` (Inter), `font-mono` (Fira Code). **Exactly three font weights project-wide: 400 (regular), 500 (medium), 600 (semibold) — never 700/bold.** This isn't a new rule invented for this skill: `CardTitle` already uses `font-semibold` and form labels already use `font-medium`; Vercel/Geist and Linear independently converge on the identical "no more than 3 weights, skip bold, communicate emphasis through size/spacing instead" discipline (see `references/research.md`). Formalizing it here just makes it official and prevents `font-bold` creeping in later.

| Role | Tailwind classes | Real size / line-height | Weight | Status |
|---|---|---|---|---|
| **Page title** | `font-heading text-xl font-semibold tracking-tight` | 20px / 28px | 600 | **Applied, Phase 2.** Two real consumers: `layout/dashboardRenderer.tsx`'s new heading, rendering the active tab's own `header.title`/`header.description` (real, validated fields that had zero rendering consumer anywhere in the app before Phase 2 — confirmed via a full `src/` search); and `layout/dashboardBrand.tsx`'s text-only fallback (the app's own name, shown when no logo is configured) — previously an ad hoc `text-lg`/18px with no home in this scale at all. |
| **Panel title** | `font-heading text-base font-semibold tracking-tight` | 16px / 24px | 600 | **Applied, Phase 2** (moved up from an originally-planned Phase 3 deferral). `components/ui/card.tsx`'s `CardTitle` — every panel title in the app — previously rendered at `text-2xl` (24px), the shadcn default for a single standalone hero card, never tuned for this app's dense multi-panel grid. Fixed during Phase 2, not deferred, because Phase 2's own new Page Title heading made the resulting hierarchy inversion directly visible in a real screenshot (every panel title rendering LARGER than the page title above it) — `card.tsx` is shared shell-adjacent chrome, not an individual panel's own internals, so this stayed within Phase 2's own scope boundary rather than crossing into Phase 3's per-panel-type work. |
| **Section label** | `font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground` | 12px / 16px | 600 | Already real and correct — `layout/settings/basemapTab.tsx`'s catalog section headers. Formalized, not changed. |
| **Body** | `font-body text-sm` | 14px / 20px | 400 | Already real and correct — `CardDescription`, most panel body copy. Matches Vercel/Geist's and Grafana's own default body size (both 14px). |
| **Form label** | `font-body text-sm font-medium text-foreground` | 14px / 20px | 500 | Already real and correct — `layout/settings/appearanceTab.tsx`'s "Theme"/"Top Bar Behavior" labels; `panels/ObservablePlotPanel.tsx`'s `PanelLocalInput` label span (Phase 3 Batch 2 — was missing `font-body font-medium`, inheriting only the wrapping row's `text-sm text-foreground` at the body-default 400 weight). |
| **Caption / meta** | `font-body text-xs text-muted-foreground` | 12px / 16px | 400 | Already real and correct — `layout/settings/scenariosTab.tsx`'s scenario counts, status text. |
| **Mono / technical** | `font-mono text-xs` | 12px / 16px | 400 | Already real and correct — `scenariosTab.tsx`'s scenario file-path display. |
| **Stat / display number** | `font-heading text-3xl font-semibold` | 30px / 36px | 600 | Already real and correct, newly formalized (Phase 3 Batch 1 audit) — `panels/ValueBoxPanel.tsx`'s own large numeral. Not one of the roles above: a value box's headline number is a genuinely distinct semantic role (Grafana's own "big stat" pattern) this scale had never named, not a deviation to correct. Its own `config.unit` annotation is Caption/meta (below), not part of this role. |

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

**Composition recipe — general enough to reuse for any panel type, not just the two below**: a shaped skeleton is nothing more than the shimmer primitive applied to several small divs, laid out with the same flex/grid classes the real content itself will use, sized to roughly the real element's own footprint. There is no shared `<Skeleton>` component in this codebase (matching this app's own established preference — the plain-rectangle version was never a shared component either, each panel type wrote its own `animate-pulse rounded-md bg-muted` line independently) — write the shimmer divs directly in each panel's own loading branch, `aria-hidden="true"` on the root (a skeleton is decorative, not content assistive tech should announce item-by-item). Two real, worked examples, done in Phase 3 Batch 1 (`029`'s Phase 3 work — `ValueBoxPanel.tsx`/`TablePanel.tsx`):

```tsx
// ValueBoxPanel.tsx — icon-circle + number-bar. The icon placeholder is
// conditional on config.icon (already known pre-fetch, a static config
// field) so it only appears when the real ready-state will have one.
<div className="flex items-center gap-3" aria-hidden="true">
  {config.icon && <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-muted" />}
  <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
</div>
```

```tsx
// TablePanel.tsx — header-row + several body-rows. Column/row counts are
// arbitrary placeholders (the real count isn't known until the query
// resolves); flex-1 on every cell shares the row width evenly.
<div aria-hidden="true">
  <div className="flex gap-4 border-b border-border px-3 py-2">
    {[0, 1, 2, 3].map((i) => <div key={i} className="h-3 flex-1 animate-pulse rounded bg-muted" />)}
  </div>
  {[0, 1, 2, 3, 4].map((row) => (
    <div key={row} className="flex gap-4 border-b border-border px-3 py-2 last:border-0">
      {[0, 1, 2, 3].map((col) => <div key={col} className="h-4 flex-1 animate-pulse rounded bg-muted" />)}
    </div>
  ))}
</div>
```

A later batch composing a chart panel's own axis-line + plot-area shape (or any other shape) should follow the same recipe — several shimmer divs, real layout classes, `aria-hidden="true"` on the root — not invent a structurally different approach.

**A real, confirmed exception found in Batch 1, not overlooked**: `MarkdownPanel.tsx` is one of the seven files this requirement names, but it has NO loading state to upgrade at all — its own code comment (research.md §4 of `006-markdown-panel`) documents that `config.content` is already present at mount time with nothing to fetch, so there is no async window a skeleton would ever actually appear during. Inventing a fake, always-instantaneous loading flash to satisfy this requirement's letter would contradict the file's own real design. When a future batch reaches a panel type on this list, confirm it genuinely has a loading state before assuming this requirement applies — it did for six of the seven, not all seven.

**Phase 3 Batch 2 — the axis-chart shape, and a two-column node-graph shape**: `PlotlyPanel.tsx`/`ObservablePlotPanel.tsx`/`RechartsPanel.tsx` (three genuinely different chart libraries, all covering the same bar/line/area territory) share ONE real, worked skeleton shape — varying-height bar silhouettes sitting on a static axis baseline:

```tsx
<div className="flex flex-col justify-end gap-2" style={{ height: config.height ?? 350 }} aria-hidden="true">
  <div className="flex flex-1 items-end gap-2">
    {[40, 70, 55, 90, 65, 80, 50].map((h, i) => (
      <div key={i} className="flex-1 animate-pulse rounded-t-sm bg-muted" style={{ height: `${h}%` }} />
    ))}
  </div>
  <div className="h-px w-full bg-border" />
</div>
```

Deliberately the SAME shape regardless of a panel's own real mark type (bar/line/area/scatter) — a genuine curve silhouette isn't practical to fake with plain shimmer divs, and this generic bar silhouette already reads as "a chart will be here" for any of them. The height array is an arbitrary placeholder (the real shape isn't known until the query resolves) — vary it per file only if it happens to fit that file's own sizing model (`ObservablePlotPanel.tsx` uses `flex: '1 1 auto', minHeight: 0` instead of a fixed `height` on the outer div, since its real chart container must share space with `config.inputs` rows rendered above it — the inner bar-row/baseline markup is identical either way).

`SankeyPanel.tsx` is structurally different enough (a two-sided node graph, not an x/y axis chart) that the same shape would be misleading — it gets its own, still-simple shape instead: two vertical columns of block placeholders (source nodes left, target nodes right), no attempt to fake the flow paths between them (a decorative placeholder doesn't need to be that literal, just recognizably "two node columns" rather than a plain rectangle):

```tsx
<div className="flex items-stretch justify-between gap-8" style={{ height: config.height ?? 350 }} aria-hidden="true">
  <div className="flex flex-1 flex-col justify-around gap-2 py-2">
    {[28, 20, 16, 10, 8].map((h, i) => <div key={i} className="animate-pulse rounded-sm bg-muted" style={{ height: `${h}%` }} />)}
  </div>
  <div className="flex flex-1 flex-col justify-around gap-2 py-2">
    {[22, 18, 14, 10].map((h, i) => <div key={i} className="animate-pulse rounded-sm bg-muted" style={{ height: `${h}%` }} />)}
  </div>
</div>
```

A future map-panel batch (`FlowMapPanel.tsx`/`ZoneMapPanel.tsx`, the two remaining files on the original seven-file list) should confirm which of these two shapes — or a genuinely new one — actually fits a map's own loading structure before assuming either transfers unchanged; a basemap-tile placeholder is a different problem again from an axis chart or a node graph.

**Phase 3 Batch 3 (final) — the map-silhouette shape, completing the original seven-file list**: `FlowMapPanel.tsx`/`ZoneMapPanel.tsx` needed a genuinely new shape, confirmed by the round above's own "confirm which shape fits, don't assume" instruction — neither the axis-chart nor the node-graph shape reads as a map. Both share a two-layer language: a static, non-pulsing `bg-muted` "map area" backdrop (a basemap isn't itself loading content, so it doesn't shimmer) with a few soft, `animate-pulse` `bg-border` shapes on top (an existing token distinct enough from `bg-muted` to read against it — no new color invented):

```tsx
// FlowMapPanel.tsx — flow-line + location-dot placeholders (rotated thin
// bars + small circles), suggesting O-D desire lines.
<div className="relative overflow-hidden rounded-md bg-muted" style={{ height: config.height ?? 500 }} aria-hidden="true">
  <div className="absolute left-[15%] top-[30%] h-1 w-[55%] origin-left rotate-[8deg] animate-pulse rounded-full bg-border" />
  {/* ...more lines... */}
  <div className="absolute left-[15%] top-[30%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-border" />
  {/* ...more dots at line endpoints... */}
</div>
```

```tsx
// ZoneMapPanel.tsx — scattered rounded-rect blocks suggesting irregular
// zone polygons, the correct silhouette for a choropleth vs. a flow map.
<div className="relative overflow-hidden rounded-md bg-muted" style={{ height: config.height ?? 450 }} aria-hidden="true">
  <div className="absolute left-[8%] top-[15%] h-[30%] w-[25%] animate-pulse rounded-md bg-border" />
  {/* ...more scattered blocks at varied positions/sizes... */}
</div>
```

**`GraphicWalkerPanel.tsx` — a real, confirmed gap, not a fourth new shape**: this panel's own pre-existing loading branch was `<div style={{ height: config.height ?? 700 }} />` — no `animate-pulse`/`bg-muted` at all, LESS than the pre-Phase-3 baseline every other panel type already had. Fixed with a sidebar+canvas two-pane skeleton (GraphicWalker's own real, stable top-level shape — genuinely structural, not data-dependent, so safe to render without guessing at chart-specific content):

```tsx
<div className="flex gap-3" style={{ height: config.height ?? 700 }} aria-hidden="true">
  <div className="h-full w-48 shrink-0 animate-pulse rounded-md bg-muted" />
  <div className="h-full flex-1 animate-pulse rounded-md bg-muted" />
</div>
```

**A real bug caught during this exact fix's own verification, not shipped**: an earlier draft dropped the explicit `height` entirely, reasoning that `.graphic-walker-panel-content > div { height: 100% }` (`graphicWalkerPanel.css`) would size it the same way it sizes the real ready-state `<GraphicWalker>` div. That's only true when `config.height` (or the 004 dialog's own flex sizing) gives the ancestor chain a DEFINITE height — for a panel configured with no `height:` at all (this app's own most common case — confirmed via a real fixture, "Free-form Visual Analytics (Summary Tab)," which sets no height field), the whole chain resolves to indeterminate/auto. The READY state's own real `<GraphicWalker>` content still renders correctly in that case because it has genuine INTRINSIC size of its own (real toolbar/field-list/canvas chrome) — but this skeleton's two empty, content-less `h-full` divs had nothing to size against and silently collapsed to 0px, confirmed live via a screenshot showing an entirely blank card. Fixed by keeping the explicit `config.height ?? 700` fallback the original bare div already had — the one part of it that was actually correct — and adding real visual content inside it, rather than removing the height altogether. **The general lesson for any future skeleton relying on a CSS percentage-height rule instead of an explicit fallback**: confirm the ancestor chain actually has a definite height in the panel's own most common (no-`height:`-configured) case before trusting it, the same live-screenshot discipline this whole skill already requires for color/theme claims.

This completes the original seven-panel-type Skeleton requirement in full (`FlowMapPanel`/`SankeyPanel`/`PlotlyPanel`/`ValueBoxPanel`/`TablePanel`/`ZoneMapPanel`/`ObservablePlotPanel`) plus the two panel types added since (`RechartsPanel`, `GraphicWalkerPanel`) — every panel type in the app now has a genuinely shaped loading skeleton, `MarkdownPanel.tsx`'s own confirmed no-loading-state exception aside.

**Map controls' own icons — audited, deliberately exempt from the Iconography tiers below, not overlooked**: `NavigationControl`'s zoom/compass icons are MapLibre's own fixed CSS background-images (not `lucide-react`/React components at all — already dark-mode-inverted via a CSS `filter`, `mapControls.css`), `ThreeDToggleControl` has no icon (a text label, "3D"/"2D"), and `ResetViewControl`'s icon is a hand-reproduced raw SVG string sized to fit MapLibre's own fixed 29×29px control-button chrome (15px, `stroke-width` 2.5 — explicitly tuned during `027-map-auto-fit-and-reset` to match that exact button size, `resetViewControl.ts`'s own comment). None of these are resizable via the `h-X w-X`/`size` forms this skill's Iconography table names — forcing them into the nearest tier (16px/20px) would either be impossible (`NavigationControl`) or would visibly break an already-deliberately-tuned fit (`ResetViewControl`) inside a third-party layout system this app doesn't control. Confirmed, not silently skipped.

## Iconography

`lucide-react` is the only icon library (constitution Principle VI) — this section is about SIZE/weight consistency, not which library.

| Tier | How to write it | Real size | Use for | Status |
|---|---|---|---|---|
| Ultra-compact | `className="h-3 w-3"` | 12px | Tight inline controls — reorder chevrons | Already correct — `scenariosTab.tsx` |
| **Default — use this unless you have a specific reason not to** | `className="h-4 w-4"` | 16px | Inline UI icons: buttons, triggers, form controls | Already the dominant convention — ~15 of ~20 current icon call sites already use this |
| Decorative / semi-prominent | `className="h-5 w-5"` | 20px | A standalone, slightly-larger icon paired with a short label — e.g. a category tile | `layout/settings/basemapTab.tsx`'s catalog tiles; `panels/ValueBoxPanel.tsx`'s configurable icon (Phase 3 Batch 1 — was `size={24}`) |
| Illustrative (state icons) | `size={28} strokeWidth={1.5}` | 28px, thinner stroke | A large icon accompanying an empty/error-state message | `panels/PanelEmptyState.tsx`; `panels/PanelErrorState.tsx`'s `TriangleAlert` (Phase 3 Batch 1 — was `size={18}` at the default stroke-width) |

**Always prefer the `h-X w-X` Tailwind-class form over the `size`/`strokeWidth` props** for any new icon usage — it's the majority convention already and keeps icon sizing in the same utility-class system as everything else. The prop form is a legacy exception in a small number of existing files, not the pattern to copy forward.

**Two concrete inconsistencies found during this skill's own research — FIXED in Phase 3 Batch 1** (`029`'s Phase 3 work, `panels/PanelErrorState.tsx`/`panels/ValueBoxPanel.tsx`): both moved to the tiers named in the table above, matching their respective sibling treatments (`PanelEmptyState.tsx`, `basemapTab.tsx`) exactly. `ValueBoxPanel.tsx`'s icon also switched from the legacy `size` prop to the preferred `h-X w-X` class form at the same time.

**A third, found in Phase 3 Batch 3**: `panels/graphicWalkerDatasetPicker.tsx`'s trailing `ChevronDown` rendered at `h-3.5 w-3.5` — not one of the four defined tiers, and with no sibling precedent anywhere else in this codebase to justify that specific size (the one other `h-3.5` usage found, `components/ui/dropdown-menu.tsx`'s `RadioItem` indicator, is a positioning-slot size for a nested `h-4 w-4` `Check` icon, not an icon-content tier itself). Moved to the Default tier (`h-4 w-4`), matching the `Database` icon right next to it in the same control — `opacity-60` kept, a de-emphasized trailing caret next to a leading content icon being a real, legitimate distinction from the icon's own size. The SAME file also had a real Typography deviation fixed alongside this: its trigger `<Button>` overrode the component's own base classes (`font-heading text-sm font-medium`, `components/ui/button.tsx`) with `font-body font-normal`, for no stated reason — every OTHER button in this app uses that base convention unmodified, arbitrary text content included; this was the one unexplained outlier, now removed.

## Color tokens

**Audited, not extended.** `tokens.css`'s eight existing semantic pairs — `primary`/`secondary`/`muted`/`accent`/`destructive`/`success` plus `border`/`input`/`ring` — are each used correctly and sufficiently across the app today. No new token is added by this skill. (See the **Brand Identity** section above first — `primary`/`accent` specifically resolve to the WFRC blue/yellow brand tokens, and that section's "never dilute it" rule governs any future change to those two roles specifically; this section covers the remaining six.)

- `accent` is confirmed to mean "interactive hover/focus/selected background" (the active tab in `navBar.tsx`'s `Tabs`, the selected tile in `basemapTab.tsx`, the focused item in `dropdown-menu.tsx`) — never a decorative brand-yellow fill. Keep using it that way; don't repurpose it for emphasis/branding elsewhere.
- No "warning"/"info" token exists, and none is added here. This was already investigated and deliberately rejected once before (the `024-settings-modal-visual-redesign` era found no real `ScenarioStatus` value that would map to a "warning" state) — that finding still holds; nothing discovered during this redesign's own research changes it.
- If a genuinely new semantic need for color ever surfaces, add it exactly the way `--success` was added: one new token pair, in both `:root` and `.dark`, following the existing `DEFAULT`/`foreground` shape, verified for WCAG contrast the same way `tokenContrast.test.ts` already checks every other pair — not a special case.
- **Never use Tailwind's slash-opacity modifier (`text-muted-foreground/80`, `bg-muted/40`, etc.) against this app's own custom color tokens** — confirmed, repeatedly, across this session (`rechartsPanel.css`'s gridline/tooltip-border fix, `mapControls.css`'s own prior history, and `panels/PanelEmptyState.tsx`'s hint text, fixed in Phase 3 Batch 2) that it silently generates NO CSS at all against a plain-hex custom property (this app's tokens are plain hex, not the HSL-channel-triplet shape Tailwind's own opacity-modifier machinery expects). Use a real `color-mix(in srgb, var(--token) X%, transparent)` value instead — as a dedicated small CSS file for a repeated/structural need (`rechartsPanel.css`), or inline as a inline `style` value for one narrow, single-element usage (`PanelEmptyState.tsx`'s hint color, matching `tableLogic.ts`'s/`zonemapColor.ts`'s own established `color-mix()`-string-as-inline-style precedent) — never the broken opacity-slash syntax, regardless of which form fits.

## Charting research: shadcn/ui's official chart component (2026-09-06 addendum)

Research only — this does NOT change or advance `docs/PIPELINE.md`'s already-logged "Charting-library consolidation — deferred, not part of the current visual redesign" entry, which remains the authoritative record that any actual migration is a large, separate, deliberately deferred decision. This section records what was found when shadcn/ui's own real chart component (`ui.shadcn.com/docs/components/chart`) was researched directly, feeding that FUTURE decision, not proposing to act on it now.

- **Genuinely not a wrapper library.** Real source (`apps/v4/registry/new-york-v4/ui/chart.tsx`, fetched directly) is a thin theming layer over raw Recharts — `ChartContainer`/`ChartStyle`/`ChartTooltip`/`ChartTooltipContent`/`ChartLegend`/`ChartLegendContent`. Their own docs state it plainly: "We do not wrap Recharts. This means you're not locked into an abstraction." Colors flow through a real two-tier CSS-variable mechanism: a `ChartConfig` object per chart names each series' color (typically `var(--chart-1)` etc. — tokens this app does **not** yet define, unlike `gropaul/dash-ui`'s own `chart-1`..`chart-5` set noted in the research trail below), and `ChartStyle` generates a second, per-chart-instance-scoped tier (`--color-{seriesKey}`, scoped via a `[data-chart=id]` attribute) that `ChartTooltipContent` actually consumes.
- **Chart-type coverage, checked against this app's own REAL grammar, not a guess**: shadcn's own charts library (`ui.shadcn.com/charts`) showcases Area/Bar/Line/Pie/Radar/Radial. `docs/GRAMMAR.md`'s own real, authored grammar shows this app's actual current chart-type surface is narrow — Plotly panels use `type: bar`/`type: scatter`; Observable Plot panels use `mark: barY`/`mark: lineY`. Meaningful overlap exists for both of those panel types. **Sankey is a real, confirmed gap**: shadcn's own showcased set does not include it. Recharts itself DOES ship a real, currently-maintained `Sankey` component (confirmed directly — `recharts.github.io/en-US/api/Sankey/`, real props, real `Tooltip` integration) — not a hard technical block — but it sits entirely outside shadcn's own official examples, meaning adopting it would mean composing Recharts' raw Sankey API from scratch, the same "you compose it yourself" position this app's current, already-working `d3-sankey`-based `SankeyPanel.tsx` is already in, just against a different library, with no template and no clear advantage over what already exists.
- **Legend interactivity — a real, confirmed gap, not assumed.** Plotly's own click-to-toggle-trace-visibility is a zero-effort, always-on default — the capability this app's own users specifically value (`docs/PIPELINE.md`'s own charting-library entry names it explicitly). Recharts' raw `Legend` component does expose a real `onClick` prop, but shadcn's own shipped `ChartLegendContent` (read directly) wires up **no click handler at all** — a real, confirmed, closed-without-a-fix GitHub issue (`shadcn-ui/ui#4188`) asked for exactly this and got nothing added to the component as shipped. Matching Plotly's current, free behavior would require writing a custom legend-content component — a real, but modest, implementation task, not something that comes free.
- **Honest migration-scope assessment**: least-risky first candidates would be Plotly's `bar`/`scatter` panels and Observable Plot's `barY`/`lineY` panels — direct overlap with shadcn's own ready-made examples. Sankey is the hardest, realistically not worth attempting without solving the "no template, no advantage over existing d3-sankey work" problem first. Legend-toggle parity is not free either. **The honest conclusion, as this research was explicitly asked to report plainly if true: meaningful gaps exist (Sankey, zero-effort legend toggle) — full replacement isn't realistic without those being solved first.** This finding lives here, alongside the rest of this skill's own real research, rather than only in `docs/PIPELINE.md`, because it's chart-component-specific implementation detail the eventual consolidation decision will need, not a restatement of the deferral itself.

## Provenance

**shadcn/ui is this skill's PRIMARY reference, not one of several co-equally-weighted sources** — the most directly authoritative one, since this app is already built on shadcn's own primitives (`components/ui/*`) and already shares its exact semantic-token architecture. Every table above that names a shadcn source (`dashboard-01`'s real block source, the chart component research above) carries that weight first; other references are corroboration or narrower, specific-aspect input, not co-equal alternatives to weigh against it.

**Supabase Studio is a secondary source**, drawn from specifically where its own real pattern genuinely improves on shadcn's own (its 12-step gray scale and `heading-*`/`text-*` semantic naming convention informed this skill's own Typography scale's naming shape — not because it out-ranks shadcn, but because shadcn's own chart/dashboard examples don't themselves prescribe a full semantic type-scale naming convention the way Supabase's `typography.css` does) — not a co-equal pillar alongside it.

Vercel/Geist (published token scale) and `gropaul/dash-ui` (real `tailwind.config.ts` — confirmed to already use the identical shadcn/Radix semantic-token architecture this app does, reinforcing shadcn's own primacy rather than competing with it) remain real, directly-fetched sources. Secondarily: Linear, Grafana (real source — `packages/grafana-data/src/themes/createTypography.ts`/`createSpacing.ts`), Tremor (real published type scale). GeoLibre was checked and deliberately weighted as one weak data point only (flagged as likely AI-generated), contributing nothing beyond the general "elevation ladder" vocabulary term already independently justified by this app's own real shadow tiers above. Full detail, real fetched values, and direct quotes: `references/research.md`.
