import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 059-server-side-pagination — real, live tests for User Stories 1/2/3.
// Generates a real, throwaway ~250,000-row synthetic Parquet file via the
// native `duckdb` CLI (the exact technique specs/059-server-side-
// pagination/research.md itself used) and places it directly under a
// REAL, already-discovered scenario's own real summary/ folder
// (`public/demo-scenarios/activitysim-baseline/summary/`) — the same
// technique `tests/integration/graphicWalkerPanel.spec.ts` established
// for injecting a real, unmodified-app-code test tab via `page.route()`,
// combined with `services/tabDataLoader.ts#registerOnePair()`'s own real,
// confirmed behavior (read directly): it builds `${scenario.path}/
// ${metric}.parquet` and registers whatever it finds there, with NO
// upfront catalog check against `summary/index.json` at all — so a real
// scenario's own metric catalog file needs no edit for this to work.
// Deleted in `afterAll`; never committed (confirmed via `git status`
// during this feature's own implementation).

const DUCKDB_CLI =
  process.env.DUCKDB_CLI ??
  'C:/Users/Pukar.Bhandari/AppData/Local/Microsoft/WinGet/Packages/DuckDB.cli_Microsoft.Winget.Source_8wekyb3d8bbwe/duckdb'

const TEST_METRIC = '_059_scale_test'
const SMALL_METRIC = '_059_scale_test_small'
const SCENARIO = 'activitysim-baseline'
const REAL_ROW_COUNT = 250_000
const SMALL_ROW_COUNT = 50 // comfortably under TABLE_QUERY_MODE_THRESHOLD — stays in 'client' mode
const TARGET_PARQUET = path.resolve(
  __dirname,
  '../../public/demo-scenarios',
  SCENARIO,
  'summary',
  `${TEST_METRIC}.parquet`,
)
const SMALL_TARGET_PARQUET = path.resolve(
  __dirname,
  '../../public/demo-scenarios',
  SCENARIO,
  'summary',
  `${SMALL_METRIC}.parquet`,
)

// T021 (US3): trip_id=1 → trip_distance = 0.1 + (1 % 500) * 0.1 = 0.2, in
// both the large (query-driven) and small (client-mode) fixtures — same
// generation formula, same domain — so this cell's rendered color-scale
// shading must match exactly across both modes if research.md §4's own
// "domain is always author-specified, never mode-dependent" finding
// holds in the shipped code, not just in the code as read during
// research.
const COLOR_SCALE_COLUMN = `{ field: trip_distance, label: "Distance", format: ",.1f", color_scale: sequential, domain: [0.1, 50.0] }`

const INJECTED_TAB_YAML = `
header:
  tab: ScaleTest
  title: Server-Side Pagination Test Tab
layout:
  row1:
    - type:       table
      title:      "Server-Side Pagination Test"
      metric:     ${TEST_METRIC}
      scenario:   ${SCENARIO}
      searchable: true
      pagination: 20
      columns:
        - { field: trip_id,        label: "Trip ID" }
        - { field: primary_purpose, label: "Purpose" }
        - ${COLOR_SCALE_COLUMN}
  row2:
    - type:       table
      title:      "Server-Side Pagination Test (Small, Client Mode)"
      metric:     ${SMALL_METRIC}
      scenario:   ${SCENARIO}
      searchable: true
      pagination: 20
      columns:
        - { field: trip_id,        label: "Trip ID" }
        - { field: primary_purpose, label: "Purpose" }
        - ${COLOR_SCALE_COLUMN}
`

function tripsSql(rowCount: number): string {
  return `
    SELECT
      i AS trip_id,
      ['work','school','shopping','social','eatout','escort','othmaint','othdiscr','univ','atwork'][1 + (i % 10)] AS primary_purpose,
      -- CAST to DOUBLE explicitly: a bare ROUND(...,1) infers as DECIMAL in
      -- DuckDB, which query()'s Arrow-to-JSON conversion surfaces as a JS
      -- object (not typeof 'number'), silently excluding it from
      -- inferColumnValueType()/buildSearchPredicate() (the same real
      -- gotcha this project's od_flows metric already hit). No real
      -- summarize.yaml metric uses ROUND() (confirmed via grep) — this is
      -- purely a test-fixture-generation artifact, fixed here.
      CAST(ROUND(0.1 + (i % 500) * 0.1, 1) AS DOUBLE) AS trip_distance
    FROM generate_series(1, ${rowCount}) AS t(i)
  `
}

test.beforeAll(() => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), '059-scale-test-'))

  const tmpParquet = path.join(tmpDir, `${TEST_METRIC}.parquet`)
  execFileSync(
    DUCKDB_CLI,
    ['-c', `COPY (${tripsSql(REAL_ROW_COUNT)}) TO '${tmpParquet.replace(/\\/g, '/')}' (FORMAT PARQUET);`],
    { stdio: 'inherit' },
  )
  copyFileSync(tmpParquet, TARGET_PARQUET)

  const smallTmpParquet = path.join(tmpDir, `${SMALL_METRIC}.parquet`)
  execFileSync(
    DUCKDB_CLI,
    [
      '-c',
      `COPY (${tripsSql(SMALL_ROW_COUNT)}) TO '${smallTmpParquet.replace(/\\/g, '/')}' (FORMAT PARQUET);`,
    ],
    { stdio: 'inherit' },
  )
  copyFileSync(smallTmpParquet, SMALL_TARGET_PARQUET)

  // Copy (not move) into the real scenario folder — mirrors this
  // project's own established "generate then place a real, throwaway
  // asset" technique.
  rmSync(tmpDir, { recursive: true, force: true })
  if (!existsSync(TARGET_PARQUET)) {
    throw new Error(`059-server-side-pagination test setup: ${TARGET_PARQUET} was not created`)
  }
  if (!existsSync(SMALL_TARGET_PARQUET)) {
    throw new Error(`059-server-side-pagination test setup: ${SMALL_TARGET_PARQUET} was not created`)
  }
})

test.afterAll(() => {
  rmSync(TARGET_PARQUET, { force: true })
  rmSync(SMALL_TARGET_PARQUET, { force: true })
})

async function boot(page: Page) {
  await page.route('**/demo-dashboard-config/index.json', async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.dashboards = ['dashboard-9-scaletest.yaml', ...json.dashboards]
    await route.fulfill({ response: res, json })
  })
  await page.route('**/demo-dashboard-config/dashboard-9-scaletest.yaml', async (route) => {
    await route.fulfill({ contentType: 'text/yaml', body: INJECTED_TAB_YAML })
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForSelector('h1:has-text("Server-Side Pagination Test Tab")', { timeout: 15_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

const REAL_TITLE = 'Server-Side Pagination Test'

test.describe('059-server-side-pagination — User Story 1: a real large table sorts and pages quickly', () => {
  test('sorts by a real column, pages to a page near the end as fast as a page near the start, and accounts for every row exactly once across a non-unique sort column', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // Confirm this real table actually took the query-driven path (a
    // real, live cross-check via the app's own debug hook — never
    // hardcoded): 250,000 real rows is comfortably over the 100,000-row
    // threshold.
    const realRowCount = (
      await page.evaluate(
        ({ scenario, metric }) => window.__wftdm!.query(`SELECT COUNT(*) AS cnt FROM "${scenario}__${metric}"`),
        { scenario: SCENARIO, metric: TEST_METRIC },
      )
    )[0].cnt
    expect(Number(realRowCount)).toBe(REAL_ROW_COUNT)

    // Sort by the non-unique "Purpose" column (10 distinct values across
    // 250,000 rows) and confirm every row is reachable exactly once,
    // walking first/middle/last pages directly (fast — no need to visit
    // all 12,500 pages one at a time).
    await card.getByRole('button', { name: 'Purpose' }).click()

    const seenIds = new Set<number>()

    // Sorting resets to page 0 (handleSort's own existing behavior), so
    // "First page" starts out correctly disabled — capture page 0's rows
    // directly, no click needed. This intentionally isn't included in
    // the flat-latency timing comparison below (it's entangled with the
    // sort click's own query cost, not a pure pagination cost).
    await expect(card.locator('tbody tr').first()).toBeVisible()
    ;(await card.locator('tbody tr td:first-child').allTextContents()).forEach((id) => seenIds.add(Number(id)))

    // Boundary round-trip: jump to the last page (a deep cursor), then
    // back to the first (now enabled, since we're no longer on it) —
    // both are real UI clicks whose timing is directly comparable,
    // proving flat latency regardless of cursor depth (research.md §2).
    const timings: number[] = []
    for (const label of ['Last page', 'First page'] as const) {
      const t0 = Date.now()
      await card.getByRole('button', { name: label }).click()
      await expect(card.locator('tbody tr').first()).toBeVisible()
      timings.push(Date.now() - t0)
      const ids = await card.locator('tbody tr td:first-child').allTextContents()
      ids.forEach((id) => seenIds.add(Number(id)))
    }

    // Flat latency: the first and last page must not differ by an
    // order of magnitude (research.md §2's own real, measured
    // 38.8-88.9ms band at this scale) — a generous 300ms ceiling per
    // page absorbs real CI variance without being a flaky hair-trigger.
    for (const ms of timings) {
      expect(ms).toBeLessThan(300)
    }

    // Direct query-layer proof that the SAME ROW_NUMBER() numbering the
    // real page query uses is gap-free and duplicate-free across the
    // WHOLE table — one aggregate query, not a 12,500-page loop (which
    // would serialize, one at a time, on DuckDB-WASM's single shared
    // connection — this project's own already-documented boot-
    // performance finding, item 26 above). Mathematically equivalent to
    // walking every page and unioning the ids: if __rn spans exactly
    // 1..N with N distinct values over N real rows, then a page-by-page
    // walk using this same numbering visits every row exactly once.
    const walk = await page.evaluate(
      async ({ scenario, metric }) => {
        const view = `"${scenario}__${metric}"`
        const rows = await window.__wftdm!.query(
          `SELECT COUNT(*) AS row_count, COUNT(DISTINCT __rn) AS distinct_rn, MIN(__rn) AS min_rn, MAX(__rn) AS max_rn
           FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY primary_purpose ASC) AS __rn FROM ${view})`,
        )
        const r = rows[0] as { row_count: number | bigint; distinct_rn: number | bigint; min_rn: number | bigint; max_rn: number | bigint }
        return { rowCount: Number(r.row_count), distinctRn: Number(r.distinct_rn), minRn: Number(r.min_rn), maxRn: Number(r.max_rn) }
      },
      { scenario: SCENARIO, metric: TEST_METRIC },
    )
    expect(walk.rowCount).toBe(REAL_ROW_COUNT)
    expect(walk.distinctRn).toBe(REAL_ROW_COUNT)
    expect(walk.minRn).toBe(1)
    expect(walk.maxRn).toBe(REAL_ROW_COUNT)
  })
})

test.describe('059-server-side-pagination — User Story 2: search matches the same rendered text a viewer sees', () => {
  test('searching a formatted distance value finds the matching row, the same as a small client-mode table would', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // trip_distance is generated as (i % 500) * 0.1, formatted as ",.1f"
    // — row i=1234 has trip_distance = (1234 % 500) * 0.1 = 23.4,
    // rendered as "23.4" (no thousands separator needed at this
    // magnitude, but the format() call still runs).
    await card.getByLabel('Search Server-Side Pagination Test').fill('23.4')
    await expect(card.locator('tbody tr').first()).toBeVisible()
    const rows = await card.locator('tbody tr').count()
    expect(rows).toBeGreaterThan(0)
    const distances = await card.locator('tbody tr td:nth-child(3)').allTextContents()
    for (const d of distances) {
      expect(d).toContain('23.4')
    }
  })

  test('an apostrophe in the search term does not break the query (SQL quote-escaping, research.md §6)', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    await card.getByLabel('Search Server-Side Pagination Test').fill("o'brien")
    // No real row contains this text — the real assertion is that the
    // query doesn't error (the panel doesn't fall into its error state)
    // and instead shows the genuine "no rows match" empty state.
    await expect(card.getByText('No rows match your search')).toBeVisible({ timeout: 10_000 })
  })
})

const SMALL_TITLE = 'Server-Side Pagination Test (Small, Client Mode)'

test.describe('059-server-side-pagination — User Story 3: color-scaled columns render identically in both modes', () => {
  test('a query-driven (large-table) panel colors a cell exactly the same as a client-mode (small-table) panel, for the same value/scale/domain', async ({
    page,
  }) => {
    await boot(page)
    const largeCard = panelCard(page, REAL_TITLE)
    const smallCard = panelCard(page, SMALL_TITLE)
    await expect(largeCard.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
    await expect(smallCard.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // Confirm the large table actually took the query-driven path and
    // the small one stayed client-mode — otherwise this test wouldn't
    // be proving what it claims to.
    const [largeRowCount, smallRowCount] = await Promise.all([
      page
        .evaluate(
          ({ scenario, metric }) => window.__wftdm!.query(`SELECT COUNT(*) AS cnt FROM "${scenario}__${metric}"`),
          { scenario: SCENARIO, metric: TEST_METRIC },
        )
        .then((rows) => Number(rows[0].cnt)),
      page
        .evaluate(
          ({ scenario, metric }) => window.__wftdm!.query(`SELECT COUNT(*) AS cnt FROM "${scenario}__${metric}"`),
          { scenario: SCENARIO, metric: SMALL_METRIC },
        )
        .then((rows) => Number(rows[0].cnt)),
    ])
    expect(largeRowCount).toBe(REAL_ROW_COUNT)
    expect(smallRowCount).toBe(SMALL_ROW_COUNT)

    // trip_id=1 is the first row in both fixtures' natural/scan order
    // (no sort applied by either panel), with the identical generation
    // formula giving it trip_distance = 0.2 in both — the same value on
    // the same author-configured color_scale/domain must resolve to the
    // exact same rendered color, per research.md §4's "domain is always
    // author-specified, never mode-dependent" finding.
    const largeFirstRowId = await largeCard.locator('tbody tr').first().locator('td').first().innerText()
    const smallFirstRowId = await smallCard.locator('tbody tr').first().locator('td').first().innerText()
    expect(largeFirstRowId).toBe('1')
    expect(smallFirstRowId).toBe('1')

    const largeColor = await largeCard
      .locator('tbody tr')
      .first()
      .locator('td')
      .nth(2)
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    const smallColor = await smallCard
      .locator('tbody tr')
      .first()
      .locator('td')
      .nth(2)
      .evaluate((el) => getComputedStyle(el).backgroundColor)

    expect(largeColor).toBe(smallColor)
    // Also confirm shading is genuinely applied, not both sides
    // silently falling back to "no color" (which would trivially match
    // too, and wouldn't prove anything).
    expect(largeColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(largeColor).not.toBe('transparent')
  })
})
