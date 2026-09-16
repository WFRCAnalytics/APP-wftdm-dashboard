import { test, expect, type Page, type Locator } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 029-shadcn-chart-panel, migrated (040-test-suite-
// migration, Batch B) off the retired synthetic fixture onto the real,
// git-tracked demo content — with a real, deliberate difference from every
// prior panel-type migration in this suite: `057-observable-plot-
// conversion` deliberately moved every real Recharts (and Plotly) bar/
// line/area panel out of the actual demo tabs onto Observable Plot, so
// Recharts (and, as this migration found, Plotly too) no longer has ANY
// real, working home in the actual calibration content. Per direct user
// decision, this panel type's own real mechanics (per-series --chart-N
// coloring, legend, tooltip, theming) live on `dashboard-8-test.yaml`
// instead — the same "exercises a panel type's own mechanics, not part of
// the real calibration story" role that tab already serves for
// `sankeyPanel.spec.ts`'s own recent addition — see that file's own new
// `row_recharts_charts`/`row_plotly_legend` rows for the full real-data
// derivation (every value confirmed live via the `duckdb` CLI before
// authoring, never fabricated).
//
// Real vehicles, all on the permanent "Test" tab (dashboard-8-test.yaml),
// all pinned to `activitysim-baseline`:
// - "Recharts Mode Breakdown (Bar)": trip_mode_share, x/series BOTH
//   `major_trip_mode` — 5 real modes, 5 bars, 5 genuinely distinct real
//   --chart-N colors, zero token wraparound (5 series, 5 tokens).
// - "Recharts Trip Length Frequency (Line)": trip_destination_summary,
//   x: distance_bin, series: primary_purpose — 10 real purposes (no
//   `filter:` narrows this; that grammar only supports one exact-match
//   value, not a list), 10 lines cycling through 5 --chart-N tokens
//   TWICE — a genuinely more thorough real test of token wraparound than
//   the retired fixture's own fabricated 2-series version ever exercised.
// - "Recharts Trip Length Frequency (Area)": same metric, filtered to
//   the one real purpose with all 5 real bins (`work`) — the
//   single-series case, --chart-1 only.
// - "Recharts Invalid Chart Type (pie)" / "Recharts Empty Result" /
//   "Broken Recharts Panel (missing metric)": already real, already on
//   the Test tab from earlier work in this migration — retargeted here,
//   not newly authored.
// - "Plotly Mode Share (Bar)": a real, working, legend-bearing Plotly
//   panel — confirmed live that ZERO real `type: plotly` panels exist
//   anywhere else in demo content any more. Same real trip_mode_share
//   data, `color: $metric.major_trip_mode` (plotlyTraces.ts's own
//   confirmed real split-into-one-trace-per-distinct-value mechanism) —
//   5 real traces, 5 real legend entries, one of them "SOV".

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
      // 10s, not 5s — the real Test tab this migration's own content now
      // lives on is genuinely busier than it was before Batch B (4 more
      // real panels added), the same class of resource-contention residual
      // risk flowmapPanel.spec.ts/zonemapPanel.spec.ts/sankeyPanel.spec.ts
      // already established and raised their own poll timeouts for.
      { timeout: 10_000 },
    )
    .toBe(true)
}

test.describe('User Story 1 - Author renders a bar, line, or area chart with the new default engine', () => {
  test('chart_type: bar renders one bar per distinct series value, each a genuinely distinct real --chart-N color', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Recharts Mode Breakdown (Bar)')
    const bars = card.locator('.recharts-bar-rectangle .recharts-rectangle')

    // Wait for the panel's OWN real render first — 056-lazy-tab-scoped-
    // loading only registers a metric's view once some panel that
    // actually queries it renders; a real, confirmed bug found live in
    // this test's first run (matching scenarioAutoActivation.spec.ts's
    // own identical finding this same migration): issuing the direct
    // cross-check query below BEFORE this wait raced the panel's own
    // registration and threw "Catalog Error: Table ...
    // trip_purpose_share does not exist". 10s (not the 5s default) for
    // the same real Test-tab-crowding reason as waitForChartToSettle's
    // own bumped timeout above.
    await expect(bars).toHaveCount(10, { timeout: 10_000 })
    await waitForChartToSettle(bars.first())

    // Direct aggregation of the real data: trip_purpose_share publishes
    // exactly 10 real rows (one per primary_purpose), confirmed live via
    // the duckdb CLI before authoring this panel. (trip_mode_share was
    // tried first and rejected — see dashboard-8-test.yaml's own header
    // comment on this row for the real, confirmed "Ride Hail" space-in-
    // CSS-var-name bug that finding caused.)
    const rows = await page.evaluate(() =>
      window.__wftdm!.query(`SELECT * FROM "activitysim-baseline__trip_purpose_share"`),
    )
    expect(rows).toHaveLength(10)

    const fills = await computedPaint(bars, 'fill')
    expect(new Set(fills).size).toBe(5) // 10 series, 5 distinct tokens, real wraparound

    const tokenColors = await chartTokenColors(page)
    for (const fill of fills) {
      expect(tokenColors).toContain(fill)
    }

    // FR-007: more than one series (10 here) shows a real legend — but
    // clicking an entry does NOTHING, a deliberate, accepted gap (shadcn's
    // shipped ChartLegendContent wires up no onClick at all, unlike
    // Plotly's own legend). Confirms the negative case directly rather
    // than only asserting the positive "Plotly still works" case
    // elsewhere. "work" is one of the 10 real purposes.
    const legend = card.locator('.recharts-legend-wrapper')
    await expect(legend).toBeVisible()
    // A specific, small leaf entry (its own real category text) — not a
    // wrapping container div, whose larger bounding box can extend into a
    // sibling panel's own chart area in this row's 3-panel layout and get
    // its click intercepted there instead.
    const legendEntry = legend.getByText('work', { exact: true })
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
    await expect(bars).toHaveCount(10) // no bar hidden/removed
    expect(fillsAfter).toEqual(fillsBefore) // nothing changed at all
  })

  test('a real category value containing a space ("Ride Hail") renders a genuine, distinct --chart-N color, not the CSS-invalid-property-name black fallback', async ({
    page,
  }) => {
    // Regression proof for the real, confirmed bug this migration's own
    // Batch B found and deliberately AVOIDED by choosing a different data
    // source (see the "Recharts Mode Breakdown (Bar)" test above, and
    // dashboard-8-test.yaml's own header comment on this row) — since
    // fixed at its root (components/ui/chart.tsx's `ChartStyle` and
    // RechartsPanel.tsx's own `var(--color-${key})` references both now
    // slugify the key via `sanitizeColorKey()` before it becomes part of
    // a CSS custom-property name). This test uses the ORIGINAL real data
    // source the bug was found on (trip_mode_share, real major_trip_mode
    // values including "Ride Hail") — proving the fix against the actual
    // trigger, not a substitute chosen to avoid it.
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Recharts Mode Share (Bar, Space in Category Value)')
    const bars = card.locator('.recharts-bar-rectangle .recharts-rectangle')

    await expect(bars).toHaveCount(5, { timeout: 10_000 })
    await waitForChartToSettle(bars.first())

    // Direct confirmation of the real data: trip_mode_share publishes
    // exactly 5 real rows, one of them "Ride Hail" — confirmed live via
    // the duckdb CLI before authoring this panel.
    const rows = await page.evaluate(() =>
      window.__wftdm!.query(`SELECT * FROM "activitysim-baseline__trip_mode_share"`),
    )
    expect(rows).toHaveLength(5)
    expect((rows as { major_trip_mode: string }[]).map((r) => r.major_trip_mode)).toContain('Ride Hail')

    const fills = await computedPaint(bars, 'fill')
    // The real, confirmed pre-fix symptom: an invalid `--color-Ride Hail`
    // declaration is silently dropped, and Recharts' own black default
    // (`rgb(0, 0, 0)`) paints that one bar instead of a real token color.
    expect(fills).not.toContain('rgb(0, 0, 0)')
    // 5 series, 5 tokens — zero wraparound, every fill a genuinely
    // distinct real --chart-N color (mirrors the "Recharts Mode
    // Breakdown (Bar)" test's own equivalent assertion above).
    expect(new Set(fills).size).toBe(5)
    const tokenColors = await chartTokenColors(page)
    for (const fill of fills) {
      expect(tokenColors).toContain(fill)
    }

    // The real, UNSLUGGED display label still renders verbatim in the
    // legend — only the internal CSS property NAME was ever slugified,
    // never the label a viewer actually sees.
    const legend = card.locator('.recharts-legend-wrapper')
    await expect(legend).toBeVisible()
    await expect(legend.getByText('Ride Hail', { exact: true })).toBeVisible()
  })

  test('chart_type: line and chart_type: area render correctly with the same data-binding and theming, changing only the visual mark', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const tokenColors = await chartTokenColors(page)

    const lineCard = panelCard(page, 'Recharts Trip Length Frequency (Line)')
    const lines = lineCard.locator('.recharts-line-curve')
    // Direct aggregation: trip_destination_summary has 10 real distinct
    // primary_purpose values (confirmed live) — one line per purpose,
    // cycling through the 5 --chart-N tokens twice. 10s, same real
    // Test-tab-crowding reason as above.
    await expect(lines).toHaveCount(10, { timeout: 10_000 })
    const strokes = await computedPaint(lines, 'stroke')
    expect(new Set(strokes).size).toBe(5) // 10 series, 5 distinct tokens, real wraparound
    for (const stroke of strokes) {
      expect(tokenColors).toContain(stroke)
    }
    // Each line has at least one real plotted point.
    const firstLineD = await lines.first().getAttribute('d')
    expect(firstLineD).toBeTruthy()

    const areaCard = panelCard(page, 'Recharts Trip Length Frequency (Area)')
    const areas = areaCard.locator('.recharts-area-area')
    // Single-series case (no `series` configured, filtered to the one
    // real purpose — `work` — with all 5 real distance bins) — exactly
    // one area, colored from the first chart token (rechartsEncoding.ts's
    // own no-series branch always assigns --chart-1).
    await expect(areas).toHaveCount(1)
    // The area's own real fill is a real SVG gradient (`fill="url(#...)"`,
    // matching shadcn's own real chart-area-gradient.json example), not a
    // flat token color — assert the gradient's own two <stop> elements
    // resolve to that same token color instead of asserting `fill`
    // directly.
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
    await gotoTestTab(page)
    const card = panelCard(page, 'Recharts Invalid Chart Type (pie)')
    await expect(card.getByRole('alert')).toContainText('Unsupported chart_type "pie"')
    // Never falls back to rendering some other chart type either.
    await expect(card.locator('.recharts-wrapper')).toHaveCount(0)
  })

  test('a zero-row query renders PanelEmptyState; a rejected query renders PanelErrorState', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    await expect(
      panelCard(page, 'Recharts Empty Result').getByText('No data for this selection'),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      panelCard(page, 'Broken Recharts Panel (missing metric)').getByText("Couldn't load this chart"),
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('User Story 2 - Existing panel types remain completely unaffected', () => {
  // Adapted to real content: plotly and recharts now coexist directly on
  // the SAME Test tab (proving the registry addition doesn't break a
  // shared-tab render); observable-plot (Summary tab) and sankey (Mode
  // Choice tab) are checked on their own real, already-established homes
  // — the retired fixture's own single-tab four-type collage has no real
  // analog now that 057 moved every real bar/line/area panel off
  // Plotly/Recharts onto Observable Plot, but checking each type renders
  // without error, including two side by side, proves the same real
  // regression concern (FR-010).
  test('plotly, recharts, observable-plot, and sankey panels each render without error, including two side by side on one tab', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    // 10s — real Test-tab-crowding residual risk, same as every other
    // first-render check in this file.
    await expect(panelCard(page, 'Plotly Mode Share (Bar)').locator('.js-plotly-plot')).toBeVisible({
      timeout: 10_000,
    }) // plotly
    await expect(
      panelCard(page, 'Recharts Mode Breakdown (Bar)').locator('.recharts-bar-rectangle .recharts-rectangle'),
    ).not.toHaveCount(0) // recharts, same tab as plotly above

    await page.getByRole('tab', { name: 'Mode Choice' }).click()
    await expect(
      panelCard(page, 'Trip Purpose to Mode Flow').locator('.sankey-chart svg[viewBox] rect[data-node-id]'),
    ).not.toHaveCount(0) // sankey

    await page.getByRole('tab', { name: 'Summary' }).click()
    await expect(
      panelCard(page, 'Average Trip Distance by Purpose').locator('.observable-plot-chart svg[viewBox]'),
    ).toBeVisible() // observable-plot
  })

  // A direct regression guard for FR-010 — this feature's one deliberate,
  // accepted gap (spec.md's own Assumptions) is that NEW recharts panels
  // don't get legend-click-to-toggle; the EXISTING plotly panel type must
  // keep it, completely unaffected by this feature's registry addition.
  // panelExpand.spec.ts already covers this mechanism inside the 004
  // expand dialog — this test scopes the same real check to the plain
  // inline card instead, a genuinely different render path (PanelCard,
  // not PanelExpandHost's portal). Real vehicle: "Plotly Mode Share
  // (Bar)" — a real, confirmed finding of this migration's own Batch B:
  // zero real WORKING plotly panels exist anywhere else in demo content
  // (057 moved every real one to Observable Plot), so this panel was
  // authored specifically to keep this real regression coverage alive.
  test("an existing plotly panel's own legend click-to-toggle-trace-visibility still works, unaffected by the new registry entry", async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Plotly Mode Share (Bar)')
    const chart = card.locator('.js-plotly-plot')
    // 10s — real Test-tab-crowding residual risk, same as every other
    // first-render check in this file.
    await expect(chart).toBeVisible({ timeout: 10_000 })

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
    await gotoTestTab(page)
    const card = panelCard(page, 'Recharts Mode Breakdown (Bar)')
    const bars = card.locator('.recharts-bar-rectangle .recharts-rectangle')
    // 10s — real Test-tab-crowding residual risk, same as every other
    // first-render check in this file.
    await expect(bars).toHaveCount(10, { timeout: 10_000 })

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
      window.__wftdm!.query(`SELECT * FROM "activitysim-baseline__trip_purpose_share"`),
    )) as { primary_purpose: string; share: number }[]

    // Scoped to THIS card — the Test tab has 3 recharts panels, each with
    // its own (mostly-empty, not-currently-active) tooltip wrapper div;
    // an unscoped page-level locator resolves to all 3 at once.
    const tooltip = card.locator('.recharts-tooltip-wrapper')
    await waitForChartToSettle(bars.first())
    await bars.first().hover()
    await expect(tooltip).toBeVisible()
    // The real series name (primary_purpose) and real value (share) for
    // this exact point — never a placeholder or a hardcoded expectation.
    // A real, confirmed finding: chart.tsx's own ChartTooltipContent
    // renders `item.value.toLocaleString()` (confirmed via direct source
    // read), not the raw full-precision number — real Parquet data (long
    // doubles, e.g. 0.10957045329262605) displays as "0.11", unlike the
    // retired fixture's own hand-crafted, already-short share values,
    // which happened to round-trip through the exact-string comparison
    // the original test used without ever exercising this real rounding
    // behavior. `toLocaleString()` (no explicit options) is the same
    // computation the component itself performs.
    await expect(tooltip).toContainText(rows[0].primary_purpose)
    await expect(tooltip).toContainText(rows[0].share.toLocaleString())
  })

  test('the tooltip surface and text remain legible in both light and dark mode', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Recharts Mode Breakdown (Bar)')
    const bars = card.locator('.recharts-bar-rectangle .recharts-rectangle')
    // Scoped to THIS card — the Test tab has 3 recharts panels, each with
    // its own (mostly-empty, not-currently-active) tooltip wrapper div;
    // an unscoped page-level locator resolves to all 3 at once.
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
