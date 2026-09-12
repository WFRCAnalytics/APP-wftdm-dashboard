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
// 040-test-suite-migration: migrated off the retired fixture's own
// already-unpinned `Scenario Split (*)` panels (deleted in T011). Reuses
// the SAME real, already-validated unpinned panels
// `demoMultiScenario.spec.ts` (038) established: "Total Trips by Mode"
// (recharts) + "Average Trip Distance by Purpose" (plotly), both Summary
// tab; "Land Use / Socioeconomics by Zone" (table), Network tab; and the
// real pinned "Households" KPI (activitysim-baseline) as the unaffected
// reference. Kept as its own dedicated file per this migration's own
// scoping decision — a distinct, narrowly-focused US1-mechanics check,
// not a duplicate of demoMultiScenario.spec.ts's own broader "reads as a
// comparison" coverage.

async function boot(page: Page) {
  await page.addInitScript(() => {
    // Sentinel: set once on first load, survives a soft re-render, would
    // be cleared by a real navigation/reload.
    if (!window.__wftdm_loadedOnce) window.__wftdm_loadedOnce = true
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('activitysim-transit-variant')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function gotoTab(page: Page, name: string) {
  await page.getByRole('tablist').getByRole('tab', { name, exact: true }).click()
}

async function openScenariosTab(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Scenarios' }).click()
}

function switchFor(page: Page, name: string) {
  return page.getByTestId(`scenario-row-${name}`).getByRole('switch')
}

test.describe('038 US1 — the Switch universally controls every unpinned panel', () => {
  test('toggling one scenario off drops it from every unpinned panel; back on restores it; no reload; pinned panel unaffected', async ({
    page,
  }) => {
    let navigated = false

    await boot(page)
    page.on('framenavigated', () => {
      navigated = true
    })

    const rechartsCard = panelCard(page, 'Total Trips by Mode')
    const plotlyCard = panelCard(page, 'Average Trip Distance by Purpose')

    // Baseline: all three real demo scenarios active → every unpinned
    // panel shows all three.
    await expect(rechartsCard.getByText('activitysim-density-variant', { exact: true })).toBeVisible()
    await expect(plotlyCard.getByText('activitysim-density-variant', { exact: true })).toBeVisible()

    await gotoTab(page, 'Network')
    const tableCard = panelCard(page, 'Land Use / Socioeconomics by Zone')
    await expect(
      tableCard.locator('tbody tr td').filter({ hasText: 'activitysim-density-variant' }).first(),
    ).toBeVisible()

    // A pinned reference panel (Households — pinned to
    // activitysim-baseline) — capture its value to prove it never moves.
    // Read the value node specifically (not the whole card) and wait for
    // a real digit to appear first — the card's title text renders before
    // its own query resolves, so capturing immediately races an empty
    // value (found live: the first attempt captured "Households" with no
    // number at all).
    await gotoTab(page, 'Summary')
    const pinnedValue = panelCard(page, 'Households').locator('.tabular-nums').first()
    const pinnedBefore = (await pinnedValue.textContent())?.trim()
    expect(pinnedBefore).toMatch(/\d/)

    // --- flip activitysim-density-variant OFF ---
    await openScenariosTab(page)
    await switchFor(page, 'activitysim-density-variant').click()
    await expect(switchFor(page, 'activitysim-density-variant')).not.toBeChecked()
    await page.getByRole('button', { name: /^Close$/ }).click()

    // Every unpinned panel drops it, immediately — on both tabs.
    await expect(rechartsCard.getByText('activitysim-density-variant', { exact: true })).toHaveCount(0)
    await expect(plotlyCard.getByText('activitysim-density-variant', { exact: true })).toHaveCount(0)
    // The other two real scenarios are still shown everywhere.
    await expect(rechartsCard.getByText('activitysim-baseline', { exact: true })).toBeVisible()
    await expect(rechartsCard.getByText('activitysim-transit-variant', { exact: true })).toBeVisible()

    await gotoTab(page, 'Network')
    await expect(
      tableCard.locator('tbody tr td').filter({ hasText: 'activitysim-density-variant' }),
    ).toHaveCount(0)

    // --- flip activitysim-density-variant BACK ON ---
    await openScenariosTab(page)
    await switchFor(page, 'activitysim-density-variant').click()
    await expect(switchFor(page, 'activitysim-density-variant')).toBeChecked()
    await page.getByRole('button', { name: /^Close$/ }).click()

    await expect(
      tableCard.locator('tbody tr td').filter({ hasText: 'activitysim-density-variant' }).first(),
    ).toBeVisible()
    await gotoTab(page, 'Summary')
    await expect(rechartsCard.getByText('activitysim-density-variant', { exact: true })).toBeVisible()
    await expect(plotlyCard.getByText('activitysim-density-variant', { exact: true })).toBeVisible()

    // No navigation/reload happened across the whole flow.
    expect(navigated).toBe(false)
    expect(await page.evaluate(() => window.__wftdm_loadedOnce)).toBe(true)

    // The pinned panel never changed.
    expect((await pinnedValue.textContent())?.trim()).toBe(pinnedBefore)
  })
})
