# Quickstart: validating the demo flag

Prerequisites: `npm install`; the demo folders under `public/` are tracked.

## 1. Unit layer

```
npx vitest run tests/unit/firstRun.test.ts tests/unit/siteConfigDemo.test.ts tests/unit/demoContentPlugin.test.ts
```

Expected: the first-run decision (no site, no pages, loaded), `loadSite` reading only the deployment root with the flag off and both with it on, and the plugin removing `demo-*` only when the flag is off.

## 2. A normal build has no demo

```
npm run build
```

Expected: `dist/` holds no `demo-*` folder (`ls dist`), and is about 12 MB smaller than step 3's output. `grep -r "demo-scenarios" dist/assets` finds nothing (the demo code paths are removed as dead code).

## 3. The demo build is unchanged

```
npm run build:demo
npm run build:pages
```

Expected: `dist/` (demo) has the four `demo-*` folders; `git status` after `build:pages` shows only bundle-hash changes under `docs/assets/`, no demo content change.

## 4. First run

Serve the normal build with no deployment folder (`npm run preview`), open it. Expected: the first-run screen naming the missing site configuration and the folder searched; no WFRC title, logo or tab; the browser console has no error; the network log has no `demo-` request.

Then add a `public/dashboard-config/dashboard-config.yaml` with a title and one page and rebuild: only that title and page appear.

## 5. The dev server and the test projects

```
npm run dev
```

Expected: the demo as today. Then the full Playwright run: no new failures compared with the known flakes in CLAUDE.md (re-run a failure with `--workers=1` first).

## 6. The check command

`npm run check -- public/demo-dashboard-config` is clean; on a small deployer folder it reports only that folder's problems.
