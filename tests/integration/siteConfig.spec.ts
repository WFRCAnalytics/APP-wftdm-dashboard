import { expect, test } from '@playwright/test'

import { patchDemoConfig, routeDeploymentConfig, routeDemoConfig } from './_siteConfig'

// 066: the site settings come from dashboard-config.yaml (the deployment's own root, then the demo's), not index.json.

test.describe('site configuration from dashboard-config.yaml', () => {
  test('the demo renders its title, logo and pages from the file', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.dashboard-brand-logo')).toBeVisible({ timeout: 30_000 })
    expect(await page.title()).toBe('WFRC TDM Calibration Dashboard')
    const first = await page.getByRole('tab').first().textContent()
    expect((first ?? '').trim().length).toBeGreaterThan(0)
  })

  test('a config with only a title leaves every other setting at its default', async ({ page }) => {
    await routeDemoConfig(page, { title: 'Only a title', pages: ['dashboard-1-summary.yaml'] })
    await page.goto('/')
    await expect.poll(() => page.title(), { timeout: 30_000 }).toBe('Only a title')
    await expect(page.getByRole('tab')).toHaveCount(1)
    await expect(page.locator('.dashboard-brand-logo')).toHaveCount(0)
  })

  test('the deployment root wins per setting, and the demo is the fallback', async ({ page }) => {
    await routeDeploymentConfig(page, { title: 'Deployment title' })
    await page.goto('/')
    await expect.poll(() => page.title(), { timeout: 30_000 }).toBe('Deployment title')
    // not set by the deployment, so the demo's logo still shows
    await expect(page.locator('.dashboard-brand-logo')).toBeVisible()
  })

  test('with no dashboard-config.yaml anywhere the app still loads, on neutral defaults', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await routeDeploymentConfig(page, null)
    await page.route('**/demo-dashboard-config/dashboard-config.yaml', (route) => route.fulfill({ status: 404, body: '' }))
    await page.goto('/')
    await page.waitForFunction(() => window.document.readyState === 'complete')
    await page.waitForTimeout(3000)
    expect(await page.title()).toBe('Calibration Dashboard')
    await expect(page.locator('.dashboard-brand-logo')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('a setting patched on the demo file reaches the app', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.title = 'Patched'
    })
    await page.goto('/')
    await expect.poll(() => page.title(), { timeout: 30_000 }).toBe('Patched')
  })
})
