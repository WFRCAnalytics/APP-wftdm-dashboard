import { expect, test, type Page } from '@playwright/test'

import { patchDemoConfig } from './_siteConfig'

// 067: the documentation link, the Settings tab list and hidden pages, set in dashboard-config.yaml and a page's header.
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}
const docsLink = (page: Page, name = 'Documentation') => page.getByRole('link', { name, exact: true })

test.describe('documentation link', () => {
  test('there is no link without a documentation address', async ({ page }) => {
    await open(page)
    await expect(page.locator('nav[data-sidebar=sidebar] a[target=_blank]')).toHaveCount(0)
  })

  test('the link shows with its label, opens the address in a new tab and has no opener access', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.docs = { url: 'https://example.org/docs/', label: 'Help' }
    })
    await open(page)
    const link = docsLink(page, 'Help')
    await expect(link).toHaveAttribute('href', 'https://example.org/docs/')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
    // the sidebar is collapsed: the icon is still there and named by its label
    await expect(page.locator('nav[data-sidebar=sidebar]')).toHaveAttribute('data-state', 'collapsed')
    await expect(link).toBeVisible()
  })

  test('a page path is appended only on that page', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.docs = { url: 'https://example.org/docs' }
    })
    await page.route('**/dashboard-2-*.yaml', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, body: (await res.text()).replace(/^header:/m, `header:\n  docs: /modes/#shares`) })
    })
    await open(page)
    await expect(docsLink(page)).toHaveAttribute('href', 'https://example.org/docs')
    await page.hover('[data-sidebar=sidebar]')
    await page.getByRole('tab').nth(1).click()
    await expect(docsLink(page)).toHaveAttribute('href', 'https://example.org/docs/modes/#shares')
    await page.getByRole('tab').nth(0).click()
    await expect(docsLink(page)).toHaveAttribute('href', 'https://example.org/docs')
  })

  test('a script address is refused: a note, and no link', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.docs = { url: 'javascript:alert(1)' }
    })
    await open(page)
    await expect(page.getByTestId('config-notice')).toContainText('docs.url')
    await expect(page.locator('nav[data-sidebar=sidebar] a[target=_blank]')).toHaveCount(0)
  })

  test('a page path without a site address is reported and ignored', async ({ page }) => {
    await page.route('**/dashboard-1-*.yaml', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, body: (await res.text()).replace(/^header:/m, `header:\n  docs: modes/`) })
    })
    await open(page)
    await expect(page.getByTestId('config-notice')).toContainText('header.docs')
    await expect(page.locator('nav[data-sidebar=sidebar] a[target=_blank]')).toHaveCount(0)
  })
})

test.describe('Settings tabs', () => {
  const settingsTabs = (page: Page) => page.getByRole('tablist', { name: 'Settings sections' }).getByRole('tab')
  async function openSettings(page: Page) {
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible()
  }

  test('with no list the five tabs of today show, in order', async ({ page }) => {
    await open(page)
    await openSettings(page)
    await expect(settingsTabs(page)).toHaveText(['Appearance', 'Scenarios', 'Basemap', 'Assistant', 'Documentation'])
  })

  test('a list shows exactly those tabs in that order and opens the first', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.settings = { tabs: ['scenarios', 'appearance'] }
    })
    await open(page)
    await openSettings(page)
    await expect(settingsTabs(page)).toHaveText(['Scenarios', 'Appearance'])
    await expect(settingsTabs(page).first()).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('config-notice')).toHaveCount(0)
  })

  test('the assistant switch wins over the list', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = { enabled: false }
      c.settings = { tabs: ['assistant', 'basemap'] }
    })
    await open(page)
    await openSettings(page)
    await expect(settingsTabs(page)).toHaveText(['Basemap'])
  })

  test('an unknown name is reported and the valid tabs still show', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.settings = { tabs: ['basemap', 'bogus', 'appearance'] }
    })
    await open(page)
    await expect(page.getByTestId('config-notice')).toContainText('settings.tabs')
    await expect(page.getByTestId('config-notice')).toContainText('bogus')
    await openSettings(page)
    await expect(settingsTabs(page)).toHaveText(['Basemap', 'Appearance'])
  })

  test('a list with no usable name is reported and every tab shows', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.settings = { tabs: ['bogus'] }
    })
    await open(page)
    await expect(page.getByTestId('config-notice')).toContainText('all tabs are shown')
    await openSettings(page)
    await expect(settingsTabs(page)).toHaveCount(5)
  })
})
