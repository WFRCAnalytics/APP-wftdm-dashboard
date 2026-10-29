# Quickstart: validating site configuration

Prerequisites: `npm install`; the demo roots under `public/` are tracked, so no fixture copy is needed.

## 1. Unit layer (no browser)

```
npx vitest run tests/unit/config
```

Expected: schema rows are unique and complete; `validate` reports an unknown key, a wrong type, an invalid colour and a site-only key on a page, and keeps the default for each; `resolve` covers one case per cascade rule and names the supplying level; `toBranding` reproduces the demo's former branding object; the generated reference test passes (regenerate with `npm run docs:config` when it fails).

## 2. The demo is unchanged

```
npm run dev
```

Open the app. Expected: same title, logos, pages, vocabularies, metric labels, years and layout as before; no config note.

## 3. A mistake is reported, never fatal

Edit the demo's `dashboard-config.yaml`: add `titel: x`, set `years.base: "abc"`, and put `title: y` at the top level of a page file (not under `header:`, whose `title` is the page's own title). Reload. Expected: the app loads; one note lists three problems with their paths; the console shows the same; the title and base year are unchanged. Remove the edits; the note disappears. (Covered by `siteConfig.spec.ts`.)

## 4. Missing file and legacy file

Temporarily rename `dashboard-config.yaml`. Expected: the app loads on neutral defaults with a note that no site configuration was found. Put an old-style `index.json` with `title` in its place; the note says site settings moved to `dashboard-config.yaml`.

## 5. Browser specs

```
npx playwright test --project=real --project=redesign --project=chromium tests/integration/siteConfig.spec.ts tests/integration/boot.spec.ts tests/integration/dashboardShell.spec.ts tests/integration/modelYears.spec.ts
```

Then the full run; compare against the known flakes in CLAUDE.md (re-run a failure with `--workers=1` first).

## 6. Adding a setting touches one place

Add a test-only row to the schema table and a value in a config. Expected: it loads, validates and appears in the regenerated reference with no other source edit.

## 7. Nested folder (walked 2026-10-28)

`WFTDM_BASE=./ npx vite build --outDir <folder>/deep/site`, serve `<folder>` statically, open `/deep/site/index.html`. Result: the title,
logo and pages come from the demo's `dashboard-config.yaml`, no config note, and the only 404s are the roots that are normally absent
(`dashboard-config/dashboard-config.yaml`, then one probe of `dashboard-config/index.json`, `scenarios/`, `observed/`).
