import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser coverage for ValueBoxPanelConfig's new gauge: {min, max}
// mode — a real demo panel (Summary tab, "Total VMT") plus three real
// Test-tab fixtures proving each status color resolves correctly. Same
// boot()/route pattern as demoContentAllPanels.spec.ts/
// observablePlotMarkVariety.spec.ts/rechartsComboChart.spec.ts — serves
// the real demo indexes without mutating on-disk fixture files.

const REAL_DEMO_DASHBOARD_INDEX = {
  dashboards: [
    'dashboard-1-summary.yaml',
    'dashboard-2-person-household.yaml',
    'dashboard-3-tour-models.yaml',
    'dashboard-4-mode-choice.yaml',
    'dashboard-5-trip-models.yaml',
    'dashboard-6-network.yaml',
    'dashboard-7-explore.yaml',
    'dashboard-8-test.yaml',
  ],
  title: 'WFRC TDM Calibration Dashboard',
}
const REAL_DEMO_SCENARIOS_INDEX = [
  'activitysim-baseline',
  'activitysim-density-variant',
  'activitysim-transit-variant',
]

async function boot(page: Page) {
  await page.route('**/demo-dashboard-config/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_DASHBOARD_INDEX) }),
  )
  await page.route('**/demo-scenarios/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_SCENARIOS_INDEX) }),
  )
  await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/scenarios/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/dashboard-config/index.json', (r) => r.fulfill({ status: 404, body: '' }))

  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('activitysim-baseline')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

function gaugeSvg(page: Page, title: string) {
  return panelCard(page, title).locator('svg[role="img"][data-gauge-status]')
}

test.describe('gauge: {min, max} (Summary tab, "Total VMT")', () => {
  test('renders a real radial gauge with a genuine status and a target tick — no error state', async ({
    page,
  }) => {
    await boot(page)
    const svg = gaugeSvg(page, 'Total VMT')
    await expect(svg).toBeVisible({ timeout: 20_000 })

    // Real baseline total_vmt (~15,212 mi, confirmed live) is within
    // ±500 of this panel's own configured observed: 15000 — a genuine
    // 'normal' (in-tolerance) status, not a fabricated/forced one.
    await expect(svg).toHaveAttribute('data-gauge-status', 'normal')
    await expect(svg.locator('[data-gauge-target]')).toHaveCount(1)

    const paths = svg.locator('path')
    await expect(paths).toHaveCount(2) // track + value arc
  })

  test('min/max end labels render formatted with the panel\'s own format string', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Total VMT')
    await expect(gaugeSvg(page, 'Total VMT')).toBeVisible({ timeout: 20_000 })
    await expect(card.getByText('0 mi', { exact: true })).toBeVisible()
    await expect(card.getByText('20,000 mi', { exact: true })).toBeVisible()
  })

  test('the primary number stays visible and accessible independent of the gauge — the gauge never replaces it', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Total VMT')
    await expect(gaugeSvg(page, 'Total VMT')).toBeVisible({ timeout: 20_000 })
    await expect(card.getByText('15,212 mi', { exact: true })).toBeVisible()
  })

  test('renders correctly in both light and dark theme', async ({ page }) => {
    await boot(page)
    const svg = gaugeSvg(page, 'Total VMT')
    await expect(svg).toBeVisible({ timeout: 20_000 })
    const lightFill = await svg.locator('path').nth(1).getAttribute('fill')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(svg).toBeVisible()
    // Same CSS-variable reference either way (var(--success)) — the
    // token itself resolves differently per theme through the ordinary
    // cascade, not a re-render of this component.
    const darkFill = await svg.locator('path').nth(1).getAttribute('fill')
    expect(darkFill).toBe(lightFill)
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
  })
})

test.describe('gauge status colors (Test tab)', () => {
  test('no observed target configured → always "normal"', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const svg = gaugeSvg(page, 'Gauge — Normal (no target configured)')
    await expect(svg).toBeVisible({ timeout: 20_000 })
    await expect(svg).toHaveAttribute('data-gauge-status', 'normal')
    // No `observed` configured on this fixture — no target tick either.
    await expect(svg.locator('[data-gauge-target]')).toHaveCount(0)
  })

  test('a real total_trips value far past threshold_warn (but under threshold_fail) → "warn"', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const svg = gaugeSvg(page, 'Gauge — Warn')
    await expect(svg).toBeVisible({ timeout: 20_000 })
    await expect(svg).toHaveAttribute('data-gauge-status', 'warn')
  })

  test('a real total_trips value past threshold_fail → "fail"', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    const svg = gaugeSvg(page, 'Gauge — Fail')
    await expect(svg).toBeVisible({ timeout: 20_000 })
    await expect(svg).toHaveAttribute('data-gauge-status', 'fail')
  })
})
