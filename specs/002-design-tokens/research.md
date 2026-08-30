# Research: Design Token and Component Foundation

**Feature**: `002-design-tokens` | **Date**: 2026-08-30

---

## 1. Canonical WFRC brand values (fetched, not invented — constitution Principle VIII precedent)

Fetched directly from `https://github.com/WFRCAnalytics/wfrc-brand` (default branch
`main`) on 2026-08-30, via the GitHub API (not approximated from memory). Source
files: `_extensions/wfrc-brand/brand.yml`,
`_extensions/wfrc-brand/assets/theme/_wfrc-colors.scss`.

**Primary brand colors**:

| Token | Hex | brand.yml semantic role |
|---|---|---|
| `wfrc-blue` | `#023c5b` | `color.primary`, light-mode headings |
| `wfrc-secondary-blue` | `#52b6d5` | `color.secondary`, links |
| `wfrc-yellow` | `#f8b93e` | `color.warning` |
| `wfrc-gray` | `#7f7a76` | `color.tertiary`, `color.dark` |
| `white` | `#ffffff` | `color.foreground.dark` / `color.background.light` |
| `black` | `#151515` | `color.foreground.light` |

**Base colors**: light background `white` (`#ffffff`); dark background `#081b26`
(brand.yml's own dedicated dark background — explicitly *not* a mechanical
darkening of `wfrc-blue`); light-mode heading color `wfrc-blue`; dark-mode heading
color `#8fcfe3` (brand.yml's own explicit lightened-`wfrc-secondary-blue` override).

**Typography**: body `Poppins` (300–700, normal+italic), headings `Inter`
(300–700, normal+italic), monospace `Fira Code` (400/500/700). All `source:
google` — no self-hosted font files needed.

**Semantic roles already declared in brand.yml**: `success` → `rtp-green`
(`#789d4b`), `info` → `rtp-blue` (`#3f748e`), `warning` → `wfrc-yellow`
(`#f8b93e`), `danger` → `rtp-red` (`#c23c33`).

**Logo assets** (FR-001 — confirmed present via the GitHub API directory
listing, same fetch as above, not assumed): `_extensions/wfrc-brand/assets/
logo/` contains three size variants, each with a color and a white
(dark-mode) transparent PNG —

| Variant | Light (color) | Dark (white) |
|---|---|---|
| Horizontal (large — app header) | `horizontal/WFRC_logo_horizontal_color_transparent.png` | `horizontal/WFRC_logo_horizontal_white_transparent.png` |
| Stacked (medium — e.g. a future PDF/print cover) | `stacked/WFRC_logo_stacked_color_transparent.png` | `stacked/WFRC_logo_stacked_white_transparent.png` |
| Abbreviated (small — favicon, compact header) | `abbreviated/WFRC_logo_abbreviated_color_transparent.png` | `abbreviated/WFRC_logo_abbreviated_white_transparent.png` |

brand.yml's own size guidance (large/medium/small → horizontal/stacked/
abbreviated) matches this table; light/dark selection follows the same
color/white pairing used for every other dark-mode override in this
research. These six files are copied into `src/assets/logo/` at
implementation time (`tasks.md`) — not referenced cross-repo from
`wfrc-brand` at runtime, same reasoning as every other brand asset in this
feature (a published app can't depend on a separate repo being reachable).
No demo-page component in this feature's chosen set (Button/Card/Tabs/
Tooltip) needs a logo rendered, so this is asset provisioning only, not
wired into a component here — FR-001 requires the assets be reconciled and
present, not that this feature builds a header/logo component yet (that's
the layout feature's job).

## 2. Reconciliation against APP-Project-Scoresheet's `src/theme/tokens.css`

Fetched `https://github.com/WFRCAnalytics/APP-Project-Scoresheet`'s
`src/theme/tokens.css` and `specs/001-consultant-selection-scoring/research.md`
§10 (the "already WCAG 2.1 AA adjusted" reference the spec named) on 2026-08-30.

**Delta 1 — naming convention, not values.** Scoresheet's tokens use a bespoke
`--color-*` naming scheme (`--color-primary`, `--color-danger`,
`--color-wfrc-gray`, `--chart-1`…`--chart-18`, plus a spacing/type-scale/shadow
system) — **not** shadcn's semantic role convention
(`background`/`foreground`/`card`/`primary`/`secondary`/`muted`/`accent`/
`destructive`/`border`/`ring`/`radius`) this feature's spec requires. Scoresheet
has no `card`, `secondary` (in shadcn's neutral-button sense), `muted`, or `ring`
role at all. This feature's token set is therefore a **new derivation**, not a
rename of Scoresheet's file — informed by which raw brand colors Scoresheet found
needed contrast adjustment (and by how much), reused directly where the same
color/role pairing recurs, and independently computed where shadcn's role has no
Scoresheet equivalent.

**Delta 2 — values reused directly (recomputed here, not blindly trusted; see §4)**:
light `primary` = `wfrc-blue` (`#023c5b`), dark `primary` = `wfrc-secondary-blue`
(`#52b6d5`) — Scoresheet's own choice, because raw `wfrc-blue` against their dark
background is only 1.51:1 (unusable), so dark mode's primary accent has to be the
*other* brand blue. `destructive` = `rtp-red` (`#c23c33`) in both modes, matching
brand.yml's own `danger` mapping exactly. Background/foreground pairs match
brand.yml's raw values directly in both tools (no adjustment needed — see §4).

**Delta 3 — accent role, resolved differently than a first guess would suggest.**
Scoresheet's own `--color-accent-background` / `--color-accent-foreground` pair is
literally `wfrc-yellow` / `#151515` in both modes (10.44:1 light, 10.04:1 dark) —
this maps directly onto shadcn's `accent`/`accent-foreground` with zero new
computation needed, and is the choice used here (§4). A tempting alternative —
mapping `accent` to `wfrc-secondary-blue` (the brand's actual "secondary" color) —
was rejected: raw `wfrc-secondary-blue` as a *background fill* is only 2.33:1
against white (fails outright), and in dark mode it would collide with `primary`
(which already claims `wfrc-secondary-blue` there per Delta 2), leaving `accent`
visually indistinguishable from `primary`. `wfrc-secondary-blue` is instead kept as
a raw brand token (`--brand-wfrc-secondary-blue`) for link-style use outside the
shadcn role set, exactly as Scoresheet uses it.

**Delta 4 — `secondary` and `muted` have no WFRC brand equivalent at all.**
Neither brand.yml nor Scoresheet's tokens define a neutral, low-emphasis
UI-surface color — Scoresheet never needed one (no shadcn-style "secondary
button" or "muted card region" concept in a scoring spreadsheet UI). These are
derived from scratch in §4, verified independently, and documented as
non-brand-literal by necessity (the spec's own edge-case guidance: "assign a
sensible, accessible default and document it as not directly sourced from the
brand guide").

## 3. Two-tier token structure (adopted from Scoresheet's own pattern)

Scoresheet's `tokens.css` keeps raw brand hex values in one block
(`--color-wfrc-blue`, etc.) and semantic tokens in a second block that reference
them via `var()`. This feature adopts the same two-tier structure — Tier 1 (raw
brand values, prefixed `--brand-*`) and Tier 2 (shadcn semantic roles, referencing
Tier 1 via `var()` wherever a role maps directly to a brand color, or a literal
derived hex where it doesn't — always with a comment naming which). This is not
new invention; it's reuse of a pattern already proven to keep provenance visible
per-token (constitution Principle VIII spirit — proven patterns over re-deriving).

## 4. WCAG 2.1 AA contrast verification (computed, not inherited blindly)

Every pairing below was computed independently using the WCAG relative-luminance
formula (not eyeballed, not copy-pasted from Scoresheet's comments) — Scoresheet's
own numbers were used as a **cross-check** where the same color pair recurs (all
matched exactly, confirming their methodology rather than replacing it), and
independently computed where this feature's role set has no Scoresheet
equivalent.

| Pairing | Light | Dark | Threshold | Result |
|---|---|---|---|---|
| `foreground` / `background` | 18.26:1 | 17.57:1 | 4.5:1 | PASS both |
| `primary-foreground` / `primary` | 11.67:1 | 7.54:1 | 4.5:1 | PASS both (cross-checked vs. Scoresheet — exact match) |
| `accent-foreground` / `accent` | 10.44:1 | 10.04:1†| 4.5:1 | PASS both (cross-checked vs. Scoresheet — exact match) |
| `destructive-foreground` / `destructive` | 5.27:1 | 5.27:1 | 4.5:1 | PASS both (cross-checked vs. Scoresheet — exact match) |
| `secondary-foreground` / `secondary` | 15.10:1 | 13.50:1 | 4.5:1 | PASS both (newly derived, §5) |
| `muted-foreground` / `muted` | 5.08:1 | 5.12:1 | 4.5:1 | PASS both — **only after adjustment, see finding below** |
| `card-foreground` / `card` | = foreground/background (card reuses background, §5) | | 4.5:1 | PASS both |

† `accent`'s hex is identical in both modes (`#f8b93e`/`#151515`); the two ratios
differ only because Scoresheet computed dark mode's version against their dark
*background* for a different check (accent as an unmodified brand color against
the page) — as an isolated foreground/background pair (which is what matters for
text-on-accent-fill), it's 10.44:1 in both modes.

**Real finding — this app's `muted` role genuinely differs from Scoresheet's
numbers, confirming the spec's instinct not to inherit blindly.** Scoresheet's
`wfrc-gray`-derived text color (`#76716e` light / `#85817d` dark) sits right at
the edge of AA against a *plain* background (4.82:1 / 4.55:1) — because
Scoresheet never pairs it with a distinctly-tinted surface, only the page
background itself. This feature's `muted` role needs an actual tinted surface
(shadcn's `muted` is a subtle-fill role, not "same as background"), and pairing
Scoresheet's exact gray against *any* tinted muted surface pulls the ratio below
4.5:1 (tested down to 4.20–4.46:1 across several subtle-tint candidates — see
`tasks.md`/implementation for the exact rejected values). Resolution: a
dedicated, slightly darker/lighter `muted-foreground` (`#6c6764` light,
`#94908c` dark — both still clearly in the `wfrc-gray` hue family, just shifted
enough to clear 4.5:1 against the chosen `muted` fill with headroom, not sitting
exactly on the threshold). Scoresheet's original grays remain correct and
unchanged for their own use case (plain-background secondary text); this is a
new, `muted`-specific value, not a "fix" to Scoresheet's tokens.

**Non-finding, documented rather than silently skipped**: `border` (`#d8d5d2`
light / `#23394a` dark, reused directly from Scoresheet) sits well under the 3:1
WCAG 1.4.11 non-text-contrast threshold against its background (1.46:1 /
1.47:1). This is **not treated as a failure** — WCAG 1.4.11 applies to graphical
objects required to identify a UI component's boundary or state; a subtle
low-emphasis divider/card border that isn't the *sole* means of identifying a
component (padding, spacing, and the separate high-contrast `ring` token carry
that job for focus/active states) is conventionally exempt, and this matches
Scoresheet's own unflagged precedent. Called out explicitly here rather than
left unmentioned, per the spec's edge-case requirement that gaps be documented,
not silently absent.

## 5. Final token decisions

See `data-model.md` for the complete token table with every value, and
`contracts/token-contract.md` for the full rationale/verification write-up per
token. Headline decisions not already covered above:

- **`card`/`card-foreground` = `background`/`foreground`** (same value, both
  modes) — adopted from Scoresheet's own precedent: they have no distinct card
  fill at all, relying on border + shadow/ring for elevation. Their research.md
  doesn't say this was deliberate, but their `tokens.css`'s elevation section
  (extensive `--shadow-ring` / `--shadow-ring-hover` machinery, explicitly
  built to fix a bug where a *tinted* dark "shadow" collided with a *tinted*
  dark card surface) is strong evidence a distinct card fill causes real
  problems in dark mode specifically. Reusing their solved approach rather than
  reintroducing the problem they already fixed.
- **`ring` = `primary`** (`#023c5b` light / `#52b6d5` dark) — shadcn's own
  default convention (focus ring matches the primary action color); matches
  Scoresheet's own focus-ring choice (`color-mix` of their `--color-primary`).
- **`input` = `border`** — shadcn's own default convention (no separate value
  needed).
- **`radius` = `0.5rem`** (8px) — matches Scoresheet's own `--radius-md` (cards/
  buttons), the shadcn-recommended single-base-token convention (`sm`/`lg`
  derived via `calc()` in Tailwind config rather than separate custom
  properties).

## 6. Tailwind version: v3 (`tailwind.config.js`), not v4

The spec explicitly names `tailwind.config.js` referencing CSS variables — the
Tailwind v3 + shadcn "CSS variables" convention (`hsl(var(--primary))` referenced
from `theme.extend.colors` in a JS config file). Tailwind v4's CSS-first
`@theme` config is newer and would still work with shadcn, but would mean no
`tailwind.config.js` at all, diverging from what the spec asked for. Decision:
Tailwind v3, matching the spec's explicit file name and keeping the mapping
step (brand token → CSS variable → Tailwind color name) maximally explicit for
this first pass, per the spec's own "document this mapping explicitly, not an
implicit choice buried in config" instruction.

## 7. React is adopted by this feature, not deferred to "the layout/panel layer"

**Finding, not a policy change**: constitution Principle I (v2.0.0)'s rationale
said React "arrives with the layout/panel layer, since nothing before that
renders anything." shadcn/ui's CLI generates **React** component source (built
on Radix UI's React primitives) — there is no non-React shadcn. This feature's
own FR-006/FR-007 (generate 3–4 working components, render them on a demo page)
is only satisfiable by adopting React *now*, one feature earlier than Principle
I's rationale text anticipated. The actual policy (Principle VI, amended: React
IS one of the fixed choices; Principle I: React "MAY be introduced when a UI
feature genuinely needs it") already supported this — a design-token
*component* foundation is exactly that kind of UI feature. Only the rationale
sentence's specific timing claim was imprecise, not the principle itself.

**Resolved**: flagged to the user rather than silently amended mid-plan;
adopted as constitution **v2.1.1** (PATCH — wording fix, not a redefinition):
Principle I's body no longer names a specific feature ("the layout/panel
layer"), instead saying React arrives with "whichever feature that turns out
to be." Both the Constitution Check in `plan.md` and this note were updated
to reflect the fix rather than describe it as still-open.

## 8. Typography tokens and font loading — gap found and closed

**Gap**: §1 documented the three brand typefaces (Poppins/Inter/Fira Code),
but nothing in the original Phase 1 pass turned that into an actual token,
CSS, or Tailwind config — Story 1's Acceptance Scenario #1 requires "color,
typography" both, and only color was implemented. Closed as follows.

**Font family tokens** — reused verbatim from Scoresheet's `tokens.css`
(exact fallback chains, not re-derived):

```css
--font-body:
  "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial,
  sans-serif;
--font-heading: "Inter", var(--font-body);
--font-mono:
  "Fira Code", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
  monospace;
```

**Self-hosting confirmed unnecessary** — brand.yml declares `source: google`
for all three families; Scoresheet's own implementation (`src/theme/
fonts.ts`) loads them from the Google Fonts CDN at runtime via an injected
`<link>` (with `preconnect` hints for `fonts.googleapis.com` and
`fonts.gstatic.com`), not self-hosted files. This feature reuses that exact
mechanism (Principle VIII) — same weight/style ranges (Poppins & Inter:
300–700, normal+italic; Fira Code: 400/500/700), same idempotent
inject-once function, ported to `src/lib/loadBrandFonts.ts` and called once
from the demo page (not from `main.ts` — this feature doesn't touch the
`001-data-state-layer` boot sequence at all, per the spec's own scope
boundary).

**Per-component family assignment** — brand.yml/Scoresheet's research.md §10
groups roles as "Body → Poppins" and "Headings / navigation / labels →
Inter" (not just headings). Applied to this feature's four components:

| Component | Element | Family | Why |
|---|---|---|---|
| Button | button label | `font-heading` (Inter) | a button label is a UI "label" per the brand's own grouping, not body prose |
| Card | `CardTitle` | `font-heading` (Inter) | heading |
| Card | `CardDescription`/body content | `font-body` (Poppins) | prose |
| Tabs | `TabsTrigger` | `font-heading` (Inter) | navigation |
| Tabs | tab panel content | `font-body` (Poppins) | prose |
| Tooltip | label text | `font-body` (Poppins) | a brief contextual annotation reads closer to "content" than "navigation/heading" — the one genuinely ambiguous call in this table, flagged rather than silently picked |

A global base style (`body { font-family: var(--font-body) }` in
`tokens.css`) covers anything not explicitly overridden, so `font-body` is
the default and only `font-heading` needs an explicit class per the table
above.

## 9. Elevation/shadow tokens — gap found and closed, reusing Scoresheet's exact mechanism

**Gap**: `research.md` §5 justified `card = background` (no distinct card
fill) by citing Scoresheet's shadow-ring system as proof a distinct dark-mode
card fill causes real bugs — but never actually ported that system, leaving
resting-state cards with **no visual separation from the page background at
all** (border alone, in both modes) — an unstated side effect of reusing
Scoresheet's conclusion without its mechanism, exactly the risk flagged for
follow-up.

**Resolution: port it (option a), not just document a border-only
non-goal** — Scoresheet's elevation system is a real, working, well-tested
fix for exactly this problem (their own comments document a prior bug: a
navy-tinted shadow was bit-identical to their dark background, silently
invisible, caught in manual testing). Re-deriving that from scratch risks
reintroducing the same bug (constitution Principle VIII's own rationale).
Ported with one substitution — our dark background hex is the *same* value
Scoresheet's light-mode shadow tint already used (`#081b26` = RGB `8 27 38`,
their exact `--shadow-color` light-mode value), so no new color computation
was needed, only the light/dark shadow-color swap they already solved:

```css
:root {
  --shadow-color: 8 27 38; /* = --brand-background-dark's RGB triplet */
  --shadow-ring: 0 0 0 0 transparent; /* no-op in light mode */
  --shadow-sm: var(--shadow-ring), 0 1px 3px rgb(var(--shadow-color) / 0.12);
  --shadow-md: var(--shadow-ring), 0 4px 12px rgb(var(--shadow-color) / 0.14);
  --shadow-lg: var(--shadow-ring), 0 12px 32px rgb(var(--shadow-color) / 0.22);
}
.dark {
  --shadow-color: 0 0 0; /* pure black — genuinely darker than the dark
    surface, unlike the light-mode navy which is bit-identical to it */
  --shadow-ring: 0 0 0 1px color-mix(in srgb, var(--foreground) 12%, transparent);
  --shadow-sm: var(--shadow-ring), 0 1px 3px rgb(var(--shadow-color) / 0.12);
  --shadow-md: var(--shadow-ring), 0 4px 12px rgb(var(--shadow-color) / 0.14);
  --shadow-lg: var(--shadow-ring), 0 12px 32px rgb(var(--shadow-color) / 0.22);
}
```

**Deliberately not ported**: `--shadow-ring-hover` and `--overlay-backdrop`.
Scoresheet needs the former for an interactive-card hover state and the
latter for a modal backdrop — this feature's four components (Button, Card,
Tabs, Tooltip) include no modal/dialog and no hover-elevated interactive
card, so both would be dead tokens with nothing to verify them against.
Documented here as a scope boundary, not silently dropped — add them when a
future feature (e.g. a Dialog component, or interactive dashboard cards)
actually needs them, reusing this same pattern rather than re-deriving it
again.

## Summary of resolved unknowns

| Technical Context field | Resolution |
|---|---|
| Language/Version | TypeScript (ES2022 target) — unchanged from 001; React adopted starting this feature (§7) |
| Primary Dependencies | `tailwindcss` (v3), `class-variance-authority`, `clsx`, `tailwind-merge` (shadcn's own utility deps), `@radix-ui/*` primitives (per component generated), `lucide-react`, `react`, `react-dom` |
| Component source | shadcn CLI-generated `.tsx` under `src/components/ui/` — copied source, not an installed package (per spec) |
| Storage | N/A — no data layer involvement; this feature never touches `services/`/`state/` |
| Testing | Vitest + a small contrast-ratio unit test (pure function, same WCAG formula used in this research) verifying every documented pairing programmatically, not just at research time |
| Target Platform | Browser — same as 001; demo page only, no scenario data |
| Project Type | Single-project web frontend, additive to 001's scaffold |
| Scale/Scope | 11 shadcn semantic roles × 2 modes + ~7 raw brand tokens + 3 font-family tokens + 4 elevation tokens; 3–4 components; one demo page; 6 logo assets copied |
| Typography | 3 font-family CSS custom properties (§8), loaded via a ported Google Fonts CDN injector (`src/lib/loadBrandFonts.ts`), not self-hosted |
| Elevation | 4 shadow tokens ported from Scoresheet's exact mechanism (§9) — `--shadow-ring-hover`/`--overlay-backdrop` deliberately deferred, no consuming component in this feature |
| Logo assets | 6 PNG files (3 sizes × color/white) copied from `wfrc-brand` into `src/assets/logo/` (§1) — provisioned, not consumed by any component in this feature |
