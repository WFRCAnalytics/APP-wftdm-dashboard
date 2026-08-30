import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.ts'

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
  test('observed and every published fixture scenario are independently queryable, one bad scenario does not block the rest', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, {
      timeout: 30_000,
    })
    await page.waitForFunction(
      () => window.__wftdm!.appState.get('good_scenario')?.status !== 'registering',
      null,
      { timeout: 30_000 },
    )

    // Observed: queryable and active by default (FR-009).
    const observedRows = await page.evaluate(() =>
      window.__wftdm!.query('SELECT * FROM observed__summary_kpis'),
    )
    expect(observedRows.length).toBeGreaterThan(0)
    const observed = await page.evaluate(() => window.__wftdm!.appState.get('observed'))
    expect(observed?.active).toBe(true)
    expect(observed?.status).toBe('ready')

    // good_scenario: independently queryable, status 'ready'.
    const goodRows = await page.evaluate(() =>
      window.__wftdm!.query('SELECT * FROM good_scenario__summary_kpis'),
    )
    expect(goodRows.length).toBeGreaterThan(0)
    const good = await page.evaluate(() => window.__wftdm!.appState.get('good_scenario'))
    expect(good?.status).toBe('ready')

    // broken_scenario: registered but status 'failed' — SC-007, does not
    // reduce the count of other scenarios successfully made queryable.
    const broken = await page.evaluate(() => window.__wftdm!.appState.get('broken_scenario'))
    expect(broken?.status).toBe('failed')
  })
})

test.describe('User Story 3 - A shared link pre-selects specific scenarios', () => {
  async function activeNames(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      window.__wftdm!.appState.list().filter((s) => s.active).map((s) => s.name),
    )
  }

  test('a matching ?s= param activates exactly that scenario', async ({ page }) => {
    await page.goto('/?s=good_scenario')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    expect((await activeNames(page)).sort()).toEqual(['good_scenario', 'observed'])
  })

  test('an unmatched ?s= value is ignored and startup still completes', async ({ page }) => {
    await page.goto('/?s=nonexistent_scenario')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    expect((await activeNames(page)).sort()).toEqual(['observed'])
  })

  test('no ?s= params leaves only observed active by default', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    expect(await activeNames(page)).toEqual(['observed'])
  })
})

test.describe('User Story 4 - Dashboard config placeholders expand into runnable queries', () => {
  test('expand() against the all-placeholder fixture executes and returns expected rows', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    const rows = await page.evaluate(async () => {
      const w = window.__wftdm!
      const cfg = await w.yamlLoader.loadConfig('/APP-wftdm-dashboard/all-placeholders-config.yaml')
      w.filterState.set('purpose', 'HBW')
      const template = `
SELECT
  purpose,
  CASE mode $mappings.major_mode END AS major_mode,
  $bins.share_bucket AS share_bucket
FROM (SELECT * FROM $sql.base_table)
WHERE 1=1
  AND purpose = '$filters.purpose'
`.trim()
      const sql = w.sqlExpander.expand(template, cfg, w.filterState, ['good_scenario'])
      return w.query(sql)
    })

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.purpose).toBe('HBW')
      expect(['Drive', 'Transit', 'Active']).toContain(row.major_mode)
    }
  })
})
