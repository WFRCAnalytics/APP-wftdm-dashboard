import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 004-panel-expand-dialog. See quickstart.md and
// contracts/panel-expand-host.md / dialog-primitive.md / panel-card.md.
//
// 040-test-suite-migration: migrated off the retired synthetic
// tests/fixtures/dashboard-config/ set. Real panels used throughout:
// "Households" (Summary tab valuebox, no expand trigger by 034-metric-
// panel-redesign's own type default) and "Average Trip Distance by
// Purpose" (Summary tab plotly, expandable by type default — the same
// role "Mode Share by Purpose" played in the retired fixture).
//
// The override test ("expandable: true/false wins over its type's own
// default") needed one real, minimal addition, not fabricated content:
// dashboard-8-test.yaml already had a real `expandable: true` override
// (row_gw_expandable's "Free-form Visual Analytics (expandable)",
// graphic-walker — graphic-walker and valuebox share the SAME "not
// expandable by type default" status, so this proves the identical
// mechanism the retired fixture's valuebox override did); the "opts OUT"
// half had no real analog, so `row_bad_diff`'s existing, already-real
// "Broken Comparison Diff (unresolvable a/b)" table panel gained one new
// line, `expandable: false` — table's own type default is expandable, so
// this is the direct real counterpart, paired against `row_missing_
// metric`'s sibling "Broken Table Panel (missing metric)" (same type, no
// override, still expandable).
//
// Two tests from the retired fixture are DELETED, not migrated, for the
// same confirmed reason `dashboardShell.spec.ts` (040 T014) already
// documents and this file inherits unchanged: a direct grep sweep found
// zero real `public/demo-dashboard-config/*.yaml` panels use `filter_ids`/
// `$filters.` at all, so there is no real panel to exercise "empty state
// via a global filter" or "a filter change updates the expanded view"
// against. Flagged there, not repeated here as a new finding — same gap,
// same resolution.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function expandTrigger(page: Page, title: string) {
  return page.getByRole('button', { name: `Expand ${title}` })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

const CHART_TITLE = 'Average Trip Distance by Purpose'

test.describe('User Story 1 - Expand a panel to a large view', () => {
  test('expand trigger opens a dialog showing the same content, for a plotly panel; a valuebox panel has no expand trigger at all', async ({
    page,
  }) => {
    await boot(page)

    // 034-metric-panel-redesign (FR-001): valuebox panels no longer get an
    // expand trigger at all.
    await expect(expandTrigger(page, 'Households')).toHaveCount(0)

    // plotly — unaffected by 034-metric-panel-redesign.
    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()
  })

  test('an explicit expandable: true/false override wins over its panel type\'s own default, in both directions', async ({
    page,
  }) => {
    // 034-metric-panel-redesign, Part A addendum (FR-023–FR-025) —
    // contracts/panel-expand-scoping.md's own override section.
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()

    // "Free-form Visual Analytics (expandable)" (graphic-walker,
    // `expandable: true` in dashboard-8-test.yaml) opts IN, even though
    // graphic-walker's own type-level default is no control at all —
    // proving this is a genuinely per-PANEL override, not an accidental
    // type-wide change (graphic-walker and valuebox share the same
    // "not expandable by default" status, so this is the same mechanism
    // the retired fixture's valuebox override proved).
    await expandTrigger(page, 'Free-form Visual Analytics (expandable)').click()
    const gwDialog = page.getByRole('dialog')
    await expect(gwDialog).toBeVisible()
    await expect(gwDialog.getByText('Free-form Visual Analytics (expandable)')).toBeVisible()
    await gwDialog.getByRole('button', { name: 'Close' }).click()
    await expect(gwDialog).not.toBeVisible()

    // "Broken Comparison Diff (unresolvable a/b)" (table, `expandable:
    // false` — the one real, minimal addition this migration made) opts
    // OUT, even though table's own type-level default is a control —
    // "Broken Table Panel (missing metric)" (same type, no override
    // configured) still correctly has one, same proof in the other
    // direction. `exact: true` here (not the shared expandTrigger()
    // helper, which doesn't set it) — "Broken Table Panel (missing
    // metric)" is a real literal prefix of "Broken Table Panel (missing
    // metric)" is not itself ambiguous, but this file's own established
    // convention (the retired fixture hit a genuine strict-mode
    // collision from a shorter title prefixing a longer one) is kept for
    // safety.
    await expect(
      page.getByRole('button', { name: 'Expand Broken Comparison Diff (unresolvable a/b)', exact: true }),
    ).toHaveCount(0)
    await expect(expandTrigger(page, 'Broken Table Panel (missing metric)')).toHaveCount(1)
  })

  test('Escape closes the dialog and returns focus to the trigger', async ({ page }) => {
    await boot(page)
    const trigger = expandTrigger(page, CHART_TITLE)
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test('clicking outside the dialog closes it and returns focus to the trigger', async ({ page }) => {
    await boot(page)
    const trigger = expandTrigger(page, CHART_TITLE)
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Radix's outside-pointerdown listener (and its own focus-on-open
    // behavior) attach in a passive effect, which can run one tick after
    // the dialog is already visible/painted. Waiting for Radix's own
    // auto-focus to have actually landed inside the dialog is a real,
    // deterministic signal that the open effect cycle has settled — not
    // an arbitrary timeout — since both are wired up around the same
    // point in Content's mount lifecycle.
    const dialogHandle = await dialog.elementHandle()
    await expect
      .poll(() => page.evaluate((el) => el?.contains(document.activeElement), dialogHandle))
      .toBe(true)

    // Click the backdrop, well outside the centered dialog box.
    await page.mouse.click(5, 5)
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test('the explicit close control closes the dialog and returns focus to the trigger', async ({
    page,
  }) => {
    await boot(page)
    const trigger = expandTrigger(page, CHART_TITLE)
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test('Tab/Shift+Tab cycles focus only within the open dialog', async ({ page }) => {
    await boot(page)
    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const dialogHandle = await dialog.elementHandle()
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const stillInside = await page.evaluate(
        (el) => el?.contains(document.activeElement),
        dialogHandle,
      )
      expect(stillInside).toBe(true)
    }
  })

  test('no DialogContent root is visible/painted for any panel that has never been expanded', async ({
    page,
  }) => {
    // This test's original premise was forceMount: keep every panel's
    // DialogContent permanently mounted, hidden only via CSS, and assert
    // that CSS actually hides it. forceMount turned out to be unsafe
    // (layout/panelExpandHost.tsx's comment has the full story — Radix's
    // MODAL Content variant hides the rest of the page from assistive
    // tech in a mount-only effect, not gated on `open`), so
    // panelExpandHost.tsx now mounts DialogContent normally, only once
    // actually expanded. The user-facing guarantee this test exists to
    // protect — no empty dialog box ever visible before a panel has been
    // expanded — still matters and is still checked directly (raw CSS
    // selector, not getByRole, so it isn't just relying on accessibility-
    // tree filtering to hide the answer) — it's just now trivially true
    // by construction (nothing mounted at all) rather than true via a
    // CSS class.
    await boot(page)
    const allDialogRoots = page.locator('[role="dialog"]')
    await expect(allDialogRoots).toHaveCount(0)
  })

  test('clicking a Plotly legend entry toggles the trace and does not close the dialog', async ({
    page,
  }) => {
    await boot(page)
    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const legendEntry = dialog.locator('.legend .traces').first()
    await expect(legendEntry).toBeVisible()

    const dialogChart = dialog.locator('.js-plotly-plot')
    const tracesBefore = await dialogChart.evaluate((gd) => {
      return (gd as unknown as { data: { visible?: boolean }[] }).data.map((t) => t.visible ?? true)
    })

    // Plotly's modebar (zoom/pan/camera icons, shown on hover) floats over
    // the same top-right corner as the legend and physically intercepts
    // the click at the browser's own hit-testing level — `force: true`
    // only bypasses Playwright's pre-click actionability check, it doesn't
    // change which element the browser actually dispatches the event to,
    // so the modebar still wins even with force. Removing it is a
    // Plotly default-layout detail unrelated to what this test exists to
    // check, so it's a legitimate, test-only DOM cleanup. Scoped to the
    // DIALOG's own modebar specifically — the Summary tab has other
    // plotly panels too, so an unscoped
    // document.querySelector('.modebar-container') could pick a
    // DIFFERENT (still-inline, not-yet-relocated) panel's own modebar
    // instead of the expanded dialog's real one.
    await dialog.evaluate((el) => el.querySelector('.modebar-container')?.remove())
    await legendEntry.click()

    // Plotly updates its internal trace state slightly after the click
    // event fires (its own legend-click handler), so poll rather than
    // read once immediately — reading too early would just observe the
    // pre-click state and look like nothing happened.
    await expect
      .poll(async () => {
        return dialogChart.evaluate((gd) => {
          return (gd as unknown as { data: { visible?: boolean | 'legendonly' }[] }).data.map(
            (t) => t.visible ?? true,
          )
        })
      })
      .not.toEqual(tracesBefore) // the legend click actually toggled something

    // The specific risk this test exists for: the dialog must still be open.
    await expect(dialog).toBeVisible()
  })

  test('a modal expanded view blocks background interaction, including switching tabs — until closed', async ({
    page,
  }) => {
    // spec.md's Edge Cases anticipated needing to handle "switching tabs
    // while expanded" as its own case. In practice, Radix's modal Dialog
    // (disableOutsidePointerEvents: true while open — verified against
    // source, contracts/panel-expand-host.md) makes that interaction
    // unreachable in the first place: the backdrop blocks pointer events
    // on everything behind it, including the nav tabs, so a user must
    // close the expanded view before they can switch tabs at all — a
    // stronger guarantee than "switching tabs cleans up the dialog after
    // the fact." This test verifies both halves: blocked while open,
    // works normally once closed.
    await boot(page)
    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The overlay blocks the click from ever reaching the tab — Playwright
    // retries actionability until this times out, proving the click never
    // went through (not just that it didn't happen to be clicked).
    await expect(
      page.getByRole('tab', { name: 'Person & Households' }).click({ timeout: 2_000 }),
    ).rejects.toThrow()
    await expect(dialog).toBeVisible() // still open — the tab switch never went through
    // Not asserted via getByRole here: while the modal is genuinely open,
    // Radix correctly marks the rest of the page aria-hidden — a
    // role-based query for the card behind the dialog would find nothing
    // by design, not because the card is actually gone. A raw CSS locator
    // (bypassing accessibility-tree filtering) confirms it's still there.
    await expect(page.locator('h3', { hasText: CHART_TITLE })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    await expect(page.getByText('Auto Ownership by Household Segment', { exact: true })).toBeVisible()
  })
})

test.describe('User Story 2 - Return to the dashboard without losing panel state', () => {
  test('expand-then-collapse on an already-loaded panel shows no loading state and identical data', async ({
    page,
  }) => {
    await boot(page)
    await expect(panelCard(page, CHART_TITLE).locator('.js-plotly-plot')).toBeVisible()

    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.animate-pulse')).toHaveCount(0)
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.animate-pulse')).toHaveCount(0)
    await expect(panelCard(page, CHART_TITLE).locator('.js-plotly-plot')).toBeVisible()
  })

  test('expanding and collapsing a panel never triggers an additional data query', async ({ page }) => {
    // Deterministic, not timing-based — counting actual query() calls
    // (services/duckdb.ts's __debugQueryLog) proves the real guarantee
    // (FR-008) directly, regardless of timing.
    await boot(page)
    await expect(panelCard(page, CHART_TITLE).locator('.js-plotly-plot')).toBeVisible()

    const countFor = (needle: string) =>
      page.evaluate(
        (n) => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes(n)).length,
        needle,
      )

    const before = await countFor('trip_distance_by_purpose')
    expect(before).toBeGreaterThan(0) // sanity: the panel really did query at least once

    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()

    const after = await countFor('trip_distance_by_purpose')
    expect(after).toBe(before) // no additional query across the whole round trip
  })

  test('a panel in its error state shows the same error state when expanded', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Test' }).click()
    // dashboard-8-test.yaml's own real broken observable-plot panel
    // (row_missing_metric_2, metric: __nonexistent_metric__). Error text
    // is this panel type's own real PanelErrorState message, confirmed
    // via direct read of ObservablePlotPanel.tsx — NOT unique on this tab
    // though (PlotlyPanel.tsx/RechartsPanel.tsx share the identical
    // "Couldn't load this chart" string, and the Test tab has its own
    // broken recharts/plotly panels too), so scoped to this panel's own
    // card specifically, not a page-wide text search.
    await expect(
      panelCard(page, 'Broken Observable Plot Panel (missing metric)').getByText("Couldn't load this chart"),
    ).toBeVisible()

    await expandTrigger(page, 'Broken Observable Plot Panel (missing metric)').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Couldn't load this chart")).toBeVisible()
  })

  // The retired fixture's own "a panel in its empty state shows the same
  // empty state when expanded" and "changing a filter while a panel is
  // expanded updates the expanded view" tests are DELETED, not migrated
  // — see this file's own header comment: zero real demo panels use
  // `filter_ids`/`$filters.`, the same real, confirmed gap
  // dashboardShell.spec.ts (040 T014) already found and left unfixed.
})

test.describe('User Story 3 - Charts render correctly sized inside the expanded view', () => {
  test('expanding a chart panel resizes it to fill the dialog, not its original card size', async ({
    page,
  }) => {
    await boot(page)
    const cardChart = panelCard(page, CHART_TITLE).locator('.js-plotly-plot')
    await expect(cardChart).toBeVisible()
    const cardBox = await cardChart.boundingBox()
    expect(cardBox).not.toBeNull()

    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    const dialogChart = dialog.locator('.js-plotly-plot')
    await expect(dialogChart).toBeVisible()

    // Give the ResizeObserver a beat to fire and Plotly.Plots.resize() to
    // apply before measuring.
    await page.waitForTimeout(300)

    // Height reliably grows (fixed card height vs. h-[90vh]). Width is
    // compared against the dialog's own content container rather than
    // against the card's width: this real panel is configured width: 0.5
    // (half row width), so "wider than before" alone wouldn't be a
    // meaningful claim — the real one is "fills the dialog it's actually
    // in," checked directly (FR-009).
    const dialogBox = await dialogChart.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.height).toBeGreaterThan(cardBox!.height)

    const dialogContentBox = await dialog.boundingBox()
    expect(dialogContentBox).not.toBeNull()
    expect(dialogBox!.width).toBeGreaterThan(dialogContentBox!.width * 0.85)
  })

  test("the chart's container DOM node identity is unchanged before and after expanding", async ({
    page,
  }) => {
    await boot(page)
    const cardChart = panelCard(page, CHART_TITLE).locator('.js-plotly-plot')
    await expect(cardChart).toBeVisible()
    await cardChart.evaluate((el) => el.setAttribute('data-preexpand-identity', 'same-node'))

    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()

    // Exactly one chart container carries the marker set before expanding
    // (unique regardless of how many total .js-plotly-plot divs exist on
    // the page) — proof of relocation, not remount — and it's now inside
    // the dialog specifically, not still in the (now-hidden) inline card.
    await expect(page.locator('.js-plotly-plot[data-preexpand-identity="same-node"]')).toHaveCount(1)
    await expect(dialog.locator('.js-plotly-plot[data-preexpand-identity="same-node"]')).toHaveCount(1)
  })

  test('collapsing an expanded chart panel returns it to correct card-sized rendering', async ({
    page,
  }) => {
    await boot(page)
    const cardChart = panelCard(page, CHART_TITLE).locator('.js-plotly-plot')
    await expect(cardChart).toBeVisible()
    const cardBoxBefore = await cardChart.boundingBox()

    await expandTrigger(page, CHART_TITLE).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()

    await page.waitForTimeout(300)
    await expect(cardChart).toBeVisible()
    await expect(cardChart).toHaveCount(1) // this panel's own container, not duplicated
    const cardBoxAfter = await cardChart.boundingBox()
    expect(cardBoxAfter!.width).toBeCloseTo(cardBoxBefore!.width, 0)
    expect(cardBoxAfter!.height).toBeCloseTo(cardBoxBefore!.height, 0)
  })
})
