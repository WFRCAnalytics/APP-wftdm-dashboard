import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [tailwindcss()],
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
          // resolution path (panels/basemap/loadBasemapStyle.ts). Folded
          // into the existing "maps" bucket rather than a new dedicated
          // chunk, matching this project's own "don't split out a small
          // addition" precedent (d3-sankey/d3-scale-chromatic were never
          // split out either) — revisit only if a measured build-size
          // regression is found (research.md R-8).
          if (
            id.includes('maplibre-gl') ||
            id.includes('@deck.gl') ||
            id.includes('@flowmap.gl') ||
            id.includes('@luma.gl') ||
            id.includes('@math.gl') ||
            id.includes('@loaders.gl') ||
            id.includes('@probe.gl') ||
            id.includes('pmtiles') ||
            id.includes('@protomaps/basemaps') ||
            id.includes('fflate')
          ) {
            return 'maps'
          }
          // 014-graphic-walker-panel: this codebase's first dependency on
          // @kanaries/graphic-walker, whose own dependency tree pulls in
          // vega/vega-lite/vega-embed, mobx/mobx-react-lite, a second
          // @radix-ui/@headlessui component set, and styled-components —
          // a large, previously-absent tree, the same situation
          // plotly/maplibre-gl were each in when they got their own chunk
          // above (research.md §9).
          if (id.includes('@kanaries/graphic-walker')) return 'graphic-walker'
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
