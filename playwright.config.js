import { defineConfig, devices } from '@playwright/test'

// Real-browser integration tests for the boot sequence — Web Worker +
// DuckDB-WASM + Parquet fetch + URL params, per research.md §1 (jsdom can't
// faithfully exercise these). Fixture Parquet data is copied into public/
// by globalSetup and removed by globalTeardown so it never pollutes the
// production public/ tree (see tests/global-setup.js).
export default defineConfig({
  testDir: 'tests/integration',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  use: {
    baseURL: 'http://localhost:5199/APP-wftdm-dashboard/',
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199/APP-wftdm-dashboard/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
