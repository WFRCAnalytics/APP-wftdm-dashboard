import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 063 redesign P3: the Year select in the control bar re-resolves every tile's runs to the chosen model year, hides
// Observed and rounds outside the base year, and is absent for a single-year deployment. Uses the demo content
// (three ActivitySim alternatives, each with a 2023 run and a clearly marked synthetic 2036 run) and the same
// per-page page.route() isolation as demoMultiScenario.spec.ts, so nothing on disk is touched.

const BASES = ['activitysim-baseline', 'activitysim-density-variant', 'activitysim-transit-variant']
const ALL_RUNS = [...BASES, ...BASES.map((n) => `${n}-2036`)]
const DASHBOARD_INDEX = {
  dashboards: ['dashboard-6-network.yaml'],
  years: [
    { year: 2023, label: 'Base year' },
    { year: 2036, label: 'End of RTP Phase I' },
  ],
  baseYear: 2023,
  defaultYear: 2023,
}

async function boot(page: Page, runs: string[], index: object = DASHBOARD_INDEX) {
  await page.route('**/demo-dashboard-config/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(index) }),
  )
  await page.route('**/demo-scenarios/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(runs) }),
  )
  await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/scenarios/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/dashboard-config/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    (names) => names.every((n) => window.__wftdm!.appState.get(n)?.status === 'ready'),
    runs,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function chooseYear(page: Page, label: RegExp) {
  // the year control is a native select
  const select = page.getByTestId('control-year')
  const value = await select.locator('option').evaluateAll(
    (opts, source) => opts.find((o) => new RegExp(source).test(o.textContent ?? ''))?.getAttribute('value') ?? '',
    label.source,
  )
  await select.selectOption(value)
}

async function scenarioCells(page: Page) {
  const card = panelCard(page, 'Accessibility by Zone')
  await expect(card.getByRole('columnheader', { name: 'scenario' })).toBeVisible({ timeout: 20_000 })
  const cells = await card.locator('tbody tr td').filter({ hasText: /activitysim-/ }).allInnerTexts()
  return new Set(cells)
}

test.describe('063 P3 — model years', () => {
  test('the control bar shows Year and Focus, defaulting to the base year and the baseline', async ({ page }) => {
    await boot(page, ALL_RUNS)
    await expect(page.getByTestId('control-year')).toHaveValue('2023')
    await expect(page.getByTestId('control-focus')).toHaveValue('activitysim-baseline')
    const state = await page.evaluate(() => window.__wftdm!.compareState.getState())
    expect(state).toMatchObject({ year: 2023, focus: 'activitysim-baseline', compare: true })
  })

  test('the Year select lists every configured year with its label', async ({ page }) => {
    await boot(page, ALL_RUNS)
    await expect(page.getByTestId('control-year').locator('option')).toHaveText(['2023 · Base year', '2036 · End of RTP Phase I'])
  })

  test('changing the year re-queries the tiles for that year', async ({ page }) => {
    await boot(page, ALL_RUNS)
    await page.getByRole('tablist').getByRole('tab', { name: 'Network', exact: true }).click()
    expect(await scenarioCells(page)).toEqual(new Set(BASES))

    await chooseYear(page, /2036/)
    await expect.poll(async () => [...(await scenarioCells(page))].sort(), { timeout: 20_000 }).toEqual(
      BASES.map((n) => `${n}-2036`).sort(),
    )

    await chooseYear(page, /2023/)
    await expect.poll(async () => [...(await scenarioCells(page))].sort(), { timeout: 20_000 }).toEqual([...BASES].sort())
  })

  test('the Scenarios tab lists the runs of the selected year only', async ({ page }) => {
    await boot(page, ALL_RUNS)
    await chooseYear(page, /2036/)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Scenarios' }).click()
    for (const n of BASES) {
      await expect(page.getByTestId(`scenario-row-${n}-2036`)).toBeVisible()
      await expect(page.getByTestId(`scenario-row-${n}`)).toHaveCount(0)
    }
  })

  test('the baseline resolves to its run in the selected year', async ({ page }) => {
    await boot(page, ALL_RUNS)
    await chooseYear(page, /2036/)
    const view = await page.evaluate(() => window.__wftdm!.compareState.getState().year)
    expect(view).toBe(2036)
    const baseline = await page.evaluate(() => window.__wftdm!.appState.getBaseline())
    expect(baseline).toBe('activitysim-baseline')
  })

  test('a single-year deployment has no Year control', async ({ page }) => {
    await boot(page, BASES, { dashboards: ['dashboard-6-network.yaml'] })
    await expect(page.getByTestId('control-year')).toHaveCount(0)
    await expect(page.getByTestId('control-focus')).toBeVisible()
  })
})
