# Quickstart: Full shadcn/ui Default-Theme Adoption

See `contracts/tailwind-v4-migration.md` and `contracts/component-
parity.md` for the full behavioral contracts each scenario below checks
against; not duplicated here.

## Prerequisites

```powershell
npm install tailwindcss@latest @tailwindcss/vite@latest @fontsource-variable/geist @fontsource-variable/geist-mono
npm uninstall autoprefixer postcss   # only after confirming no other consumer (contracts/tailwind-v4-migration.md)
npm run dev
```

## Scenario 1 — The build pipeline migrates with zero `tailwind.config.js` changes (contracts/tailwind-v4-migration.md)

```powershell
npm run dev
npm run build
grep -c "bg-primary" dist/assets/*.css   # or equivalent — confirm real custom utilities still generate
```

**Done when**: the dev server boots and the production build succeeds
with no PostCSS/Vite plugin errors, and the built CSS still contains this
project's own real custom utility classes.

## Scenario 2 — Every semantic token matches shadcn's real current values (FR-001, data-model.md §1)

```js
// Browser console or a Playwright page.evaluate(), both themes:
getComputedStyle(document.documentElement).getPropertyValue('--primary')
```

**Done when**: every token in `data-model.md` §1's table resolves to its
listed new hex value, in both `:root` and `.dark`.

## Scenario 3 — Typography matches shadcn's real current font stack (FR-002, data-model.md §2)

```js
getComputedStyle(document.querySelector('h1, .font-heading')).fontFamily
getComputedStyle(document.body).fontFamily
getComputedStyle(document.querySelector('.font-mono')).fontFamily
```

**Done when**: heading/body both resolve to `'Geist Variable'`, and mono
resolves to `'Geist Mono Variable'`.

## Scenario 4 — All seven new form-input primitives exist and work (FR-003/FR-004)

Render each on a temporary demo page; confirm each is interactive
(clickable/typeable/toggleable) and visually correct in both themes.

**Done when**: Input, Select, Checkbox, Switch, RadioGroup, Textarea,
Label all render and behave correctly, both themes.

## Scenario 5 — Every dark-mode fix from data-model.md §6 still holds

```powershell
npm run test:unit -- tokenContrast
npx playwright test tests/integration/graphicWalkerPanel.spec.ts   # theme test
# plus new, equivalent assertions for Plotly/Observable Plot/Sankey/map-controls/dialog, per data-model.md §6
```

**Done when**: all six cases individually pass their real, direct
assertion — not a screenshot-only check — in both themes.

## Scenario 6 — No live WFRC-brand-token reference remains (FR-008, SC-004)

```powershell
grep -rn "brand-wfrc" src/
```

**Done when**: this returns zero matches anywhere in `src/`, outside the
untouched `028-dashboard-branding` logo/title mechanism (which has no
brand-color references to begin with — confirmed by direct read).

## Scenario 7 — The design-system skill states the suspension plainly (FR-009, SC-005)

Read the `wftdm-design-system` skill's Brand Identity section.

**Done when**: it explicitly states the brand-consistency rule is
suspended for this feature, on explicit direction, pending a future
re-branding feature — not silently altered or contradicting the shipped
result.
