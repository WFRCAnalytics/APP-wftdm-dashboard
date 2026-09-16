import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 008-sankey-panel, migrated (040-test-suite-
// migration, T023) off the retired synthetic fixture onto the real,
// git-tracked demo content. See quickstart.md and contracts/
// sankey-panel.md for the mechanism itself (unchanged by this migration).
//
// Real vehicle: "Trip Purpose to Mode Flow" (dashboard-4-mode-choice.yaml,
// Mode Choice tab — NOT the landing page, unlike the retired fixture's own
// Summary-tab placement) — metric purpose_mode_flow, source: primary_purpose,
// target: major_trip_mode, value: trips, color_scheme: Tableau10, UNPINNED
// (sums flows across every currently-active scenario). On a plain boot the
// active set is the 3 real 'ready' activitysim-* scenarios (038's own
// auto-activation rule; 'observed' has no purpose_mode_flow data and is
// 'failed' in this environment, never active) — confirmed live via
// `duckdb` CLI directly against the three real Parquet files:
//
//   SELECT primary_purpose, major_trip_mode, SUM(trips) FROM (
//     SELECT * FROM read_parquet('.../activitysim-baseline/.../purpose_mode_flow.parquet')
//     UNION ALL SELECT * FROM read_parquet('.../activitysim-density-variant/...')
//     UNION ALL SELECT * FROM read_parquet('.../activitysim-transit-variant/...')
//   ) GROUP BY primary_purpose, major_trip_mode
//
// — 10 distinct primary_purpose values x 5 distinct major_trip_mode values,
// EVERY one of the 50 combinations present with a real, positive trips sum
// (COUNT(*)-derived at the summarize.yaml level, so a zero/negative row is
// structurally impossible — a GROUP BY only ever emits a row for a
// combination that actually occurred). This means:
//   - 15 distinct nodes (10 "source:<purpose>" + 5 "target:<mode>"), 50
//     distinct links, at the panel's real default (no filter configured).
//   - The retired fixture's "excludes a non-positive-value row, logs
//     exactly one console.warn" test has NO real trigger and is retired
//     outright (structurally impossible, matching zonemapPanel.spec.ts's
//     (T025) own identical class of finding for its retired "excluded"
//     mechanic).
//   - The retired fixture's "SOV -> SOV same-value-row" self-loop
//     correction test also has no real analog: primary_purpose and
//     major_trip_mode are two disjoint vocabularies (a purpose string
//     can never equal a mode string), so no real source/target pair ever
//     collides the way a single tour_mode/trip_mode vocabulary could.
//     Retired outright, not worked around.
//
// A second real sankey panel, "Trip Purpose to Mode Flow (No Color
// Scheme)" (same tab, same metric, color_scheme omitted), is this
// migration's own small addition — the real vehicle for the
// token-derived-fallback-palette case. A third small addition, "Sankey
// Empty Result" (dashboard-8-test.yaml, pinned to activitysim-baseline,
// filter: { primary_purpose: __no_such_purpose__ }), is the real
// zero-row-filter PanelEmptyState vehicle — the retired fixture's own
// dynamic $filters.purpose-driven version has no real analog (a direct
// grep sweep confirms zero real demo panels anywhere use the reactive
// $filters. placeholder, matching every other file in this migration's
// own identical finding); a literal, non-placeholder filter value is the
// real, established substitute convention.
//
// The retired fixture's "a filter change with no resize still redraws"
// regression test (the useRef-vs-local-variable resize-guard bug,
// contracts/sankey-panel.md) is KEPT, redesigned around a real, different
// reactive trigger: toggling a scenario's own Switch (appState.setActive)
// — a real, working reactive mechanism for this specific unpinned panel
// (its own description literally invites this: "Toggle scenarios on the
// Scenarios tab to isolate one run"), proving the exact same class of
// regression (a content change with no container-size change must still
// redraw) without depending on the $filters. mechanism this real content
// never uses.
//
// "Broken Sankey Panel (missing metric)" (dashboard-8-test.yaml,
// permanent Test tab) replaces the retired fixture's own "Sankey Broken
// Panel (intentional)".

const REAL_TABLEAU10 = [
  '#4e79a7',
  '#f28e2c',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc949',
  '#af7aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ab',
]
// 033-shadcn-default-theme: SankeyPanel.tsx's own token-derived fallback
// moved from WFRC brand tokens to --chart-1..4 (research.md §7's
// disambiguation from RechartsPanel's separate, still out-of-scope
// palette) — these are tokens.css's real LIGHT-mode --chart-1..4 hex
// values (Playwright's default colorScheme is 'light', unset here).
const FALLBACK_TOKEN_HEX = ['#3358be', '#ba7f00', '#cc4330', '#008029']

const REAL_SANKEY_TITLE = 'Trip Purpose to Mode Flow'
const FALLBACK_SANKEY_TITLE = 'Trip Purpose to Mode Flow (No Color Scheme)'

// The real, live-confirmed UNION ALL every currently-active scenario's
// own purpose_mode_flow view contributes to on a plain boot (the panel's
// own real $scenario.purpose_mode_flow expansion) — used only to build
// this test's OWN cross-check query, never asserted as a literal DOM
// value anywhere (every assertion below still cross-checks against a
// live query result, not a hardcoded number).
const ACTIVE_SCENARIO_VIEWS = [
  '"activitysim-baseline__purpose_mode_flow"',
  '"activitysim-density-variant__purpose_mode_flow"',
  '"activitysim-transit-variant__purpose_mode_flow"',
]

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoModeChoiceTab(page: Page) {
  await page.getByRole('tab', { name: 'Mode Choice' }).click()
}

async function gotoTestTab(page: Page) {
  await page.getByRole('tab', { name: 'Test' }).click()
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

function expandTrigger(page: Page, title: string) {
  // exact: true — "Trip Purpose to Mode Flow" is a real substring of
  // this migration's own new "Trip Purpose to Mode Flow (No Color
  // Scheme)" sibling panel's accessible name; a real, confirmed
  // strict-mode collision found via a live isolated run before this fix.
  return page.getByRole('button', { name: `Expand ${title}`, exact: true })
}

async function queryCountFor(page: Page, needle: string) {
  return page.evaluate(
    (n) => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes(n)).length,
    needle,
  )
}

async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check, { timeout: 10000 }).toBe(true)
}

test.describe('User Story 1 - Author renders a two-column flow metric as a Sankey diagram', () => {
  test('rendered nodes/links match a direct GROUP BY/SUM aggregation across every active scenario', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_SANKEY_TITLE)
    const chart = card.locator('.sankey-chart svg[viewBox]')
    await expect(chart).toBeVisible()

    // Direct aggregation of the real data, across every real scenario
    // this unpinned panel's own $scenario union currently spans.
    const rows = await page.evaluate(
      (views) =>
        window.__wftdm!.query(
          `SELECT primary_purpose, major_trip_mode, SUM(trips) AS trips FROM (
             ${views.map((v) => `SELECT * FROM ${v}`).join(' UNION ALL ')}
           ) GROUP BY primary_purpose, major_trip_mode`,
        ),
      ACTIVE_SCENARIO_VIEWS,
    )
    const expectedNodeIds = new Set<string>()
    const expectedLinkKeys = new Set<string>()
    for (const r of rows as Record<string, unknown>[]) {
      expectedNodeIds.add(`source:${r.primary_purpose}`)
      expectedNodeIds.add(`target:${r.major_trip_mode}`)
      expectedLinkKeys.add(`source:${r.primary_purpose}|target:${r.major_trip_mode}`)
    }

    // Real, confirmed values (queried directly via the duckdb CLI before
    // writing this test, not guessed) — locks the cross-check itself in
    // against a silent future data change, same discipline
    // flowmapPanel.spec.ts's (T024) own aggregation test established.
    expect(expectedNodeIds.size).toBe(15)
    expect(expectedLinkKeys.size).toBe(50)

    await expect(chart.locator('rect[data-node-id]')).toHaveCount(expectedNodeIds.size)
    await expect(chart.locator('path[data-source-id]')).toHaveCount(expectedLinkKeys.size)
  })

  test('color_scheme: Tableau10 uses the real d3-scale-chromatic colors; omitted color_scheme uses the token-derived fallback', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)

    const tableauCard = panelCard(page, REAL_SANKEY_TITLE)
    const tableauChart = tableauCard.locator('.sankey-chart svg[viewBox]')
    await expect(tableauChart.locator('rect[data-node-id]')).not.toHaveCount(0)
    const tableauFills = await tableauChart.locator('rect[data-node-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('fill')),
    )
    expect(new Set(tableauFills).size).toBeGreaterThan(1) // genuinely categorical, not one flat color
    for (const fill of tableauFills) {
      expect(REAL_TABLEAU10.map((c) => c.toLowerCase())).toContain(fill!.toLowerCase())
    }

    const fallbackCard = panelCard(page, FALLBACK_SANKEY_TITLE)
    const fallbackChart = fallbackCard.locator('.sankey-chart svg[viewBox]')
    await expect(fallbackChart.locator('rect[data-node-id]')).not.toHaveCount(0)
    const fallbackFills = await fallbackChart.locator('rect[data-node-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('fill')),
    )
    expect(new Set(fallbackFills).size).toBeGreaterThan(1)
    for (const fill of fallbackFills) {
      expect(FALLBACK_TOKEN_HEX.map((c) => c.toLowerCase())).toContain(fill!.toLowerCase())
    }
  })

  // The retired fixture's own "excludes the non-positive-value row, logs
  // exactly one console.warn" test is retired outright — structurally
  // impossible against this real metric. purpose_mode_flow is a plain
  // COUNT(*) GROUP BY (summarize.yaml) — a GROUP BY only ever emits a row
  // for a combination that genuinely occurred at least once, so no
  // zero/negative trips value can exist in real output. Confirmed
  // directly via the duckdb CLI across all three real scenario files
  // (MIN(trips) = 1 in every one) before retiring this test, matching
  // zonemapPanel.spec.ts's (T025) own identical "structurally impossible,
  // not worked around" precedent for its retired "excluded" mechanic.

  test('a rejected/unresolvable config renders PanelErrorState', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    // 10s, not the 5s default — the real Test tab mounts 11+ real/broken
    // map panels at once (flowmapPanel.spec.ts's (T024) own already-
    // documented crowding); a real, confirmed intermittent timeout at
    // the default 5000ms found live in this test during isolated-run
    // iteration, matching that same established resource-contention
    // signature, not a logic bug.
    await expect(
      panelCard(page, 'Broken Sankey Panel (missing metric)').getByText("Couldn't load this diagram"),
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('User Story 2 - Sankey panel responds to real, live reactive changes', () => {
  // The retired fixture's own "changing the global purpose filter
  // re-queries and re-renders" test is retired outright — a direct grep
  // sweep of every real public/demo-dashboard-config/*.yaml file confirms
  // zero panels anywhere use the reactive $filters. placeholder (every
  // other migrated file in this session/migration has found the
  // identical real-content gap: dashboardShell.spec.ts/T014,
  // panelExpand.spec.ts/T027, flowmapPanel.spec.ts/T024,
  // zonemapPanel.spec.ts/T025).

  test('a literal filter matching zero rows shows PanelEmptyState', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    // 10s — same real Test-tab-crowding residual risk as the broken-config
    // test above, confirmed via a real full-suite (10-worker) run.
    await expect(
      panelCard(page, 'Sankey Empty Result').getByText('No data for this selection'),
    ).toBeVisible({ timeout: 10_000 })
  })

  // Regression coverage for the useRef-vs-local-variable resize-guard bug
  // found and fixed in contracts/sankey-panel.md: a content change with
  // the container's on-screen size unchanged must still redraw. A guard
  // that persists across the component's lifetime would pass a weaker "a
  // query re-ran" assertion while silently failing to redraw — this test
  // inspects the rendered SVG content itself, not just query activity.
  // REDESIGNED around a real, different reactive trigger than the
  // retired fixture's own $filters.purpose change: this panel is
  // unpinned, so toggling one active scenario's own Switch off
  // (appState.setActive) genuinely changes its own $scenario union with
  // no resize involved — the exact same regression class the retired
  // test existed to catch, using a mechanism this real content actually
  // has.
  test('toggling a scenario off with no resize still redraws the diagram content', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_SANKEY_TITLE)
    const chart = card.locator('.sankey-chart svg[viewBox]')
    await expect(chart.locator('rect[data-node-id]')).toHaveCount(15)

    const nodeIdsBefore = await chart.locator('rect[data-node-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-node-id')).sort(),
    )

    // No viewport resize, no 004 dialog interaction — container size is
    // unchanged between these two reads. Toggling off the density and
    // transit variants leaves only activitysim-baseline active — the
    // SAME 10-purpose x 5-mode combination space (confirmed live: this
    // real data's own universe of (purpose, mode) pairs is identical
    // across all three scenarios), so node COUNT doesn't change, but the
    // rendered link VALUES (and therefore the SVG path geometry) do —
    // proving a genuine redraw, not a stale cached one.
    await page.evaluate(() => {
      window.__wftdm!.appState.setActive('activitysim-density-variant', false)
      window.__wftdm!.appState.setActive('activitysim-transit-variant', false)
    })

    const workSovLink = () =>
      chart.locator('path[data-source-id="source:work"][data-target-id="target:SOV"]')
    // Combined (3 scenarios): work->SOV = 324 (confirmed via the same
    // live duckdb CLI query this file's own header comment records).
    await expect(workSovLink()).toHaveAttribute('data-value', '324')

    await trueEventually(async () => {
      const value = await workSovLink().getAttribute('data-value')
      // Baseline-only: work->SOV = 107 (confirmed via the duckdb CLI
      // directly against activitysim-baseline's own real Parquet file).
      return value === '107'
    })
    const nodeIdsAfter = await chart.locator('rect[data-node-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-node-id')).sort(),
    )
    expect(nodeIdsAfter).toEqual(nodeIdsBefore) // same 15 nodes — only link values changed

    await page.evaluate(() => {
      window.__wftdm!.appState.setActive('activitysim-density-variant', true)
      window.__wftdm!.appState.setActive('activitysim-transit-variant', true)
    })
  })
})

test.describe('User Story 3 - Sankey panel behaves consistently with the rest of the panel registry', () => {
  test('004 expand/collapse renders correctly proportioned and issues zero additional query', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_SANKEY_TITLE)
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)

    const inlineBox = await card.locator('.sankey-chart svg[viewBox]').first().boundingBox()
    const before = await queryCountFor(page, 'purpose_mode_flow')
    expect(before).toBeGreaterThan(0)

    await expandTrigger(page, REAL_SANKEY_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)

    const dialogBox = await dialog.locator('.sankey-chart svg[viewBox]').first().boundingBox()
    expect(dialogBox!.width).toBeGreaterThan(inlineBox!.width)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)
    await expect(expandTrigger(page, REAL_SANKEY_TITLE)).toBeFocused()

    const after = await queryCountFor(page, 'purpose_mode_flow')
    expect(after).toBe(before)
  })

  test('resizing the browser window itself relayouts the diagram without distortion', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_SANKEY_TITLE)
    const chart = card.locator('.sankey-chart svg[viewBox]')
    await expect(chart.locator('rect[data-node-id]')).not.toHaveCount(0)

    const widthBefore = await chart.getAttribute('width')
    const currentSize = page.viewportSize()!
    await page.setViewportSize({ width: Math.max(currentSize.width - 400, 640), height: currentSize.height })

    await trueEventually(async () => {
      const widthAfter = await chart.getAttribute('width')
      return widthAfter !== widthBefore
    })
    // Still a real, non-degenerate diagram after the resize — not
    // distorted/collapsed to zero.
    await expect(chart.locator('rect[data-node-id]')).toHaveCount(15)
    const box = await chart.boundingBox()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)

    await page.setViewportSize(currentSize)
  })

  // Adapted to the REAL Mode Choice tab's own actual composition — the
  // retired fixture mixed sankey with valuebox/plotly/table/markdown/
  // observable-plot all on one Summary-tab-equivalent; the real Mode
  // Choice tab (where the real sankey panel actually lives) mixes it with
  // table + observable-plot x2 instead, matching markdownPanel.spec.ts's
  // (T020) own identical "adapt to the real tab's actual composition"
  // precedent rather than forcing a five-type mix no real tab has.
  test('a tab mixing sankey with table and observable-plot panels renders all of them without error', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    await expect(panelCard(page, 'Tour Mode Share by Segment').locator('table')).toBeVisible() // table
    await expect(
      panelCard(page, 'At-Work Subtour Mode Share by Purpose').locator('.observable-plot-chart svg[viewBox]'),
    ).toBeVisible() // observable-plot
    await expect(
      panelCard(page, 'Trip Mode Share by Time-of-Day Period (WALK_LOC)').locator(
        '.observable-plot-chart svg[viewBox]',
      ),
    ).toBeVisible() // observable-plot, second instance

    const sankeyCard = panelCard(page, REAL_SANKEY_TITLE)
    await expect(sankeyCard.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)
    await expect(expandTrigger(page, REAL_SANKEY_TITLE)).toBeVisible()
  })

  test('a sankey panel uses the same inline loading skeleton convention as PlotlyPanel/ObservablePlotPanel, not a new shared component', async ({
    page,
  }) => {
    await boot(page)
    await gotoModeChoiceTab(page)
    const card = panelCard(page, REAL_SANKEY_TITLE)
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)
    await expect(card.locator('.animate-pulse')).toHaveCount(0)
  })
})
