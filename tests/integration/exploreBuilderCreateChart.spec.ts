import { test, expect } from '@playwright/test'

// 065-chart-builder: with no chart tab the button reads "Create chart"; once one exists it reads "Add chart".
test('the chart button says Create chart until a chart exists, then Add chart', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Explore' }).first().click()
  await expect(page.getByTestId('explore-builder')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('tab', { name: 'Chart 1' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Create chart' }).click()
  await expect(page.getByRole('tab', { name: 'Chart 1' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'Add chart' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create chart' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close tab Chart 1' }).click()
  await expect(page.getByRole('button', { name: 'Create chart' })).toBeVisible()
  expect(errors).toEqual([])
})
