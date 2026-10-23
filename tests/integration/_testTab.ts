// The Test tab (dashboard-8-test.yaml: deliberately broken and edge-case panels — missing metrics, unreachable
// basemap, XSS markdown and so on) is NOT shipped with the app. Specs that exercise those panels import `test` from
// here instead of '@playwright/test': it behaves the same, but every page also gets the Test tab appended as the last
// entry of the dashboard index, served from tests/fixtures/test-tab/. Same route-injection idea the Graphic Walker
// spec uses for its own tab.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test as base, expect as baseExpect } from '@playwright/test'

export * from '@playwright/test'

// The Test tab mounts ~80 panels at once, so errors and empty states take several seconds to surface under DuckDB-WASM
// contention. Specs on it get a 20s assertion timeout instead of the 5s default; a healthy run still finishes as soon as
// the state appears. (`expect.configure(...)` returns a NEW expect: calling it and dropping the result does nothing.)
export const expect = baseExpect.configure({ timeout: 20_000 })

const here = dirname(fileURLToPath(import.meta.url))
const TEST_TAB_FILE = 'dashboard-8-test.yaml'
const TEST_TAB_YAML = readFileSync(join(here, '..', 'fixtures', 'test-tab', TEST_TAB_FILE), 'utf-8')

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/demo-dashboard-config/index.json', async (route) => {
      const res = await route.fetch()
      const json = await res.json()
      if (!json.dashboards.includes(TEST_TAB_FILE)) json.dashboards = [...json.dashboards, TEST_TAB_FILE]
      await route.fulfill({ response: res, json })
    })
    await page.route(`**/demo-dashboard-config/${TEST_TAB_FILE}`, (route) =>
      route.fulfill({ contentType: 'text/yaml', body: TEST_TAB_YAML }),
    )
    await use(page)
  },
})
