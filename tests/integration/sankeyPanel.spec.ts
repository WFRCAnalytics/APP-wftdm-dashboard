import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 008-sankey-panel, extending
// observablePlotPanel.spec.ts's/tablePanel.spec.ts's/markdownPanel.spec.ts's
// pattern (real DuckDB-WASM, fixture Parquet, fixture dashboard-config).
// See quickstart.md and contracts/sankey-panel.md.
//
// Fixture shape (tests/fixtures/dashboard-config/dashboard-1-summary.yaml's
// row_sankey):
// - "Sankey Tour-to-Trip Mode Consistency": color_scheme: Tableau10,
//   reactive to $filters.purpose — US1/US2's primary vehicle.
// - "Sankey Mode Consistency (No Color Scheme)": same metric, color_scheme
//   omitted — the token-derived-fallback-palette vehicle.
// - "Sankey Broken Panel (intentional)": metric no scenario publishes —
//   error state.
//
// Fixture data (tests/fixtures/generate.py's TOUR_MODE_TO_TRIP_MODE_ROWS),
// purpose: 'all' (default, no WHERE clause): 10 distinct nodes (5 source +
// 5 target, namespaced), 10 links, 1 row excluded (Non-Motorized -> SOV,
// trips: -5). purpose: 'NHB' narrows to 5 nodes / 3 links — a clearly
// different diagram, used for filter-reactivity coverage.

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

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

function expandTrigger(page: Page, title: string) {
  return page.getByRole('button', { name: `Expand ${title}` })
}

async function queryCountFor(page: Page, needle: string) {
  return page.evaluate(
    (n) => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes(n)).length,
    needle,
  )
}

async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check).toBe(true)
}

test.describe('User Story 1 - Author renders a two-column flow metric as a Sankey diagram', () => {
  test('rendered nodes/links match a direct GROUP BY/SUM aggregation, including the corrected same-value-row case', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    const chart = card.locator('.sankey-chart svg[viewBox]')
    await expect(chart).toBeVisible()

    // Direct aggregation of the same fixture data, at the panel's default
    // filter value ('all' — no WHERE clause).
    const rows = await page.evaluate(() =>
      window.__wftdm!.query(`SELECT * FROM good_scenario__tour_mode_to_trip_mode`),
    )
    const positiveRows = rows.filter((r: Record<string, unknown>) => Number(r.trips) > 0)
    const expectedNodeIds = new Set<string>()
    const expectedLinkKeys = new Set<string>()
    for (const r of positiveRows as Record<string, unknown>[]) {
      expectedNodeIds.add(`source:${r.tour_mode}`)
      expectedNodeIds.add(`target:${r.trip_mode}`)
      expectedLinkKeys.add(`source:${r.tour_mode}|target:${r.trip_mode}`)
    }

    await expect(chart.locator('rect[data-node-id]')).toHaveCount(expectedNodeIds.size)
    await expect(chart.locator('path[data-source-id]')).toHaveCount(expectedLinkKeys.size)

    // The corrected self-loop reasoning (research.md §4): SOV -> SOV
    // (tour_mode == trip_mode) must render as two distinct nodes joined by
    // a real link — not be excluded as if it were a genuine self-loop.
    await expect(chart.locator('rect[data-node-id="source:SOV"]')).toHaveCount(1)
    await expect(chart.locator('rect[data-node-id="target:SOV"]')).toHaveCount(1)
    const sovLink = chart.locator('path[data-source-id="source:SOV"][data-target-id="target:SOV"]')
    await expect(sovLink).toHaveCount(1)
    // 500 (HBW) + 80 (NHB) summed into one link, per the direct aggregation.
    await expect(sovLink).toHaveAttribute('data-value', '580')
  })

  test('color_scheme: Tableau10 uses the real d3-scale-chromatic colors; omitted color_scheme uses the token-derived fallback', async ({
    page,
  }) => {
    await boot(page)

    const tableauCard = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    const tableauChart = tableauCard.locator('.sankey-chart svg[viewBox]')
    await expect(tableauChart.locator('rect[data-node-id]')).not.toHaveCount(0)
    const tableauFills = await tableauChart.locator('rect[data-node-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('fill')),
    )
    expect(new Set(tableauFills).size).toBeGreaterThan(1) // genuinely categorical, not one flat color
    for (const fill of tableauFills) {
      expect(REAL_TABLEAU10.map((c) => c.toLowerCase())).toContain(fill!.toLowerCase())
    }

    const fallbackCard = panelCard(page, 'Sankey Mode Consistency (No Color Scheme)')
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

  test('excludes the non-positive-value row from the diagram and logs exactly one console.warn with the excluded count', async ({
    page,
  }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning') consoleMessages.push(msg.text())
    })

    await boot(page)
    const card = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)

    // Non-Motorized -> SOV (trips: -5) must never appear as a rendered link.
    await expect(
      card.locator('.sankey-chart svg[viewBox] path[data-source-id="source:Non-Motorized"][data-target-id="target:SOV"]'),
    ).toHaveCount(0)

    // Scoped to this specific panel's own message — the sibling
    // "Sankey Mode Consistency (No Color Scheme)" panel queries the same
    // metric and independently logs its own warning too.
    const thisWarnings = consoleMessages.filter((m) =>
      m.includes('Sankey Tour-to-Trip Mode Consistency'),
    )
    expect(thisWarnings).toHaveLength(1)
    expect(thisWarnings[0]).toContain('excluded 1 row')
  })

  test('a rejected/unresolvable config renders PanelErrorState', async ({ page }) => {
    await boot(page)
    await expect(
      panelCard(page, 'Sankey Broken Panel (intentional)').getByText("Couldn't load this diagram"),
    ).toBeVisible()
  })
})

test.describe('User Story 2 - Sankey panel responds to global filters like every other panel type', () => {
  test('changing the global purpose filter re-queries and re-renders only matching rows', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    const chart = card.locator('.sankey-chart svg[viewBox]')
    await expect(chart.locator('rect[data-node-id]')).toHaveCount(10)
    await expect(chart.locator('path[data-source-id]')).toHaveCount(10)

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NHB'))

    await expect(chart.locator('rect[data-node-id]')).toHaveCount(5)
    await expect(chart.locator('path[data-source-id]')).toHaveCount(3)

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
    await expect(chart.locator('rect[data-node-id]')).toHaveCount(10)
  })

  test('a filter value matching zero rows shows PanelEmptyState', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NONEXISTENT'))
    await expect(card.getByText('No data for this selection')).toBeVisible()

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)
  })

  // Regression coverage for the useRef-vs-local-variable resize-guard bug
  // found and fixed in contracts/sankey-panel.md: a filter change with the
  // container's on-screen size unchanged must still redraw. A guard that
  // persists across the component's lifetime would pass a weaker "a query
  // re-ran" assertion while silently failing to redraw — this test
  // inspects the rendered SVG content itself, not just query activity.
  test('a filter change with no resize still redraws the diagram content', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    const chart = card.locator('.sankey-chart svg[viewBox]')
    await expect(chart.locator('rect[data-node-id]')).toHaveCount(10)

    const nodeIdsBefore = await chart.locator('rect[data-node-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-node-id')).sort(),
    )

    // No viewport resize, no 004 dialog interaction — container size is
    // unchanged between these two reads.
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NHB'))

    await trueEventually(async () => {
      const count = await chart.locator('rect[data-node-id]').count()
      return count === 5
    })
    const nodeIdsAfter = await chart.locator('rect[data-node-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-node-id')).sort(),
    )
    expect(nodeIdsAfter).not.toEqual(nodeIdsBefore)
    expect(nodeIdsAfter).toEqual(
      ['source:HOV', 'source:SOV', 'source:Transit', 'target:SOV', 'target:Transit'].sort(),
    )

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
  })
})

test.describe('User Story 3 - Sankey panel behaves consistently with the rest of the panel registry', () => {
  test('004 expand/collapse renders correctly proportioned and issues zero additional query', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)

    const inlineBox = await card.locator('.sankey-chart svg[viewBox]').first().boundingBox()
    const before = await queryCountFor(page, 'tour_mode_to_trip_mode')
    expect(before).toBeGreaterThan(0)

    await expandTrigger(page, 'Sankey Tour-to-Trip Mode Consistency').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)

    const dialogBox = await dialog.locator('.sankey-chart svg[viewBox]').first().boundingBox()
    expect(dialogBox!.width).toBeGreaterThan(inlineBox!.width)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)
    await expect(expandTrigger(page, 'Sankey Tour-to-Trip Mode Consistency')).toBeFocused()

    const after = await queryCountFor(page, 'tour_mode_to_trip_mode')
    expect(after).toBe(before)
  })

  test('resizing the browser window itself relayouts the diagram without distortion', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
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
    await expect(chart.locator('rect[data-node-id]')).toHaveCount(10)
    const box = await chart.boundingBox()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)

    await page.setViewportSize(currentSize)
  })

  test('a tab mixing sankey with valuebox/plotly/table/markdown/observable-plot panels renders all of them without error', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.getByText('Total Households')).toBeVisible() // valuebox
    await expect(page.getByText('Mode Share by Purpose', { exact: true })).toBeVisible() // plotly
    await expect(panelCard(page, 'Screenline Validation').locator('table')).toBeVisible() // table
    await expect(
      panelCard(page, 'Methodology Notes').getByRole('heading', { name: 'Highway Assignment Validation' }),
    ).toBeVisible() // markdown
    await expect(
      panelCard(page, 'Observable Plot Mode Share (Bar)').locator('.observable-plot-chart svg[viewBox]'),
    ).toBeVisible() // observable-plot

    const sankeyCard = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    await expect(sankeyCard.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)
    await expect(expandTrigger(page, 'Sankey Tour-to-Trip Mode Consistency')).toBeVisible()
  })

  test('a sankey panel uses the same inline loading skeleton convention as PlotlyPanel/ObservablePlotPanel, not a new shared component', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Sankey Tour-to-Trip Mode Consistency')
    await expect(card.locator('.sankey-chart svg[viewBox] rect[data-node-id]')).not.toHaveCount(0)
    await expect(card.locator('.animate-pulse')).toHaveCount(0)
  })
})
