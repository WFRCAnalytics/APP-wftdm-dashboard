import { test, expect } from '@playwright/test'

// 063 redesign: the scenario-comparison charts on the Summary page (years-trend, rank-bars, scorecard, radar,
// calibration-table). Boots the app at `/` (the demo dashboard opens on Summary with Compare on).
// Data-loading console errors from unrelated demo files are not asserted; chart draw failures and page errors are.

test.describe('scenario comparison charts', () => {
  test('draw, hover, sort and switch year without errors', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error' && /ChartPanel|drawing "/.test(m.text())) problems.push(m.text())
    })
    await page.goto('/')
    const trend = page.locator('[data-chart-kind="years-trend"]').first()
    await expect(trend.locator('svg').first()).toBeVisible({ timeout: 60_000 })

    // years-trend: hover shows the shared tooltip
    await trend.scrollIntoViewIfNeeded()
    await expect(trend.locator('svg circle').first()).toBeVisible()
    const box = (await trend.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5)
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 })
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')
    await expect(page.locator('.wf-tip')).toContainText('Click to switch the dashboard to')
    await page.mouse.move(2, 2)

    // rank-bars: a bar and its tooltip
    const rank = page.locator('[data-chart-kind="rank-bars"]').first()
    await expect(rank.locator('svg rect[data-wf]').first()).toBeVisible()
    await rank.locator('svg rect[data-wf]').first().hover()
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')

    // scorecard: sort by a header with the mouse and with Enter
    const card = page.locator('[data-chart-kind="scorecard"]').first()
    const th = card.locator('th[data-s="2"]')
    await expect(th).toHaveAttribute('aria-sort', 'none')
    await th.click()
    await expect(card.locator('th[data-s="2"]')).toHaveAttribute('aria-sort', 'descending')
    await card.locator('th[data-s="2"]').press('Enter')
    await expect(card.locator('th[data-s="2"]')).toHaveAttribute('aria-sort', 'ascending')

    // radar: an axis hit line shows the tooltip
    const axis = page.locator('[data-chart-kind="radar"] line[data-axis]').first()
    await expect(axis).toBeAttached()
    await axis.hover({ force: true })
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')

    // calibration table view
    const tile = page.locator('[data-chart-kind="radar"]').first().locator('xpath=ancestor::*[.//button[normalize-space()="Table"]][1]')
    await tile.getByRole('button', { name: 'Table', exact: true }).click()
    await expect(page.locator('[data-chart-kind="calibration-table"] table')).toBeVisible()

    // clicking a milestone switches the year
    await trend.scrollIntoViewIfNeeded()
    const b2 = (await trend.boundingBox())!
    await page.mouse.click(b2.x + 70, b2.y + b2.height / 2)
    await expect(page.locator('select').first()).toHaveValue('2023')

    expect(problems).toEqual([])
  })
})
