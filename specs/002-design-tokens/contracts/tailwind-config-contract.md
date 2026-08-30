# Contract: `tailwind.config.js`

Satisfies: FR-004. Depends on `token-contract.md`'s CSS custom properties
already existing at runtime (Tailwind config references them by name; it does
not define values itself).

## Structure

Tailwind v3 (`research.md` §6), the standard shadcn "CSS variables" pattern —
every semantic role name maps to `hsl(var(--role))`, **not** a literal hex
value:

```js
// tailwind.config.js
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        body: ['var(--font-body)'],
        heading: ['var(--font-heading)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
}
```

`fontFamily` entries reference `token-contract.md`'s Tier 3 custom
properties directly (each already a full fallback chain, so
`font-family: var(--font-body)` is valid CSS on its own — no array of
literal names needed). `boxShadow` entries reference Tier 4 the same way;
overriding Tailwind's `DEFAULT`/`md` shadow with our own `--shadow-md`
means a bare `shadow` class (not just `shadow-md`) also picks up the
brand-tinted, theme-aware version instead of Tailwind's generic gray
default.

Note: token values in `token-contract.md` are plain hex (`#023c5b`), not HSL
triples — the `hsl(var(--x))` wrapping shown in most shadcn boilerplate
assumes HSL-component custom properties (`222 47% 11%`). Since this feature's
tokens are hex (simpler, matches `wfrc-brand`'s own format exactly, no
hex↔HSL translation step to get wrong), the Tailwind mapping references the
custom properties directly (`var(--primary)`), not through an `hsl()`
wrapper. This is a deliberate deviation from the most common shadcn
boilerplate, not an oversight — documented here so a future contributor
copying a shadcn example verbatim doesn't "fix" it back to HSL and break the
direct hex values.

## Given/When/Then

- **Given** `tailwind.config.js`, **when** its `theme.extend.colors` block is
  inspected, **then** every color value is a `var(--...)` reference — zero
  literal hex/rgb/hsl values appear (FR-004).
- **Given** a component uses `bg-primary`, **when** Tailwind generates CSS,
  **then** the output references `var(--primary)`, so changing
  `--primary`'s value in `token-contract.md`'s CSS restyles the component
  with no Tailwind config or component change (FR-008).
- **Given** a component uses `font-heading` or `font-body`, **when**
  Tailwind generates CSS, **then** the output references
  `var(--font-heading)`/`var(--font-body)`, resolving to Inter/Poppins once
  `loadBrandFonts()` has run (Story 1 Acceptance Scenario #1).
- **Given** a component uses `shadow` or `shadow-lg`, **when** Tailwind
  generates CSS, **then** the output references `var(--shadow-md)`/
  `var(--shadow-lg)`, not Tailwind's generic default shadow.

## Non-goals for this feature

- No Tailwind v4 CSS-first `@theme` migration (`research.md` §6) — v3 chosen
  explicitly; a future feature may revisit this once shadcn's v4 tooling is
  more settled.
