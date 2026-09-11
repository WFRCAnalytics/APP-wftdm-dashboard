import { test, expect } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser dashboard shell/navigation/panel tests — real DuckDB-WASM,
// real Parquet, real public/demo-dashboard-config/ content (7 real
// calibration tabs + the permanent 8th "Test" tab). 040-test-suite-
// migration (T014): migrated off the retired synthetic
// tests/fixtures/dashboard-config/ 3-tab set ("Summary"/"Detail"/
// "Basemaps") — no _sharedFixtureLock usage, no per-test index.json
// rewrite; this file reads the SAME public/demo-dashboard-config/ every
// other already-migrated spec reads.

test.describe('User Story 1 - An analyst navigates a real, professionally-styled dashboard shell', () => {
  test('the visible tab set matches discovered config, and switching tabs changes content with no reload', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // SC-001: the real 7 calibration tabs, in public/demo-dashboard-config/
    // index.json's own listed order, plus the permanent 8th "Test" tab
    // (its accessible NAME is "Test", via header.aria_label — but its raw
    // TEXT CONTENT is a single space, per header.tab, so allTextContents()
    // sees " " here, not "Test"; sidebarNav.spec.ts/testTabInvisibility.spec.ts
    // already cover the accessible-name assertion directly).
    //
    // Scoped to the real role="tablist" region — a real, confirmed
    // regression found during 014-graphic-walker-panel's own
    // implementation: an unscoped page.getByRole('tab') query also picks
    // up @kanaries/graphic-walker's own internal chart-navigation UI
    // (which also uses role="tab"), once a graphic-walker panel exists on
    // the active tab.
    const navTabs = page.getByRole('tablist').first()
    const tabs = await navTabs.getByRole('tab').allTextContents()
    expect(tabs).toEqual([
      'Summary',
      'Person & Households',
      'Tour',
      'Mode Choice',
      'Trip',
      'Network',
      'Explore',
      ' ',
    ])

    // FR-002: switching tabs changes content, no full page reload.
    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Person & Households' })).toBeVisible()
    expect(navigated).toBe(false)

    // SC-004 (checkable properties): panel cards use border/shadow tokens,
    // not unstyled default HTML. Real demo panel: "Auto Ownership by
    // Household Segment" (dashboard-2-person-household.yaml). Known DOM
    // depth: CardTitle text -> CardHeader -> Card (panelCard.tsx), so two
    // parent hops from the title text lands on the actual Card element —
    // same depth the retired fixture test already relied on.
    const cardEl = page.getByText('Auto Ownership by Household Segment', { exact: true }).locator('..').locator('..')
    await expect(cardEl).toHaveClass(/border/)
    const borderStyle = await cardEl.evaluate((el) => getComputedStyle(el).borderStyle)
    expect(borderStyle).toBe('solid')
  })
})

test.describe('User Story 2 - An analyst sees a real number, computed from real data', () => {
  test('a value-box panel displays a number matching its underlying real data', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // SC-002: real Summary-tab KPIs (dashboard-1-summary.yaml, pinned to
    // activitysim-baseline, summary_kpis metric) — 5000 households /
    // 15,212 total VMT.
    //
    // A REAL, CONFIRMED, OUT-OF-SCOPE BUG found while verifying this
    // migration's own expected values live (not assumed from the YAML's
    // `format: "{:,.0f}"` alone): DuckDB-WASM's Arrow results deliver
    // COUNT(*)-derived integer columns (total_households, total_trips) as
    // JS `bigint`, not `number` — confirmed directly via
    // `window.__wftdm.query()` (JSON.stringify threw "Do not know how to
    // serialize a BigInt"). panels/formatValue.ts's own `typeof value !==
    // 'number'` guard is `true` for a bigint, so it falls through to the
    // unformatted `String(value)` branch — the comma-grouped format string
    // is silently skipped for these two KPIs specifically. This is the
    // EXACT same bigint-vs-number gap CLAUDE.md already documents fixing
    // once for ZoneMapPanel.tsx's own metric join
    // (`typeof raw === 'number' || typeof raw === 'bigint' ? Number(raw) :
    // null`) — that fix was never extended to the shared formatValue.ts,
    // which ValueBoxPanel.tsx AND TablePanel.tsx both use. Real, confirmed,
    // deliberately NOT fixed here (out of scope for a test migration) —
    // this test asserts the REAL current rendered text ("5000", not
    // "5,000"), not an aspirational fixed state. total_vmt is a real
    // SUM()-derived DOUBLE, not COUNT(*)-derived, and is genuinely
    // unaffected — it renders correctly comma-formatted, confirming the
    // gap is specific to bigint-typed columns, not formatValue() broadly.
    await expect(page.getByText('Households', { exact: true })).toBeVisible()
    await expect(page.getByText('5000', { exact: true })).toBeVisible()
    await expect(page.getByText('Total VMT', { exact: true })).toBeVisible()
    await expect(page.getByText('15,212', { exact: true })).toBeVisible()
  })
})

test.describe('User Story 3 - An analyst sees a real, filter-reactive chart', () => {
  test('a plotly panel renders real data from real ActivitySim scenarios', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    // Real Summary-tab plotly panel: "Average Trip Distance by Purpose"
    // (trip_distance_by_purpose, unpinned — a real multi-scenario union
    // per 038-all-loaded-scenarios, one trace per active scenario).
    const plotlyCard = page.getByText('Average Trip Distance by Purpose', { exact: true }).locator('..').locator('..')
    await expect(plotlyCard.locator('.js-plotly-plot')).toBeVisible({ timeout: 10_000 })

    const traceCount = await plotlyCard.locator('.js-plotly-plot').evaluate((gd) => {
      return (gd as unknown as { data: unknown[] }).data.length
    })
    // 3 real active demo scenarios (activitysim-baseline/-density-variant/
    // -transit-variant) — one trace each, per the panel's own `name:
    // $scenario` trace config.
    expect(traceCount).toBe(3)

    // 040-test-suite-migration: the retired fixture test also exercised
    // `$filters.purpose` global-filter reactivity (a filter change
    // re-queries and redraws in place, same container, no reload).
    // Confirmed via a direct grep sweep, not assumed: NO real
    // public/demo-dashboard-config/*.yaml panel declares a top-level
    // `filters:` block or references `$filters.` anywhere — this real
    // grammar mechanism (state/filterState.ts, hooks/useFilterState.ts,
    // sqlExpander.ts's own $filters. expansion) currently has ZERO real
    // demo-content integration coverage, the same class of gap
    // 038-all-loaded-scenarios' own audit already found and documented
    // for $baseline (see the describe block removed below). Its SQL-
    // expansion correctness stays covered at the unit level
    // (tests/unit/sqlExpander.test.ts's own $filters.* cases) — flagged
    // here, not silently dropped, as a real gap worth its own follow-up
    // (either adding a real filter_ids panel to the demo content, or a
    // dedicated dashboard-8-test.yaml row) rather than fabricated here.
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
    const plotlyCard = page.getByText('Average Trip Distance by Purpose', { exact: true }).locator('..').locator('..')
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
    // 033-shadcn-default-theme: --foreground dark is #fafafa.
    expect(tickFill).toBe('rgb(250, 250, 250)') // --foreground in dark mode

    // A theme flip must not re-query DuckDB-WASM — only colors change.
    await page.waitForTimeout(300)
    const queryCountAfter = await page.evaluate(() => window.__wftdm!.__debugQueryLog().length)
    expect(queryCountAfter).toBe(queryCountBefore)
  })
})

test.describe('Panel error isolation (SC-006, FR-010)', () => {
  test("a broken panel's failure does not prevent sibling panels from rendering", async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await page.getByRole('tab', { name: 'Test' }).click()

    // dashboard-8-test.yaml's own real broken-panel content
    // (row_missing_metric: metric: __nonexistent_metric__) shows a
    // scoped error — real rendered text confirmed directly (not assumed
    // from src/panels/TablePanel.tsx's own PanelErrorState message alone).
    const brokenCard = page.getByText('Broken Table Panel (missing metric)', { exact: true }).locator('..').locator('..')
    await expect(brokenCard.getByText("Couldn't load this table")).toBeVisible()

    // ...while a real, WORKING sibling elsewhere on the same "Test" tab
    // (row_gw_expandable's "Free-form Visual Analytics (expandable)" — a
    // real graphic-walker panel bound to trip_mode_share/
    // activitysim-baseline, valid config, no error) still renders. This
    // is the same-tab isolation proof the retired fixture test's own
    // "Detail" tab pairing made — dashboard-8-test.yaml has no row that
    // pairs one broken + one working panel directly, so this uses two
    // real rows on the SAME rendered tab instead (full_page: true +
    // multiple panels ⇒ ordinary card-grid rendering, per this tab's own
    // documented misconfiguration behavior — every row renders together,
    // not just one).
    const workingCard = page.getByText('Free-form Visual Analytics (expandable)', { exact: true }).locator('..').locator('..')
    await expect(workingCard.getByText("Couldn't load", { exact: false })).toHaveCount(0)
  })
})

// 019-baseline-diff-consumption's own $baseline/comparison: diff describe
// block is DELIBERATELY REMOVED, not migrated — a real, confirmed gap
// found while researching what to migrate it to, not silently worked
// around: 038-all-loaded-scenarios' own real audit (CLAUDE.md's own
// Implementation-order item 25) already established that ZERO panels in
// public/demo-dashboard-config/ use `comparison: diff` or `$baseline`
// anywhere, and dashboard-8-test.yaml's own real scope (per its header
// comment) is broken/edge-case panel coverage, not a home for a genuinely
// WORKING feature-correctness assertion. $baseline's own SQL-expansion
// correctness stays covered at the unit level
// (tests/unit/sqlExpander.test.ts). Flagged as a real, separate gap for
// its own follow-up (either a real demo panel or a dedicated
// dashboard-8-test.yaml addition), matching the $filters. gap noted above
// — not fabricated fixture-only content this whole migration exists to
// retire.

// 028-dashboard-branding: deployer-configurable header title/logo. The
// retired fixture's own dashboard-config/index.json carried a synthetic
// title + data-URI logo pair specifically to avoid a network dependency;
// the real public/demo-dashboard-config/index.json carries WFRC's own
// real branding (a real https:// logo URL, light + dark variants) — see
// that file's own content. Confirmed via CLAUDE.md's own 028/036 history
// that loadDashboardBranding()'s real/demo-root precedence and the
// logoUrl/logoUrlDark/title fields are unchanged by this migration.
test.describe('028-dashboard-branding', () => {
  test('the real WFRC logo renders in the header, using the light-mode variant by default, and sets the tab title', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    const logo = page.locator('.dashboard-brand-logo')
    await expect(logo).toBeVisible()
    // The real demo branding's light-mode logo URL (public/
    // demo-dashboard-config/index.json) — asserting the real, current
    // WFRC brand asset path, not a placeholder fixture data URI.
    expect(await logo.getAttribute('src')).toContain('WFRC_logo_horizontal_color_transparent.png')
    await expect(page.locator('.dashboard-brand-title')).toHaveCount(0) // logo present -> no redundant text

    expect(await page.title()).toBe('WFRC TDM Calibration Dashboard')
  })

  test('switching to dark mode swaps in the logoUrlDark variant', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const logo = page.locator('.dashboard-brand-logo')
    await expect(async () => {
      expect(await logo.getAttribute('src')).toContain('WFRC_logo_horizontal_white_transparent.png')
    }).toPass({ timeout: 5_000 })
  })

  test('a logo that fails to load falls back to the configured title text, never a broken image', async ({
    page,
  }) => {
    // Overrides just this one request's response — this app's own
    // coi-serviceworker (index.html, loaded first) intercepts every
    // fetch to inject cross-origin-isolation headers, which colliding
    // with route.fetch()-based re-routing was already confirmed live by
    // this file's own prior version (it returned index.html's own markup
    // instead of the JSON body) — building a fully synthetic response
    // body here (mirroring the real demo branding's own title, only
    // logoUrl swapped) sidesteps that entirely, same technique as before.
    const realBranding = {
      dashboards: [
        'dashboard-1-summary.yaml',
        'dashboard-2-person-household.yaml',
        'dashboard-3-tour-models.yaml',
        'dashboard-4-mode-choice.yaml',
        'dashboard-5-trip-models.yaml',
        'dashboard-6-network.yaml',
        'dashboard-7-explore.yaml',
        'dashboard-8-test.yaml',
      ],
      title: 'WFRC TDM Calibration Dashboard',
      logoUrl: '/definitely-does-not-exist-logo.png',
    }
    await page.route('**/demo-dashboard-config/index.json', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(realBranding) })
    })

    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // FR-004: once the <img>'s own error event fires, the component falls
    // back to plain title text — never leaves a broken-image icon showing.
    await expect(page.locator('.dashboard-brand-title')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.dashboard-brand-logo')).toHaveCount(0)
  })
})

// Phase 2 of the app-wide UI/UX redesign (wftdm-design-system skill) —
// shell/nav. Verified in BOTH themes via real getComputedStyle() reads,
// per the skill's own non-negotiable dual-theme requirement.
test.describe('Phase 2 — shell/nav redesign (wftdm-design-system)', () => {
  test("the active tab's real header.title renders as a page-level heading; header.description renders only when present", async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    // Summary (landing tab): real header.title, no header.description —
    // confirmed via a direct grep sweep that NO real
    // public/demo-dashboard-config/*.yaml tab sets header.description
    // (every `description:` hit in that tree is a PANEL-level field, a
    // different, pre-existing grammar key — not this one). The optional
    // paragraph must not render as an empty node or literal "undefined".
    await expect(page.getByRole('heading', { level: 1, name: 'Summary' })).toBeVisible()
    await expect(page.getByText('undefined', { exact: true })).toHaveCount(0)

    // The "Test" tab's own real header.title IS multi-word and distinct —
    // confirms the heading tracks the real active tab, not a stale value.
    await page.getByRole('tab', { name: 'Test' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Test / Broken Panels' })).toBeVisible()
  })

  test('the page title uses the Page Title role\'s real computed size/weight in both light and dark', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    const heading = page.getByRole('heading', { level: 1, name: 'Summary' })
    const readStyle = () =>
      heading.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { fontSize: cs.fontSize, fontWeight: cs.fontWeight }
      })

    // wftdm-design-system's Page Title role: text-xl (20px) font-semibold
    // (600) — real computed values, not a class-name-string assertion.
    let style = await readStyle()
    expect(style.fontSize).toBe('20px')
    expect(style.fontWeight).toBe('600')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    style = await readStyle()
    expect(style.fontSize).toBe('20px')
    expect(style.fontWeight).toBe('600')
  })

  test('panel titles render smaller than the page title in both themes — the correct hierarchy, not inverted', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    const pageTitle = page.getByRole('heading', { level: 1, name: 'Summary' })
    const panelTitle = page.getByText('Households', { exact: true })
    const readPx = (locator: typeof pageTitle) =>
      locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))

    for (const dark of [false, true]) {
      if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'))
      const [pageSize, panelSize] = await Promise.all([readPx(pageTitle), readPx(panelTitle)])
      expect(pageSize).toBeGreaterThan(panelSize)
      expect(panelSize).toBe(16) // wftdm-design-system's Panel Title role
    }
  })

  test('the sidebar carries a real, non-empty box-shadow in both light and dark', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    const header = page.locator('[data-sidebar="sidebar"]')
    const readShadow = () => header.evaluate((el) => getComputedStyle(el).boxShadow)

    // shadow-md's real, resolved computed value — not just "not none".
    let shadow = await readShadow()
    expect(shadow).not.toBe('none')
    expect(shadow).toContain('0.14')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    shadow = await readShadow()
    expect(shadow).not.toBe('none')
    expect(shadow).toContain('0.14')
    // Dark mode's own distinct mechanism — an edge-highlight ring layered
    // underneath the same shadow-md blur — a real computed box-shadow
    // with a ring present lists TWO layers, not one.
    const layerCount = shadow.split(/,(?![^(]*\))/).length
    expect(layerCount).toBeGreaterThanOrEqual(2)
  })

  test("DashboardBrand's text-only fallback uses the Page Title role's real computed size in both themes", async ({
    page,
  }) => {
    // Same broken-logo route-mock technique as the 028-dashboard-branding
    // suite above.
    const realBranding = {
      dashboards: [
        'dashboard-1-summary.yaml',
        'dashboard-2-person-household.yaml',
        'dashboard-3-tour-models.yaml',
        'dashboard-4-mode-choice.yaml',
        'dashboard-5-trip-models.yaml',
        'dashboard-6-network.yaml',
        'dashboard-7-explore.yaml',
        'dashboard-8-test.yaml',
      ],
      title: 'WFRC TDM Calibration Dashboard',
      logoUrl: '/definitely-does-not-exist-logo.png',
    }
    await page.route('**/demo-dashboard-config/index.json', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(realBranding) })
    })

    await page.goto('/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    const brandTitle = page.locator('.dashboard-brand-title')
    await expect(brandTitle).toBeVisible({ timeout: 10_000 })
    const readSize = () => brandTitle.evaluate((el) => getComputedStyle(el).fontSize)

    let size = await readSize()
    expect(size).toBe('20px')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    size = await readSize()
    expect(size).toBe('20px')
  })
})
