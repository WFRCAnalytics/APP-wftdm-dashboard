# Quickstart: validating viewer-facing settings

Prerequisites: `npm install`; the demo roots under `public/` are tracked.

## 1. Unit layer (no browser)

```
npx vitest run tests/unit/configViewer.test.ts tests/unit/configPages.test.ts tests/unit/configValidate.test.ts tests/unit/configToBranding.test.ts tests/unit/configCheck.test.ts tests/unit/configReference.test.ts tests/unit/configJsonSchema.test.ts
```

Expected: `docsHref` joins with and without slashes and refuses non-web addresses; `resolveSettingsTabs` keeps order, drops the assistant when off and never returns an empty list; `listedPages` and `landingIndex` follow the hidden rules; the new rows validate, the page-scoped rows are refused in the site file; the generated reference and JSON Schema match the table (regenerate with `npm run docs:config`).

## 2. Nothing changes without the keys

```
npm run dev
```

Open the app. Expected: no icon at the foot of the sidebar, five Settings tabs, every page listed, no config note.

## 3. The documentation link

In the demo's `dashboard-config.yaml` add `docs: { url: "https://example.org/docs/", label: "Help" }`. Reload. Expected: a "Help" icon at the foot of the sidebar (tooltip when collapsed); clicking opens `https://example.org/docs/` in a new tab. Add `docs: modes/` to one page's `header:`: on that page the icon opens `https://example.org/docs/modes/`.

## 4. Settings tabs

Add `settings: { tabs: [scenarios, appearance] }`. Expected: Settings shows those two, Scenarios first and open. Add `bogus` to the list: the note names it and the two valid tabs still show.

## 5. Hidden pages

Add `hidden: true` to a page's header. Expected: not in the sidebar, the landing page is the first other page, and `#/<its slug>` opens it.

## 6. `check`

```
npm run check -- public/demo-dashboard-config
```

Expected: `ok` with the keys above removed; with `docs: ftp://x`, `header.docs` and no `docs.url`, an unknown tab and every page hidden, each is listed and the exit code is 1.

## 7. Browser spec

```
npx playwright test --project=chromium tests/integration/viewerSettings.spec.ts
```

Then the full run; compare with the known flakes in CLAUDE.md (re-run a failure with `--workers=1` first).
