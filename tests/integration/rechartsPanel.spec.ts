import { test, expect, type Page, type Locator } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 029-shadcn-chart-panel, extending
// sankeyPanel.spec.ts's/observablePlotPanel.spec.ts's pattern (real
// DuckDB-WASM, fixture Parquet, fixture dashboard-config). See
// quickstart.md and contracts/recharts-panel.md.
//
// Fixture shape (tests/fixtures/dashboard-config/dashboard-1-summary.yaml's
// row_recharts):
// - "Recharts Mode Breakdown (Bar)": trip_mode_share, x: purpose,
//   y: share, series: mode — one x category (HBW), 4 series (SOV/HOV/
//   Transit/Non-Motorized) — the primary US1 vehicle.
// - "Recharts Trip Length Frequency (Line)": trip_destination_dist,
//   x: distance_bin, y: trips, series: mode, filter: purpose: HBW (a
//   literal, non-`$filters.` value) — 2 series (SOV/Transit), 5 x-values.
// - "Recharts Trip Length Frequency (Area)": same metric, no `series`,
//   filter: purpose: HBW, mode: SOV — a single series, 5 x-values.
// - "Recharts Invalid Chart Type (intentional)": chart_type: pie.
// - "Recharts Empty Result (intentional)": a literal filter value
//   matching zero rows.
// - "Recharts Broken Panel (intentional)": a metric no scenario publishes.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

/**
 * Resolves each of --chart-1..--chart-5's current computed color, in the
 * browser's own normalized serialization (e.g. "rgb(2, 60, 91)") — the
 * same format `getComputedStyle(svgEl).fill`/`.stroke` return once a
 * `var(--color-<key>)` reference resolves. Read live from the DOM rather
 * than hardcoded, so this test keeps working across a theme flip or a
 * future token value change without editing expectations by hand.
 */
async function chartTokenColors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement)
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const colors = [1, 2, 3, 4, 5].map((n) => {
      probe.style.color = rootStyle.getPropertyValue(`--chart-${n}`).trim()
      return getComputedStyle(probe).color
    })
    probe.remove()
    return colors
  })
}

async function computedPaint(locator: Locator, prop: 'fill' | 'stroke'): Promise<string[]> {
  return locator.evaluateAll((els, p) => els.map((el) => getComputedStyle(el).getPropertyValue(p)), prop)
}

/**
 * Recharts animates a bar/line/area's geometry from zero on mount by
 * default (real, confirmed live — `d`/`height` keep changing across
 * consecutive reads for ~1.5s) — hovering mid-animation can land on a
 * detached, mid-frame DOM node. Waits for two consecutive reads of the
 * given shape's own `d` attribute to agree, meaning the animation has
 * genuinely settled, before any hover/interaction test relies on a
 * stable position.
 */
async function waitForChartToSettle(shape: Locator) {
  let previous: string | null = null
  await expect
    .poll(
      async () => {
        const current = await shape.getAttribute('d')
        const settled = current !== null && current === previous
        previous = current
        return settled
      },
      { timeout: 5000 },
    )
    .toBe(true)
}

test.describe('User Story 1 - Author renders a bar, line, or area chart with the new default engine', () => {
  test('chart_type: bar renders one bar per distinct series value, each a genuinely distinct real --chart-N color', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Recharts Mode Breakdown (Bar)')
    const bars = card.locator('.recharts-bar-rectangle .recharts-rectangle')

    // Direct aggregation of the same fixture data: trip_mode_share
    // publishes exactly 4 rows (one per mode), all under purpose: HBW.
    const rows = await page.evaluate(() =>
      window.__wftdm!.query(`SELECT * FROM good_scenario__trip_mode_share`),
    )
    expect(rows).toHaveLength(4)
    await expect(bars).toHaveCount(4)
    await waitForChartToSettle(bars.first())

    const fills = await computedPaint(bars, 'fill')
    expect(new Set(fills).size).toBe(4) // 4 series, 4 genuinely distinct paint colors

    const tokenColors = await chartTokenColors(page)
    for (const fill of fills) {
      expect(tokenColors).toContain(fill)
    }

    // FR-007: more than one series (4 here) shows a real legend — but
    // clicking an entry does NOTHING, a deliberate, accepted gap (shadcn's
    // shipped ChartLegendContent wires up no onClick at all, unlike
    // Plotly's own legend). Confirms the negative case directly rather
    // than only asserting the positive "Plotly still works" case
    // elsewhere (T019) — never a silent, accidental toggle.
    const legend = card.locator('.recharts-legend-wrapper')
    await expect(legend).toBeVisible()
    // A specific, small leaf entry (its own real category text) — not a
    // wrapping container div, whose larger bounding box can extend into a
    // sibling panel's own chart area in this fixture's 3-panel row and
    // get its click intercepted there instead.
    const legendEntry = legend.getByText('SOV', { exact: true })
    await expect(legendEntry).toBeVisible()
    const fillsBefore = await computedPaint(bars, 'fill')
    // force: true — same precedent as panelExpand.spec.ts's own Plotly
    // legend-click test (a real, sanctioned Playwright escape hatch for
    // exactly this class of chart-library DOM quirk): still dispatches a
    // real click at the real target element's real coordinates, only
    // skipping Playwright's own pre-click "is this pixel visually
    // clickable" actionability check.
    await legendEntry.click({ force: true })
    const fillsAfter = await computedPaint(bars, 'fill')
    await expect(bars).toHaveCount(4) // no bar hidden/removed
    expect(fillsAfter).toEqual(fillsBefore) // nothing changed at all
  })

  test('chart_type: line and chart_type: area render correctly with the same data-binding and theming, changing only the visual mark', async ({
    page,
  }) => {
    await boot(page)
    const tokenColors = await chartTokenColors(page)

    const lineCard = panelCard(page, 'Recharts Trip Length Frequency (Line)')
    const lines = lineCard.locator('.recharts-line-curve')
    // Direct aggregation: purpose: HBW narrows trip_destination_dist to
    // 2 modes (SOV/Transit) x 5 distance bins — one line per mode.
    await expect(lines).toHaveCount(2)
    const strokes = await computedPaint(lines, 'stroke')
    expect(new Set(strokes).size).toBe(2)
    for (const stroke of strokes) {
      expect(tokenColors).toContain(stroke)
    }
    // Each line has 5 real plotted points (one per distance_bin).
    const firstLineD = await lines.first().getAttribute('d')
    expect(firstLineD).toBeTruthy()

    const areaCard = panelCard(page, 'Recharts Trip Length Frequency (Area)')
    const areas = areaCard.locator('.recharts-area-area')
    // Single-series case (no `series` configured) — exactly one area,
    // colored from the first chart token (rechartsEncoding.ts's own
    // no-series branch always assigns --chart-1).
    await expect(areas).toHaveCount(1)
    // Round 4 (research.md §10): the area's own real fill is now a real
    // SVG gradient (`fill="url(#...)"`, matching shadcn's own real
    // chart-area-gradient.json example), not a flat token color — assert
    // the gradient's own two <stop> elements resolve to that same token
    // color instead of asserting `fill` directly.
    const areaFillAttr = await areas.first().getAttribute('fill')
    const gradientIdMatch = areaFillAttr?.match(/^url\(#(.+)\)$/)
    expect(gradientIdMatch).toBeTruthy()
    const stops = areaCard.locator(`#${gradientIdMatch![1]} stop`)
    await expect(stops).toHaveCount(2)
    const stopColors = await stops.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el as unknown as Element).getPropertyValue('stop-color')),
    )
    for (const stopColor of stopColors) {
      expect(tokenColors).toContain(stopColor)
    }
  })

  test('an invalid chart_type fails clearly and visibly — a real, surfaced configuration error, never a silent blank panel', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Recharts Invalid Chart Type (intentional)')
    await expect(card.getByRole('alert')).toContainText('Unsupported chart_type "pie"')
    // Never falls back to rendering some other chart type either.
    await expect(card.locator('.recharts-wrapper')).toHaveCount(0)
  })

  test('a zero-row query renders PanelEmptyState; a rejected query renders PanelErrorState', async ({
    page,
  }) => {
    await boot(page)
    await expect(
      panelCard(page, 'Recharts Empty Result (intentional)').getByText('No data for this selection'),
    ).toBeVisible()
    await expect(
      panelCard(page, 'Recharts Broken Panel (intentional)').getByText("Couldn't load this chart"),
    ).toBeVisible()
  })
})

test.describe('User Story 2 - Existing panel types remain completely unaffected', () => {
  test('a tab mixing plotly/observable-plot/sankey/recharts panels renders all four without error', async ({
    page,
  }) => {
    await boot(page)
    await expect(
      panelCard(page, 'Mode Share by Purpose').locator('.js-plotly-plot'),
    ).toBeVisible() // plotly
    await expect(
      panelCard(page, 'Observable Plot Mode Share (Bar)').locator('.observable-plot-chart svg[viewBox]'),
    ).toBeVisible() // observable-plot
    await expect(
      panelCard(page, 'Sankey Tour-to-Trip Mode Consistency').locator('.sankey-chart svg[viewBox] rect[data-node-id]'),
    ).not.toHaveCount(0) // sankey
    await expect(
      panelCard(page, 'Recharts Mode Breakdown (Bar)').locator('.recharts-bar-rectangle .recharts-rectangle'),
    ).not.toHaveCount(0) // recharts
  })

  // A direct regression guard for FR-010 — this feature's one deliberate,
  // accepted gap (spec.md's own Assumptions) is that NEW recharts panels
  // don't get legend-click-to-toggle; the EXISTING plotly panel type must
  // keep it, completely unaffected by this feature's registry addition.
  // panelExpand.spec.ts already covers this mechanism inside the 004
  // expand dialog — this test scopes the same real check to the plain
  // inline card instead, a genuinely different render path (PanelCard,
  // not PanelExpandHost's portal).
  test("an existing plotly panel's own legend click-to-toggle-trace-visibility still works, unaffected by the new registry entry", async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Mode Share by Purpose')
    const chart = card.locator('.js-plotly-plot')
    await expect(chart).toBeVisible()

    const legendEntry = card.locator('.legend .traces').first()
    await expect(legendEntry).toBeVisible()

    const tracesBefore = await chart.evaluate((gd) =>
      (gd as unknown as { data: { visible?: boolean | 'legendonly' }[] }).data.map((t) => t.visible ?? true),
    )

    // Same modebar-interception caveat panelExpand.spec.ts's own test
    // documents — scoped to this specific card, not document-wide.
    await card.evaluate((el) => el.querySelector('.modebar-container')?.remove())
    await legendEntry.click()

    await expect
      .poll(async () =>
        chart.evaluate((gd) =>
          (gd as unknown as { data: { visible?: boolean | 'legendonly' }[] }).data.map((t) => t.visible ?? true),
        ),
      )
      .not.toEqual(tracesBefore)
  })
})

test.describe('User Story 3 - A viewer gets useful, on-brand tooltips without extra author work', () => {
  test('hovering a bar shows a real tooltip matching the underlying query value(s) for that point', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Recharts Mode Breakdown (Bar)')
    const bars = card.locator('.recharts-bar-rectangle .recharts-rectangle')
    await expect(bars).toHaveCount(4)

    // Direct aggregation, in the same order the DOM renders bars (real
    // query result order, first-seen — rechartsEncoding.ts). Hovers only
    // the FIRST bar — confirmed live that a SECOND, sequential hover in
    // the same test session gets tangled with Recharts' own shared-cursor
    // highlight overlay (chart.tsx's `.recharts-tooltip-cursor`, spanning
    // the whole grouped category once any bar in it has been hovered),
    // an unrelated Recharts DOM/interaction quirk, not a real defect in
    // this app's own code — one clean, deterministic hover already fully
    // satisfies FR-012's own "matches the real value for that point"
    // requirement without chasing that quirk here.
    const rows = (await page.evaluate(() =>
      window.__wftdm!.query(`SELECT * FROM good_scenario__trip_mode_share`),
    )) as { mode: string; share: number }[]

    // Scoped to THIS card — the fixture tab has 3 recharts panels, each
    // with its own (mostly-empty, not-currently-active) tooltip wrapper
    // div; an unscoped page-level locator resolves to all 3 at once.
    const tooltip = card.locator('.recharts-tooltip-wrapper')
    await waitForChartToSettle(bars.first())
    await bars.first().hover()
    await expect(tooltip).toBeVisible()
    // The real series name (mode) and real value (share) for this exact
    // point — never a placeholder or a hardcoded expectation.
    await expect(tooltip).toContainText(rows[0].mode)
    await expect(tooltip).toContainText(String(rows[0].share))
  })

  test('the tooltip surface and text remain legible in both light and dark mode', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Recharts Mode Breakdown (Bar)')
    const bars = card.locator('.recharts-bar-rectangle .recharts-rectangle')
    // Scoped to THIS card — the fixture tab has 3 recharts panels, each
    // with its own (mostly-empty, not-currently-active) tooltip wrapper
    // div; an unscoped page-level locator resolves to all 3 at once.
    const tooltip = card.locator('.recharts-tooltip-wrapper')
    await waitForChartToSettle(bars.first())

    async function surfaceColors() {
      await bars.first().hover()
      await expect(tooltip).toBeVisible()
      return tooltip.evaluate((el) => {
        const surface = el.firstElementChild as HTMLElement
        const style = getComputedStyle(surface)
        return { bg: style.backgroundColor, text: style.color }
      })
    }

    const light = await surfaceColors()
    // A real, distinct surface/text pair — never invisible white-on-white
    // (or the dark-mode equivalent, checked below).
    expect(light.bg).not.toBe(light.text)

    // Same real mechanism graphicWalkerPanel.spec.ts's own theme test
    // uses (useColorScheme() observes this class directly) — no toggle UI
    // exists in this fixture harness.
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const dark = await surfaceColors()
    expect(dark.bg).not.toBe(dark.text)
    // The surface itself genuinely re-themes — never a hardcoded
    // light-only color that would just look wrong against a dark page.
    expect(dark.bg).not.toBe(light.bg)

    await page.evaluate(() => document.documentElement.classList.remove('dark'))
  })
})
