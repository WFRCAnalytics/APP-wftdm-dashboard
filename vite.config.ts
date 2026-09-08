import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/APP-wftdm-dashboard/', // GitHub Pages
  // base: '/wftdm-dashboard/',  // wfrc.utah.gov subdirectory
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
          if (
            id.includes('maplibre-gl') ||
            id.includes('@deck.gl') ||
            id.includes('@flowmap.gl') ||
            id.includes('@luma.gl') ||
            id.includes('@math.gl') ||
            id.includes('@loaders.gl') ||
            id.includes('@probe.gl')
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
          // recharts — real, confirmed additions to this dependency tree
          // (not npm's newer "latest" major, which the actual shadcn CLI
          // install did NOT pin — research.md §6): lodash, react-smooth,
          // recharts-scale, victory-vendor. Same "large, previously-
          // absent library gets its own chunk" reasoning as plotly/maps/
          // graphic-walker above, so a dashboard that never renders a
          // `recharts` panel never pays its load cost.
          if (
            id.includes('recharts') ||
            id.includes('/lodash/') ||
            id.includes('react-smooth') ||
            id.includes('recharts-scale') ||
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
