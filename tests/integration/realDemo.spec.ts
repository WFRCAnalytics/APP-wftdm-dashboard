import { test, expect, type Page } from '@playwright/test'

// The default demo content: the three real ActivitySim example runs on the redesigned pages (single model year, no
// observed or calibration data). Runs on its own dev server (see playwright.config.js, project `real`).

async function boot(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/observed|metric catalog|GL Driver|WebGL|AbortError|aborted a request/.test(m.text())) errors.push(m.text())
  })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

// pages are tabbed by default (layout.mode in the deployment's index.json): choose a tab of the page
const pageTab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Page sections' }).getByRole('tab', { name, exact: true })

test.describe('real demo data on the redesigned pages', () => {
  test('the Summary hero shows the real totals and the charts draw from the real tables', async ({ page }) => {
    const errors: string[] = []
    await boot(page, errors)
    await expect(page.getByText('23,583', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('5,000', { exact: true })).toBeVisible()
    // one year, no observed data: no Year control
    await expect(page.getByTestId('control-year')).toHaveCount(0)

    // the scorecard (Compare is on with three runs) lists the three scenarios
    await expect(page.locator('[data-chart-kind="scorecard"]').getByText('ActivitySim: TAZ 1 Density +40%')).toBeVisible({ timeout: 30_000 })

    // mode share bars use the deployment's own vocabulary (SOV -> Drive alone, Non-Motorized -> Walk and bike)
    await pageTab(page, 'Mode choice').click()
    const chart = page.locator('[data-chart-kind="mode-bars"] svg').first()
    await expect(chart).toBeVisible({ timeout: 30_000 })
    await expect(chart).toContainText('Walk and bike')
    await expect(chart).toContainText('Ride hail')
    expect(errors).toEqual([])
  })

  test('hover shows the shared tooltip, and the time-of-day chart reads in plain counts', async ({ page }) => {
    const errors: string[] = []
    await boot(page, errors)
    await pageTab(page, 'Mode choice').click()
    const bars = page.locator('[data-chart-kind="mode-bars"] [data-wf]')
    await expect(bars.first()).toBeVisible({ timeout: 30_000 })
    // the tallest bar (the small ones are a few pixels high)
    const heights = await bars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    const bar = bars.nth(heights.indexOf(Math.max(...heights)))
    await bar.scrollIntoViewIfNeeded()
    await bar.hover({ force: true })
    await expect
      .poll(() => page.evaluate(() => { const t = document.querySelector('.wf-tip'); return t ? Number(getComputedStyle(t).opacity) : 0 }))
      .toBe(1)
    await pageTab(page, 'Time of day').click()
    await expect(page.locator('[data-chart-kind="time-lines"] svg')).toContainText('2000', { timeout: 30_000 })
  })

  test('the other pages draw: pyramid, waffle and the Sankey purpose to mode flow', async ({ page }) => {
    const errors: string[] = []
    await boot(page, errors)
    await page.hover('[data-sidebar=sidebar]')
    await page.getByRole('tab', { name: 'Person and household' }).click()
    await expect(page.locator('[data-chart-kind="pyramid"] svg')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-chart-kind="waffle"]').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Mode choice' }).click()
    await pageTab(page, 'Purpose to mode').click()
    await expect(page.locator('[data-chart-kind="sankey"] svg path').first()).toBeVisible({ timeout: 30_000 })
    expect(errors).toEqual([])
  })
})
