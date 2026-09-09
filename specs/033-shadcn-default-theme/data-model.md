# Phase 1 Data Model: Full shadcn/ui Default-Theme Adoption

## §1. Token value migration — real, verified hex values

Every value below was converted from shadcn's real, fetched `oklch()`
source (`research.md` §2) via a real Canvas 2D `fillStyle`/
`getImageData()` round-trip (Chromium's own color resolution, not a
manual formula) — not approximated. The resulting hex values are, not
coincidentally, Tailwind's own well-known real Neutral palette steps
(50/100/200/500/600/700/800/900/950) plus Red-600/Red-400 for
destructive and Blue-600 for the one real dark-mode sidebar accent —
confirmed as a sanity check, not assumed.

### `:root` (light)

| Token | Old value (WFRC) | New value (shadcn Neutral/Nova) |
|---|---|---|
| `--background` | `var(--brand-white)` (`#ffffff`) | `#ffffff` (unchanged numerically) |
| `--foreground` | `var(--brand-black)` (`#151515`) | `#000000` |
| `--card` | `var(--background)` | `#ffffff` |
| `--card-foreground` | `var(--foreground)` | `#000000` |
| `--popover` *(new)* | — | `#ffffff` |
| `--popover-foreground` *(new)* | — | `#000000` |
| `--primary` | `var(--brand-wfrc-blue)` (`#023c5b`) | `#000000` |
| `--primary-foreground` | `#ffffff` | `#fafafa` |
| `--secondary` | `#ece9e6` | `#f5f5f5` |
| `--secondary-foreground` | `var(--foreground)` | `#171717` |
| `--muted` | `#f5f4f2` | `#f5f5f5` |
| `--muted-foreground` | `#6c6764` | `#737373` |
| `--accent` | `var(--brand-wfrc-yellow)` (`#f8b93e`) | `#f5f5f5` |
| `--accent-foreground` | `var(--brand-black)` | `#171717` |
| `--destructive` | `#c23c33` | `#e7000b` |
| `--destructive-foreground` | `#ffffff` | `#fcf3f3` |
| `--border` | `#d8d5d2` | `#e5e5e5` |
| `--input` | `var(--border)` | `#e5e5e5` |
| `--ring` | `var(--primary)` | `#a1a1a1` |
| `--radius` | `0.5rem` | `0.625rem` |
| `--sidebar` *(new)* | — | `#fafafa` |
| `--sidebar-foreground` *(new)* | — | `#000000` |
| `--sidebar-primary` *(new)* | — | `#171717` |
| `--sidebar-primary-foreground` *(new)* | — | `#fafafa` |
| `--sidebar-accent` *(new)* | — | `#f5f5f5` |
| `--sidebar-accent-foreground` *(new)* | — | `#171717` |
| `--sidebar-border` *(new)* | — | `#e5e5e5` |
| `--sidebar-ring` *(new)* | — | `#a1a1a1` |

### `.dark`

| Token | Old value (WFRC) | New value (shadcn Neutral/Nova) |
|---|---|---|
| `--background` | `var(--brand-background-dark)` (`#081b26`) | `#0a0a0a` |
| `--foreground` | `var(--brand-white)` | `#fafafa` |
| `--card` | `var(--background)` | `#171717` |
| `--card-foreground` | `var(--foreground)` | `#fafafa` |
| `--popover` *(new)* | — | `#171717` |
| `--popover-foreground` *(new)* | — | `#fafafa` |
| `--primary` | `var(--brand-wfrc-secondary-blue)` (`#52b6d5`) | `#e5e5e5` |
| `--primary-foreground` | `var(--brand-background-dark)` | `#171717` |
| `--secondary` | `#123240` | `#262626` |
| `--secondary-foreground` | `var(--foreground)` | `#fafafa` |
| `--muted` | `#0c232d` | `#262626` |
| `--muted-foreground` | `#94908c` | `#a1a1a1` |
| `--accent` | `var(--brand-wfrc-yellow)` | `#404040` |
| `--accent-foreground` | `var(--brand-black)` | `#fafafa` |
| `--destructive` | `#c23c33` | `#ff6467` |
| `--destructive-foreground` | `#ffffff` | `#df2225` |
| `--border` | `#23394a` | `#f5ffff1a` (10% white) |
| `--input` | `var(--border)` | `#ffffff26` (15% white) |
| `--ring` | `var(--primary)` | `#737373` |
| `--sidebar` *(new)* | — | `#171717` |
| `--sidebar-foreground` *(new)* | — | `#fafafa` |
| `--sidebar-primary` *(new)* | — | `#1447e6` (the one real non-neutral accent — a genuine, confirmed Blue-600 hue, not an error) |
| `--sidebar-primary-foreground` *(new)* | — | `#fafafa` |
| `--sidebar-accent` *(new)* | — | `#262626` |
| `--sidebar-accent-foreground` *(new)* | — | `#fafafa` |
| `--sidebar-border` *(new)* | — | `#f5ffff1a` |
| `--sidebar-ring` *(new)* | — | `#525252` |

**Not migrated, per spec.md's own Assumptions (`research.md` §7)**:
`--chart-1`..`--chart-5`, `--success`/`--success-foreground` (this
project's own real addition, not part of shadcn's set at all — no
directly corresponding upstream token, kept as-is), `--shadow-*` (this
project's own elevation system, not a shadcn default-theme concern).

**Deleted** (no longer referenced once every consumer moves to the new
tokens, per FR-008): `--brand-wfrc-blue`, `--brand-wfrc-secondary-blue`,
`--brand-wfrc-yellow`, `--brand-wfrc-gray`, `--brand-white`,
`--brand-black`, `--brand-background-dark` — the raw Tier-1 brand tokens
`tokens.css` currently defines and every semantic token currently
aliases. Real, confirmed consumers that reference these BY NAME (not
merely by inheriting a semantic token's resolved value) and therefore
need their own source edit, not just a token-value change:
`panels/SankeyPanel.tsx` (`FALLBACK_TOKEN_VARS`), `panels/tableLogic.ts`
(`cellColor()`), `panels/zonemapColor.ts` (choropleth fill anchor) — see
§3.

## §2. Typography migration

| Role | Old | New |
|---|---|---|
| `--font-body` | `"Poppins", -apple-system, ...` | `'Geist Variable', sans-serif` |
| `--font-heading` | `"Inter", var(--font-body)` | `'Geist Variable', sans-serif` (same value as body — Nova has no separate heading face, `research.md` §5) |
| `--font-mono` | `"Fira Code", SFMono-Regular, ...` | `'Geist Mono Variable', monospace` |

Loading mechanism: `src/lib/loadBrandFonts.ts` (Google Fonts CDN runtime
injection) is retired; replaced by direct side-effecting imports of
`@fontsource-variable/geist`/`@fontsource-variable/geist-mono` (real,
self-hosted, Vite-bundled — `research.md` §5/§6). `tailwind.config.js`'s
`fontFamily.body`/`.heading`/`.mono` keys are unchanged (still
`['var(--font-body)']` etc.) — only the custom-property values and the
loading mechanism change, not the Tailwind-facing names, so no class-name
migration (`font-body`/`font-heading`/`font-mono`) is needed anywhere
that already uses them.

## §3. Real, direct WFRC-brand-name references requiring a source edit (FR-008)

| File | Reference | Fix |
|---|---|---|
| `panels/SankeyPanel.tsx:32` | `FALLBACK_TOKEN_VARS = ['--primary', '--brand-wfrc-secondary-blue', '--brand-wfrc-yellow', '--brand-wfrc-gray']` | Replace with a neutral-theme-appropriate fallback sequence — e.g. `['--primary', '--secondary', '--accent', '--muted-foreground']`, all real, still-existing semantic tokens |
| `panels/tableLogic.ts` (`cellColor()`, 2 call sites) | `color-mix(in srgb, var(--brand-wfrc-blue) ${strength}%, var(--muted))` | `var(--brand-wfrc-blue)` → `var(--primary)` (now resolves to the new neutral-black/light-gray value, not a deleted variable) |
| `panels/zonemapColor.ts` (choropleth fill, 2 call sites) | Same `color-mix(...var(--brand-wfrc-blue)...)` pattern | Same fix — `var(--primary)` |

**Not in this table, confirmed unrelated (`research.md` §7)**:
`panels/RechartsPanel.tsx`/`rechartsEncoding.ts`'s use of `--chart-1..5`
— those tokens are not WFRC-brand-derived and are untouched.

## §4. Existing UI primitive components — re-theme only, no structural rewrite

`button.tsx`, `card.tsx`, `chart.tsx`, `dialog.tsx`, `dropdown-menu.tsx`,
`separator.tsx`, `sidebar.tsx`, `tabs.tsx`, `tooltip.tsx` — each keeps its
existing component structure (this feature is a re-theme, per FR-005, not
a component-internals rewrite); each is verified to render correctly
against the new token values in both themes. `sidebar.tsx` additionally
gains real consumers of the new `--sidebar-*` tokens it currently lacks
(today it reuses the app's main `--background`/`--border`/etc. tokens
directly, confirmed by `research.md` §2's own grep finding) — this is the
one component where the new tokens change which CSS variables are
referenced, not just their values.

## §5. New form-input primitives (FR-003/FR-004)

| Component | Real shadcn dependency | Real Radix primitive |
|---|---|---|
| `label.tsx` | `@radix-ui/react-label` (or the unified `radix-ui` package, per the Tailwind v4 track's own convention, `research.md` §3) | `Label` |
| `input.tsx` | none (plain `<input>`) | — |
| `textarea.tsx` | none (plain `<textarea>`) | — |
| `checkbox.tsx` | `@radix-ui/react-checkbox` | `Checkbox` |
| `switch.tsx` | `@radix-ui/react-switch` | `Switch` |
| `radio-group.tsx` | `@radix-ui/react-radio-group` | `RadioGroup` |
| `select.tsx` | `@radix-ui/react-select` | `Select` |

Each is authored following this project's own established convention for
every prior `components/ui/` primitive — hand-authored against this
project's real, current token/Tailwind setup (now Tailwind v4 +
`new-york-v4`, per the confirmed decision), verified against the real
current `new-york-v4` registry source for exact class-level parity, not
guessed. The real gap-check (`research.md`'s own components/ui/ audit,
cross-referenced against the real `new-york-v4` registry directory
listing) confirms these seven are the complete standard form-input set;
no eighth primitive was found missing.

## §6. Dark-mode fix re-verification entities (FR-007)

One verification case per row of `research.md` §8's table — each is a
real, direct assertion (computed style or contrast-ratio), not a visual
check, per `research.md` §9:

| Case | Assertion |
|---|---|
| Plotly transparent background | `page.evaluate()` reads the real Plotly `layout.paper_bgcolor`/`plot_bgcolor` the chart was actually drawn with, both themes |
| Observable Plot tooltip contrast | `tokenContrast.test.ts`-style ratio check against the new token values, both themes |
| Sankey label legibility | `getComputedStyle()` on a real rendered `<text>` node's `fill`, both themes |
| Map control icon legibility | Live visual + existing `filter: invert(1)` mechanism confirmed still resolving against the new `--card`/`--foreground` values |
| Native form control legibility | `color-scheme` declarations confirmed still present and correctly valued (`light`/`dark`) after the retheme |
| Dialog text-color inheritance | `getComputedStyle()` on real dialog content, both themes |

## §7. Design-system documentation entity

`wftdm-design-system` skill's own "Brand Identity" section gains a new,
clearly-labeled subsection stating the suspension (FR-009) — not a
deletion or silent rewrite of the existing rule, which stays intact as
the rule that resumes once a future re-branding feature reinstates it.
