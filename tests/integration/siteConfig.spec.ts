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

// US2: a mistake is reported (one visible note, the console) and never stops the app.
test.describe('problems are reported, never fatal', () => {
  const note = (page: import('@playwright/test').Page) => page.getByTestId('config-notice')
  const paths = (page: import('@playwright/test').Page) => note(page).locator('[data-problem-path]').evaluateAll((els) => els.map((e) => e.getAttribute('data-problem-path')))

  test('an unknown key, a wrong type and an invalid colour are listed; the rest still applies', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))
    await patchDemoConfig(page, (c) => {
      c.titel = 'x'
      c.years = { base: 'abc' }
      c.colors = { primary: '#12' }
      c.title = 'Still applied'
    })
    await page.goto('/')
    await expect(note(page)).toBeVisible({ timeout: 30_000 })
    expect((await paths(page)).sort()).toEqual(['colors.primary', 'titel', 'years.base'])
    expect(await page.title()).toBe('Still applied')
    expect(warnings.some((w) => w.includes('titel'))).toBe(true)
  })

  test('a site-only key set on a page is listed and the page still loads', async ({ page }) => {
    await page.route('**/demo-dashboard-config/dashboard-1-summary.yaml', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, body: `title: nope
${await res.text()}` })
    })
    await page.goto('/')
    await expect(note(page)).toBeVisible({ timeout: 30_000 })
    expect(await paths(page)).toEqual(['title'])
    await expect(page.getByRole('tab').first()).toBeVisible()
  })

  test('invalid YAML is reported with its line and the app loads on defaults', async ({ page }) => {
    await page.route('**/demo-dashboard-config/dashboard-config.yaml', (route) => route.fulfill({ contentType: 'text/yaml', body: 'title: [unclosed' }))
    await page.goto('/')
    await expect(note(page)).toContainText('invalid YAML', { timeout: 30_000 })
    await expect(note(page)).toContainText('line')
  })

  test('a missing file is noted; a leftover index.json is noted as moved', async ({ page }) => {
    await routeDeploymentConfig(page, null)
    await page.route('**/demo-dashboard-config/dashboard-config.yaml', (route) => route.fulfill({ status: 404, body: '' }))
    await page.goto('/')
    await expect(note(page)).toContainText('no site configuration was found', { timeout: 30_000 })

    const moved = await page.context().newPage()
    await routeDeploymentConfig(moved, null)
    await moved.route('**/dashboard-config/index.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ title: 'Old', dashboards: ['a.yaml'] }) }))
    await moved.goto('/')
    await expect(moved.getByTestId('config-notice')).toContainText('now live in dashboard-config.yaml', { timeout: 30_000 })
  })

  test('a clean configuration shows no note', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.dashboard-brand-logo')).toBeVisible({ timeout: 30_000 })
    await expect(note(page)).toHaveCount(0)
  })
})
