import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { bootSkeletonPlugin } from './scripts/viteBootSkeletonPlugin.ts'

export default defineConfig({
  // GitHub Pages *project* page for WFRCAnalytics/APP-wftdm-dashboard —
  // served at https://wfrcanalytics.github.io/APP-wftdm-dashboard/, so every
  // asset URL must be prefixed with the repo name or it 404s once deployed.
  // Keep this EXACTLY equal to "/<repo-name>/". Used by both `npm run build`
  // and `npm run build:pages`.
  base: '/APP-wftdm-dashboard/',
  // base: '/wftdm-dashboard/',  // if/when served from wfrc.utah.gov/wftdm-dashboard/ instead
  // 033-shadcn-default-theme: the real, official Tailwind v4 Vite plugin —
  // replaces the previous PostCSS-plugin-based v3 setup (postcss.config.js,
  // deleted) entirely. tokens.css's own `@config "../../tailwind.config.js"`
  // directive (research.md §3/§4's confirmed, empirically-trialed bridge)
  // is what lets tailwind.config.js itself stay a plain, unmodified JS file
  // under this plugin — no CSS-native `@theme` rewrite needed.
  // 055-build-time-skeleton: bootSkeletonPlugin() must run AFTER
  // tailwindcss() in this array only in the sense that plugin order
  // here is irrelevant to it — it only touches index.html's own markup
  // via transformIndexHtml, never CSS. Listed second simply because it
  // was added second; no real ordering dependency exists between them.
  plugins: [tailwindcss(), bootSkeletonPlugin()],
  worker: { format: 'es' }, // REQUIRED for DuckDB-WASM
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] }, // REQUIRED
  resolve: {
    // shadcn's own import convention (@/components, @/lib/utils) — mirrors
    // tsconfig.json's "paths" so both the type-checker and the bundler
    // resolve "@/*" the same way (002-design-tokens)
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'esnext',
    // outDir is left at Vite's default ('dist/') here on purpose:
    // `npm run build` feeds the Python package (`make build` copies dist/
    // into python/wftdm_dashboard/static/). The GitHub Pages build is a
    // SEPARATE target — `npm run build:pages` overrides outDir to `docs/`
    // (+ --emptyOutDir) so the built demo app can be committed straight
    // into docs/ and served by GitHub Pages ("deploy from a branch",
    // /docs folder). No CI/Actions — the built output is committed by
    // hand. NOTE: while this is in place, docs/ holds the BUILT DASHBOARD,
    // not documentation (reference docs moved to project-docs/). Once the
    // real dashboard deploys from WFRC's own server, docs/ reverts to
    // housing the Python-package / YAML-authoring documentation.
    // demo.html (002-design-tokens) is intentionally NOT listed as a
    // rollupOptions.input entry — Vite's default build only bundles
    // index.html, so the throwaway demo page stays out of the production
    // dashboard build (FR-009/SC-005). `npm run dev` still serves it since
    // Vite's dev server resolves any .html file in the project root.
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 042-boot-performance-fix: a THIRD instance of the react-vendor/
          // app-shared class of leak, and the last one — found by checking
          // whether the entry chunk's own residual one-binding `import`
          // from 'recharts'/'flowmap-deck' (real, confirmed used code, not
          // dead facades — grepped for real call sites in the built entry
          // chunk) shared ANY actual module with either chunk. It didn't —
          // an explicit module-set intersection, computed directly via
          // Vite's build API, came back empty both times, ruling out
          // another app-source leak like scenarioDisplay.ts's. Rollup's
          // own documented `hoistTransitiveImports` option was tried next
          // (its symptom — a real import backed by no real shared code —
          // matches its own description) and had ZERO measurable effect,
          // confirmed by rebuilding with it set to `false` and diffing
          // output file hashes, which were byte-identical; removed rather
          // than left in as a misleading, non-functional "fix". The real
          // cause: Vite's own internal runtime helper module,
          // `\0vite/preload-helper.js` (every `import()` call site needs
          // it, including all ten of panels/registry.tsx's own lazy()
          // factories, which live in the entry chunk itself) — confirmed
          // present in both 'recharts' and 'flowmap-deck' chunks' own
          // module lists from the earlier react-vendor investigation.
          // Rollup's automatic algorithm, with no explicit rule of mine to
          // guide it, placed this ALWAYS-NEEDED shared helper physically
          // inside those two large chunks rather than the entry/its own
          // tiny chunk — every other dynamic-import call site (the entry
          // chunk among them) then needed a live import of it from there.
          // Same fix as the two above: give it an explicit, dedicated,
          // always-eager home.
          if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) {
            return 'app-shared'
          }
          // 042-boot-performance-fix: the last instance of this same class
          // of leak — found by grepping the entry chunk's own compiled code
          // around its one remaining `recharts` import for a recognizable
          // usage pattern (`mq(UL(e))`/`WC=UL` — `clsx`'s own real, tiny
          // output shape, combined with tailwind-merge, is exactly
          // `@/lib/utils`'s `cn()` helper every UI component in this app
          // uses). `clsx` has real consumers on both sides of the eager/
          // lazy boundary (every eager shadcn-pattern component's own
          // `cn()` call, AND recharts' own internal usage) — same fix.
          if (id.includes('node_modules/clsx/')) return 'app-shared'
          // 042-boot-performance-fix: MUST be checked first, before every
          // other rule below. A real, confirmed root cause found while
          // verifying panels/registry.tsx's own React.lazy() conversion
          // (see that file's header comment) actually deferred anything —
          // it didn't, on its own. Inspected each output chunk's real
          // `imports` array via Vite's build API directly: EVERY chunk in
          // the app, including totally unrelated leaf ones like
          // hooks/useFilterState.ts's own tiny chunk, statically imported
          // the 'recharts' chunk. Root cause, confirmed by printing that
          // chunk's own full module list: this manualChunks function had
          // no explicit rule for `react`/`react-dom`/`scheduler` at all —
          // Rollup's own automatic algorithm, left to decide where to
          // physically place those three unmatched-but-shared packages,
          // chose to bundle them INSIDE the 'recharts' output file (recharts
          // v3 depends on them transitively via @reduxjs/toolkit/
          // react-redux, and Rollup's chunk-graph heuristic apparently
          // judged that the best place to co-locate them). Invisible before
          // this feature because 'recharts' was ALREADY part of the eager
          // entry graph back then (registry.tsx statically imported every
          // panel type) — trapping React itself inside a NOW-lazy chunk
          // only became a real problem once 'recharts' actually became
          // conditionally-loaded. Since literally every part of this React
          // app needs React/ReactDOM/Scheduler unconditionally, giving them
          // their own explicit, always-eager chunk — checked before any
          // other rule can claim them — is the fix; `hoistTransitiveImports:
          // false` was tried first and had zero effect (confirmed via a
          // direct rebuild comparison), because this was never about
          // Rollup's transitive-import hoisting heuristic at all.
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor'
          }
          // 042-boot-performance-fix: a SECOND instance of the exact same
          // class of problem the react-vendor rule above fixes, found by
          // re-inspecting the 'recharts' chunk's own module list after that
          // first fix — it shrank but was still statically imported by the
          // entry chunk. This app's own panels/scenarioDisplay.ts (pure,
          // dependency-free per its own header comment) is imported BOTH
          // eagerly (main.tsx's own setDeployerScenarioPalette() call,
          // scenarioColorControl.tsx via the Scenarios tab — always
          // mounted, same as basemapTab.tsx's own leak fixed via
          // mapDefaults.ts) AND by the lazy Recharts/Plotly/ObservablePlot
          // chain (hooks/useScenarioDisplay.ts). Left unmatched, Rollup
          // physically placed it inside the 'recharts' chunk, and along
          // with it, several of recharts' own real transitive dependencies
          // that happen to be graph-adjacent (`use-sync-external-store`,
          // `tiny-invariant`, `@babel/runtime` helpers — none of which have
          // any other real, eager consumer of their own, confirmed via
          // `npm ls use-sync-external-store`) — re-dragging the whole
          // chunk eager exactly like react-vendor did. Same fix: an
          // explicit, dedicated, always-eager chunk of its own.
          if (id.includes('src/panels/scenarioDisplay.ts')) return 'app-shared'
          if (id.includes('@duckdb/duckdb-wasm')) return 'duckdb'
          // 003-dashboard-shell-navigation: first feature to depend on
          // Plotly (a large library) — split per CLAUDE.md's own
          // documented vite.config.js convention, unimplemented until now
          // since nothing depended on it before this feature.
          if (id.includes('plotly')) return 'plotly'
          // 010-flowmap-panel: this codebase's first real map — maplibre-gl
          // + the whole deck.gl/flowmap.gl/luma.gl family are all large,
          // previously-absent libraries, split into their own chunk for the
          // same reason plotly got one above.
          // 041-protomaps-pmtiles-basemap: pmtiles + @protomaps/basemaps are
          // both small, dependency-light (pmtiles has one dependency,
          // fflate; @protomaps/basemaps has zero, confirmed via `npm view`)
          // and meaningfully useless without maplibre-gl already loaded —
          // they only ever run inside this app's own MapLibre style-
          // resolution path (panels/basemap/loadBasemapStyle.ts).
          //
          // 042-boot-performance-fix: SPLIT this single 'maps' bucket into
          // two — a real, confirmed second-order finding from implementing
          // panels/registry.tsx's React.lazy() conversion (docs/
          // PIPELINE.md), not part of the original 011/041 chunking
          // decisions above. layout/settings/basemapTab.tsx (reachable
          // unconditionally from Shell -> SettingsModal, never lazy) needs
          // maplibre-gl + pmtiles + @protomaps/basemaps eagerly for its own
          // real, always-available basemap preview — that need is genuine
          // and unrelated to any specific panel type, so those three stay
          // in 'maps' and stay eager, by design. But @deck.gl/@flowmap.gl/
          // @luma.gl/@math.gl/@loaders.gl/@probe.gl are needed ONLY by
          // FlowMapPanel.tsx (confirmed: ZoneMapPanel.tsx is deliberately
          // pure MapLibre with no MapboxOverlay/deck.gl at all — see this
          // file's own comment on that panel) — if left merged into the
          // SAME 'maps' output file as maplibre-gl, Rollup's manualChunks
          // would force the whole merged file to download eagerly the
          // instant basemapTab.tsx needed ANY part of it, silently
          // defeating panels/registry.tsx's own lazy-loading fix for
          // FlowMapPanel.tsx specifically (a real chunk-grouping trap, not
          // a per-module-import problem — confirmed by reading Rollup's
          // manualChunks contract: matched modules are forced into one
          // physical file regardless of which importer reaches them).
          // Split into its own 'flowmap-deck' chunk so it only downloads
          // when FlowMapPanel.tsx's own dynamic import actually fires.
          if (id.includes('maplibre-gl') || id.includes('pmtiles') || id.includes('@protomaps/basemaps') || id.includes('fflate')) {
            return 'maps'
          }
          if (
            id.includes('@deck.gl') ||
            id.includes('@flowmap.gl') ||
            id.includes('@luma.gl') ||
            id.includes('@math.gl') ||
            id.includes('@loaders.gl') ||
            id.includes('@probe.gl')
          ) {
            return 'flowmap-deck'
          }
          // 014-graphic-walker-panel: this codebase's first dependency on
          // @kanaries/graphic-walker, whose own dependency tree pulls in
          // vega/vega-lite/vega-embed, mobx/mobx-react-lite, a second
          // @radix-ui/@headlessui component set, and styled-components —
          // a large, previously-absent tree, the same situation
          // plotly/maplibre-gl were each in when they got their own chunk
          // above (research.md §9).
          if (id.includes('@kanaries/graphic-walker')) return 'graphic-walker'
          // 057-observable-plot-conversion (found post-hoc, not part of
          // that feature's own original scope — a real, confirmed chunk-
          // graph leak, same class as 042's three react-vendor/app-shared
          // findings, discovered while investigating why Summary's
          // landing tab still downloaded the full recharts vendor chunk
          // after every real recharts panel there was converted to
          // observable-plot). `@observablehq/plot`'s own real dependency
          // (`d3`, the umbrella package) and `recharts`' own real
          // dependency (via `victory-vendor`) both genuinely,
          // independently need several of the SAME top-level d3-*
          // packages — confirmed directly via each library's own real
          // `package.json` (`victory-vendor` depends on `d3-array`/
          // `d3-interpolate`/`d3-scale`/`d3-shape`/`d3-time`/`d3-timer`/
          // `d3-ease`; `d3` depends on all of those plus `d3-color`/
          // `d3-format`/`d3-path`), resolved by npm to the IDENTICAL
          // physical `node_modules` files, not two separate copies. Left
          // unmatched by every rule in this function, Rollup's own
          // auto-chunking placed the full overlapping set — d3-array/
          // d3-color/d3-format/d3-interpolate/d3-path/d3-scale/d3-shape/
          // d3-time/d3-time-format, confirmed via Vite's own build API
          // chunk-graph output, not guessed — entirely inside the
          // (forced) `recharts` bucket below. Since `@observablehq/plot`
          // itself was ALSO left unmatched (auto-chunked under an
          // arbitrary `index-*` name), every real Observable Plot
          // consumer needed a static cross-chunk import edge back into
          // the FULL `recharts` chunk just to reach these shared, purely
          // generic math/formatting/scale primitives — dragging recharts
          // plus its own real, unique dependencies (`@reduxjs/toolkit`,
          // `react-redux`, ...) onto any page using Observable Plot,
          // including a bare value-box sparkline, even with zero real
          // recharts panels anywhere on it (confirmed live: Summary's
          // landing tab, no recharts panel since this feature's own
          // conversion, still downloaded the full ~450KB recharts chunk
          // on every visit). Fixed with a THIRD, small, neutral bucket
          // for exactly this confirmed-shared subset — checked before
          // recharts' own rule below — so neither chart engine's real,
          // UNIQUE code (recharts' own React/Redux layer; Observable
          // Plot's own mark/facet/plot.js logic) is ever pulled in by a
          // page using only the other one. `internmap` (d3-array's own
          // small internal Map-polyfill dependency) travels with it for
          // the same reason. This is NOT the same fix as 042's three
          // react-vendor/app-shared findings — those were real APP
          // source files (`scenarioDisplay.ts`) or a Vite runtime helper
          // reachable from literally everywhere; this is a genuine
          // third-party-dependency-version-overlap case, first possible
          // the moment this feature gave Observable Plot a second real
          // consumer (`valueBoxSparkline.tsx`) — before that, Observable
          // Plot had only one importer (`ObservablePlotPanel.tsx`) and
          // was bundled directly into that single chunk with no sharing
          // possible at all.
          // 058-hierarchical-chart-panels: `d3-hierarchy` ADDED to this
          // list — a real, confirmed instance of the exact same class of
          // leak this whole bucket already exists to prevent, found while
          // starting this feature's own implementation, before it could
          // ship broken. `d3-hierarchy` was previously exclusive to
          // `@observablehq/plot`'s own internal `Plot.tree`/`Plot.cluster`
          // marks (confirmed via this feature's own research.md §1) — the
          // comment below this block used to list it among the packages
          // "deliberately left unmatched... stay [t]here via Rollup's own
          // default placement" for exactly that reason. This feature's new
          // `treemapRenderer.ts`/`sunburstRenderer.ts` (each reachable only
          // via their own new, separately-lazy `TreemapPanel`/
          // `SunburstPanel` registry entries) are now a SECOND, real,
          // independent importer — left unmatched, Rollup would place
          // `d3-hierarchy` in whichever chunk it judged best (most likely
          // the already-existing `observable-plot` chunk, since that
          // importer existed first), forcing a viewer who opens ONLY a
          // treemap/sunburst panel to also eagerly pull in the entire
          // Observable Plot bundle just to reach it — the identical failure
          // mode every other rule in this function already exists to
          // prevent. `d3-shape` (this feature's other new dependency,
          // `d3.arc()` for the sunburst renderer) needed NO new rule at
          // all — it already matches the existing `d3-shape` entry below,
          // confirmed via `npm ls d3-shape` to already be a real,
          // multiply-shared package (`@kanaries/graphic-walker`'s own
          // `vega-scenegraph` dependency, `@observablehq/plot`'s own
          // bundled `d3`, and `victory-vendor`) before this feature ever
          // added a direct top-level dependency on it.
          if (
            id.includes('node_modules/d3-array/') ||
            id.includes('node_modules/d3-color/') ||
            id.includes('node_modules/d3-format/') ||
            id.includes('node_modules/d3-hierarchy/') ||
            id.includes('node_modules/d3-interpolate/') ||
            id.includes('node_modules/d3-path/') ||
            id.includes('node_modules/d3-scale/') ||
            id.includes('node_modules/d3-shape/') ||
            id.includes('node_modules/d3-time/') ||
            id.includes('node_modules/d3-time-format/') ||
            id.includes('node_modules/internmap/')
          ) {
            return 'd3-shared'
          }
          // 057-observable-plot-conversion (same post-hoc fix as above):
          // @observablehq/plot never had its own explicit bucket —
          // Rollup auto-chunked it under a generic, unstable `index-*`
          // name instead. Same "large, previously-unshared library gets
          // its own explicit, stably-named chunk" reasoning as plotly/
          // maps/graphic-walker/recharts in this same function — its own
          // exclusive d3-* dependencies (d3-axis/d3-contour/d3-delaunay/
          // d3-dispatch/d3-ease/d3-random/d3-selection/d3-timer/
          // d3-transition/d3-zoom — confirmed via the same chunk-graph
          // inspection to have no other real importer anywhere in this
          // app) are deliberately left unmatched here and stay with it
          // via Rollup's own default placement, exactly as they already
          // correctly did before this fix. `d3-hierarchy` was ALSO on
          // this exclusive list originally — `058-hierarchical-chart-
          // panels` moved it up into the `d3-shared` bucket above once it
          // gained a second, independent real importer; see that block's
          // own comment for the full finding.
          if (id.includes('@observablehq/plot')) return 'observable-plot'
          // 029-shadcn-chart-panel: this codebase's first dependency on
          // recharts. UPGRADED to recharts@^3.10.1 (a deliberate, later
          // major-version upgrade from the original ^2.15.4 the shadcn CLI
          // itself installed — see CLAUDE.md's own recorded history and
          // research.md §13 for the full story). Recharts v3 rewrote its
          // own dependency chain entirely, confirmed directly via
          // `npm ls`, not assumed: `react-smooth`/`recharts-scale` are
          // GONE (v3 dropped both), replaced by a real, new Redux-based
          // internal state layer (`@reduxjs/toolkit`, `es-toolkit`,
          // `decimal.js-light`) plus a `victory-vendor` version bump
          // (^36.6.8 → ^37.0.2). `lodash` was REMOVED from this list —
          // confirmed via `npm ls lodash` that it was never actually a
          // recharts dependency at all (v2 or v3): it's
          // `@kanaries/graphic-walker`'s own transitive dependency (via
          // `react-color`/`react-resize-detector`), a pre-existing
          // inaccuracy in this chunk rule now fixed, not something this
          // upgrade introduced. `immer`/`react-redux`/`reselect`/
          // `use-sync-external-store` (also real, new-to-recharts
          // dependencies) are deliberately NOT added here either — each
          // is also already pulled in by an unrelated, pre-existing
          // dependency elsewhere in this tree (`@kanaries/graphic-walker`/
          // `@kanaries/react-beautiful-dnd` for `immer`/`react-redux`/
          // `use-sync-external-store`, `@flowmap.gl/data` for `reselect`,
          // confirmed via `npm ls` for each) — chunking a genuinely shared
          // dependency under the recharts-specific lazy-load boundary
          // would force every OTHER panel type that also needs it to pay
          // for the whole `recharts` chunk too, defeating the point of
          // splitting by panel type. Leaving them unmatched here lets
          // Rollup's own default chunking place them wherever they're
          // naturally shared. Same "large, previously-absent library gets
          // its own chunk" reasoning as plotly/maps/graphic-walker above.
          if (
            id.includes('recharts') ||
            id.includes('@reduxjs/toolkit') ||
            id.includes('es-toolkit') ||
            id.includes('decimal.js-light') ||
            id.includes('victory-vendor')
          ) {
            return 'recharts'
          }
        },
      },
    },
  },
  server: {
    // dev only — enables SharedArrayBuffer / threaded DuckDB-WASM locally
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
