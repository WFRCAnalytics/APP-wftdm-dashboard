import { test, expect, type Page } from '@playwright/test'

// 065-chart-builder: the Explore builder's Data tab on the real demo data (project `real`, three ActivitySim runs).
async function openExplore(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/observed|metric catalog|GL Driver|WebGL|AbortError|aborted a request|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name: 'Explore' }).first().click()
  await expect(page.getByTestId('explore-builder')).toBeVisible({ timeout: 30_000 })
}

test('Explore opens the builder, previews a table and summarises a column', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  // the type filter lists only the types present, with counts
  await expect(page.locator('.xb .psearch .pill').first()).toContainText('All')
  // a column row gets a summary line
  await expect(page.locator('.xb .prow2 .pm').first()).not.toHaveText(/^\s*$/, { timeout: 30_000 })
  // the selected column shows summary statistics
  await expect(page.locator('.xb .det .st').first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'test-results/explore-data-tab.png' })
  expect(errors).toEqual([])
})

test('the SQL tab shows the builder query and Run works', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('tab', { name: 'SQL', exact: true }).click()
  await expect(page.locator('.xb .edc pre')).toContainText('SELECT')
  await page.getByRole('button', { name: 'Run query' }).click()
  await expect(page.locator('.xb .runmsg')).toContainText('rows', { timeout: 30_000 })
  expect(errors).toEqual([])
})

test('a refused statement is explained and not run', async ({ page }) => {
  const errors: string[] = []
  await openExplore(page, errors)
  await expect(page.locator('.xb .tbl tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('tab', { name: 'SQL', exact: true }).click()
  await page.getByLabel('SQL query').fill('DROP TABLE x')
  await expect(page.getByText('This statement is not allowed')).toBeVisible({ timeout: 15_000 })
  expect(errors).toEqual([])
})
