import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 038-all-loaded-scenarios — the auto-activation contract
// (specs/038-all-loaded-scenarios/contracts/discovery-activation.md,
// DA-1..DA-8). A scenario participates in the dynamic `$scenario` union
// iff its own registration reached `status === 'ready'` — uniformly for
// observed / published / demo, with NO fixture-vs-demo branching.
//
// Fixture ready-set on a plain boot: `observed` + `good_scenario`
// (both `ready`). `broken_scenario` is `failed` → never auto-active.

async function boot(page: Page, searchParams = '') {
  await page.goto('/' + searchParams)
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  // All three fixture scenarios have left the 'registering' state.
  await page.waitForFunction(
    () =>
      window.__wftdm!.appState.get('good_scenario')?.status !== 'registering' &&
      window.__wftdm!.appState.get('broken_scenario')?.status !== 'registering',
    null,
    { timeout: 30_000 },
  )
}

function activeNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window
      .__wftdm!.appState.list()
      .filter((s) => s.active)
      .map((s) => s.name)
      .sort(),
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

test.describe('038 auto-activation (discovery-activation.md DA-1..DA-8)', () => {
  test('DA-1/DA-3: a plain boot auto-activates every ready scenario; a failed one is not activated', async ({
    page,
  }) => {
    await boot(page)

    const [observed, good, broken] = await page.evaluate(() => [
      window.__wftdm!.appState.get('observed'),
      window.__wftdm!.appState.get('good_scenario'),
      window.__wftdm!.appState.get('broken_scenario'),
    ])

    expect(observed?.status).toBe('ready')
    expect(observed?.active).toBe(true) // DA-1

    expect(good?.status).toBe('ready')
    expect(good?.active).toBe(true) // DA-3 — auto-active with NO ?s= param

    expect(broken?.status).toBe('failed')
    expect(broken?.active).toBeFalsy() // DA-3 — a failed scenario never auto-activates

    expect(await activeNames(page)).toEqual(['good_scenario', 'observed'])
  })

  test('DA-3: an unpinned $scenario panel spans exactly the ready scenarios, with no failed-scenario error', async ({
    page,
  }) => {
    await boot(page)

    // `Scenario Split (Table)` (row_scenario_display) has no
    // scenario:/scenarios: pin — it unions `summary_kpis` across the
    // active set. Both `observed` and `good_scenario` publish it, 2 rows
    // each → 4 rows. `broken_scenario` (failed) contributes nothing and
    // causes no error banner.
    const rows = panelCard(page, 'Scenario Split (Table)').locator('tbody tr')
    await expect(rows).toHaveCount(4)

    await expect(
      panelCard(page, 'Scenario Split (Table)').getByText(/couldn.t load/i),
    ).toHaveCount(0)

    const scenarioCells = await panelCard(page, 'Scenario Split (Table)')
      .locator('tbody tr td:last-child')
      .allInnerTexts()
    // The added `scenario` discriminator column carries both ready names,
    // never `broken_scenario`.
    expect(new Set(scenarioCells)).toEqual(new Set(['observed', 'good_scenario']))
  })

  test('DA-6: a ?s= param naming an already-auto-active scenario is idempotent', async ({
    page,
  }) => {
    await boot(page, '?s=good_scenario')
    // good_scenario was already auto-active; the param neither duplicates
    // nor reduces the set.
    expect(await activeNames(page)).toEqual(['good_scenario', 'observed'])
  })

  test('DA-5: a ?s= param naming a failed scenario still activates the entry (add-only), union errors stay per-panel', async ({
    page,
  }) => {
    await boot(page, '?s=broken_scenario')
    // Add-only: the failed entry is now flagged active (it is a
    // registered entry), alongside the auto-active ready set. It has no
    // views, so any panel that unions it errors exactly as before — that
    // is unchanged, per-panel behavior, not a boot crash.
    expect(await activeNames(page)).toEqual(['broken_scenario', 'good_scenario', 'observed'])
    expect(await page.evaluate(() => window.__wftdm !== undefined)).toBe(true)
  })

  test('DA-8: toggling every scenario off leaves unpinned panels in an empty/error state, no crash', async ({
    page,
  }) => {
    await boot(page)
    // Start from a real 2-scenario union so the transition to "none" is
    // genuine.
    await expect(panelCard(page, 'Scenario Split (Table)').locator('tbody tr')).toHaveCount(4)

    await page.evaluate(() => {
      const s = window.__wftdm!.appState
      for (const name of s.list().map((x) => x.name)) s.setActive(name, false)
    })
    // DA-8: the panel drops to its own error/empty state (no tbody rows)
    // — the panel CARD and its title stay mounted, and the app is still
    // fully alive: no boot crash, DuckDB still answers.
    await expect(panelCard(page, 'Scenario Split (Table)')).toBeVisible()
    await expect(panelCard(page, 'Scenario Split (Table)').locator('tbody tr')).toHaveCount(0)
    const stillAlive = await page.evaluate(() => window.__wftdm!.query('SELECT 1 AS one'))
    expect(stillAlive).toEqual([{ one: 1 }])

    // NOTE (research.md §6b): recovering an unpinned panel from the
    // *zero-active* state in-place is a pre-existing limitation, not a 038
    // regression — with no active scenario, `$scenario` expansion throws
    // synchronously in the panel's effect body and panelCard.tsx's error
    // boundary replaces the body (and does not auto-reset on a later prop
    // change). DA-4/DA-7 reactive pickup (a scenario becoming active while
    // >=1 was already active — the panel never hit the throw) IS covered:
    // settingsModal.spec.ts's FR-019/FR-020 toggle test and
    // demoMultiScenario.spec.ts (T020).
  })

  test('DA-2: a failed observed registration is not activated and poisons nothing', async ({
    page,
  }) => {
    // Simulate the real-deployment case (empty public/observed/) by
    // failing the observed summary index fetch. registerObserved() then
    // reaches its catch → status 'failed' → never setActive.
    await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
    await boot(page)

    const observed = await page.evaluate(() => window.__wftdm!.appState.get('observed'))
    expect(observed?.status).toBe('failed')
    expect(observed?.active).toBeFalsy()

    // good_scenario still auto-activates; the unpinned panel spans just it
    // (2 rows), with no error attributable to the absent observed.
    expect(await activeNames(page)).toEqual(['good_scenario'])
    const rows = panelCard(page, 'Scenario Split (Table)').locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(
      panelCard(page, 'Scenario Split (Table)').getByText(/couldn.t load/i),
    ).toHaveCount(0)
  })
})
