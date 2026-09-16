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
// 040-test-suite-migration: migrated off the retired synthetic
// `good_scenario`/`broken_scenario` fixture names, matching
// boot.spec.ts's (T031) own already-established real-name convention.
// Real ready-set on a plain boot: `activitysim-baseline`/
// `activitysim-density-variant`/`activitysim-transit-variant` (all real,
// `ready`, auto-active per 038). `observed` is real, registered, but
// genuinely `failed` in this deployment (no real public/demo content
// exists under `public/observed/`) — never auto-active, playing the
// retired fixture's own `broken_scenario` role for real.
//
// Real unpinned-panel vehicle: "Accessibility by Zone" (`dashboard-6-
// network.yaml`, Network tab, metric `accessibility_summary`) — 25 real
// MTC/SF-area zones per scenario (confirmed live via the duckdb CLI
// directly against the real Parquet file), with a real `scenario`
// discriminator column (038's own established convention for every
// unpinned demo table). 3 ready scenarios -> 75 rows; 1 -> 25; 0 -> 0.

const READY_SET = [
  'activitysim-baseline',
  'activitysim-density-variant',
  'activitysim-transit-variant',
]
const ZONES_PER_SCENARIO = 25

async function boot(page: Page, searchParams = '') {
  await page.goto('/' + searchParams)
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('activitysim-baseline')?.status !== 'registering',
    null,
    { timeout: 30_000 },
  )
}

async function gotoNetworkTab(page: Page) {
  await page.getByRole('tab', { name: 'Network' }).click()
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

// "Accessibility by Zone" has `pagination: 25` — with 75 real rows across
// 3 active scenarios, `tbody tr` only ever renders ONE page at a time
// (25 rows), never the full union. Every "how many rows total" assertion
// below therefore cross-checks the real total via a live query, matching
// this migration's own established "prove it against real data, not a
// DOM count subject to pagination/sort-tie-break assumptions" discipline
// — never assumed from the rendered DOM alone.
// 056-lazy-tab-scoped-loading: a metric's own Parquet file/view is only
// registered once some panel that actually queries it renders — never
// eagerly at boot. A real bug found live in this file's own first
// isolated run: calling realUnionCount() (a raw window.__wftdm!.query(),
// bypassing ensureRegistered() entirely) immediately after navigating to
// the Network tab raced the "Accessibility by Zone" panel's own
// query/registration, throwing "Catalog Error: Table ...
// accessibility_summary does not exist". Waiting for the panel's own
// real rendered output first guarantees the views this test's own
// cross-check query needs already exist.
async function waitForRealRender(card: ReturnType<typeof panelCard>) {
  await expect(card.locator('tbody tr').first()).toBeVisible()
}

async function realUnionCount(page: Page, metric: string, scenarios: string[]): Promise<number> {
  const rows = await page.evaluate(
    ({ metric, scenarios }) =>
      window.__wftdm!.query(
        `SELECT COUNT(*) AS n FROM (${scenarios
          .map((s) => `SELECT * FROM "${s}__${metric}"`)
          .join(' UNION ALL ')})`,
      ),
    { metric, scenarios },
  )
  return Number(rows[0].n)
}

test.describe('038 auto-activation (discovery-activation.md DA-1..DA-8)', () => {
  test('DA-1/DA-3: a plain boot auto-activates every ready scenario; a failed one is not activated', async ({
    page,
  }) => {
    await boot(page)

    const [baseline, density, transit, observed] = await page.evaluate(() => [
      window.__wftdm!.appState.get('activitysim-baseline'),
      window.__wftdm!.appState.get('activitysim-density-variant'),
      window.__wftdm!.appState.get('activitysim-transit-variant'),
      window.__wftdm!.appState.get('observed'),
    ])

    expect(baseline?.status).toBe('ready')
    expect(baseline?.active).toBe(true) // DA-1
    expect(density?.status).toBe('ready')
    expect(density?.active).toBe(true)
    expect(transit?.status).toBe('ready')
    expect(transit?.active).toBe(true)

    expect(observed?.status).toBe('failed')
    expect(observed?.active).toBeFalsy() // DA-3 — a failed scenario never auto-activates

    expect(await activeNames(page)).toEqual(READY_SET.slice().sort())
  })

  test('DA-3: an unpinned $scenario panel spans exactly the ready scenarios, with no failed-scenario error', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)

    // "Accessibility by Zone" (row_accessibility) has no scenario:/
    // scenarios: pin — it unions accessibility_summary across the active
    // set. All 3 ready scenarios publish it, 25 rows each -> 75 rows
    // total (live cross-check — observed (failed) contributes nothing).
    const card = panelCard(page, 'Accessibility by Zone')
    await waitForRealRender(card)
    const totalRows = await realUnionCount(page, 'accessibility_summary', READY_SET)
    expect(totalRows).toBe(ZONES_PER_SCENARIO * READY_SET.length)

    await expect(card.getByText(/couldn.t load/i)).toHaveCount(0)
    await expect(card.getByText(`Page 1 of ${Math.ceil(totalRows / 25)}`)).toBeVisible()

    // The `scenario` discriminator column's own visible (page 1) values
    // are always within the ready set — never `observed`, which has no
    // real accessibility_summary data to leak in.
    const scenarioCells = await card.locator('tbody tr td:nth-child(1)').allInnerTexts()
    expect(scenarioCells.length).toBeGreaterThan(0)
    for (const cell of scenarioCells) {
      expect(READY_SET).toContain(cell)
    }
  })

  test('DA-6: a ?s= param naming an already-auto-active scenario is idempotent', async ({
    page,
  }) => {
    await boot(page, '?s=activitysim-baseline')
    // activitysim-baseline was already auto-active; the param neither
    // duplicates nor reduces the set.
    expect(await activeNames(page)).toEqual(READY_SET.slice().sort())
  })

  test('DA-5: a ?s= param naming a failed scenario still activates the entry (add-only), union errors stay per-panel', async ({
    page,
  }) => {
    await boot(page, '?s=observed')
    // Add-only: the failed entry is now flagged active (it is a
    // registered entry), alongside the auto-active ready set. It has no
    // views, so any panel that unions it errors exactly as before — that
    // is unchanged, per-panel behavior, not a boot crash.
    expect(await activeNames(page)).toEqual([...READY_SET, 'observed'].sort())
    expect(await page.evaluate(() => window.__wftdm !== undefined)).toBe(true)
  })

  test('DA-8: toggling every scenario off leaves unpinned panels in an empty/error state, no crash', async ({
    page,
  }) => {
    await boot(page)
    await gotoNetworkTab(page)
    // Start from a real 3-scenario union so the transition to "none" is
    // genuine (a live cross-check, not a DOM count — pagination: 25
    // means tbody never shows all 75 rows at once anyway).
    const card = panelCard(page, 'Accessibility by Zone')
    await waitForRealRender(card)
    expect(await realUnionCount(page, 'accessibility_summary', READY_SET)).toBe(
      ZONES_PER_SCENARIO * READY_SET.length,
    )

    await page.evaluate(() => {
      const s = window.__wftdm!.appState
      for (const name of s.list().map((x) => x.name)) s.setActive(name, false)
    })
    // DA-8: the panel drops to its own error/empty state (no tbody rows)
    // — the panel CARD and its title stay mounted, and the app is still
    // fully alive: no boot crash, DuckDB still answers.
    await expect(card).toBeVisible()
    await expect(card.locator('tbody tr')).toHaveCount(0)
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
    // demoMultiScenario.spec.ts.

    // Restore for test isolation (no afterEach hook exists in this file).
    await page.evaluate(() => {
      const s = window.__wftdm!.appState
      for (const name of s.list().map((x) => x.name)) {
        if (name !== 'observed') s.setActive(name, true)
      }
    })
  })

  test('DA-2: a failed observed registration is not activated and poisons nothing', async ({
    page,
  }) => {
    // observed is already genuinely failed in this deployment (no real
    // public/observed/ content) — this explicit route() makes the
    // condition deterministic regardless of what a given checkout
    // happens to have on disk, matching boot.spec.ts's own real-failure
    // framing (registerObserved() reaches its catch -> status 'failed'
    // -> never setActive, unconditionally, per 038's own uniform rule).
    await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
    await boot(page)

    const observed = await page.evaluate(() => window.__wftdm!.appState.get('observed'))
    expect(observed?.status).toBe('failed')
    expect(observed?.active).toBeFalsy()

    // Every ready scenario still auto-activates; observed's failure
    // isolates cleanly — the unpinned panel spans just the 3 ready
    // scenarios (75 rows), with no error attributable to the absent
    // observed.
    expect(await activeNames(page)).toEqual(READY_SET.slice().sort())
    await gotoNetworkTab(page)
    const card = panelCard(page, 'Accessibility by Zone')
    await waitForRealRender(card)
    expect(await realUnionCount(page, 'accessibility_summary', READY_SET)).toBe(
      ZONES_PER_SCENARIO * READY_SET.length,
    )
    await expect(card.getByText(/couldn.t load/i)).toHaveCount(0)
  })
})
