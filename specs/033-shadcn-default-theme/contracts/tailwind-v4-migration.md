# Contract: Tailwind v3 → v4 Migration

Confirmed by the real, empirical trial in `research.md` §3. This is the
exact, minimal set of infrastructure changes — no `tailwind.config.js`
rewrite.

## `package.json`

Remove: `tailwindcss` (^3.4.15), `autoprefixer`, `postcss` (unless still
needed by another tool — confirm during implementation; Tailwind v4 does
its own vendor-prefixing internally, a real documented v4 change, so
`autoprefixer` is expected to become dead weight, not confirmed removable
without a build-output diff first).

Add: `tailwindcss@^4`, `@tailwindcss/vite@^4` (the official Vite-native
integration — this project already uses Vite 6, no Vite version bump
needed; preferred over `@tailwindcss/postcss` since it avoids keeping a
separate `postcss.config.js` at all).

Add (fonts, `data-model.md` §2): `@fontsource-variable/geist`,
`@fontsource-variable/geist-mono`.

## `vite.config.ts`

Add the `@tailwindcss/vite` plugin to the `plugins:` array. Remove
`postcss.config.js` once confirmed the Vite plugin fully replaces it (no
other PostCSS plugin currently runs in this project besides
`autoprefixer`, confirmed by direct read of the existing
`postcss.config.js`).

## `src/styles/tokens.css`

Replace:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

with:

```css
@import "tailwindcss";
@config "../../tailwind.config.js";
```

**Confirmed working, unmodified, against this project's real
`tailwind.config.js`** (`research.md` §3) — no config-file rewrite into
CSS-native `@theme` syntax is part of this migration. `tailwind.config.js`
itself is NOT edited by this step (its `colors`/`fontFamily`/`boxShadow`/
`borderRadius` keys all already reference `var(--token)` — they work
identically under the `@config` bridge).

## `components.json`

```diff
- "style": "default",
+ "style": "new-york-v4",
```

`baseColor: "neutral"` is UNCHANGED — already correct (`research.md` §1).

## What does NOT change

- `tailwind.config.js` itself — kept as a JS file, unmodified structure,
  referenced via `@config` (this is the entire point of the confirmed
  Option B path — `research.md` §4).
- Any panel's data-fetching/query-building/chart-encoding logic (FR-012).
- The `--chart-1..5` categorical palette (`research.md` §7).

## Verification

- `npm run dev` boots with no PostCSS/Vite plugin errors.
- `npm run build` produces a CSS bundle containing this project's real
  custom utilities (`bg-primary`, `font-heading`, `shadow-md`, etc.) —
  spot-check by grepping the built CSS, matching `research.md` §3's own
  trial-verification method.
- `npm run typecheck` and the full existing Vitest/Playwright suite still
  pass — this migration changes the build pipeline and token values only,
  not application code paths.
