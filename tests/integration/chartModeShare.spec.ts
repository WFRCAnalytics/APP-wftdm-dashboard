import { test, expect, type Page } from '@playwright/test'

// 063 redesign: the mode-share family on the Summary page ("Mode share" tile: bars, gap, 100% bars, slope, donut, table,
// and the "Trips by purpose and mode" 100% bars view). Chart draw failures and page errors are asserted, not
// data-loading noise from unrelated demo files.

function watch(page: Page): string[] {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && /ChartPanel|drawing "/.test(m.text())) problems.push(m.text())
  })
  return problems
}

const tile = (page: Page, title: string) => page.locator('div[class*="rounded-[24px]"]').filter({ hasText: title }).first()

async function hover(page: Page, region: ReturnType<Page['locator']>, fx: number, fy: number) {
  await region.scrollIntoViewIfNeeded()
  const box = (await region.boundingBox())!
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy)
  await page.mouse.move(box.x + box.width * fx + 2, box.y + box.height * fy + 1, { steps: 2 })
}

test.describe('mode share charts', () => {
  test.setTimeout(150_000)
  test('bars, gap, 100% bars, slope, donut and table draw; hovers show the shared tooltip', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    const t = tile(page, 'Mode share')
    const chart = t.locator('[data-chart-kind="mode-bars"] svg').first()
    await expect(chart).toBeVisible({ timeout: 60_000 })

    await hover(page, chart, 0.07, 0.85)
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')
    await expect(page.locator('.wf-tip')).toContainText('share of trips')

    const view = t.getByRole('group', { name: 'View' })
    await view.getByText('Gap', { exact: true }).click()
    const gap = t.locator('[data-chart-kind="gap-dots"] svg').first()
    await expect(gap).toBeVisible()
    await expect(t.locator('[data-chart-kind="gap-dots"] svg circle').first()).toBeVisible()

    await view.getByText('100% bars', { exact: true }).click()
    const stack = t.locator('[data-chart-kind="stacked-bars"] svg').first()
    await expect(stack).toBeVisible()
    await stack.locator('g[data-key] rect').first().hover()
    await expect(page.locator('.wf-tip')).toHaveCSS('opacity', '1')
    await expect(page.locator('.wf-tip')).toContainText('Share')

    await view.getByText('Slope', { exact: true }).click()
    await expect(t.locator('[data-chart-kind="slope"] svg').first()).toBeVisible()

    await view.getByText('Donut', { exact: true }).click()
    await expect(t.locator('[data-chart-kind="donut"] svg path').first()).toBeVisible()

    await view.getByText('Table', { exact: true }).click()
    await expect(t.locator('[data-chart-kind="mode-table"] table')).toBeVisible()
    await expect(t.locator('[data-chart-kind="mode-table"] tbody tr')).toHaveCount(6)

    expect(problems).toEqual([])
  })

  test('Summary "Trips by purpose and mode" 100% bars view draws five rows', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    const t = tile(page, 'Trips by purpose and mode')
    await t.scrollIntoViewIfNeeded()
    await t.getByRole('group', { name: 'View' }).getByText('100% bars', { exact: true }).click()
    const svg = t.locator('[data-chart-kind="stacked-bars"] svg').first()
    await expect(svg).toBeVisible({ timeout: 60_000 })
    await expect(svg.locator('text', { hasText: 'Non-home' })).toBeVisible()
    expect(problems).toEqual([])
  })
})
