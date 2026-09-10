import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __wftdm_loadedOnce?: boolean
  }
}

// 038-all-loaded-scenarios — User Story 1 (FR-005): flipping one
// scenario's Scenarios-tab Switch immediately adds/drops that scenario's
// series/rows on every UNPINNED ($scenario-union) panel, with no page
// reload. A pinned panel is unaffected (FR-006).
//
// Exercised against the fixture's own already-unpinned `Scenario Split
// (*)` panels (row_scenario_display, dashboard-1-summary.yaml) so US1 is
// verifiable independent of the US3 demo-content edits.

async function boot(page: Page, searchParams = '') {
  await page.addInitScript(() => {
    // Sentinel: set once on first load, survives a soft re-render, would
    // be cleared by a real navigation/reload.
    if (!window.__wftdm_loadedOnce) window.__wftdm_loadedOnce = true
  })
  await page.goto('/' + searchParams)
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('good_scenario')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function openScenariosTab(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Scenarios' }).click()
}

function goodSwitch(page: Page) {
  return page.getByTestId('scenario-row-good_scenario').getByRole('switch')
}

test.describe('038 US1 — the Switch universally controls every unpinned panel', () => {
  test('toggling one scenario off drops it from every unpinned panel; back on restores it; no reload; pinned panel unaffected', async ({
    page,
  }) => {
    let navigated = false

    await boot(page, '?s=good_scenario')
    page.on('framenavigated', () => {
      navigated = true
    })

    const tableRows = panelCard(page, 'Scenario Split (Table)').locator('tbody tr')
    const rechartsCard = panelCard(page, 'Scenario Split (Recharts)')
    const plotlyCard = panelCard(page, 'Scenario Split (Plotly)')

    // Baseline: two active scenarios → union spans both.
    await expect(tableRows).toHaveCount(4)
    await expect(rechartsCard.getByText('good_scenario')).toBeVisible()
    await expect(plotlyCard.getByText('good_scenario', { exact: true })).toBeVisible()

    // A pinned reference panel (Total Households — pinned scenarios:
    // [observed] by 038 T003) — capture its value to prove it never moves.
    const pinnedValue = panelCard(page, 'Total Households').locator('.tabular-nums, [class*="tabular"]').first()
    const pinnedBefore = await panelCard(page, 'Total Households').innerText()

    // --- flip good_scenario OFF ---
    await openScenariosTab(page)
    await goodSwitch(page).click()
    await expect(goodSwitch(page)).not.toBeChecked()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // Every unpinned panel drops good_scenario, immediately.
    await expect(tableRows).toHaveCount(2)
    await expect(rechartsCard.getByText('good_scenario')).toHaveCount(0)
    await expect(plotlyCard.getByText('good_scenario', { exact: true })).toHaveCount(0)
    // observed (the remaining active scenario) is still shown everywhere.
    await expect(panelCard(page, 'Scenario Split (Table)').getByText('observed').first()).toBeVisible()

    // --- flip good_scenario BACK ON ---
    await openScenariosTab(page)
    await goodSwitch(page).click()
    await expect(goodSwitch(page)).toBeChecked()
    await page.getByRole('button', { name: /^Close$/ }).click()

    await expect(tableRows).toHaveCount(4)
    await expect(rechartsCard.getByText('good_scenario')).toBeVisible()
    await expect(plotlyCard.getByText('good_scenario', { exact: true })).toBeVisible()

    // No navigation/reload happened across the whole flow.
    expect(navigated).toBe(false)
    expect(await page.evaluate(() => window.__wftdm_loadedOnce)).toBe(true)

    // The pinned panel never changed.
    expect(await panelCard(page, 'Total Households').innerText()).toBe(pinnedBefore)
    void pinnedValue
  })
})
