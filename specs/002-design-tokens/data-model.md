# Data Model: Design Token and Component Foundation

**Feature**: `002-design-tokens` | **Date**: 2026-08-30

No application data layer — "entities" here are the CSS custom properties and
component source files this feature defines, per the spec's Key Entities
section. Values below are final decisions from `research.md`; this file is the
authoritative table `tasks.md` implements against.

---

## Design Token

Tier 1 (raw brand values) and Tier 2 (shadcn semantic roles) — see
`research.md` §3.

### Tier 1 — raw brand tokens (from `wfrc-brand`, unmodified)

| Custom property | Value | Source |
|---|---|---|
| `--brand-wfrc-blue` | `#023c5b` | brand.yml `color.palette.wfrc-blue` |
| `--brand-wfrc-secondary-blue` | `#52b6d5` | brand.yml `color.palette.wfrc-secondary-blue` |
| `--brand-wfrc-yellow` | `#f8b93e` | brand.yml `color.palette.wfrc-yellow` |
| `--brand-wfrc-gray` | `#7f7a76` | brand.yml `color.palette.wfrc-gray` |
| `--brand-white` | `#ffffff` | brand.yml `color.palette.white` |
| `--brand-black` | `#151515` | brand.yml `color.palette.black` |
| `--brand-background-dark` | `#081b26` | brand.yml `color.background.dark` |

### Tier 2 — shadcn semantic roles

Every row: light value, dark value, whether it's a direct `var()` reference to
Tier 1 or a newly-derived literal, and the verified contrast ratio for the
`-foreground`/base pairing (from `research.md` §4). `card`/`card-foreground`,
`input`, and `ring` reuse other rows' values exactly (noted, not re-verified —
same pairing).

| Role | Light | Dark | Derivation | Contrast |
|---|---|---|---|---|
| `background` | `#ffffff` (`var(--brand-white)`) | `#081b26` (`var(--brand-background-dark)`) | direct | — (base color, not a pairing) |
| `foreground` | `#151515` (`var(--brand-black)`) | `#ffffff` (`var(--brand-white)`) | direct | 18.26:1 / 17.57:1 vs. background |
| `card` | `#ffffff` (= `background`) | `#081b26` (= `background`) | reuse — Scoresheet precedent, `research.md` §5 | = foreground/background |
| `card-foreground` | `#151515` (= `foreground`) | `#ffffff` (= `foreground`) | reuse | = foreground/background |
| `primary` | `#023c5b` (`var(--brand-wfrc-blue)`) | `#52b6d5` (`var(--brand-wfrc-secondary-blue)`) | direct (dark mode uses the other brand blue — raw `wfrc-blue` is 1.51:1 vs. dark bg, unusable) | 11.67:1 / 7.54:1 |
| `primary-foreground` | `#ffffff` | `#081b26` (`var(--brand-background-dark)`) | derived (dark bg reused as text) | — |
| `secondary` | `#ece9e6` | `#123240` | derived — no WFRC brand equivalent (`research.md` §2 Delta 4) | 15.10:1 / 13.50:1 |
| `secondary-foreground` | `#151515` | `#ffffff` | reuse of `foreground` values | — |
| `muted` | `#f5f4f2` | `#0c232d` | derived — no WFRC brand equivalent | 5.08:1 / 5.12:1 |
| `muted-foreground` | `#6c6764` | `#94908c` | derived from `wfrc-gray` family, shifted for `muted`-specific contrast (`research.md` §4 finding — **not** Scoresheet's `#76716e`/`#85817d`, which don't clear AA against a tinted `muted` fill) | 5.08:1 / 5.12:1 |
| `accent` | `#f8b93e` (`var(--brand-wfrc-yellow)`) | `#f8b93e` (`var(--brand-wfrc-yellow)`) | direct, same both modes | 10.44:1 / 10.44:1 |
| `accent-foreground` | `#151515` | `#151515` | direct, same both modes | — |
| `destructive` | `#c23c33` | `#c23c33` | derived from RTP `rtp-red` (matches brand.yml's `color.danger`), same both modes | 5.27:1 / 5.27:1 |
| `destructive-foreground` | `#ffffff` | `#ffffff` | direct, same both modes | — |
| `border` | `#d8d5d2` | `#23394a` | reused from Scoresheet's derived neutral border (not WCAG-text-checked — see `research.md` §4 non-finding) | n/a (non-text) |
| `input` | `#d8d5d2` (= `border`) | `#23394a` (= `border`) | reuse — shadcn default convention | = `border` |
| `ring` | `#023c5b` (= `primary`) | `#52b6d5` (= `primary`) | reuse — shadcn default convention | = `primary` |
| `radius` | `0.5rem` | `0.5rem` | matches Scoresheet's `--radius-md`; not theme-dependent | n/a |

**Invariant**: every `-foreground`/base pairing in this table (excluding
`border`/`input`/`ring`/`radius`, which aren't text-contrast pairs) MUST be
≥4.5:1 in both light and dark mode — enforced by a unit test (`contracts/
token-contract.md`), not just this document.

### Tier 3 — typography tokens (`research.md` §8)

Not theme-dependent (same value in `:root` and `.dark`) — typography doesn't
change between light/dark mode, only color does.

| Custom property | Value | Source |
|---|---|---|
| `--font-body` | `"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif` | brand.yml `typography.base`, reused verbatim from Scoresheet's `tokens.css` |
| `--font-heading` | `"Inter", var(--font-body)` | brand.yml `typography.headings`, reused verbatim |
| `--font-mono` | `"Fira Code", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` | brand.yml `typography.monospace`, reused verbatim |

Loaded at runtime from the Google Fonts CDN via `src/lib/loadBrandFonts.ts`
(ported from Scoresheet's `theme/fonts.ts` — same weight/style ranges, same
idempotent inject-once function, same `preconnect` hints) — not self-hosted
font files.

### Tier 4 — elevation tokens (`research.md` §9)

Theme-dependent (redeclared in `.dark`, unlike typography) — the whole point
is a different mechanism per mode (drop shadow in light, edge-highlight ring
in dark).

| Custom property | Light | Dark | Source |
|---|---|---|---|
| `--shadow-color` | `8 27 38` (RGB triplet, = `--brand-background-dark`) | `0 0 0` | reused from Scoresheet, exact values — our light-mode brand dark background is bit-identical to their light-mode shadow tint, so no new computation |
| `--shadow-ring` | `0 0 0 0 transparent` (no-op) | `0 0 0 1px color-mix(in srgb, var(--foreground) 12%, transparent)` | reused mechanism |
| `--shadow-sm` | `var(--shadow-ring), 0 1px 3px rgb(var(--shadow-color) / 0.12)` | same formula, dark `--shadow-color`/`--shadow-ring` | reused |
| `--shadow-md` | `var(--shadow-ring), 0 4px 12px rgb(var(--shadow-color) / 0.14)` | same formula | reused |
| `--shadow-lg` | `var(--shadow-ring), 0 12px 32px rgb(var(--shadow-color) / 0.22)` | same formula | reused |

**Not ported** (`research.md` §9): `--shadow-ring-hover`, `--overlay-backdrop`
— no component in this feature's set needs a hover-elevated card or a modal
backdrop. Add them, reusing this same mechanism, when a feature that does
need them arrives.

---

## Logo Asset

Six PNG files (`research.md` §1) copied from `wfrc-brand`'s
`_extensions/wfrc-brand/assets/logo/` into `src/assets/logo/` — provisioned
by this feature (satisfies FR-001's "logo assets" clause) but not consumed
by any of the four chosen components or the demo page; a future
layout/header feature is the actual consumer.

| Variant | Light (color) file | Dark (white) file |
|---|---|---|
| Horizontal | `horizontal/WFRC_logo_horizontal_color_transparent.png` | `horizontal/WFRC_logo_horizontal_white_transparent.png` |
| Stacked | `stacked/WFRC_logo_stacked_color_transparent.png` | `stacked/WFRC_logo_stacked_white_transparent.png` |
| Abbreviated | `abbreviated/WFRC_logo_abbreviated_color_transparent.png` | `abbreviated/WFRC_logo_abbreviated_white_transparent.png` |

---

## Brand Source Value

The pre-reconciliation form each Design Token traces back to — see
`research.md` §1–2 for the full fetch record and every delta found against
`APP-Project-Scoresheet`'s existing tokens. Not a runtime entity; a
documentation/provenance concept realized entirely in `research.md` and the
Tier 1 table above (every Tier 2 row states its derivation).

---

## Component

A shadcn-generated `.tsx` file under `src/components/ui/`, styled exclusively
through Tailwind utility classes that resolve to the semantic roles above
(e.g. `bg-primary text-primary-foreground`), never a literal hex value.

| Component | Radix primitive(s) | Demonstrates | Typography (`research.md` §8) |
|---|---|---|---|
| Button | none (native `<button>`, CVA variants) | `primary`/`secondary`/`destructive` roles, `ring` (focus) | label → `font-heading` |
| Card | none (plain div structure) | `card`/`card-foreground`, `border`, `radius`, `--shadow-md` (resting elevation) | `CardTitle` → `font-heading`; body/`CardDescription` → `font-body` |
| Tabs | `@radix-ui/react-tabs` | `muted`/`muted-foreground` (inactive tab), `accent` (active indicator) | `TabsTrigger` → `font-heading`; panel content → `font-body` |
| Tooltip | `@radix-ui/react-tooltip` | `popover`-style surface (extends `card`), `border`, `--shadow-lg` | label → `font-body` (the one ambiguous call in this table — flagged in `research.md` §8, not silently picked) |

Exact 3–4 chosen at implementation time within the spec's stated range; this
table names the first candidates and what each is chosen to prove, not a
locked-in final list.

## Relationships

```
Brand Source Value (wfrc-brand) --reconciled against--> APP-Project-Scoresheet's tokens.css
                                          |
                                          v
                    Tier 1 raw brand tokens (--brand-*), Logo Assets (copied to src/assets/logo/)
                                          |
                                          v (var() reference or documented derivation)
        Tier 2 shadcn semantic roles + Tier 3 typography tokens + Tier 4 elevation tokens
                                          |
                                          v (Tailwind config maps role/token name -> CSS var)
                                    tailwind.config.js
                                          |
                          v (Tailwind utility classes)          v (runtime <link> injection)
                                Component (.tsx)  <----  loadBrandFonts.ts (Google Fonts CDN)
                                          |
                                          v
                                    Demo page (renders all Components)
```
