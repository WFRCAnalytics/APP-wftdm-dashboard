import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __frameCount?: number
  }
}

// Real-browser boot-sequence tests — Web Worker + DuckDB-WASM + Parquet
// fetch + URL params, per research.md §1 (jsdom can't faithfully exercise
// these). Each user story appends its own describe block here, per
// plan.md's Project Structure (a single tests/integration/boot.spec.ts).
//
// 040-test-suite-migration: migrated off the retired synthetic
// `good_scenario`/`broken_scenario` fixture names. Real scenarios:
// `activitysim-baseline`/`activitysim-density-variant`/
// `activitysim-transit-variant` (all real, `ready`, auto-active per
// 038-all-loaded-scenarios) and `observed` — real, registered, but
// genuinely `failed` (public/observed/ ships no real content in this
// deployment, confirmed repeatedly this session, e.g. the 042-boot-
// performance investigation's own live 404s for
// observed/summary/index.json) and therefore never auto-active (038:
// a failed scenario is never auto-activated). This maps directly onto
// the retired fixture's own "one bad scenario does not block the rest"
// shape — `observed` now plays that role for real, not `broken_scenario`.

test.describe('User Story 1 - App boots to a ready, queryable state', () => {
  test('query engine is reachable and the page stays responsive during init', async ({
    page,
  }) => {
    // Start a rAF counter before navigation so it races initDuckDB() —
    // if initDuckDB() ever blocked the main thread synchronously, frames
    // would stall and this counter would stay at 0.
    await page.addInitScript(() => {
      window.__frameCount = 0
      function tick() {
        window.__frameCount!++
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })

    await page.goto('/')

    // Boot sequence completion is signaled by main.ts's debug hook existing.
    await page.waitForFunction(() => window.__wftdm !== undefined, null, {
      timeout: 30_000,
    })

    const frameCount = await page.evaluate(() => window.__frameCount)
    expect(frameCount).toBeGreaterThan(0)

    const rows = await page.evaluate(() => window.__wftdm!.query('SELECT 1 AS one'))
    expect(rows).toEqual([{ one: 1 }])
  })
})

test.describe('User Story 2 - Observed data and published scenarios are ready to query automatically', () => {
  test('observed and every real scenario are independently queryable, one failed registration does not block the rest', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, {
      timeout: 30_000,
    })
    await page.waitForFunction(
      () => window.__wftdm!.appState.get('activitysim-baseline')?.status !== 'registering',
      null,
      { timeout: 30_000 },
    )

    // activitysim-baseline: independently queryable, status 'ready',
    // auto-active (038-all-loaded-scenarios).
    const baselineRows = await page.evaluate(() =>
      window.__wftdm!.query('SELECT * FROM "activitysim-baseline__summary_kpis"'),
    )
    expect(baselineRows.length).toBeGreaterThan(0)
    const baseline = await page.evaluate(() => window.__wftdm!.appState.get('activitysim-baseline'))
    expect(baseline?.active).toBe(true)
    expect(baseline?.status).toBe('ready')

    // observed: registered, but genuinely `failed` (no real data in this
    // deployment) — SC-007, does not reduce the count of other scenarios
    // successfully made queryable, and (038) is never auto-activated.
    const observed = await page.evaluate(() => window.__wftdm!.appState.get('observed'))
    expect(observed?.status).toBe('failed')
    expect(observed?.active).toBe(false)
  })
})

test.describe('User Story 3 - A shared link pre-selects specific scenarios', () => {
  async function activeNames(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      window.__wftdm!.appState.list().filter((s) => s.active).map((s) => s.name),
    )
  }

  const READY_SET = [
    'activitysim-baseline',
    'activitysim-density-variant',
    'activitysim-transit-variant',
  ]

  test('a matching ?s= param activates exactly that scenario, additively (038: add-only)', async ({
    page,
  }) => {
    // `observed` is real, registered, but `failed` — never auto-active on
    // a plain boot (038). `applyURLParams()` itself never gates on status
    // (confirmed directly — it only checks `appState.get(name)` exists),
    // so an explicit `?s=observed` genuinely, additively activates it —
    // a real, meaningful assertion, unlike `?s=activitysim-baseline`
    // (already auto-active either way, so it would be a no-op check).
    await page.goto('/?s=observed')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.waitForFunction(
      () => window.__wftdm!.appState.get('activitysim-baseline')?.status === 'ready',
      null,
      { timeout: 30_000 },
    )
    expect((await activeNames(page)).sort()).toEqual([...READY_SET, 'observed'].sort())
  })

  test('an unmatched ?s= value is ignored and startup still completes', async ({ page }) => {
    await page.goto('/?s=nonexistent_scenario')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.waitForFunction(
      () => window.__wftdm!.appState.get('activitysim-baseline')?.status === 'ready',
      null,
      { timeout: 30_000 },
    )
    // observed stays failed/inactive — the unmatched param changed nothing.
    expect((await activeNames(page)).sort()).toEqual(READY_SET.sort())
  })

  test('no ?s= params leaves every ready scenario active by default', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.waitForFunction(
      () => window.__wftdm!.appState.get('activitysim-baseline')?.status === 'ready',
      null,
      { timeout: 30_000 },
    )
    expect((await activeNames(page)).sort()).toEqual(READY_SET.sort())
  })
})

test.describe('User Story 4 - Dashboard config placeholders expand into runnable queries', () => {
  test('expand() against the all-placeholder fixture executes and returns expected rows', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // 040-test-suite-migration: tests/fixtures/all-placeholders-config.yaml
    // (the sole surviving fixture) now points `$sql.base_table` at the
    // real `activitysim-baseline__trip_mode_share` view — see that file's
    // own updated header comment for the full real-column story (no
    // published metric has both a raw mode-like AND a purpose-like column
    // together, so the template below filters on `major_trip_mode`, a
    // column that genuinely exists, instead of the retired `purpose`).
    const rows = await page.evaluate(async () => {
      const w = window.__wftdm!
      const cfg = await w.yamlLoader.loadConfig('/APP-wftdm-dashboard/all-placeholders-config.yaml')
      w.filterState.set('mode', 'Transit')
      const template = `
SELECT
  major_trip_mode,
  CASE major_trip_mode $mappings.mode_group END AS mode_group,
  $bins.share_bucket AS share_bucket
FROM (SELECT * FROM $sql.base_table)
WHERE major_trip_mode = '$filters.mode'
`.trim()
      const sql = w.sqlExpander.expand(template, cfg, w.filterState, ['activitysim-baseline'])
      return w.query(sql)
    })

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.major_trip_mode).toBe('Transit')
      expect(row.mode_group).toBe('Transit')
      expect(['Low', 'Medium', 'High']).toContain(row.share_bucket)
    }
  })
})
