# Contract: Design tokens (`src/styles/tokens.css`)

Satisfies: FR-001, FR-002, FR-003, FR-005. Constitution Principle VI (amended
2.1.0 — Tailwind CSS, shadcn/ui, Radix, `lucide-react` fixed for the UI layer).

## Structure

Four tiers, in one file, `:root` for light values, `.dark` (class-based,
matching shadcn's own convention) for dark overrides. Tier 3 (typography) is
not theme-dependent — declared once in `:root`, never redeclared in `.dark`.

```css
:root {
  /* Tier 1 — raw brand tokens, from wfrc-brand, unmodified */
  --brand-wfrc-blue: #023c5b;
  --brand-wfrc-secondary-blue: #52b6d5;
  --brand-wfrc-yellow: #f8b93e;
  --brand-wfrc-gray: #7f7a76;
  --brand-white: #ffffff;
  --brand-black: #151515;
  --brand-background-dark: #081b26;

  /* Tier 2 — shadcn semantic roles (light values) */
  --background: var(--brand-white);
  --foreground: var(--brand-black);
  --card: var(--background);
  --card-foreground: var(--foreground);
  --primary: var(--brand-wfrc-blue);
  --primary-foreground: #ffffff;
  --secondary: #ece9e6;
  --secondary-foreground: var(--foreground);
  --muted: #f5f4f2;
  --muted-foreground: #6c6764;
  --accent: var(--brand-wfrc-yellow);
  --accent-foreground: var(--brand-black);
  --destructive: #c23c33;
  --destructive-foreground: #ffffff;
  --border: #d8d5d2;
  --input: var(--border);
  --ring: var(--primary);
  --radius: 0.5rem;

  /* Tier 3 — typography (research.md §8) — not theme-dependent, declared
     once, reused verbatim from Scoresheet's tokens.css */
  --font-body:
    "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial,
    sans-serif;
  --font-heading: "Inter", var(--font-body);
  --font-mono:
    "Fira Code", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;

  /* Tier 4 — elevation (research.md §9) — reused mechanism from
     Scoresheet's tokens.css; --shadow-color's light-mode value is our
     --brand-background-dark's own RGB triplet (8 27 38), not a new
     computation */
  --shadow-color: 8 27 38;
  --shadow-ring: 0 0 0 0 transparent; /* no-op in light mode */
  --shadow-sm: var(--shadow-ring), 0 1px 3px rgb(var(--shadow-color) / 0.12);
  --shadow-md: var(--shadow-ring), 0 4px 12px rgb(var(--shadow-color) / 0.14);
  --shadow-lg: var(--shadow-ring), 0 12px 32px rgb(var(--shadow-color) / 0.22);
}

body {
  font-family: var(--font-body);
}

.dark {
  --background: var(--brand-background-dark);
  --foreground: var(--brand-white);
  --card: var(--background);
  --card-foreground: var(--foreground);
  --primary: var(--brand-wfrc-secondary-blue);
  --primary-foreground: var(--brand-background-dark);
  --secondary: #123240;
  --secondary-foreground: var(--foreground);
  --muted: #0c232d;
  --muted-foreground: #94908c;
  --accent: var(--brand-wfrc-yellow);
  --accent-foreground: var(--brand-black);
  --destructive: #c23c33;
  --destructive-foreground: #ffffff;
  --border: #23394a;
  --input: var(--border);
  --ring: var(--primary);
  /* --radius, --font-* not redeclared — not theme-dependent */

  /* Elevation: dark mode — different mechanism, not just different colors
     (edge-highlight ring, since a drop shadow alone reads too weakly
     against an already-dark page — research.md §9) */
  --shadow-color: 0 0 0;
  --shadow-ring: 0 0 0 1px color-mix(in srgb, var(--foreground) 12%, transparent);
  --shadow-sm: var(--shadow-ring), 0 1px 3px rgb(var(--shadow-color) / 0.12);
  --shadow-md: var(--shadow-ring), 0 4px 12px rgb(var(--shadow-color) / 0.14);
  --shadow-lg: var(--shadow-ring), 0 12px 32px rgb(var(--shadow-color) / 0.22);
}
```

**Deliberately excluded** (research.md §9): `--shadow-ring-hover`,
`--overlay-backdrop` — no component in this feature needs a hover-elevated
card or a modal backdrop. Not a silent omission; add them (reusing this same
mechanism) when a feature that needs them arrives.

**Font loading**: `--font-body`/`--font-heading`/`--font-mono` name font
families but load nothing themselves — `src/lib/loadBrandFonts.ts` (ported
from Scoresheet's `theme/fonts.ts`) injects the Google Fonts `<link>` tags
once, called from the demo page. See `component-contract.md` for where it's
invoked and `research.md` §8 for why self-hosting isn't needed.

Exact values, and the reasoning/verification behind each, are in
`data-model.md`'s Design Token table and `research.md` §4–5 — this file is the
literal CSS contract `tailwind.config.js` and every component consume, not a
second copy of the rationale.

## Given/When/Then

- **Given** the `.dark` class is absent from `<html>`, **when** any component
  reads a semantic role, **then** it resolves to the light value defined in
  `:root`.
- **Given** the `.dark` class is present on `<html>`, **when** any component
  reads a semantic role, **then** it resolves to the `.dark` override, with no
  component code change required (FR-008).
- **Given** any `-foreground`/base semantic pairing (excluding
  `border`/`input`/`ring`/`radius`), **when** its contrast ratio is computed
  via the WCAG relative-luminance formula, **then** it is ≥4.5:1 in both
  `:root` and `.dark` (FR-005, SC-001) — enforced by a Vitest unit test
  (`tests/unit/tokenContrast.test.ts`) that reads this file's actual values,
  not a hardcoded copy of them, so the test fails if this file's values drift
  without the test being updated.
- **Given** a root-level token value changes, **when** the demo page reloads,
  **then** every component consuming that token's role reflects the change
  with zero component-file edits (FR-008, SC-004).
- **Given** `loadBrandFonts()` has run, **when** any element uses
  `font-body`/`font-heading`/`font-mono`, **then** it renders in
  Poppins/Inter/Fira Code respectively, not a fallback system font (Story 1
  Acceptance Scenario #1's "typography" half, previously unimplemented).
- **Given** a Card renders in either mode, **when** compared against the
  page background, **then** it is visually distinguishable via `--shadow-md`
  (plus `border`), not border-alone — the gap `research.md` §9 found and
  closed.

## Non-goals for this feature

- No automated CI gate re-running the contrast check against a live browser
  render (axe-core, etc.) — the unit test checks the token *values*
  arithmetically. A future feature may add real rendered-DOM accessibility
  testing once there's a real dashboard to test.
- No chart-color palette wiring (the RTP/Wasatch Choice categorical set) —
  out of scope per the spec; `--brand-*` tokens are limited to what the
  shadcn role set in FR-002 actually needs.
- No `--shadow-ring-hover` or `--overlay-backdrop` — no consuming component
  in this feature's set (research.md §9). Explicit exclusion, not an
  unstated side effect.
- No logo component/header — the six logo assets (`data-model.md`'s Logo
  Asset entity) are copied and provisioned, satisfying FR-001, but not
  rendered by any component or the demo page in this feature.
