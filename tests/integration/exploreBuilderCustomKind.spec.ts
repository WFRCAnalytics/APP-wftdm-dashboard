import { test, expect } from '@playwright/test'

// 065-chart-builder: `kind: custom` draws a chart from a spec written in dashboard YAML. The tab is injected through the
// dashboard index (the same technique the Test tab uses), against the real demo runs.
const FILE = 'dashboard-9-custom.yaml'
const YAML = (spec: string) => `
header:
  tab: Custom
  title: Custom charts
layout:
  row_custom:
    - type: chart
      kind: custom
      title: Auto access by scenario
      height: 360
      width: 1.0
      spec:
${spec}
`

async function open(page: import('@playwright/test').Page, spec: string) {
  await page.route('**/demo-dashboard-config/index.json', async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    if (!json.dashboards.includes(FILE)) json.dashboards = [...json.dashboards, FILE]
    await route.fulfill({ response: res, json })
  })
  await page.route(`**/demo-dashboard-config/${FILE}`, (route) => route.fulfill({ contentType: 'text/yaml', body: YAML(spec) }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Custom' }).first().click()
}

test('a custom chart in YAML draws from DuckDB with the tile chrome', async ({ page }) => {
  await open(page, `        data: { table: accessibility_summary }
        mark: bar
        encoding:
          x: { field: scenario }
          y: { field: auPkTotal, aggregate: sum }
          color: { field: scenario }`)
  const chart = page.locator('[data-chart-kind="custom"]')
  await expect(chart.locator('svg [data-t]').first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'test-results/custom-kind.png' })
})

test('a mistake in the spec is explained inside the tile', async ({ page }) => {
  await open(page, `        data: { table: accessibility_summary }
        mark: bar
        encoding:
          x: { field: nope }
          y: { field: auPkTotal }`)
  await expect(page.locator('[data-chart-kind="custom"]')).toContainText('"nope" is not a column', { timeout: 30_000 })
})
