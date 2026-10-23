import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 063 redesign P4: the `multi-view` tile ("Trips by Purpose and Mode" on the Mode Choice tab): view switcher, Group by,
// per-tile state that survives a page switch, the expand overlay with working controls, and the load-time validation
// error state. Same per-page page.route() isolation as demoMultiScenario.spec.ts.

const TITLE = 'Trips by Purpose and Mode'
const SCENARIOS = ['activitysim-baseline', 'activitysim-density-variant', 'activitysim-transit-variant']

async function boot(page: Page, mutateYaml?: (text: string) => string) {
  await page.route('**/demo-dashboard-config/index.json', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ dashboards: ['dashboard-4-mode-choice.yaml', 'dashboard-5-trip-models.yaml'] }),
    }),
  )
  await page.route('**/demo-scenarios/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(SCENARIOS) }),
  )
  if (mutateYaml) {
    await page.route('**/dashboard-4-mode-choice.yaml', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, body: mutateYaml(await res.text()) })
    })
  }
  await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/scenarios/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/dashboard-config/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('activitysim-baseline')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function tile(page: Page) {
  return page.getByText(TITLE, { exact: true }).locator('..').locator('..')
}

async function gotoTab(page: Page, name: string) {
  await page.getByRole('navigation').hover().catch(() => {})
  await page.getByRole('tablist').getByRole('tab', { name, exact: true }).click()
}

// The tile redraws as its data lands, which can close an open dropdown under the pointer: open it and pick as one retried step.
async function chooseGroup(page: Page, card: ReturnType<typeof tile>, option: RegExp) {
  await expect(async () => {
    // a dropdown left open by a failed try hides the rest of the page from the role queries: close it first
    await page.keyboard.press('Escape')
    await card.getByRole('combobox', { name: 'Group by' }).click({ timeout: 5_000 })
    await page.getByRole('option', { name: option }).click({ timeout: 5_000 })
  }).toPass({ timeout: 25_000 })
}

test.describe('063 P4 — multi-view tile', () => {
  test('shows the view switcher and Group by, with the first view drawn', async ({ page }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    const card = tile(page)
    await expect(card).toBeVisible()
    const views = card.getByRole('group', { name: 'View' })
    await expect(views.getByRole('button')).toHaveText(['Treemap', 'Sunburst', 'Flow', 'Heatmap'])
    await expect(views.getByRole('button', { name: 'Treemap' })).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByRole('combobox', { name: 'Group by' })).toContainText(/^Purpose/)
    await expect(card.locator('g[data-node-name]').first()).toBeVisible({ timeout: 20_000 })
  })

  test('switching views swaps the chart', async ({ page }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    const card = tile(page)
    const views = card.getByRole('group', { name: 'View' })

    await views.getByRole('button', { name: 'Flow' }).click()
    await expect(views.getByRole('button', { name: 'Flow' })).toHaveAttribute('aria-pressed', 'true')
    await expect(card.locator('svg path[d]').first()).toBeVisible({ timeout: 20_000 })
    await expect(card.locator('g[data-node-name]')).toHaveCount(0)

    await views.getByRole('button', { name: 'Heatmap' }).click()
    await expect(card.locator('svg rect').first()).toBeVisible({ timeout: 20_000 })

    await views.getByRole('button', { name: 'Treemap' }).click()
    await expect(card.locator('g[data-node-name]').first()).toBeVisible({ timeout: 20_000 })
  })

  test('Group by reorders the hierarchy ($group.path substitution)', async ({ page }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    const card = tile(page)
    // Purpose > Mode: top level is a purpose
    await expect(card.locator('g[data-node-name="work"]').first()).toBeVisible({ timeout: 20_000 })
    await expect(card.locator('g[data-node-name="SOV"]')).toHaveCount(0)

    await chooseGroup(page, card, /^Mode/)
    await expect(card.locator('g[data-node-name="SOV"]').first()).toBeVisible({ timeout: 20_000 })
    await expect(card.locator('g[data-node-name="work"]')).toHaveCount(0)
  })

  test('the chosen view and group survive a page switch', async ({ page }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    let card = tile(page)
    await card.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Sunburst' }).click()
    await chooseGroup(page, card, /^Mode/)

    await gotoTab(page, 'Trip')
    await gotoTab(page, 'Mode Choice')
    card = tile(page)
    await expect(card.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Sunburst' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(card.getByRole('combobox', { name: 'Group by' })).toContainText(/^Mode/)
  })

  test('expand opens the overlay with the same controls working inside it', async ({ page }) => {
    await boot(page)
    await gotoTab(page, 'Mode Choice')
    await tile(page).getByRole('button', { name: `Expand ${TITLE}` }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'View' }).getByRole('button')).toHaveCount(4)
    await dialog.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Sunburst' }).click()
    await expect(dialog.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Sunburst' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(dialog.locator('path[data-node-name]').first()).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    // the choice made inside the overlay is the tile's state
    await expect(
      tile(page).getByRole('group', { name: 'View' }).getByRole('button', { name: 'Sunburst' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('an invalid multi-view shows the panel error state with a precise message and breaks nothing else', async ({ page }) => {
    await boot(page, (text) => text.replace('{ id: sun,  label: Sunburst', '{ id: tree, label: Sunburst'))
    await gotoTab(page, 'Mode Choice')
    await expect(page.getByRole('alert').filter({ hasText: 'duplicate view id "tree"' })).toBeVisible()
    // the rest of the tab still renders
    await expect(page.getByText('Trip Purpose to Mode Flow', { exact: true }).first()).toBeVisible()
  })

  test('an unknown $group field is reported at load', async ({ page }) => {
    await boot(page, (text) => text.replace('path: $group.path, value: trips, compare: [multi] }', 'path: $group.nope, value: trips, compare: [multi] }'))
    await gotoTab(page, 'Mode Choice')
    await expect(page.getByRole('alert').filter({ hasText: '$group.nope' })).toBeVisible()
  })

  test('an unknown compare strategy is reported at load', async ({ page }) => {
    await boot(page, (text) => text.replace('compare: [multi] }', 'compare: [sideways] }'))
    await gotoTab(page, 'Mode Choice')
    await expect(page.getByRole('alert').filter({ hasText: 'unknown compare strategy "sideways"' })).toBeVisible()
  })
})
