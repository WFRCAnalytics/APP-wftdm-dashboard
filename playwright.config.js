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
    // 127.0.0.1, not 'localhost' — 009-scenario-manager's
    // isLocalDeployment() correctly implements docs/SPEC.md's own
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
  webServer: {
    // --host 127.0.0.1 explicit, not left to Vite's own 'localhost'
    // default: on this machine that default resolves to binding only the
    // IPv6 [::1] interface, not IPv4 127.0.0.1 — found when the baseURL
    // fix above (127.0.0.1, not 'localhost') made Playwright's own
    // webServer readiness poll against 127.0.0.1 time out even though the
    // server had actually started (confirmed via `netstat`: TIME_WAIT
    // entries only on [::1]:5199, nothing on 127.0.0.1:5199).
    command: 'npx vite --port 5199 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5199/APP-wftdm-dashboard/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
