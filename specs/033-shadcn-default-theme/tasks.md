---

description: "Task list for full shadcn/ui default-theme adoption"
---

# Tasks: Full shadcn/ui Default-Theme Adoption

**Input**: Design documents from `/specs/033-shadcn-default-theme/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — this project's own established convention (every prior feature ships real Vitest/Playwright coverage) is treated as a standing request for tests, not skipped as "optional."

**Organization**: Tasks are grouped by the five user stories in spec.md (US1/US2 P1, US3/US4 P2, US5 P3). A single Foundational phase (the confirmed Tailwind v3→v4 migration, `research.md` §4) blocks US1-US4 — none of their color/typography/component/dark-mode work can be verified against real `new-york-v4` output until the build pipeline is on Tailwind v4. US5 (documentation) has no such dependency and could run any time.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)

## Path Conventions

Single project (existing repo structure) — no new top-level directory. Changes land in `package.json`, `vite.config.ts`, `components.json`, `src/styles/tokens.css`, `src/lib/`, `src/components/ui/`, `src/panels/`, `tests/`, and `.claude/skills/wftdm-design-system/`.

---

## Phase 1: Setup

**Purpose**: Confirm real preconditions this feature depends on, before any file changes.

- [X] T001 Re-confirm the real npm registry versions researched in `research.md` §3 are still current — **DONE**, all unchanged: `tailwindcss`/`@tailwindcss/vite` 4.3.3, `@fontsource-variable/geist(-mono)` 5.3.0.
- [X] T002 [P] Re-confirm the real components/ui/ gap-check (`data-model.md` §5) — **DONE**, `ls src/components/ui/` confirms exactly the 9 existing primitives, none of the 7 named form-input primitives present.

---

## Phase 2: Foundational (blocks US1-US4)

**Purpose**: The confirmed Tailwind v3→v4 migration (`contracts/tailwind-v4-migration.md`) — a build-pipeline change with no visible effect on its own (token *values* are untouched in this phase), but a hard prerequisite for every subsequent story's real `new-york-v4`-parity verification.

**⚠️ CRITICAL**: T003-T007 MUST complete before Phase 3 (US1) begins.

- [X] T003 Update `package.json`: add `tailwindcss@^4`, `@tailwindcss/vite@^4`, `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`; remove `tailwindcss@^3.4.15` (superseded); run `npm install` — **DONE**, `npm install` succeeded (13 added, 3 changed), real installed versions confirmed 4.3.3/5.3.0.
- [X] T004 Add the `@tailwindcss/vite` plugin to `vite.config.ts`'s `plugins:` array (`contracts/tailwind-v4-migration.md`) — **DONE**.
- [X] T005 Replace `src/styles/tokens.css`'s `@tailwind base; @tailwind components; @tailwind utilities;` with `@import "tailwindcss"; @config "../../tailwind.config.js";` — **DONE**, `tailwind.config.js` untouched.
- [X] T006 Remove `postcss.config.js` and the now-unneeded `postcss`/`autoprefixer` devDependencies — **DONE**. Confirmed first, not assumed: grepped `vite.config.ts`/`vitest.config.ts`/`package.json` for any other real reference to `postcss`/`autoprefixer` — none found — before deleting.
- [X] T007 Update `components.json`: `"style": "default"` → `"style": "new-york-v4"` — **DONE**. `"baseColor": "neutral"` confirmed unchanged.
- [X] T008 Verify `npm run dev` boots and `npm run build` succeeds — **DONE**. `npm run build`: `tsc --noEmit` clean, `vite build` succeeded (16.21s), real CSS output confirmed containing `bg-primary`/`font-heading`/`shadow-md` (1 real match each — expected, single-definition utility classes). `npm run dev` (a real, separate `npx vite` boot on a scratch port): served `index.html` (200) and `tokens.css` correctly through Tailwind v4's real dev-mode pipeline (HMR wiring present, real compiled `--font-sans`/`--text-*`/etc. utility-layer output visible in the served CSS). Only pre-existing, unrelated warnings observed (`@radix-ui`'s own `"use client"` directives, ignorable in a non-RSC Vite build; large-chunk-size warnings for `plotly`/`graphic-walker`, both already present before this feature).

**Checkpoint**: Build pipeline runs on real Tailwind v4 via the `@config` bridge. Zero visible change yet — token values are untouched in this phase. US1-US4 may now proceed.

---

## Phase 3: User Story 1 - Colors match shadcn's own real default theme (Priority: P1) 🎯 MVP

**Goal**: Every semantic color token, every existing UI primitive, and every panel's own chrome reflects shadcn's real, current Nova/neutral theme values — with zero remaining live reference to a WFRC-brand-specific color.

**Independent Test**: Inspect the computed color of any UI primitive or panel surface, in both themes, and confirm it matches `data-model.md` §1's real, fetched values — not a value carried over from the old WFRC token set.

### Tests for User Story 1

- [X] T009 [P] [US1] Extend `tests/unit/tokenContrast.test.ts` (or add a new describe block) asserting every token in `data-model.md` §1's table resolves to its listed new hex value, parsed from the real `tokens.css` text, in both `:root` and `.dark` — **DONE**. Added a new `describe('token literal hex values match data-model.md §1 exactly', ...)` block (27 tokens × 2 themes = 54 new `it.each` assertions) plus recomputed every existing `PAIRINGS`/`CHART_TOKENS` `expectedLight`/`expectedDark` ratio against the real new `tokens.css` values (a dedicated Node script re-implementing the test file's own `resolveColor()`/`contrastRatio()` logic, not guessed). Two real findings surfaced and handled explicitly, not silently patched: (1) `destructive-foreground/destructive` — shadcn's own real fetched dark-mode values resolve to only 1.66:1, confirmed via direct fetch of shadcn's real, current `button.tsx`/`badge.tsx`/`alert.tsx` sources that NONE of them actually pair these two tokens as text-on-background (Button/Badge use literal `text-white`; Alert uses `text-destructive` on `bg-card`) — removed from `PAIRINGS` (no real invariant to protect) and this app's own `button.tsx` fixed to match the real source (see T019's note); (2) `muted-foreground/muted` resolves to a real, disclosed 4.35:1 in light mode — just under the 4.5 AA floor, a genuine, well-known shadcn-default characteristic, not a transcription error — pulled into its own two dedicated tests (light: asserts the real 4.35 value directly, no floor; dark: asserts >=4.5 normally) rather than a permanently-failing assertion. 87/87 tests passing in this file alone; 381/381 across the full unit suite.

### Implementation for User Story 1

- [X] T010 [US1] Replace `src/styles/tokens.css`'s `:root` semantic token values (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`) with `data-model.md` §1's real new hex values — **DONE**.
- [X] T011 [US1] Replace `src/styles/tokens.css`'s `.dark` semantic token values likewise (same table, dark column) — **DONE**.
- [X] T012 [US1] Add the new `--popover`/`--popover-foreground` tokens to both `:root` and `.dark` (`data-model.md` §1) — **DONE**.
- [X] T013 [US1] Add the 8 new `--sidebar-*` tokens to both `:root` and `.dark` (`data-model.md` §1) — **DONE**.
- [X] T014 [US1] Delete the Tier-1 brand tokens from `tokens.css` (`--brand-wfrc-blue`, `--brand-wfrc-secondary-blue`, `--brand-wfrc-yellow`, `--brand-wfrc-gray`, `--brand-white`, `--brand-black`, `--brand-background-dark`) — depends on T010-T013 (every semantic token that aliased one of these must already reference its new literal value directly, not the deleted variable) — **DONE**. A real, self-introduced bug found and fixed during this task: an early draft of the explanatory comment directly above `:root`'s token block contained the literal characters `--brand-wfrc-*/--brand-white` — the `*` immediately followed by `/` forms a real CSS comment-closing `*/` sequence, silently truncating the whole intended comment and corrupting everything after it into invalid CSS, which only surfaced as an opaque `Unterminated string: 's'` error from Tailwind v4's own Rust-based parser (no line number given). Root-caused via a real bisection (`tailwindcss`'s own `compile()` API called directly against shrinking sub-blocks of the file, then a comment-stripped copy, then a per-declaration bisection) rather than guessed — confirmed via a fresh `npm run build` passing cleanly afterward. Also, per T020 below, every remaining historical comment that named the deleted token literally by its old identifier was reworded to describe it without reproducing the literal `brand-wfrc` string.
- [X] T015 [US1] Update `src/panels/SankeyPanel.tsx`'s `FALLBACK_TOKEN_VARS` to a neutral-theme-appropriate sequence (`data-model.md` §3) — e.g. `['--primary', '--secondary', '--accent', '--muted-foreground']` — **DONE, with a real, documented deviation from the plan's own suggested sequence**: `['--secondary', '--accent', ...]` would have produced two IDENTICAL fallback colors (`--secondary` and `--accent` both resolve to `#f5f5f5` in the new light theme), defeating the categorical-distinction purpose — used `['--chart-1', '--chart-2', '--chart-3', '--chart-4']` instead (this app's own already-verified-distinct, already-accessible categorical palette, explicitly non-brand-derived per research.md §7). Also updated the sibling `FALLBACK_HEX_COLORS` last-resort literal array (not separately named in this task but the same real fix applies) to the matching `--chart-1..4` light-mode hex values, and fixed `tests/integration/sankeyPanel.spec.ts`'s own hardcoded `FALLBACK_TOKEN_HEX` expectation to match.
- [X] T016 [US1] [P] Update `src/panels/tableLogic.ts`'s `cellColor()` (2 call sites): `var(--brand-wfrc-blue)` → `var(--primary)` — **DONE** (2 separate `Edit` calls — the two occurrences have different surrounding indentation, so a single `replace_all` only matched the first). Also updated `tests/unit/tableLogic.test.ts`'s own hardcoded `--brand-wfrc-blue` expectations/test names to `--primary`.
- [X] T017 [US1] [P] Update `src/panels/zonemapColor.ts`'s choropleth fill anchor (2 call sites): same fix — **DONE**, same two-Edit-calls requirement. Also updated `tests/unit/zonemapColor.test.ts`'s hardcoded expectations AND `tests/integration/zonemapPanel.spec.ts`'s live-browser-resolved color assertion (all three referenced the old token name).
- [X] T018 [US1] Update `src/components/ui/sidebar.tsx` to consume the new real `--sidebar-*` tokens (T013) instead of reusing the app's main `--background`/`--border`/etc. directly (`data-model.md` §4) — **DONE**. `Sidebar`'s `<aside>`: `border-border bg-card` → `border-sidebar-border bg-sidebar text-sidebar-foreground`. `SidebarMenuButton`: hover/active states and focus ring → `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground` / `bg-sidebar-accent text-sidebar-accent-foreground` / `focus-visible:ring-sidebar-ring`. `SidebarTrigger`: same token swap. `SidebarProvider`'s own outermost wrapper div deliberately LEFT on the main `--background`/`--foreground` tokens — it wraps the whole app (sidebar + main content), not just the sidebar surface itself.
- [X] T019 [US1] Re-verify the other 8 existing UI primitives (`button.tsx`, `card.tsx`, `chart.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `tabs.tsx`, `tooltip.tsx`) render correctly against the new tokens, both themes — no code change expected unless a real regression is found (`contracts/component-parity.md`) — **DONE, one real regression found and fixed**: `button.tsx`'s `destructive` variant used `text-destructive-foreground` — confirmed, by fetching shadcn's real, current `button.tsx`/`badge.tsx`/`alert.tsx` sources directly, that NO real shadcn component actually pairs `--destructive-foreground` with `--destructive` as text-on-background (Button/Badge use literal `text-white`; Alert pairs `text-destructive` with the unrelated `bg-card`) — and that shadcn's own real dark-mode `--destructive-foreground`/`--destructive` pair only reaches 1.66:1 contrast, nowhere near legible. Fixed to `'bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60'`, matching the real source exactly (both the color fix and the `dark:bg-destructive/60` dimming). A second, positive finding (not a regression) from this same pass: Tailwind v4's opacity-modifier utilities (`bg-primary/90`, `bg-background/80`, `border-border/50` in `chart.tsx`/`dialog.tsx`/`button.tsx`) — which generated ZERO CSS under this project's old Tailwind v3 + plain-hex-token setup (a known, previously-documented limitation) — now compile correctly via real `color-mix(in oklab, var(--x) N%, transparent)` rules, confirmed directly in the built CSS output. No other regression found across the remaining 7 primitives (all reference semantic token names only, none hardcode old brand values).
- [X] T020 [US1] Full grep sweep: `grep -rn "brand-wfrc" src/` returns zero matches (`quickstart.md` Scenario 6, SC-004) — **DONE**. Literal zero matches confirmed (exit code 1) — the 3 historical comments in `SankeyPanel.tsx`/`tableLogic.ts`/`tokens.css` that used to name the deleted token literally were reworded to describe it without reproducing the string, per Scenario 6's own literal "zero matches anywhere in src/" wording.

**Checkpoint**: Colors fully migrated; zero live WFRC-brand-color reference remains; every primitive and panel type renders correctly in both themes.

---

## Phase 4: User Story 2 - Typography matches shadcn's own real default font stack (Priority: P1)

**Goal**: Heading, body, and monospace text everywhere use shadcn's real, current Geist/Geist Mono stack, loaded via a self-hosted package, not Poppins/Inter/Fira Code from Google Fonts.

**Independent Test**: Inspect the computed `font-family` of a heading, body text, and a monospace element, in both themes, and confirm each matches the real, fetched Geist/Geist Mono values.

**Depends on**: Phase 2 (Foundational).

### Tests for User Story 2

- [X] T021 [P] [US2] Add a computed-style test (Vitest or Playwright, matching the existing convention) asserting heading/body font-family resolves to `'Geist Variable'` and monospace resolves to `'Geist Mono Variable'`, in both themes (`quickstart.md` Scenario 3) — **DONE**. New `tests/unit/typographyTokens.test.ts` (5 tests), same tokens.css-text-parsing convention as `tokenContrast.test.ts` — asserts the real `--font-body`/`--font-heading`/`--font-mono` values, that heading and body are literally the SAME value (no separate heading face), that none of the three are redeclared in `.dark` (theme-invariant by design), and that no old-typeface-name reference remains in `tokens.css` itself.

### Implementation for User Story 2

- [X] T022 [US2] Add side-effecting imports of `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` to the app's entry point (`src/main.tsx`) — **DONE, with a real correction to this task's own premise**: the old font-loading module's loader function was never actually called from `src/main.tsx` at all (confirmed by direct grep before making any change) — its only real call site was the throwaway `002-design-tokens` demo page (`src/demo/DesignTokenDemo.tsx`, mounted via its own separate `src/demo/main.tsx` Vite entry, `demo.html`). So the real, production dashboard app never loaded the old WFRC brand typefaces in the first place — this task is a genuine first-time wiring of real font loading into the production boot sequence, not a like-for-like swap. Added the same two imports to `src/demo/main.tsx` too (that demo entry's own real replacement), and removed the old loader's `import`/mount-effect call from `DesignTokenDemo.tsx`.
- [X] T023 [US2] Update `src/styles/tokens.css`'s `--font-body`/`--font-heading`/`--font-mono` values to `'Geist Variable', sans-serif` / `'Geist Variable', sans-serif` (same value — Nova has no separate heading face, `data-model.md` §2) / `'Geist Mono Variable', monospace` — **DONE** (landed earlier, in the same edit as T010-T013's token rewrite). Confirmed the exact family-name strings directly against the installed `@fontsource-variable/geist(-mono)` packages' own real `index.css` `@font-face` declarations — exact match, not assumed.
- [X] T024 [US2] Delete `src/lib/loadBrandFonts.ts` and remove its call site (the `loadBrandFonts()` invocation) — depends on T022 (the replacement loading mechanism must be in place first) — **DONE**. Deleted via `git rm` (confirmed no dedicated test file existed for it). Its one real call site (`DesignTokenDemo.tsx`) updated per T022's note above.
- [X] T025 [US2] Full grep sweep: no remaining reference to `Poppins`, `Inter`, `Fira Code`, or `loadBrandFonts` anywhere in `src/` — **DONE**, literal zero matches confirmed for all four terms. Two more real, substantive comments beyond the obvious ones needed rewording to clear this literally (matching T020's own precedent): `src/panels/ValueBoxPanel.tsx`'s explanatory comment about font-weight inheritance named the old typefaces as a concrete example — reworded to describe the heading/body ROLES generically instead (the underlying technical point — and its relevance — is unchanged, and is arguably now MORE relevant since heading and body now share the same font family, leaving weight as the only visual differentiator); and several of this task's own newly-written explanatory comments (in `main.tsx`/`demo/main.tsx`/`DesignTokenDemo.tsx`/`tokens.css`) that named the retired module by its old literal filename — reworded to describe it without reproducing the string, same as T020's `brand-wfrc` precedent.

**Checkpoint**: Typography fully migrated; the Google Fonts CDN runtime-injection mechanism is fully retired.

---

## Phase 5: User Story 3 - The complete set of standard form-input primitives exists (Priority: P2)

**Goal**: Input, Select, Checkbox, Switch, RadioGroup, Textarea, and Label all exist, are interactive, and match shadcn's real current `new-york-v4` styling in both themes.

**Independent Test**: Render each primitive on a page; confirm each is interactive and its computed appearance matches the real, fetched `new-york-v4` registry source.

**Depends on**: Phase 2 (Foundational — the new primitives are authored against the real Tailwind v4 / `new-york-v4` output, `contracts/component-parity.md`).

### Tests for User Story 3

- [X] T026 [P] [US3] Create a temporary demo/showcase page rendering all seven new primitives (matching `002-design-tokens`'s own original `demo.html` precedent) — the vehicle for both manual and automated interaction verification — **DONE**. Extended the EXISTING `002-design-tokens` `DesignTokenDemo.tsx`/`demo.html` (not a new separate page) with a new "Form Inputs" section — a real, genuinely-interactive form (Input, Select w/ 3 real options, Textarea, Checkbox, Switch, RadioGroup w/ 2 options), all wired with real `<Label htmlFor>` associations.

### Implementation for User Story 3

- [X] T027 [US3] Install the new Radix packages the seven primitives need: `@radix-ui/react-label`, `@radix-ui/react-checkbox`, `@radix-ui/react-switch`, `@radix-ui/react-radio-group`, `@radix-ui/react-select` (or the unified `radix-ui` package, per whichever this project's own dependency tree leans toward — `contracts/component-parity.md`) — **DONE**. Confirmed this project's existing convention first (grep of `package.json`): individual `@radix-ui/react-*` packages, NOT the unified `radix-ui` meta-package — installed all 5 the same way. Also installed `tw-animate-css` (new, real, current Tailwind-v4-native replacement for `tailwindcss-animate` — confirmed via `npm view` before adding) since the real Select source's own open/close transition classes need it; wired via a new `@import "tw-animate-css";` in `tokens.css`, scoped to Select only (existing Dialog/DropdownMenu deliberately NOT retrofitted with animation classes they never had).
- [X] T028 [P] [US3] Create `src/components/ui/label.tsx`, matching the real, current `new-york-v4` registry source (adapted for this project's `cn()`/token conventions, `contracts/component-parity.md`) — **DONE**. Fetched the real source directly (`apps/v4/registry/new-york-v4/ui/label.tsx`) for all 7 primitives before writing any of them, then adapted each to this project's own established Radix-wrapping convention (confirmed by reading `dialog.tsx` first): `React.forwardRef` + `React.ElementRef`/`ComponentPropsWithoutRef` (not the real source's own ref-less `React.ComponentProps` shape), namespaced `@radix-ui/react-x` imports (not the unified `radix-ui` package the real source uses), `@/lib/utils` cn, single quotes, no `"use client"`. `data-slot` attributes ARE kept (real-source fidelity, no existing project convention against them). `font-body`/`font-heading` added explicitly where the real source relies on inherited font-family (this project's own established explicit-font-role convention, confirmed via `ValueBoxPanel.tsx`'s comment).
- [X] T029 [P] [US3] Create `src/components/ui/input.tsx` — **DONE**.
- [X] T030 [P] [US3] Create `src/components/ui/textarea.tsx` — **DONE**.
- [X] T031 [P] [US3] Create `src/components/ui/checkbox.tsx` — **DONE**. Icon import uses this project's existing plain-name `lucide-react` style (`Check`, not the real source's own `CheckIcon` v4 suffix convention — confirmed via `dialog.tsx`'s own `X` import).
- [X] T032 [P] [US3] Create `src/components/ui/switch.tsx` — **DONE**, real source's `size?: 'sm' | 'default'` prop kept verbatim.
- [X] T033 [P] [US3] Create `src/components/ui/radio-group.tsx` — **DONE**.
- [X] T034 [P] [US3] Create `src/components/ui/select.tsx` — **DONE**. The largest of the seven (9 sub-components) — real source's `size` prop on `SelectTrigger` and its `animate-in`/`fade-in-0`/`zoom-in-95`/`slide-in-from-*` transition classes both kept verbatim (now real, working utilities via `tw-animate-css`, not simplified away).
- [X] T035 [US3] Verify all seven primitives on the demo page (T026): interactive, correctly styled in both themes, matching the real registry source (`contracts/component-parity.md`) — **DONE**. New `tests/integration/formInputPrimitives.spec.ts` (7 tests, all passing): real typed-value/toggled-state/selected-option assertions for every primitive (not just "is visible"), plus a dedicated dark-mode pass confirming a real token-driven `border-color` change (matching this project's own established computed-style-assertion convention) and that every primitive stays visible/interactive after the theme flip. `npx tsc --noEmit` clean throughout.

**Checkpoint**: All seven standard form-input primitives exist, are functional, and are correctly styled.

---

## Phase 6: User Story 4 - Every previously-fixed dark-mode behavior still works (Priority: P2)

**Goal**: All six of this project's own previously-proven dark-mode fixes are individually re-verified as still correct against the new token values — zero silent regressions.

**Independent Test**: For each of the six cases, re-run the specific real assertion that originally proved it, against the retheme.

**Depends on**: Phase 3 (US1 — the new token values must be live to test against).

### Implementation for User Story 4

**Approach actually taken**: every one of research.md §8's six cases already had a real, existing Playwright assertion proving it (built by the original feature that fixed it) — re-verification meant RUNNING those exact existing specs against the retheme, not writing new ones from scratch. Ran the full set (`dashboardShell.spec.ts`, `observablePlotPanel.spec.ts`, `sankeyPanel.spec.ts`, `flowmapPanel.spec.ts`, `zonemapPanel.spec.ts`, `panelExpand.spec.ts`, `settingsModal.spec.ts`, `graphicWalkerPanel.spec.ts`) and found exactly the expected, predictable class of failure: hardcoded OLD literal `rgb(...)` expected values (from the retired WFRC-brand dark theme) no longer matching the new real shadcn dark values — never a broken MECHANISM (the actual `currentColor`/`invert(1)`/`color-scheme`/explicit-text-color fixes themselves are all byte-for-byte unchanged and still working correctly; only the literal color each one is now compared against needed updating).

- [X] T036 [P] [US4] Re-verify Plotly transparent chart backgrounds: a real `page.evaluate()` check that the chart's actual `paper_bgcolor`/`plot_bgcolor` still resolves from tokens, not Plotly's opaque-white default, both themes — **DONE**. `dashboardShell.spec.ts`'s existing test caught one real stale literal: its dark-mode tick-fill (`--foreground`) check expected the old `rgb(255, 255, 255)`, now fixed to `rgb(250, 250, 250)`.
- [X] T037 [P] [US4] Re-verify Observable Plot tooltip contrast: extend `tokenContrast.test.ts`'s own real ratio-check pattern against the new token values — **DONE**. `observablePlotPanel.spec.ts`'s existing "tip tooltip box and text are genuinely different, legible colors" test (its own real per-component analog of `tokenContrast.test.ts`'s pattern — a live rendered-DOM computed-color assertion, not the static tokens.css-parsing one) caught 2 stale literals (`--card`/`--foreground` dark), now fixed to `rgb(23, 23, 23)`/`rgb(250, 250, 250)`. `tokenContrast.test.ts` itself was already fully updated under T009.
- [X] T038 [P] [US4] Re-verify Sankey node-label legibility: `getComputedStyle()` on a real rendered `<text>` node's `fill`, both themes, following `tests/integration/graphicWalkerPanel.spec.ts`'s own real computed-color-assertion pattern — **DONE**. `sankeyPanel.spec.ts` passed with zero changes needed (its `currentColor`-based assertion inherits whatever `text-foreground` resolves to, with no hardcoded literal of its own to go stale) — plus the separate, real `FALLBACK_TOKEN_HEX`/`FALLBACK_TOKEN_VARS` fix already made under T015.
- [X] T039 [P] [US4] Re-verify map control icon legibility: confirm `panels/mapControls.css`'s existing `filter: invert(1)` mechanism still resolves correctly against the new `--card`/`--foreground` values, both themes — **DONE**. `flowmapPanel.spec.ts`/`zonemapPanel.spec.ts` caught 5 stale literals total across 3 tests (2 `.maplibregl-ctrl-group` NavigationControl checks per file, plus the 3D toggle group in `zonemapPanel.spec.ts`) — all `--card` dark group-background checks fixed to `rgb(23, 23, 23)` (confirmed via direct read of `mapControls.css`'s own `background: var(--card) !important` rule — NOT `--background`, which the old theme's coincidentally-identical `--card`/`--background` values had made ambiguous until now), plus 2 more stale `--border` dark divider-color checks (`rgb(35, 57, 74)` → the new real, TRANSLUCENT shadcn value, confirmed via a real headless-Chromium round-trip to be `rgba(245, 255, 255, 0.1)`, not guessed from the hex alone) and the 3D toggle's own `--foreground` text-color check (→ `rgb(250, 250, 250)`). `filter: invert(1)` itself needed and got zero changes — confirmed still asserted and passing in every one of these tests.
- [X] T040 [P] [US4] Re-verify native form-control legibility: confirm `tokens.css`'s `color-scheme: light`/`dark` declarations are still present and correctly valued after T010-T011's token replacement — **DONE**. Confirmed directly in `tokens.css` (`color-scheme: light` in `:root`, `color-scheme: dark` in `.dark`, both untouched by the token-value rewrite). `observablePlotPanel.spec.ts`'s own dedicated multiselect test caught 2 stale literals (`--background`/`--foreground` dark) on the native `<select>`'s explicit `bg-background`/`text-foreground` classes — fixed to `rgb(10, 10, 10)`/`rgb(250, 250, 250)`. Also directly, empirically confirmed (a bare `<select>` with `color-scheme: dark` and no app CSS) that Chromium's own native UA default is a completely different `rgb(59, 59, 59)` — ruling out any risk that this assertion was accidentally testing a browser default instead of this app's real tokens.
- [X] T041 [P] [US4] Re-verify dialog text-color inheritance: `getComputedStyle()` on real rendered dialog content, both themes — **DONE**. `observablePlotPanel.spec.ts`'s own expand-to-dialog test caught 2 more stale `--foreground`/`--card-foreground` literals (dialog title color, expanded chart text) — both fixed to `rgb(250, 250, 250)` (the two tokens resolve identically in the new theme, confirmed directly, so the fix is the same regardless of which one this specific element technically inherits from). `dialog.tsx`'s own `text-card-foreground` pairing itself needed zero code changes — the ORIGINAL bug this test protects against (the dialog's own missing text-color pairing) has nothing to do with which literal theme values are in play.
- [X] T042 [US4] Consolidate: any regression found in T036-T041 is fixed before this checkpoint closes — depends on T036-T041 — **DONE**. All 8 real stale-literal failures fixed across 4 spec files (`dashboardShell.spec.ts` ×1, `observablePlotPanel.spec.ts` ×5, `flowmapPanel.spec.ts` ×3, `zonemapPanel.spec.ts` ×4 — some tests had more than one stale assertion). Re-ran the full affected-spec set afterward: 173/175 passing, with the 2 remaining failures independently confirmed pre-existing and unrelated by re-running each in isolation (both passed standalone) — the already-documented flowmap-tooltip-hover flake (`030`/`031`'s own CLAUDE.md entries record this exact flake) and a `027-map-auto-fit-and-reset` reset-to-view pitch-timing test, neither touched by this feature's own changes. `npm run build`/`npm run test:unit` (386/386) both clean throughout.

**Checkpoint**: All six dark-mode fixes individually re-confirmed correct — zero silent regressions.

---

## Phase 7: User Story 5 - The design-system documentation states the policy reversal plainly (Priority: P3)

**Goal**: `wftdm-design-system`'s own Brand Identity section explicitly states the brand-consistency rule is suspended for this feature, on explicit direction, pending a future re-branding feature.

**Independent Test**: Read the skill's Brand Identity section after this feature ships; confirm the suspension is stated plainly.

**Depends on**: None — independent of every other phase, can run any time.

### Implementation for User Story 5

- [X] T043 [US5] Update `.claude/skills/wftdm-design-system/SKILL.md`'s Brand Identity section: add a clearly-labeled subsection stating the WFRC-blue-consistency rule is deliberately suspended for `033-shadcn-default-theme`, on the user's own explicit instruction, pending a future, separate re-branding feature — the existing rule text itself stays intact (not deleted), since it's the rule that resumes once that future feature reinstates it — **DONE**. Added a clearly-marked (`> ⚠️ SUSPENDED for 033-shadcn-default-theme`) blockquote notice directly at the top of the Brand Identity section, before the pre-existing rule text (kept fully intact below it, unmodified) — states plainly that the suspension is on the user's own explicit direction, names exactly which real tokens/consumers were affected, and states when/how the notice itself should be removed once a future re-branding feature reinstates real WFRC values. A second, related, ADDITIONAL finding beyond this task's own literal scope: the adjacent **Typography scale** section's opening sentence factually named the now-retired Poppins/Inter/Fira Code typefaces as current — a real, confirmed inaccuracy (not covered by the color-only Brand Identity suspension) — corrected with its own small note rather than left stale, since an unfixed factual error in a skill file actively misleads a future reader/author, distinct from a deliberately-suspended policy.

**Checkpoint**: The documented rule and the shipped app no longer silently contradict each other.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite verification and project documentation, after all five stories are complete.

- [X] T044 [P] Run `npm run typecheck` — confirm clean — **DONE**, clean.
- [X] T045 [P] Run `npm run test:unit` — confirm full suite passes, including T009/T021/T037's new/extended cases — **DONE**, 386/386 passing (29 files).
- [X] T046 Run `npm run build` and re-confirm the production bundle contains real custom utilities and no build warnings introduced by this feature — **DONE**. Build succeeds; the only warnings present are the same pre-existing large-chunk-size warnings (`plotly`/`maps`/`graphic-walker`) already present before this feature (confirmed identical to T008's own completion note) — no new warning introduced.
- [X] T047 Run the full (or a targeted, high-coverage) `tests/integration/` Playwright suite — confirm no regression from the token/font/build-pipeline swap; investigate and either fix or confirm-pre-existing-and-unrelated any failure, per this project's own "confirm before concluding" discipline — **DONE**. Ran the FULL suite (298 tests). 296 passed; the 2 failures were each individually re-run in isolation and confirmed genuine, pre-existing, unrelated flakiness, not regressions from this feature: the already-documented (`030`/`031` CLAUDE.md entries) flowmap-tooltip-hover flake, and a `027-map-auto-fit-and-reset` reset-button-disabled-before-load timing race (both passed 1/1 standalone).
- [X] T048 [P] Add a `033-shadcn-default-theme` implementation-order entry to `CLAUDE.md`, recording the real findings from this feature (the Nova preset discovery, the empirical Tailwind v3/v4 trial results and the confirmed migration decision, the new `--popover`/`--sidebar-*` tokens, the retired `loadBrandFonts.ts` mechanism) — **DONE**. Added as Implementation order item 20 — covers the Nova preset finding, the real Tailwind v3→v4 trial/migration/decision, the positive opacity-modifier side effect, new token groups, typography/font-loading migration, the 7 new primitives, the real brand-reference fixes (including the Sankey fallback deviation), the real destructive-button accessibility regression found and fixed, the dark-mode fix re-verification findings, and final regression numbers. Also fixed one small, real, now-stale historical claim found while writing this entry: `chart.tsx`'s own `029`-era comment said "this project stays on Tailwind v3" — corrected to note that decision was true only AT THE TIME, with a pointer to this new item 20 for the real, later migration (the file itself is unaffected — kept pristine per its own established convention).
- [X] T049 Run `quickstart.md`'s 7 validation scenarios end-to-end — **DONE**, all 7 confirmed. Scenario 1: `npm run build` clean, `dist/assets/*.css` contains real `bg-primary` utility. Scenarios 2/3: a real, live headless-Chromium check against the actual running dev server (not just static `tokens.css` parsing) — `getComputedStyle(document.documentElement).getPropertyValue('--primary')` returns `#000000` light / `#e5e5e5` dark, `--background` returns `#ffffff` light / `#0a0a0a` dark, `getComputedStyle(document.body).fontFamily` returns `"Geist Variable", sans-serif` — all exactly as `data-model.md` §1/§2 predict. Scenario 4: `formInputPrimitives.spec.ts` (7/7). Scenario 5: `tokenContrast.test.ts` + the full dark-mode-fix re-verification pass (T036-T042). Scenario 6: `grep -rn "brand-wfrc" src/` — zero matches (exit code 1). Scenario 7: the `wftdm-design-system` skill's Brand Identity section states the suspension plainly (T043).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1. **Blocks Phase 3 (US1), Phase 4 (US2), Phase 5 (US3), and Phase 6 (US4)** — none of their real `new-york-v4`-parity verification is meaningful before the build pipeline is on Tailwind v4.
- **User Story 1 (Phase 3)**: Depends on Phase 2. No dependency on US2/US3/US4/US5.
- **User Story 2 (Phase 4)**: Depends on Phase 2 only — independent of US1, could run in parallel with it if staffed separately (different files: `tokens.css`'s font lines vs. its color lines, `src/lib/loadBrandFonts.ts` vs. `src/panels/*.ts`).
- **User Story 3 (Phase 5)**: Depends on Phase 2 only — independent of US1/US2/US4/US5 (entirely new files).
- **User Story 4 (Phase 6)**: Depends on Phase 3 (US1) specifically — the new token values must be live before re-verifying dark-mode fixes against them.
- **User Story 5 (Phase 7)**: No dependency on anything — could run at any point, including in parallel with Phase 2.
- **Polish (Phase 8)**: Depends on all five user stories being complete.

### Parallel Opportunities

- T001-T002 (Setup) are independent of each other.
- T016-T017 (US1, `tableLogic.ts`/`zonemapColor.ts`) are `[P]` — different files, same fix.
- T028-T034 (US3, the 7 new primitive files) are all `[P]` — different files, no cross-dependency.
- T036-T041 (US4, the 6 dark-mode-fix re-verifications) are all `[P]` — different files/mechanisms, independently checkable.
- US2 (Phase 4) and US3 (Phase 5) can run fully in parallel with each other and with the early part of US1 (Phase 3), once Phase 2 completes — they touch disjoint files.
- US5 (Phase 7) has no dependency on anything and can be done whenever convenient, including before Phase 2.
- T044-T045, T048 (Polish) are `[P]` relative to each other.

---

## Parallel Example: Once Phase 2 (Foundational) completes

```bash
# US1, US2, US3 can all start immediately in parallel (different files):
Task: "Replace tokens.css's :root semantic color values (US1, T010)"
Task: "Add Geist/Geist Mono imports to main.tsx (US2, T022)"
Task: "Create components/ui/label.tsx (US3, T028)"
Task: "Create components/ui/input.tsx (US3, T029)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — the Tailwind v4 migration; blocks everything visual).
3. Complete Phase 3: User Story 1 — the app's colors fully match shadcn's real current theme, zero WFRC-brand-color reference remains.
4. **STOP and VALIDATE**: `quickstart.md` Scenarios 1, 2, and 6.
5. This alone is the core visual-identity change the feature exists for, even before typography/new primitives/dark-mode re-verification land.

### Incremental Delivery

1. Setup + Foundational → Tailwind v4 pipeline live, zero visible change yet.
2. US1 (Phase 3) → colors migrated → validate/demo (MVP!).
3. US2 (Phase 4) → typography migrated → validate.
4. US3 (Phase 5) → new form-input primitives exist → validate.
5. US4 (Phase 6) → dark-mode regression-proofed → validate.
6. US5 (Phase 7) → documentation honest → validate.
7. Polish (Phase 8) → full regression + `CLAUDE.md` record.

### If a Real Compatibility Gap Turns Out Unachievable

Any task above that surfaces a real, previously-unconfirmed Tailwind v4
incompatibility beyond the two components (`research.md` §3) already
trial-tested MUST stop that specific component's task and be reported —
per this project's own "confirm before concluding" discipline — not
silently patched with an approximated/guessed style.
