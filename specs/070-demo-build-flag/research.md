# Research: Demo content only when asked for

## What the code does today

- `services/siteConfig.ts#loadSite` always loads `dashboard-config/` and `demo-dashboard-config/`; settings merge per key (deployment wins), page lists concatenate, and `main.tsx` loads the pages of both.
- `services/scenarioDiscovery.ts#discoverScenarios` always calls `registerDemoScenarios()` (`demo-scenarios/index.json`).
- `panels/zoneGeometry.ts` retries a missing `geometry/<file>` under `demo-geometry/`; `charts/lib/mapGeometry.ts#loadRail` reads the rail file only from `demo-geometry/`.
- `scripts/viteBootSkeletonPlugin.ts` reads both folders to paint the first skeleton.
- Vite copies all of `public/` into the output: `dist/` and `docs/` both contain `demo-dashboard-config` (36 KB), `demo-geometry` (24 KB), `demo-scenarios` (706 KB) and `demo-synthetic` (11 MB).
- `npm run dev` and the three Playwright projects start `npx vite` (serve mode); `WFTDM_DEMO` only picks which fixtures the dev server's middleware answers with. `vitest.config.js` is separate and unit tests pass explicit URLs where they need a root.
- Nothing in `src/` reads `import.meta.env.MODE`, `DEV` or `PROD`.
- No WFRC value is left as a code default (Phase A made the defaults neutral); the demo values sit only in `public/demo-dashboard-config/dashboard-config.yaml` and the page files.

## Decisions

1. **A Vite mode, mapped to a `define`.**
   Decision: `vite.config.ts` becomes `defineConfig(({ command, mode }) => ...)` with `demo = command === 'serve' || mode === 'demo'`, and defines `import.meta.env.VITE_WFTDM_DEMO` as `'1'` or `''`. `build:pages` runs `vite build --mode demo ...`; `build:demo` is the same into `dist/`. The app reads one constant, `DEMO_CONTENT`.
   Rationale: the project is developed on Windows, where `VAR=1 npm run ...` does not work and `cross-env` would be a new dependency; a mode flag is portable and visible in the script. The dev server and the Playwright projects need no change.
   Alternatives: an environment variable (portability, or a new dependency); a runtime switch such as a query parameter or a file on the server (a normal build could still be pointed at demo files, and the files would still ship); two Vite configs (duplication).

2. **Remove `demo-*` from the output after the copy.**
   Decision: `scripts/viteDemoContentPlugin.ts`, `apply: 'build'`, in `closeBundle` deletes `<outDir>/demo-*` when demo is off. It touches only the output folder.
   Rationale: Vite 5 copies `public/` before writing the bundle, so removing afterwards is reliable and leaves the source tree alone (FR-012). A second, filtered public directory would mean moving the tracked demo files, which the spec rules out.
   Alternatives: `publicDir: false` plus a copy plugin (re-implements the copy, loses Vite's handling of `public/`); moving the demo folders out of `public/` (breaks the dev server paths and every spec).

3. **The dev server is always the demo.**
   Rationale: `npm run dev` and the three Playwright projects rely on it; the spec requires them unchanged (FR-007). `vite preview` of a normal build serves what the build contains, so a preview shows exactly what ships.

4. **First run is a screen, not a toast.**
   Decision: a pure `firstRunState` decides between "no site configuration found" (the site file is absent) and "the site lists no pages" (present, empty `pages`), and a small component shows the folder searched and the next step (add `dashboard-config.yaml`; or build with `npm run build:demo`). `main.tsx` renders it instead of `Shell` when no page loaded. A page file that fails to parse still yields the existing per-file errors, and the app still renders what did parse.
   Rationale: today an empty page list leaves a blank shell. The existing configuration note stays for problems; the first-run screen is for the case where there is nothing to show.
   Alternatives: reuse the configuration note only (it is dismissible and the page behind it would be empty); redirect to documentation (none hosted yet).

5. **Geometry follows the flag.**
   Decision: the zone-boundary fallback to `demo-geometry/` only when demo is on; the rail file resolves to `geometry/<file>` when demo is off (a deployer puts it beside their boundaries) and `demo-geometry/<file>` when on.
   Rationale: otherwise a normal build requests demo files that are not there.

6. **The boot skeleton follows the flag.**
   Decision: the plugin gets `{ demo }`; with demo off it reads only `public/dashboard-config` (already optional: gitignored and absent in a fresh clone).
   Rationale: the skeleton is painted before the app boots, so a demo tab flashing in a normal build would defeat the change.

7. **The Pages output stays as it is.**
   Decision: `build:pages` runs in demo mode, which keeps all four demo folders (including `demo-synthetic`, 11 MB) so `docs/` is byte-for-byte what it is today apart from the bundle hashes. Trimming `demo-synthetic` from Pages is a separate decision (it is only needed by the redesign tests).

8. **The flag is not a schema setting.**
   Rationale: it is a build choice and a normal build has no demo to point at; `check` and the schema need no row.

## Risks

- `define` of an `import.meta.env.*` key: Vite supports it, but the build must be verified (the quickstart greps the bundle for the demo paths in a normal build; they appear only behind `DEMO_CONTENT`, which the minifier removes as dead code when it is the constant `''`).
- Unit tests run under `vitest.config.js` where `VITE_WFTDM_DEMO` is undefined, so `DEMO_CONTENT` is false there; tests that need the demo root pass it explicitly or set the `define` in a test-local way.
- A spec that depends on `npm run build` output: none exists (checked); previews of `docs/` use `preview:pages`.
