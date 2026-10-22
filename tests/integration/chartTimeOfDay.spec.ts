import { test, expect, type Page } from '@playwright/test'

// 063 redesign: "Trips through the day" (time-lines, time-stream, time-heat on the Summary page) and "Average speed by
// hour" (speed-heat on the Network page). Boots at `/` (demo dashboard, Summary, Compare on). Data-loading console errors
// from unrelated demo files are not asserted; chart draw failures and page errors are.

function watch(page: Page): string[] {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && /ChartPanel|drawing "/.test(m.text())) problems.push(m.text())
  })
  return problems
}

const tile = (page: Page, title: string) => page.locator('div[class*="rounded-[24px]"]').filter({ hasText: title }).first()

async function sweep(page: Page, region: ReturnType<Page['locator']>, y = 0.5) {
  await region.scrollIntoViewIfNeeded()
  const box = (await region.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * y)
  for (const fx of [0.4, 0.5, 0.6]) await page.mouse.move(box.x + box.width * fx, box.y + box.height * y, { steps: 3 })
}

test.describe('trips through the day and speed charts', () => {
  test.setTimeout(150_000)
  test('lines, stream and heatmap draw, hover and respond to the keyboard', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    const t = tile(page, 'Trips through the day')
    await expect(t.locator('[data-chart-kind="time-lines"] svg').first()).toBeVisible({ timeout: 60_000 })
    await t.scrollIntoViewIfNeeded()

    // Lines: the crosshair tooltip lists the scenarios and the bold reference row
    const lines = t.locator('[data-chart-kind="time-lines"] svg').first()
    await sweep(page, lines)
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')
    await expect(page.locator('.wf-tip')).toContainText('trips per hour')
    await expect(page.locator('.wf-tip')).toContainText('Reference')
    await page.mouse.move(2, 2)
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '0')

    // Keyboard: focus the chart, Right arrow shows the first hour
    await lines.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')
    await expect(page.locator('.wf-tip')).toContainText('12 AM')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.wf-tip')).toContainText('1 AM')
    await page.keyboard.press('Escape')
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '0')

    // Stream
    await t.getByRole('tab', { name: 'Stream' }).or(t.getByRole('radio', { name: 'Stream' })).or(t.getByRole('button', { name: 'Stream' })).first().click()
    const stream = t.locator('[data-chart-kind="time-stream"] svg').first()
    await expect(stream).toBeVisible()
    // The first draw may be replaced when the view's own table finishes loading: sweep again until the tooltip shows.
    await expect(async () => {
      await sweep(page, stream)
      await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1', { timeout: 1000 })
    }).toPass({ timeout: 20_000 })
    await expect(page.locator('.wf-tip')).toContainText('trips in this hour')

    // Heatmap
    await t.getByRole('tab', { name: 'Heatmap' }).or(t.getByRole('radio', { name: 'Heatmap' })).or(t.getByRole('button', { name: 'Heatmap' })).first().click()
    const cell = t.locator('[data-chart-kind="time-heat"] svg rect[data-wf]').first()
    await expect(cell).toBeVisible()
    await cell.hover()
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')
    await expect(page.locator('.wf-tip')).toContainText('Share of its trips')

    expect(problems).toEqual([])
  })

  test('speed heatmap draws side by side and shows a synced tooltip', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    await expect(page.locator('[data-chart-kind="time-lines"] svg').first()).toBeVisible({ timeout: 60_000 })
    await page.hover('[data-sidebar=sidebar]')
    await page.getByRole('tab', { name: 'Network' }).first().click()
    await page.mouse.move(900, 500)
    const t = tile(page, 'Average speed by hour')
    const cells = t.locator('[data-chart-kind="speed-heat"] svg rect[data-key]')
    await expect(cells.first()).toBeVisible({ timeout: 60_000 })
    await cells.nth(30).hover()
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')
    await expect(page.locator('.wf-tip')).toContainText('mph')
    expect(problems).toEqual([])
  })
})
