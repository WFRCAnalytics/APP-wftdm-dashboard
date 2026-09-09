# Phase 0 Research: Full shadcn/ui Default-Theme Adoption

All findings below were resolved by direct retrieval from shadcn/ui's own
real, current source (`shadcn-ui/ui` on GitHub, fetched via `gh api`/`curl`
against `raw.githubusercontent.com`, not `ui.shadcn.com`'s own rendered
docs pages, which collapse large code blocks and cannot be scraped
reliably) and by real, hands-on trials against this project's own actual
files — not assumed from memory, per the feature's own explicit
instruction.

## 1. shadcn's own naming has moved past "default"/"new-york" entirely

**Finding**: The real, current `shadcn` CLI package
(`packages/shadcn/src/preset/defaults.ts`) no longer organizes its output
around the classic two-style "default"/"new-york" choice at all. It now
ships eight named **presets** — Nova, Vega, Maia, Lyra, Mira, Luma, Sera,
Rhea — each bundling a `style` + `baseColor`/`theme` + icon library + font
choice together. The real, live `ui.shadcn.com` docs site itself
(`apps/v4`) is built on the **Nova** preset: `baseColor: "neutral"`,
`theme: "neutral"`, `iconLibrary: "lucide"`, `font: "geist"` — confirmed by
cross-referencing `apps/v4/lib/fonts.ts` (uses `next/font/google`'s
`Geist`/`Geist_Mono`) directly against `defaults.ts`'s own Nova entry.

**Decision**: Treat "Nova" (neutral base color, Geist/Geist Mono fonts,
Lucide icons) as the real, current referent of what the feature's own
"new-york style variant's neutral/zinc palette" language was pointing at —
not a literal style named "new-york-v4" (that name still exists as a
`components.json` `style` value, §3 below, but "Nova" is the actual
current preset identity wrapping it). This project already uses
`lucide-react` (Principle VI) and already has `baseColor: "neutral"` in
its real, existing `components.json` — two of Nova's three non-font
ingredients are already in place; only the color *values* and the font
need to change.

**Alternatives considered**: Chase a literal preset named "new-york" in
the current CLI. Rejected — no such preset exists in the real, current
`defaults.ts`; "new-york" survives only as a `style` value nested inside
this mechanism (§3), and insisting on the exact old name would mean
targeting dead terminology instead of shadcn's real current output.

## 2. The real, current default theme's CSS values (Nova/neutral)

**Finding**: Fetched directly from `apps/v4/app/globals.css` (the live
docs site's own real, shipped `:root`/`.dark` blocks — this site runs the
Nova preset per §1, so this is a first-party live confirmation, not a
guess):

```css
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0% 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0% 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0% 0 0);
  --primary: oklch(0% 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.97 0.01 17);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0% 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.371 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.58 0.22 27);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.439 0 0);
}
```

Every color is `oklch(L C H)` with **chroma 0** (except `--destructive`
and dark mode's `--sidebar-primary`, both real accent hues) — a truly
neutral gray scale, confirming "neutral" (not "zinc," which carries a
faint cool tint) is the real base color in use. `--chart-1..5` in the real
source resolve to `var(--color-blue-300..800)` (a real, Tailwind-palette-
referencing monochrome-blue categorical set) — **not relevant to this
project** per §7 below.

**Decision**: These are the target color values for FR-001, converted to
this project's existing plain-hex custom-property convention (`contracts/
tailwind-config-contract.md`'s own established "plain hex, not
`hsl(var(--x))`" deviation) during implementation — oklch→hex conversion
via a real rendered-canvas read (this project's own established technique,
already used for `029`'s chart-token work), not a manual/approximate
conversion.

**New tokens this project doesn't have yet**: `--popover`/
`--popover-foreground` (used by Dialog/DropdownMenu internals in the real
new-york-v4 source) and the eight `--sidebar-*` tokens (`sidebar.tsx`'s own
hand-port, `030`, currently reuses the main `--background`/`--border`/etc.
tokens directly instead — confirmed by grep, no `--sidebar-*` custom
property exists anywhere in this project's real `tokens.css` today). Both
gaps are added as part of this feature, following this project's own
established token-addition discipline (Assumptions, spec.md Edge Cases).

## 3. Real, empirical trial: the actual CLI, run against this project's real files

**Decision-relevant finding, tested directly, not read from a migration
guide**: `components.json`'s `style` field accepts three real, distinct
values on the current, live shadcn CLI — tested by copying this project's
real, unmodified `components.json`/`tailwind.config.js`/`tokens.css` into
an isolated scratch directory and running the real
`npx shadcn@latest add button`/`add card` against each:

| `style` value | CLI accepts it today? | Real output shape | Needs Tailwind v4? |
|---|---|---|---|
| `"default"` (this project's current real value) | Yes | `React.forwardRef`, `ring-offset-background`, `h-10`/`h-9`/`h-11` sizing — the OLD, pre-new-york look | No — confirmed v3-compatible |
| `"new-york"` | **Yes — still fully served today** | `React.forwardRef`, `ring-1`, `shadow`/`shadow-sm`, `h-9`/`h-8`/`h-10` sizing — a real, different, currently-shipped visual style | **No** — real compiled output contains zero v4-exclusive syntax |
| `"new-york-v4"` (the actual Nova/apps-v4 track) | Yes | Function component (no `forwardRef`), `data-slot` attributes, imports `{ Slot } from "radix-ui"` (the unified package) and `{ cn } from "cn"`, uses `has-[>svg]:`, `aria-invalid:`, `dark:bg-input/30`-style opacity-modified custom-color utilities, and (Card) named container queries (`@container/card-header`, `has-data-[slot=...]:`) | **Yes, genuinely** |

The middle row is a real, previously-unconfirmed fact worth naming
plainly: **this project could switch `components.json`'s `style` to
`"new-york"` today, with zero Tailwind changes, and the real CLI would
serve real, current, different-from-"default" output.** It would not be
byte-identical to Nova/new-york-v4 (older component internals, HSL-era
sizing/shadow choices, no `data-slot` attributes, no `--sidebar-*`/
`--popover` tokens) — a real, different midpoint, not a substitute for
Nova's actual current look.

**The genuinely v4-exclusive syntax, confirmed by directly attempting to
compile it under this project's real, installed Tailwind v3.4.15** (via
its real, unmodified `tailwind.config.js`, no changes): `has-[>svg]:`,
`aria-invalid:`, `has-data-[slot=...]:`, named container queries
(`@container/name`), and opacity-modifier syntax on this project's own
plain-hex custom-color tokens (`dark:bg-input/30`) **all produced zero
generated CSS** — the exact same silent-no-output failure mode this
project's own `mapControls.css`/mob CSS history already documented for
opacity-modifiers against plain-hex tokens, now confirmed to extend to
these newer Tailwind v4 variant syntaxes too. `size-9` (also present in
the new-york-v4 output) DID compile correctly under v3.4.15 — that
specific utility was already backported to Tailwind v3.4. This is real,
first-hand, reproduced evidence — not inferred from a migration guide —
that new-york-v4's real component code cannot be dropped into this
project unmodified today.

**The other real, empirical half of the trial — how invasive would fixing
this actually be**: copying this project's real, completely unmodified
`tailwind.config.js` into an isolated Tailwind v4 CLI install and
compiling a CSS entry point of just:

```css
@import "tailwindcss";
@config "./tailwind.config.js";
```

against this project's real `src/**/*.{ts,tsx}` content glob **succeeded
immediately, with zero errors**, and produced correct output for this
project's own existing custom utilities (`.bg-primary { background-color:
var(--primary); }`, `.font-heading { font-family: var(--font-heading); }`
— identical in shape to what the real, installed Tailwind v3 already
generates). Tailwind v4's own `@config` directive is a real, documented
backward-compatibility bridge specifically for keeping an existing
JS-based config during migration — confirmed working here against this
project's actual file, not merely cited from Tailwind's own upgrade guide.

**Rationale**: This directly answers the feature's own required question
with first-hand evidence rather than secondhand reading: the highest-risk-
sounding part of "migrate to Tailwind v4" (rewriting `tailwind.config.js`
into CSS-native `@theme` syntax) is **not actually required** — the real,
official `@config` bridge lets this project keep its exact current JS
config file, unmodified, while still running on the real Tailwind v4
engine that new-york-v4's actual component code needs.

**Alternatives considered**: Assuming a full CSS-native `@theme` rewrite
would be required (the naive reading of "migrate to v4"). Disproven
directly — `@config` exists precisely to avoid this for cases like this
project's, where the JS config already fully describes the theme via
`var(--token)` indirection and needs no structural change.

## 4. Recommendation — presented to the user for explicit confirmation (FR-010)

Three real options, given the evidence above:

- **Option A — switch `style` to `"new-york"` only, no Tailwind change.**
  Lowest effort, zero version risk, but does not reach Nova/new-york-v4's
  actual current look (older component internals, no `data-slot`, no
  `--sidebar-*`/`--popover` tokens, HSL-era sizing) — a real, different,
  but not "shadcn's own current default" in the fullest sense the spec
  asks for.
- **Option B — perform the Tailwind v3→v4 migration via the `@config`
  bridge** (keep `tailwind.config.js` as-is; swap the CSS entry's three
  `@tailwind` directives for `@import "tailwindcss"; @config
  "./tailwind.config.js";`; swap the PostCSS/Vite plugin package
  `tailwindcss` → `@tailwindcss/vite` or `@tailwindcss/postcss`), THEN set
  `style: "new-york-v4"` and let the real CLI serve genuinely current
  output going forward for this feature's dozen-plus components and every
  future primitive. Empirically confirmed low structural risk for the
  config side (§3); real remaining risk is per-component visual/behavioral
  regression testing across every existing component and panel (the same
  verification work FR-007 already requires regardless of which option is
  chosen) plus first-time exposure to any other real v3/v4 incompatibility
  this trial's 2-component sample didn't surface.
- **Option C — continue hand-porting new-york-v4 output component-by-
  component** (this project's established `029`/`030` pattern), leaving
  `components.json`/Tailwind entirely as they are. Zero infrastructure
  risk, but repeats the exact manual-diff-and-verify burden this feature's
  own request flagged as concerning, at roughly 12+ components instead of
  1-2.

**CONFIRMED (2026-09-08)**: Presented to the user directly, per FR-010 and
the feature's own explicit instruction not to pick silently. **Option B —
migrate to Tailwind v4 via the `@config` bridge — is confirmed.** The rest
of this plan, `data-model.md`, `contracts/`, `quickstart.md`, and
`tasks.md` are written against this decision: `tailwind.config.js` is kept
as a JS file, referenced via `@config` from the new CSS entry point;
`tokens.css`'s three `@tailwind` directives are replaced with `@import
"tailwindcss"; @config "../../tailwind.config.js";`; the PostCSS
`tailwindcss` plugin is replaced with `@tailwindcss/postcss` (or, per
Phase 1's own build-integration research, `@tailwindcss/vite` used
directly in `vite.config.ts`); `components.json`'s `style` becomes
`"new-york-v4"`.

## 5. Real, current font: Geist / Geist Mono — license and hosting confirmed

**Finding**: `apps/v4/lib/font-definitions.ts` (real, current source)
defines Nova's font as:

```js
{
  name: "geist", title: "Geist", type: "sans",
  family: "'Geist Variable', sans-serif",
  registryVariable: "--font-sans",
  provider: "google", import: "Geist",
  dependency: "@fontsource-variable/geist",
  subsets: ["latin"],
}
```

and its mono counterpart:

```js
{
  name: "geist-mono", title: "Geist Mono", type: "mono",
  family: "'Geist Mono Variable', monospace",
  provider: "google", import: "Geist_Mono",
  dependency: "@fontsource-variable/geist-mono",
}
```

Nova's own `fontHeading: "inherit"` (defaults.ts, §1) means **no separate
heading typeface** — Geist serves both body and heading roles, a real,
confirmed departure from this project's current three-role Poppins(body)/
Inter(heading)/Fira Code(mono) split down to a two-role Geist(sans, body +
heading)/Geist Mono(code) split.

**License/hosting, confirmed directly**: Geist is Vercel's own real,
open-source typeface (SIL Open Font License), genuinely served by Google
Fonts (`provider: "google"`) exactly like this project's current Poppins/
Inter, AND independently self-hostable via the real, published
`@fontsource-variable/geist`/`@fontsource-variable/geist-mono` npm
packages (the `fontsource` project bundles real, redistributable font
files under their own original licenses) — not a Vercel-account-gated or
proprietary asset.

**Decision**: Either loading path is real and available; recommend the
self-hosted `@fontsource-variable/*` packages over extending this
project's existing `loadBrandFonts.ts` Google Fonts CDN mechanism (§6) —
a smaller, more self-contained change (one new npm dependency import,
zero runtime `<link>`-injection code) and avoids adding a third real
external network dependency class alongside the two this project already
has confirmed exceptions for (Google Fonts, `extensions.duckdb.org`) — but
this is a small implementation choice, not a decision requiring the same
confirmation gate as §4.

**Alternatives considered**: Assuming "Geist" without checking (the
feature's own explicit instruction to avoid this). The real check also
surfaced that Nova uses NO separate heading font at all — a real, useful
correction to the assumption a heading/body split would simply carry over
with new font names.

## 6. This project's real, current font-loading mechanism

**Finding**: `src/lib/loadBrandFonts.ts` — a dedicated module, NOT a
static `<link>` in `index.html` — builds a single Google Fonts CSS2 URL
for Poppins/Inter/Fira Code (with explicit weight/style ranges) and
injects `preconnect` + `stylesheet` `<link>` elements into `<head>` at
runtime, guarded by an `injected` module-level flag so repeat calls are a
no-op. Ported verbatim from `APP-Project-Scoresheet`'s own
`src/theme/fonts.ts` (Principle VIII). `index.html` itself has no font
`<link>` of its own at all — confirmed by direct read.

**Decision**: The real replacement for this feature imports the two
`@fontsource-variable/geist*` packages directly in a TypeScript entry
point (e.g. `main.tsx`, following Vite's own standard
`import '@fontsource-variable/geist'`-style side-effecting CSS import
convention) instead of `loadBrandFonts.ts`'s runtime `<link>`-injection
approach — self-hosted font files bundled by Vite need no runtime
network request or injection guard at all, so the entire mechanism (the
module, its `injected` flag, the preconnect hints) is retired, not
adapted.

## 7. Two different "chart palette" concepts — explicitly disambiguated

Two unrelated things share the word "palette" in this codebase; conflating
them would either leave a real brand reference untouched or touch
something correctly out of scope:

- **`SankeyPanel.tsx`'s `FALLBACK_TOKEN_VARS`** (`['--primary',
  '--brand-wfrc-secondary-blue', '--brand-wfrc-yellow',
  '--brand-wfrc-gray']`, confirmed by direct grep, line 32) — a real,
  literal list of WFRC-brand-specific custom-property NAMES, read via
  `getComputedStyle(...).getPropertyValue(...)` for Sankey node coloring
  when no explicit `color_scheme` is configured. This is squarely inside
  FR-008's scope (a WFRC-brand reference *by name*, not merely through the
  semantic `--primary` token) and **MUST be updated** — e.g. to a neutral-
  theme-appropriate fallback sequence, not left pointing at
  `--brand-wfrc-*` variables that may no longer carry meaningful distinct
  values once the retheme lands.
- **`RechartsPanel`'s `--chart-1`..`--chart-5`** (`tokens.css`) — a
  categorical data-series palette **already derived from Observable Plot's
  own real default scheme**, not from any WFRC brand token, per a prior,
  separate, explicit user exception recorded in this project's own
  history (`029-shadcn-chart-panel`'s "Recharts version history"/
  `wftdm-design-system` skill's own Brand Identity exception paragraph).
  This is correctly OUT of scope per spec.md's own Assumptions — **do not
  touch it**, and do not assume `FALLBACK_TOKEN_VARS` is "the same thing,
  already handled" just because both involve multi-color fallback
  sequences for chart coloring. They are unrelated: one is a real brand-
  name reference requiring an update; the other is a real, already-non-
  brand palette requiring none.

## 8. Full component/panel dark-mode-fix inventory (FR-007 scope)

Confirmed by direct source read, not assumed — every one of these MUST be
individually re-verified after the retheme, using the SAME verification
technique that originally proved each one (§9), not a screenshot-only
substitute:

| Fix | Where | Original verification technique |
|---|---|---|
| Plotly transparent chart backgrounds | `panels/PlotlyPanel.tsx` (`paper_bgcolor`/`plot_bgcolor` resolved from tokens, not Plotly's opaque-white default) | Direct computed-style/rendered-pixel check |
| Observable Plot tooltip contrast + legend overflow + font-size match | `panels/ObservablePlotPanel.tsx`/`observablePlotEncoding.ts` | Direct computed-style check (`016`-era fix, `c6fffbd`) |
| Sankey node-label legibility | `panels/SankeyPanel.tsx` (`fill="currentColor"` on raw `document.createElementNS` text nodes) | `getComputedStyle()` reading the real resolved `rgb(...)` in both themes |
| Map controls' icon legibility (dark-gray SVG data-URI icons with no dark variant) | `panels/mapControls.css` (`filter: invert(1)` group) | Live visual + the same class of computed-style check |
| Native form-control legibility (`<select>`/`<option>`) | `tokens.css`'s `color-scheme: light`/`dark` declarations | Live visual (OS-rendered native control, no DOM style to assert on directly) |
| Dialog text-color inheritance | `components/ui/dialog.tsx` (`bg-card` paired with an explicit text color, since `DialogPortal` renders into `document.body`, outside `shell.tsx`'s own `text-foreground` wrapper) | `getComputedStyle()` reading a real resolved color, both themes (found via a literal hardcoded-black regression) |

Also real and in scope, found during this research pass (not in the
feature's own named list, but the same class of fix): `tableLogic.ts`'s/
`zonemapColor.ts`'s `cellColor()`/choropleth-fill zero-anchored
`color-mix()` sequential scale (currently anchored on `--brand-wfrc-blue`
directly — §7's sibling finding, FR-008 scope, not FR-007 — a color-source
change, not a dark-mode-behavior fix, so tracked separately).

## 9. Verification method for FR-007 — reuse exactly, don't substitute

**Decision**: Every fix in §8's table gets a real, direct
`getComputedStyle()`-based assertion, following this project's own two
already-established patterns exactly:

- **`tests/unit/tokenContrast.test.ts`** — reads `tokens.css`'s actual
  custom-property values (not a hardcoded copy) and computes real WCAG
  contrast ratios, in both `:root` and `.dark`, for every `-foreground`/
  base pairing plus the `--chart-*` non-text-minimum check. This is a
  **build-time/static** check (parses the real CSS text) — appropriate for
  re-verifying that the NEW token values still clear the same contrast
  minimums the old ones did, but it doesn't touch a live DOM.
- **`tests/integration/graphicWalkerPanel.spec.ts`**'s own theme test —
  the **live-DOM** equivalent: `page.evaluate(() =>
  getComputedStyle(el).color)` against a real rendered element, asserting
  an exact expected `rgb(...)` value in light mode, then flipping
  `document.documentElement.classList.add('dark')` and re-asserting the
  dark-mode `rgb(...)`. This is the pattern each of §8's six fixes needs —
  a real rendered-DOM assertion, in both themes, of the SPECIFIC property
  that fix depends on (Plotly's `paper_bgcolor` config value reaching the
  chart, Sankey's `<text>` `fill` computed value, the dialog's computed
  `color`, etc.) — never a screenshot-only "looks right" check standing in
  for a property that was originally proven via a real assertion.

**Rationale**: A screenshot can look plausible while a specific CSS
custom property silently resolves to the wrong value underneath (this
project's own history already has one example of exactly that risk class
— the Dialog text-inheritance bug was invisible until someone actually
read the computed style). Reusing the exact original proof technique per
fix is the only way to say "still correct," not "still looks fine."

## 10. Phased task structure (given this feature's scale)

**Decision**: Structure `tasks.md` in five phases, mirroring the original
`wftdm-design-system` rollout's own phased discipline (research →
foundation → component-by-component → panel-by-panel → verification),
scaled to this feature's real scope:

1. **Foundation** — the Tailwind version decision (once confirmed, §4),
   new token values (§2) written into `tokens.css`, new font loading (§5/
   §6), `components.json`/`tailwind.config.js` updates, the two new token
   groups (`--popover*`, `--sidebar-*`).
2. **Existing component re-theming** — button, card, chart, dialog,
   dropdown-menu, separator, sidebar, tabs, tooltip — each re-verified
   against the new tokens (FR-005).
3. **New form-input primitives** — Input, Select, Checkbox, Switch,
   RadioGroup, Textarea, Label, plus any the real gap-check adds (FR-003/
   FR-004).
4. **Panel-internal re-theming** — every panel type's own brand-token
   references (Sankey's `FALLBACK_TOKEN_VARS`, `tableLogic.ts`/
   `zonemapColor.ts`'s `--brand-wfrc-blue` anchor) updated per FR-008,
   `--chart-1..5` deliberately left untouched per §7.
5. **Dark-mode regression verification** — the full §8/§9 re-verification
   pass, plus the design-system skill documentation update (FR-009).

**Rationale**: Matches the user's own explicit request or an equivalent
phased structure; keeps the highest-risk, foundation-laying decision (the
Tailwind approach) isolated from and completed before any visual
component work begins, exactly as FR-010 requires.
