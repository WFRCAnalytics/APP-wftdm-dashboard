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

Expected: `dist/` holds no `demo-*` folder (`ls dist`), and is about 12 MB smaller than step 3's output. `grep -rl "demo-" dist` finds only the service worker's cache pattern and the URL builder in the geometry chunk (strings, no request is made).

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

## Checked so far (2026-10-29, US1 to US4)

- Normal build: `dist/` has no `demo-*` folder; 94 MB before, 81 MB after. `grep -rl "demo-"` finds the service worker's cache pattern and the geometry chunk's URL builder only.
- Demo build (`vite build --mode demo`) against the committed `docs/`: same top-level entries, the same non-asset file list, all four `demo-*` folders byte-identical to `public/demo-*` and to `docs/`; asset names equal apart from content hashes.
- Demo mode in the browser: `realDemo`, `settingsModal`, `settingsRedesign`, `layoutTabs`, `boot`, `exploreBuilderSite`, `assistantConfig` ran (87 + 29 passed); the only failures are `realDemo.spec.ts:19` and `:39`, the known pre-existing ones.
- First run (project `firstrun`, 3 cases): no site file, a site file with `pages: []`, and a one-page deployment; no `demo-` request, no console error.
- `npm run check`: the demo folder is clean (exit 0); a scratch folder with one bad limit reports only that problem (exit 1).

## Walked (2026-10-29)

- Step 1 and the unit layer: 109 files, 1438 tests pass.
- Steps 2 to 4 as recorded above (normal build 94 MB to 81 MB with no `demo-*`; the demo build matches `docs/`; the first-run screen on a normal build, 3 cases in project `firstrun`).
- Step 5, full Playwright run (645 tests): 639 passed, 6 failed. `realDemo.spec.ts:19` and `:39` (pre-existing) and `chartMaps.spec.ts:95` (known flaky) are the baseline. `observablePlotMarkVariety:216` and `chartScenarioCompare:8` passed when re-run alone. `observablePlotPanel.spec.ts:167` (hovering a line mark) is a hover-timing flake: it failed in the 068 and 069 runs too, and alone it fails on `main` as well (1 of 4 runs there, 4 of 6 on this branch), so it is not caused by this change.
- Not covered by a browser test: nothing new beyond the first-run cases.
