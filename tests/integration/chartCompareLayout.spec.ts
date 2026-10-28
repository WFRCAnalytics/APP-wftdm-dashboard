import { test, expect, type Locator, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Side-by-side compare picks its column count from the width the grid really has (src/panels/compareStrategy.ts
// pickColumns), and a tile's Layout control (Auto / Row / Grid) overrides it. Four zone maps on the Summary tile
// "Where transit grows" (two thirds of the page wide in compare mode).

const TILE = 'Where transit grows'

async function boot(page: Page, width: number, height = 1000) {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 60_000 })
  await page.waitForSelector('.wfz-map canvas', { timeout: 120_000 })
  // the reference plus three more: four cells, one page
  await page.evaluate(() => window.__wftdm!.compareState.toggleCompareMember('express-bus'))
  await expect(page.getByTestId('compare-cells').first()).toBeVisible({ timeout: 30_000 })
  await page.getByText(TILE, { exact: true }).first().scrollIntoViewIfNeeded()
}

const tile = (page: Page) => page.getByTestId('row_zones_flows_compare')
const cells = (scope: Locator) => scope.locator('[data-testid^="compare-cell-"]')

/** How many columns the grid really lays out, and the cell positions to prove it. */
async function layout(scope: Locator) {
  await expect(cells(scope)).toHaveCount(4, { timeout: 30_000 })
  // let a resize settle (the column count follows a ResizeObserver)
  await scope.page().waitForTimeout(400)
  return scope.locator('.wf-multi').first().evaluate((grid) => {
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
    const cellEls = [...grid.children].filter((c) => (c as HTMLElement).dataset.testid?.startsWith('compare-cell-'))
    const tops = cellEls.map((c) => Math.round(c.getBoundingClientRect().top))
    const widths = cellEls.map((c) => Math.round(c.getBoundingClientRect().width))
    return { columns, rows: new Set(tops).size, minWidth: Math.min(...widths) }
  })
}

test.describe('compare layout', () => {
  test.setTimeout(240_000)

  test('a desktop tile with room for two columns is 2x2', async ({ page }) => {
    await boot(page, 1440)
    const l = await layout(tile(page))
    expect(l.columns).toBe(2)
    expect(l.rows).toBe(2)
    await page.screenshot({ path: 'test-results/compare-layout-2x2.png' })
  })

  test('the expanded dialog is wide enough for one row of four', async ({ page }) => {
    await boot(page, 1600)
    await page.getByRole('button', { name: `Expand ${TILE}` }).click()
    const dialog = page.getByRole('dialog')
    const l = await layout(dialog)
    expect(l.columns).toBe(4)
    expect(l.rows).toBe(1)
    expect(l.minWidth).toBeGreaterThanOrEqual(280)
    await page.screenshot({ path: 'test-results/compare-layout-1x4.png' })
  })

  test('a phone stacks the cells in one column', async ({ page }) => {
    await boot(page, 390, 844)
    const l = await layout(tile(page))
    expect(l.columns).toBe(1)
    expect(l.rows).toBe(4)
  })

  test('the Layout control overrides Auto: Row gives four columns, Grid two, Auto goes back', async ({ page }) => {
    await boot(page, 1800)
    const t = tile(page)
    const auto = await layout(t)
    expect(auto.columns).toBe(2)

    await t.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Row', exact: true }).click()
    expect((await layout(t)).columns).toBe(4)

    await t.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Grid', exact: true }).click()
    expect((await layout(t)).columns).toBe(2)

    await t.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Auto', exact: true }).click()
    expect((await layout(t)).columns).toBe(2)
  })

  test('the Layout control is hidden with fewer than three scenarios', async ({ page }) => {
    await boot(page, 1440)
    await expect(tile(page).getByRole('group', { name: 'Layout' })).toHaveCount(1)
    // drop scenarios from the compare set (never the reference cell, which is first) until two cells are left
    for (const n of [3, 2]) {
      await page.evaluate(() => {
        const last = [...document.querySelectorAll('[data-testid="row_zones_flows_compare"] [data-testid^="compare-cell-"]')].pop()!
        const run = (last as HTMLElement).dataset.s!
        const cs = window.__wftdm!.compareState
        const alt = window.__wftdm!.appState.list().find((s) => s.name === run)
        cs.setScenarioGroupActive(alt?.scenarioGroup ?? run, false)
      })
      await expect(cells(tile(page))).toHaveCount(n, { timeout: 30_000 })
    }
    await expect(tile(page).getByRole('group', { name: 'Layout' })).toHaveCount(0)
  })
})
