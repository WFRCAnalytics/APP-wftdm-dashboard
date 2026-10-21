import { defineConfig, devices } from '@playwright/test'

// Real-browser integration tests for the boot sequence — Web Worker +
// DuckDB-WASM + Parquet fetch + URL params, per research.md §1 (jsdom can't
// faithfully exercise these). Fixture Parquet data is copied into public/
// by globalSetup and removed by globalTeardown so it never pollutes the
// production public/ tree (see tests/global-setup.js).
// Specs written for the redesign (they assert on the Corridor Pro demo content).
const REDESIGN_SPECS = [
  '**/chart*.spec.ts',
  '**/settingsRedesign.spec.ts',
]

export default defineConfig({
  testDir: 'tests/integration',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  use: {
    // 127.0.0.1, not 'localhost' — 009-scenario-manager's
    // isLocalDeployment() correctly implements project-docs/SPEC.md's own
    // documented `hostname === 'localhost'` LOCAL/WEB deployment check
    // (gating the "Load Local Scenario" control to WEB mode only), and
    // this dev server is a test harness, not the wftdm-dashboard
    // serve/here local-server mode that check is actually about — the two
    // need to be honestly distinguishable at the hostname level, not just
    // in intent. Found and fixed here (not by weakening the production
    // check) when 009's own new integration spec's first run couldn't
    // find its trigger button at all: every prior spec ran on literal
    // 'localhost' with no code caring about hostname yet, so this was
    // never a problem before this feature introduced the first
    // hostname-sensitive behavior in the whole suite.
    baseURL: 'http://127.0.0.1:5199/APP-wftdm-dashboard/',
  },
  // Two dev servers: the redesign specs run against the real Corridor Pro demo (5198); the older specs, written against
  // the ActivitySim example panels, run against that content served from tests/fixtures/legacy-demo (5199,
  // WFTDM_LEGACY_DEMO=1, see scripts/viteLegacyDemoPlugin.ts).
  webServer: [
    {
      command: 'npx vite --port 5199 --strictPort --host 127.0.0.1',
      env: { WFTDM_LEGACY_DEMO: '1' },
      url: 'http://127.0.0.1:5199/APP-wftdm-dashboard/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5198 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:5198/APP-wftdm-dashboard/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      testIgnore: REDESIGN_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'redesign',
      testMatch: REDESIGN_SPECS,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5198/APP-wftdm-dashboard/' },
    },
  ],
})
