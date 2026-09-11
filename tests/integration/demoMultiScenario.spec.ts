import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 038-all-loaded-scenarios — User Story 3 (SC-002/SC-003): the real demo
// content reads as a multi-scenario comparison on every panel whose chart
// type supports it, and the Scenarios-tab Switch controls all of them at
// once. Dual-theme verified for the chart panels (standing project
// requirement for a single-series -> multi-series change).
//
// Isolation is done ENTIRELY with per-page `page.route()` — no on-disk
// mutation, so no `_sharedFixtureLock` and no leak window (038 made
// auto-activated demo scenarios leak into every concurrently-running
// spec that asserts an exact scenario set; routing removes that at the
// root). `tests/global-setup.js` blanks the two demo index.json files to
// `[]` for the whole suite; boot() serves the real content back to THIS
// page only, and 404s the fixture discovery endpoints so the app
// registers only the three real demo scenarios — exactly a real demo
// deployment (empty public/observed + public/scenarios; `observed`
// registers `failed`).

// 040-test-suite-migration: the real committed index.json now has an 8th
// permanent entry (dashboard-8-test.yaml). This spec routes its own
// 7-entry index — its subject is the multi-scenario demo content, not
// the shipped index — so the test tab is intentionally excluded here.
const REAL_DEMO_DASHBOARD_INDEX = {
  dashboards: [
    'dashboard-1-summary.yaml',
    'dashboard-2-person-household.yaml',
    'dashboard-3-tour-models.yaml',
    'dashboard-4-mode-choice.yaml',
    'dashboard-5-trip-models.yaml',
    'dashboard-6-network.yaml',
    'dashboard-7-explore.yaml',
  ],
}
const REAL_DEMO_SCENARIOS_INDEX = [
  'activitysim-baseline',
  'activitysim-density-variant',
  'activitysim-transit-variant',
]

async function boot(page: Page) {
  // Serve the real demo indexes to this page only (global-setup blanked
  // the on-disk files).
  await page.route('**/demo-dashboard-config/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_DASHBOARD_INDEX) }),
  )
  await page.route('**/demo-scenarios/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_SCENARIOS_INDEX) }),
  )
  // Suppress the fixture content roots — this spec is about the real demo
  // deployment shape.
  await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/scenarios/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/dashboard-config/index.json', (r) => r.fulfill({ status: 404, body: '' }))

  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () =>
      window.__wftdm!.appState.get('activitysim-baseline')?.status === 'ready' &&
      window.__wftdm!.appState.get('activitysim-transit-variant')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function gotoTab(page: Page, name: string) {
  await page.getByRole('tablist').getByRole('tab', { name, exact: true }).click()
}

async function openScenariosTab(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Scenarios' }).click()
}

function switchFor(page: Page, name: string) {
  return page.getByTestId(`scenario-row-${name}`).getByRole('switch')
}

test.describe('038 US3 — the demo reads as a multi-scenario comparison', () => {
  test('every ready demo scenario is auto-active; no fixture scenario is present', async ({
    page,
  }) => {
    await boot(page)
    const active = await page.evaluate(() =>
      window
        .__wftdm!.appState.list()
        .filter((s) => s.active)
        .map((s) => s.name)
        .sort(),
    )
    expect(active).toEqual([
      'activitysim-baseline',
      'activitysim-density-variant',
      'activitysim-transit-variant',
    ])
    // observed registered but failed (routed 404) -> not active, poisons nothing.
    expect(await page.evaluate(() => window.__wftdm!.appState.get('observed')?.status)).toBe('failed')
  })

  test('an unpinned table shows a scenario column with all three runs (Network tab)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTab(page, 'Network')
    const card = panelCard(page, 'Accessibility by Zone')
    await expect(card).toBeVisible()
    // The $scenario union adds a `scenario` discriminator column.
    await expect(card.getByRole('columnheader', { name: 'scenario' })).toBeVisible()
    const scenarioCells = await card.locator('tbody tr td').filter({ hasText: /activitysim-/ }).allInnerTexts()
    expect(new Set(scenarioCells)).toEqual(
      new Set([
        'activitysim-baseline',
        'activitysim-density-variant',
        'activitysim-transit-variant',
      ]),
    )
  })

  for (const dark of [false, true]) {
    test(`unpinned plotly / recharts / observable-plot each render three per-scenario series, theme-correct (${dark ? 'dark' : 'light'})`, async ({
      page,
    }) => {
      await boot(page)
      await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)

      // --- recharts: "Total Trips by Mode" (series: scenario), Summary tab ---
      const rc = panelCard(page, 'Total Trips by Mode')
      await expect(rc).toBeVisible()
      for (const s of REAL_DEMO_SCENARIOS_INDEX) {
        await expect(rc.getByText(s, { exact: true })).toBeVisible()
      }
      // Bars actually render, in a resolved (non-transparent) fill.
      const rcBarFill = await rc
        .locator('path.recharts-rectangle, .recharts-bar-rectangle path')
        .first()
        .evaluate((el) => getComputedStyle(el as Element).fill)
      expect(rcBarFill).not.toBe('none')
      expect(rcBarFill).not.toBe('rgba(0, 0, 0, 0)')

      // --- plotly: "Average Trip Distance by Purpose" (name: $scenario) ---
      const pl = panelCard(page, 'Average Trip Distance by Purpose')
      await expect(pl).toBeVisible()
      for (const s of REAL_DEMO_SCENARIOS_INDEX) {
        await expect(pl.locator('.legend').getByText(s, { exact: true })).toBeVisible()
      }
      // Three distinct trace fill colours (one per scenario).
      const traceFills = await pl
        .locator('.legend .traces path')
        .evaluateAll((els) => els.map((e) => getComputedStyle(e).fill))
      expect(new Set(traceFills.filter(Boolean)).size).toBeGreaterThanOrEqual(3)

      // --- observable-plot: "Workplace Location Distance Distribution" (fill: scenario) ---
      await gotoTab(page, 'Person & Households')
      const op = panelCard(page, 'Workplace Location Distance Distribution')
      await expect(op).toBeVisible()
      // Observable Plot renders a swatch/legend label per fill value.
      for (const s of REAL_DEMO_SCENARIOS_INDEX) {
        await expect(op.getByText(s, { exact: true }).first()).toBeVisible()
      }
    })
  }

  test('toggling one scenario off drops it from unpinned panels on two different tabs; pinned panels unaffected', async ({
    page,
  }) => {
    await boot(page)

    // Tab A: Summary — recharts "Total Trips by Mode".
    const rc = panelCard(page, 'Total Trips by Mode')
    await expect(rc.getByText('activitysim-transit-variant', { exact: true })).toBeVisible()
    // A pinned KPI on the same tab — its value must survive the toggle
    // unchanged (pinned to activitysim-baseline, FR-006). Read the value
    // node specifically, not the whole card.
    const kpiValue = panelCard(page, 'Households').locator('.tabular-nums').first()
    const kpiBefore = (await kpiValue.textContent())?.trim()
    expect(kpiBefore).toMatch(/\d/)

    // Tab B: Network — unpinned table "Land Use / Socioeconomics by Zone".
    await gotoTab(page, 'Network')
    const lu = panelCard(page, 'Land Use / Socioeconomics by Zone')
    await expect(lu.locator('tbody tr td').filter({ hasText: 'activitysim-transit-variant' }).first()).toBeVisible()
    // A pinned map on the same tab.
    const flowmapCard = panelCard(page, 'Trip Distribution Desire Lines')
    await expect(flowmapCard).toBeVisible()

    // Flip transit-variant OFF.
    await openScenariosTab(page)
    await switchFor(page, 'activitysim-transit-variant').click()
    await expect(switchFor(page, 'activitysim-transit-variant')).not.toBeChecked()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // Gone from both tabs' unpinned panels.
    await expect(lu.locator('tbody tr td').filter({ hasText: 'activitysim-transit-variant' })).toHaveCount(0)
    await gotoTab(page, 'Summary')
    await expect(rc.getByText('activitysim-transit-variant', { exact: true })).toHaveCount(0)
    // Pinned KPI unchanged — same value it had before the toggle.
    await expect
      .poll(async () => (await panelCard(page, 'Households').locator('.tabular-nums').first().textContent())?.trim())
      .toBe(kpiBefore)

    // Flip back on — restored everywhere.
    await openScenariosTab(page)
    await switchFor(page, 'activitysim-transit-variant').click()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await expect(rc.getByText('activitysim-transit-variant', { exact: true })).toBeVisible()
  })
})
