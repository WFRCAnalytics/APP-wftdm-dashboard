import { defineConfig } from 'vite'

// Pure-logic unit tests only (sqlExpander, filterState, yamlLoader) — no
// browser, no DuckDB-WASM/Worker. Real-browser boot-sequence behavior is
// covered separately by Playwright (see playwright.config.js), per
// research.md §1.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
