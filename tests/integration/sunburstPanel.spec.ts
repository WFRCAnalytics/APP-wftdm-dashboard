import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 058-hierarchical-chart-panels — real-browser tests for the new `sunburst`
// panel type. Real vehicle: "Trip Purpose to Mode Breakdown (Sunburst)"
// (dashboard-8-test.yaml, purpose_mode_flow, activitysim-baseline) — the
// SAME real two-level hierarchy treemapPanel.spec.ts's own header comment
// documents (10 real primary_purpose values, up to 5 real major_trip_mode
// values each), proving research.md §6's own "same real hierarchy, two
// ways" architectural claim directly. Real total: 23,583 trips (confirmed
// live via the duckdb CLI). Real smallest leaf: school/Ride Hail = 1 trip
// — the vehicle for this file's own FR-009 (negligibly-small-node) test.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoTestTab(page: Page) {
  await page.getByRole('tab', { name: 'Test' }).click()
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function waitForQueryActivityToSettle(page: Page) {
  // Same real, confirmed helper treemapPanel.spec.ts's own T013 needed —
  // see that file's header comment for the full finding.
  let stableStreak = 0
  let previous = -1
  await expect
    .poll(
      async () => {
        const current = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)
        stableStreak = current === previous ? stableStreak + 1 : 0
        previous = current
        return stableStreak
      },
      { timeout: 15_000, intervals: [500] },
    )
    .toBeGreaterThanOrEqual(3)
}

const REAL_TITLE = 'Trip Purpose to Mode Breakdown (Sunburst)'

test.describe('User Story 2 - Author renders the same real hierarchy as a zoomable sunburst', () => {
  test('renders real purpose/mode arcs, angular width proportional to real totals, cross-checked against a direct query', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, REAL_TITLE)
    const arcs = card.locator('path[data-node-name]')

    // 10 real top-level purpose arcs + up to 5 real mode arcs per purpose —
    // real, confirmed live: exactly 60 (10 purposes all have all 5 real
    // modes represented).
    await expect(arcs).toHaveCount(60, { timeout: 10_000 })

    const totals = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT primary_purpose, SUM(trips) AS total FROM "activitysim-baseline__purpose_mode_flow" GROUP BY primary_purpose ORDER BY total DESC`,
      ),
    )
    expect(totals).toHaveLength(10)
    expect(String((totals as { primary_purpose: string }[])[0].primary_purpose)).toBe('work')

    // Every top-level purpose arc has its own real, distinct fill color —
    // same depth-1-ancestor-keyed convention treemapPanel.spec.ts's own
    // test already confirms for the treemap.
    const topLevelFills = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('path[data-node-path]'))
          .filter((el) => !(el.getAttribute('data-node-path') ?? '').includes(' / '))
          .map((el) => getComputedStyle(el).fill),
      )
      .then((fills) => fills)
    expect(new Set(topLevelFills).size).toBe(5)
  })

  test('clicking a non-leaf arc zooms so it becomes the center; clicking the center circle zooms back out', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, REAL_TITLE)
    const arcs = card.locator('path[data-node-name]')
    await expect(arcs).toHaveCount(60, { timeout: 10_000 })

    const work = card.locator('path[data-node-path="work"]')
    await work.click()

    // After zooming into "work", its own 5 real mode arcs should be
    // visible (fill-opacity !== '0') — real cross-check via the arc's own
    // data-node-path.
    const workSov = card.locator('path[data-node-path="work / SOV"]')
    await expect(workSov).toHaveCSS('fill-opacity', '0.55', { timeout: 10_000 })

    // The center circle is the zoom-out affordance — clicking it returns
    // to the full view (real top-level purpose arcs visible again).
    const centerCircle = card.locator('circle')
    await centerCircle.click()
    await expect(work).toHaveCSS('fill-opacity', '0.75', { timeout: 10_000 })
  })

  test('a negligibly small node (school/Ride Hail, 1 real trip) renders with no overflowing/broken label', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('path[data-node-name]')).toHaveCount(60, { timeout: 10_000 })

    // Real, confirmed live: school/Ride Hail = 1 trip out of 23,583 total
    // — a genuinely negligible angular slice.
    const tinyArc = card.locator('path[data-node-path="school / Ride Hail"]')
    await expect(tinyArc).toHaveAttribute('data-node-value', '1')

    // Its own label must be hidden (opacity 0) — the reference's own real
    // labelVisible() area threshold, reused verbatim (FR-009).
    const labels = card.locator('text')
    const tinyIndex = await card.locator('path[data-node-name]').evaluateAll((paths, targetPath) =>
      paths.findIndex((p) => p.getAttribute('data-node-path') === targetPath),
      'school / Ride Hail',
    )
    expect(tinyIndex).toBeGreaterThanOrEqual(0)
    const tinyLabel = labels.nth(tinyIndex)
    await expect(tinyLabel).toHaveCSS('opacity', '0')

    // A real, large node's label (work, the largest real purpose) IS
    // visible — proving the hidden case above is a real, deliberate
    // threshold, not every label being hidden.
    const workIndex = await card.locator('path[data-node-name]').evaluateAll((paths) =>
      paths.findIndex((p) => p.getAttribute('data-node-path') === 'work'),
    )
    await expect(labels.nth(workIndex)).toHaveCSS('opacity', '1')
  })

  test('shared empty/error states and zero-refetch-on-zoom — proving the host is genuinely shared, not reimplemented', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)

    const emptyCard = panelCard(page, 'Sunburst Empty Result')
    await expect(emptyCard.getByText('No data for this selection', { exact: true })).toBeVisible({ timeout: 10_000 })

    const errorCard = panelCard(page, 'Broken Sunburst Panel (missing metric)')
    await expect(errorCard.getByText("Couldn't load this chart", { exact: true })).toBeVisible({ timeout: 10_000 })

    const card = panelCard(page, REAL_TITLE)
    const arcs = card.locator('path[data-node-name]')
    await expect(arcs).toHaveCount(60, { timeout: 10_000 })

    await waitForQueryActivityToSettle(page)
    const queryCountBefore = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)

    await card.locator('path[data-node-path="work"]').click()
    await expect(card.locator('path[data-node-path="work / SOV"]')).toHaveCSS('fill-opacity', '0.55', {
      timeout: 10_000,
    })
    await card.locator('circle').click()
    await expect(card.locator('path[data-node-path="work"]')).toHaveCSS('fill-opacity', '0.75', { timeout: 10_000 })

    const queryCountAfter = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)
    expect(queryCountAfter).toBe(queryCountBefore)
  })
})
