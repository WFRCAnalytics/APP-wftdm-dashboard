import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser dashboard shell/navigation/panel tests — extends
// boot.spec.ts's pattern (real DuckDB-WASM, fixture Parquet from
// tests/fixtures/generate.py, dashboard-config fixtures copied to
// public/dashboard-config/ by tests/global-setup.js). See quickstart.md.

test.describe('User Story 1 - An analyst navigates a real, professionally-styled dashboard shell', () => {
  test('the visible tab set matches discovered config, and switching tabs changes content with no reload', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // SC-001: tab set exactly matches dashboard-config's header.tab entries.
    // "Basemaps" added by 011-basemap-style-system's own fixture tab
    // (dashboard-3-basemaps.yaml) — a real, permanent addition to the
    // shared fixture set, not a stray leftover.
    //
    // Scoped to navBar.tsx's own TabsList (a real role="tablist" region) —
    // a real, confirmed regression found during 014-graphic-walker-panel's
    // own implementation: a page-level, unscoped page.getByRole('tab')
    // query also picks up @kanaries/graphic-walker's own internal chart-
    // navigation UI (its "Data"/"Visualization" view switcher and "Chart
    // 1" tab strip both use role="tab" too, confirmed live), once a
    // graphic-walker panel exists on the Summary/landing tab. The app now
    // legitimately has two independent role="tablist" regions on one
    // page — scoping to the specific one this test actually means is the
    // correct fix, not a workaround.
    const navTabs = page.getByRole('tablist').first()
    const tabs = await navTabs.getByRole('tab').allTextContents()
    expect(tabs).toEqual(['Summary', 'Detail', 'Basemaps'])

    // FR-002: switching tabs changes content, no full page reload.
    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })
    await page.getByRole('tab', { name: 'Detail' }).click()
    await expect(page.getByText('Average Trip Distance')).toBeVisible()
    expect(navigated).toBe(false)

    // SC-004 (checkable properties): panel cards use border/shadow tokens,
    // not unstyled default HTML. Known DOM depth: CardTitle text ->
    // CardHeader -> Card (panelCard.tsx), so two parent hops from the
    // title text lands on the actual Card element.
    const cardEl = page.getByText('Average Trip Distance').locator('..').locator('..')
    await expect(cardEl).toHaveClass(/border/)
    const borderStyle = await cardEl.evaluate((el) => getComputedStyle(el).borderStyle)
    expect(borderStyle).toBe('solid')
  })
})

test.describe('User Story 2 - An analyst sees a real number, computed from real data', () => {
  test('a value-box panel displays a number matching its underlying fixture data', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // SC-002: matches tests/fixtures/generate.py's SUMMARY_KPIS_ROWS
    // (total_households: 1500, total_trips: 9200, both rows).
    await expect(page.getByText('Total Households')).toBeVisible()
    await expect(page.getByText('1,500')).toBeVisible()
    await expect(page.getByText('Total Trips')).toBeVisible()
    await expect(page.getByText('9,200')).toBeVisible()
  })
})

test.describe('User Story 3 - An analyst sees a real, filter-reactive chart', () => {
  test('a plotly panel renders real data and redraws in place when a filter changes', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    // Scoped to this specific plotly panel's card, not the whole page —
    // 019-baseline-diff-consumption added further plotly panels to this
    // same fixture tab, so the page now legitimately has more than one
    // .js-plotly-plot div; an unscoped locator is a real strict-mode
    // violation now, not a workaround-worthy edge case (the same class of
    // fix 014-graphic-walker-panel's own CLAUDE.md history note already
    // documents for an unrelated unscoped role="tab" query).
    const plotlyCard = page.getByText('Mode Share by Purpose', { exact: true }).locator('..').locator('..')
    await expect(plotlyCard.locator('.js-plotly-plot')).toBeVisible({ timeout: 10_000 })

    // SC-003: changing the purpose filter re-queries and redraws without
    // a page reload, and — same container, not torn down and rebuilt.
    const before = await plotlyCard.locator('.js-plotly-plot').evaluate((gd) => {
      return (gd as unknown as { data: unknown[] }).data.length
    })
    expect(before).toBeGreaterThan(0)

    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NONEXISTENT'))
    // other panels bound to the same global purpose filter (e.g.
    // 007-observable-plot-panel's fixture panels) legitimately also show
    // this same empty-state text when purpose matches nothing, which
    // would make an unscoped page-wide locator ambiguous (and flaky,
    // since how many have finished their own async fetch by the time
    // this assertion polls varies run to run).
    await expect(plotlyCard.getByText('No data for this selection')).toBeVisible()
    expect(navigated).toBe(false)

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await expect(plotlyCard.locator('.js-plotly-plot')).toBeVisible()
    const plotlyDivCount = await plotlyCard.locator('.js-plotly-plot').count()
    expect(plotlyDivCount).toBe(1) // same container reused, not duplicated
  })

  // Real bug found live (015-theme-toggle): Plotly.js's own default
  // paper_bgcolor/plot_bgcolor is opaque white and font.color/gridcolor
  // default to a fixed dark gray — none of it theme-aware on its own —
  // so every Plotly panel showed a bright white card in dark mode.
  // PlotlyPanel.tsx now resolves paper/plot background to fully
  // transparent (letting the card's own bg-card show through) and
  // font/gridline colors from the real --foreground/--border tokens via
  // getComputedStyle, re-applied on a theme change with no extra query
  // (a second, theme-only effect reusing the last-fetched traces).
  test('a plotly panel matches the app theme in dark mode — transparent background, real token colors, no re-query', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    // Scoped — see the filter-change test above for why an unscoped
    // .js-plotly-plot locator is a real strict-mode violation now that
    // 019-baseline-diff-consumption added further plotly panels to this
    // same fixture tab.
    const plotlyCard = page.getByText('Mode Share by Purpose', { exact: true }).locator('..').locator('..')
    await expect(plotlyCard.locator('.js-plotly-plot')).toBeVisible({ timeout: 10_000 })

    const queryCountBefore = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(300)

    const styles = await plotlyCard.locator('.js-plotly-plot .bg').first().evaluate((el) => {
      const cs = getComputedStyle(el)
      return { fillOpacity: cs.fillOpacity }
    })
    expect(styles.fillOpacity).toBe('0') // fully transparent — the card's own bg-card shows through

    const tickFill = await plotlyCard
      .locator('.js-plotly-plot .xtick text')
      .first()
      .evaluate((el) => getComputedStyle(el).fill)
    expect(tickFill).toBe('rgb(255, 255, 255)') // --foreground in dark mode

    // A theme flip must not re-query DuckDB-WASM — only colors change.
    // A short settle wait first: if a (bugged) re-query DID fire, it needs
    // a moment to actually reach the log before this assertion would see it.
    await page.waitForTimeout(300)
    const queryCountAfter = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)
    expect(queryCountAfter).toBe(queryCountBefore)
  })
})

test.describe('Panel error isolation (SC-006, FR-010)', () => {
  test("a broken panel's failure does not prevent sibling panels from rendering", async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.getByRole('tab', { name: 'Detail' }).click()

    // The deliberately-broken panel (dashboard-2-detail.yaml) shows a
    // scoped error...
    await expect(page.getByText("Couldn't load this value")).toBeVisible()
    // ...while its sibling on the same tab still renders correctly.
    await expect(page.getByText('Average Trip Distance')).toBeVisible()
    await expect(page.getByText('6.4')).toBeVisible()
  })
})

// 019-baseline-diff-consumption. Reuses this file's own real
// .js-plotly-plot-scoping pattern (the SQL expander plotly panel test
// above) plus generate.py's real VMT_BY_HOME_TAZ_ROWS/
// VMT_BY_HOME_TAZ_OBSERVED_ROWS fixture data — same values
// zonemapPanel.spec.ts's own hardcoded-name comparison: diff test already
// hand-verifies.
test.describe('019-baseline-diff-consumption', () => {
  function plotlyCard(page: import('@playwright/test').Page, title: string) {
    return page.getByText(title, { exact: true }).locator('..').locator('..')
  }

  /** Reads a specific x value's y from the FIRST already-rendered trace,
   * or undefined if the chart hasn't drawn that trace/x value yet — never
   * throws on a not-yet-populated .data. Polled with a generous timeout
   * below: this fixture page now has many panels (019 added 8), and
   * DuckDB-WASM processes their queries with real contention — a fixed
   * short toBeVisible() wait raced ahead of a real, if slow, correct
   * resolution in this suite's first run, not a logic bug. */
  async function plotlyYFor(page: import('@playwright/test').Page, title: string, x: number) {
    return plotlyCard(page, title)
      .locator('.js-plotly-plot')
      .evaluate(
        (gd, needle) => {
          const data = (gd as unknown as { data?: { x: number[]; y: (number | null)[] }[] }).data
          const i = data?.[0]?.x?.indexOf(needle) ?? -1
          return i === -1 ? undefined : data![0].y[i]
        },
        x,
      )
      .catch(() => undefined)
  }

  test('User Story 1: $baseline resolves and computes the correct absolute diff', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    await page.evaluate(() => window.__wftdm!.appState.setBaseline('observed'))

    await expect
      .poll(() => plotlyYFor(page, 'Plotly VMT Diff via $baseline', 100), { timeout: 20_000 })
      .toBe(-13)
    expect(await plotlyYFor(page, 'Plotly VMT Diff via $baseline', 700)).toBe(20)
  })

  test('User Story 2: a zero-baseline row is cleanly omitted as a null data point, never Infinity/NaN', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    await page.evaluate(() => window.__wftdm!.appState.setBaseline('good_scenario'))

    const title = 'Plotly VMT Percent Diff via $baseline (zero-baseline case)'
    // SQL NULL arrives as a real null data point — not coerced to 0, not
    // Infinity/NaN. Polled: same real query-contention reason as above.
    await expect.poll(() => plotlyYFor(page, title, 300), { timeout: 20_000 }).toBe(null)

    const nonNullValue = await plotlyYFor(page, title, 700)
    expect(nonNullValue).not.toBeNull()
    expect(Number.isFinite(nonNullValue)).toBe(true) // a real, finite number — not Infinity/NaN
  })
})

// 028-dashboard-branding: deployer-configurable header title/logo, sourced
// from dashboard-config/index.json's own new object shape (yamlLoader.ts's
// loadDashboardBranding()). tests/fixtures/dashboard-config/index.json
// carries a real title + a light/dark data-URI logo pair (no network
// dependency — see that file's own comment for why data: URIs specifically).
test.describe('028-dashboard-branding', () => {
  test('a configured logo renders in the header, using the light-mode variant by default, and sets the tab title', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    const logo = page.locator('.dashboard-brand-logo')
    await expect(logo).toBeVisible()
    expect(await logo.getAttribute('src')).toContain('023c5b') // the fixture's light-mode fill color
    await expect(page.locator('.dashboard-brand-title')).toHaveCount(0) // logo present -> no redundant text

    expect(await page.title()).toBe('Fixture Test Dashboard')
  })

  test('switching to dark mode swaps in the logoUrlDark variant', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const logo = page.locator('.dashboard-brand-logo')
    await expect(async () => {
      expect(await logo.getAttribute('src')).toContain('ffffff') // the fixture's dark-mode fill color
    }).toPass({ timeout: 5_000 })
  })

  test('a logo that fails to load falls back to the configured title text, never a broken image', async ({
    page,
  }) => {
    // Overrides just this one request's response — the real fixture file on
    // disk (and every other test in this suite) is untouched. Reads the
    // fixture directly from disk rather than route.fetch()-ing the live
    // request: this app's own coi-serviceworker (index.html, loaded first)
    // intercepts every fetch to inject cross-origin-isolation headers,
    // which re-routing through route.fetch() collided with in practice —
    // real, confirmed live (it returned index.html's own markup instead of
    // the JSON body) — reading the source file directly sidesteps that
    // entirely.
    const fixturePath = join(__dirname, '../fixtures/dashboard-config/index.json')
    const json = JSON.parse(readFileSync(fixturePath, 'utf-8'))
    json.logoUrl = '/definitely-does-not-exist-logo.png'
    delete json.logoUrlDark
    await page.route('**/dashboard-config/index.json', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) })
    })

    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // FR-004: once the <img>'s own error event fires, the component falls
    // back to plain title text — never leaves a broken-image icon showing.
    await expect(page.locator('.dashboard-brand-title')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.dashboard-brand-logo')).toHaveCount(0)
  })
})
