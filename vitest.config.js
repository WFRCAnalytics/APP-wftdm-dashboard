import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// Pure-logic unit tests only (sqlExpander, filterState, yamlLoader,
// panelQuery, layout/types) — no browser, no DuckDB-WASM/Worker.
// Real-browser boot-sequence and rendering behavior is covered separately
// by Playwright (see playwright.config.js), per research.md §1/§5.
export default defineConfig({
  resolve: {
    // Mirrors vite.config.ts's own alias (002-design-tokens) so unit
    // tests can import via "@/..." the same way application code does.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
