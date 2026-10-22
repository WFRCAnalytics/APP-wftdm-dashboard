import { test, expect, type Page } from './_testTab'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 030-sidebar-navigation — real-browser coverage for User Story 1 (the
// left sidebar itself). quickstart.md Scenario 1/2.
//
// 040-test-suite-migration: migrated off the retired synthetic
// tests/fixtures/dashboard-config/ 3-tab set. Asserts against the REAL
// public/demo-dashboard-config/ set: 7 calibration tabs plus the
// PERMANENT 8th dashboard-8-test.yaml entry (header.tab is a single
// space " ", so its visible label normalizes to ''). FR-003's "tracks
// whatever is discovered, zero code change" is proven by routing the
// demo index.json to a smaller subset and re-booting — no on-disk
// mutation.

// The 8th ("Test") tab's header.tab is " "; Playwright's toHaveText
// normalizes whitespace, so it appears as '' in a text array.
const REAL_TABS = [
  'Summary',
  'Person & Households',
  'Tour',
  'Mode Choice',
  'Trip',
  'Network',
  'Explore',
  '',
]

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function sidebarTablist(page: Page) {
  return page.locator('[data-sidebar="sidebar"]').getByRole('tablist')
}

test.describe('030-sidebar-navigation — User Story 1 (sidebar shell)', () => {
  test('every discovered tab renders as a sidebar item, tracking a differently-sized set with zero code change (FR-001–FR-003)', async ({
    page,
  }) => {
    // The real discovered set: 7 demo tabs + the permanent test tab.
    await boot(page)
    await expect(sidebarTablist(page).getByRole('tab')).toHaveCount(REAL_TABS.length)
    await expect(sidebarTablist(page).getByRole('tab')).toHaveText(REAL_TABS)

    // A genuinely DIFFERENT, smaller discovered set — re-verified with NO
    // code change (FR-003). Route the demo index.json to a 4-entry subset.
    await page.route('**/demo-dashboard-config/index.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          dashboards: [
            'dashboard-1-summary.yaml',
            'dashboard-2-person-household.yaml',
            'dashboard-7-explore.yaml',
            'dashboard-8-test.yaml',
          ],
          title: 'WFRC TDM Calibration Dashboard',
        }),
      }),
    )
    await boot(page)
    await expect(sidebarTablist(page).getByRole('tab')).toHaveCount(4)
    await expect(sidebarTablist(page).getByRole('tab')).toHaveText([
      'Summary',
      'Person & Households',
      'Explore',
      '',
    ])
  })

  test('the floating nav is a 68px rail that expands to 248px with its toggle (docking the page beside it) or on keyboard focus (overlay), never on hover or scroll', async ({
    page,
  }) => {
    await boot(page)
    const sidebar = page.locator('[data-sidebar="sidebar"]')
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(68)

    // Hovering never expands it: the rail moving under the pointer is exactly what made items hard to hit.
    await sidebar.hover()
    await page.waitForTimeout(400)
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')

    await page.getByRole('button', { name: 'Show menu labels' }).click()
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(248)

    // Pinned, the nav is docked: the page's left padding grows by the nav's extra width, so the canvas shrinks to the
    // remaining space instead of sitting underneath the menu.
    await expect
      .poll(() => page.locator('main').evaluate((el) => getComputedStyle(el).paddingLeft))
      .toBe('276px')

    // It stays expanded when the pointer leaves and after choosing a tab, until collapsed with the same toggle.
    await page.mouse.move(900, 400)
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
    await page.getByRole('button', { name: 'Hide menu labels' }).click()
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    await page.mouse.wheel(0, 2000)
    await page.waitForTimeout(200)
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')

    await expect
      .poll(() => page.locator('main').evaluate((el) => getComputedStyle(el).paddingLeft))
      .toBe('96px')

    // Keyboard focus expands it too, as a transient overlay: Tab from the toggle (just clicked) into the next control in
    // the rail. That never moves the page.
    await page.keyboard.press('Tab')
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
    expect(await page.locator('main').evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('96px')
  })

  test('brand/logo and Settings are visually distinct from the primary tab list (US1 acceptance)', async ({
    page,
  }) => {
    await boot(page)
    // DashboardBrand renders in the sidebar header (above the tab list);
    // Settings renders in the sidebar footer (below it). The full logo shows
    // once the menu is expanded (the collapsed rail shows the abbreviated
    // mark, or the generic one when a deployment configures none).
    await page.getByRole('button', { name: 'Show menu labels' }).click()
    await expect(page.getByRole('img', { name: /wfrc/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  })

  test('the permanent 8th tab is an inconspicuous sliver — no icon, whitespace-only label, real aria-label (040 FR-019–FR-021)', async ({
    page,
  }) => {
    await boot(page)
    const tabs = sidebarTablist(page).getByRole('tab')
    await expect(tabs).toHaveCount(8)

    const testTab = page.getByRole('tab', { name: 'Test' })
    await expect(testTab).toHaveCount(1)
    await expect(tabs.nth(7)).toHaveAttribute('aria-label', 'Test')
    await expect(testTab.locator('svg')).toHaveCount(0)
    const labelText = await testTab.locator('span').first().textContent()
    expect((labelText ?? '').trim()).toBe('')

    // Every real tab, by contrast, has a visible label once the nav is expanded.
    await page.getByRole('button', { name: 'Show menu labels' }).click()
    await expect(tabs.first().getByText('Summary', { exact: true })).toBeVisible()
  })
})

// Navigation branding is deployer-configured (dashboard-config/index.json: logoUrl/logoUrlDark for the expanded menu,
// markUrl/markUrlDark for the collapsed rail), never built in. Collapsed shows the mark; expanded REPLACES it with the logo
// (or the title when there is no logo): the mark is never shown beside either.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

async function bootWithBranding(page: Page, branding: Record<string, string | undefined>) {
  await page.route('**/demo-dashboard-config/index.json', async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    for (const key of ['title', 'logoUrl', 'logoUrlDark', 'markUrl', 'markUrlDark']) delete json[key]
    await route.fulfill({ response: res, json: { ...json, ...branding } })
  })
  await boot(page)
}

const hiddenWrapper = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => el.closest('[aria-hidden]')?.getAttribute('aria-hidden'))

test.describe('deployer-configured navigation branding', () => {
  test('a configured mark shows collapsed and the logo replaces it expanded, never both', async ({ page }) => {
    await bootWithBranding(page, { title: 'Test Org', logoUrl: PIXEL, markUrl: PIXEL })
    await expect(page.locator('.dashboard-brand-mark')).toHaveCount(1)
    expect(await hiddenWrapper(page, '.dashboard-brand-mark')).toBe('false')
    expect(await hiddenWrapper(page, '.dashboard-brand-logo')).toBe('true')

    await page.getByRole('button', { name: 'Show menu labels' }).click()
    await expect(page.locator('[data-sidebar="sidebar"]')).toHaveAttribute('data-state', 'expanded')
    expect(await hiddenWrapper(page, '.dashboard-brand-mark')).toBe('true')
    expect(await hiddenWrapper(page, '.dashboard-brand-logo')).toBe('false')
  })

  test('the dark-mode variants are used in dark mode', async ({ page }) => {
    await bootWithBranding(page, {
      logoUrl: 'data:image/png;base64,LIGHTLOGO',
      logoUrlDark: PIXEL,
      markUrl: 'data:image/png;base64,LIGHTMARK',
      markUrlDark: PIXEL,
    })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(page.locator('.dashboard-brand-mark')).toHaveAttribute('src', PIXEL)
    await expect(page.locator('.dashboard-brand-logo')).toHaveAttribute('src', PIXEL)
  })

  test('with no mark configured the generic mark is used, and with a title only the title replaces it when expanded', async ({ page }) => {
    await bootWithBranding(page, { title: 'Test Org' })
    await expect(page.locator('.dashboard-brand-mark')).toHaveCount(0)
    await expect(page.locator('.dashboard-brand-logo')).toHaveCount(0)
    const nav = page.locator('[data-sidebar="sidebar"]')
    await expect(nav.locator('.dashboard-brand-title')).toHaveText('Test Org')
    expect(await hiddenWrapper(page, '.dashboard-brand-title')).toBe('true')

    await page.getByRole('button', { name: 'Show menu labels' }).click()
    expect(await hiddenWrapper(page, '.dashboard-brand-title')).toBe('false')
  })

  test('with nothing configured the header still shows a mark and no stray empty gap', async ({ page }) => {
    await bootWithBranding(page, {})
    await expect(page.locator('.dashboard-brand-mark, .dashboard-brand-logo, .dashboard-brand-title')).toHaveCount(0)
    const header = page.locator('[data-sidebar="sidebar"] svg path[d="M4 18 9 9l4 6 3-5 4 8"]')
    await expect(header).toHaveCount(1)
  })
})
