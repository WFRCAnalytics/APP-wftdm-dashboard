# Quickstart: Validating the Design Token and Component Foundation

**Feature**: `002-design-tokens`

This feature's only user-facing surface is a throwaway demo page — validation
means running the contrast unit test and visually inspecting that page in both
light and dark mode. See `contracts/` for the exact contracts being validated
and `data-model.md` for the token table referenced below.

## Prerequisites

- `001-data-state-layer`'s scaffold already in place (`package.json`,
  `vite.config.ts`, `tsconfig.json` exist).
- `npm install` run after this feature adds `tailwindcss`, `react`,
  `react-dom`, `@radix-ui/*` (per component), `lucide-react`,
  `class-variance-authority`, `clsx`, `tailwind-merge` to `package.json`.
- shadcn CLI available via `npx shadcn@latest` (no separate install needed).

## Run the contrast unit test

```bash
npm run test:unit -- tokenContrast
```

Reads `src/styles/tokens.css`'s actual custom property values (not a
hardcoded copy) and asserts every `-foreground`/base semantic pairing in
`data-model.md`'s table is ≥4.5:1 in both `:root` and `.dark` — satisfies
SC-001. A token value changed without updating this test's expectations
fails loudly, not silently.

## Visually verify the demo page

```bash
npm run dev
# open the demo route in a browser
```

1. **Light mode (default)** — confirm Button (`primary`/`secondary`/
   `destructive` variants), Card, Tabs, and Tooltip all render in WFRC's
   brand colors and typography, not framework defaults (SC-003).
2. **Typography check** — open browser devtools' computed-style panel on a
   heading (`CardTitle`/`TabsTrigger`) and confirm the resolved font is
   Inter, not a fallback; confirm body/prose text resolves to Poppins.
   Confirms `loadBrandFonts()` actually ran and the CDN stylesheet loaded
   (Story 1 Acceptance Scenario #1's previously-unverified typography half).
3. **Elevation check** — confirm Card and Tooltip have visible separation
   from the page background at rest (shadow in light mode, a light edge rim
   in dark mode) — not border-alone (`research.md` §9's gap, closed).
4. **Toggle dark mode** — confirm every component re-renders using the
   `.dark` token overrides, with no separate dark-specific component code
   (FR-008), and that the elevation mechanism switches from drop-shadow to
   edge-highlight-ring as designed.
5. **Token-swap check (SC-004)** — temporarily change a value in
   `src/styles/tokens.css` (e.g. `--primary`), reload, confirm every
   consuming component reflects the change, then revert. Zero component
   files should need touching for this to work.
6. **Zero-dependency check (SC-005)** — confirm the demo page loads with no
   scenario data, no `public/scenarios`/`public/observed` involvement, and no
   panel-registry code path exercised (it's a standalone route, unrelated to
   `001-data-state-layer`'s boot sequence).
7. **Logo asset check (FR-001)** — confirm all six PNGs exist under
   `src/assets/logo/` with the expected filenames (`data-model.md`'s Logo
   Asset table). Not rendered anywhere in this feature — a file-presence
   check, not a visual one.

## Expected outcome

SC-001 through SC-005 all hold: 100% of semantic pairings pass WCAG 2.1 AA in
both modes (verified by the unit test, not eyeballing); a reviewer can trace
every token's provenance via `research.md`/`data-model.md`; the demo page
renders correctly with zero manual color overrides; swapping root tokens
restyles every component with zero component edits; and the whole thing works
with zero dashboard scenario/panel/layout dependencies.
