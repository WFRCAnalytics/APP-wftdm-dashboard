import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 004-panel-expand-dialog, extending
// dashboardShell.spec.ts's pattern (real DuckDB-WASM, fixture Parquet,
// fixture dashboard-config). See quickstart.md and contracts/
// panel-expand-host.md / dialog-primitive.md / panel-card.md.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function expandTrigger(page: Page, title: string) {
  return page.getByRole('button', { name: `Expand ${title}` })
}

test.describe('User Story 1 - Expand a panel to a large view', () => {
  test('expand trigger opens a dialog showing the same content, for a valuebox and a plotly panel', async ({
    page,
  }) => {
    await boot(page)

    // valuebox
    await expandTrigger(page, 'Total Households').click()
    let dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Total Households')).toBeVisible()
    await expect(dialog.getByText('1,500')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()

    // plotly
    await expandTrigger(page, 'Mode Share by Purpose').click()
    dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()
  })

  test('Escape closes the dialog and returns focus to the trigger', async ({ page }) => {
    await boot(page)
    const trigger = expandTrigger(page, 'Total Households')
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test('clicking outside the dialog closes it and returns focus to the trigger', async ({ page }) => {
    await boot(page)
    const trigger = expandTrigger(page, 'Total Households')
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
    const trigger = expandTrigger(page, 'Total Households')
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test('Tab/Shift+Tab cycles focus only within the open dialog', async ({ page }) => {
    await boot(page)
    await expandTrigger(page, 'Total Households').click()
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
    // CSS class, which is exactly why forceMount + the CSS-hide approach
    // was more machinery than this actually needed.
    await boot(page)
    const allDialogRoots = page.locator('[role="dialog"]')
    await expect(allDialogRoots).toHaveCount(0)
  })

  test('clicking a Plotly legend entry toggles the trace and does not close the dialog', async ({
    page,
  }) => {
    await boot(page)
    await expandTrigger(page, 'Mode Share by Purpose').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const legendEntry = dialog.locator('.legend .traces').first()
    await expect(legendEntry).toBeVisible()

    const tracesBefore = await page.evaluate(() => {
      const gd = document.querySelector('.js-plotly-plot')
      return gd ? (gd as unknown as { data: { visible?: boolean }[] }).data.map((t) => t.visible ?? true) : []
    })

    // Plotly's modebar (zoom/pan/camera icons, shown on hover) floats over
    // the same top-right corner as the legend and physically intercepts
    // the click at the browser's own hit-testing level — `force: true`
    // only bypasses Playwright's pre-click actionability check, it doesn't
    // change which element the browser actually dispatches the event to,
    // so the modebar still wins even with force. Removing it is a
    // Plotly default-layout detail unrelated to what this test exists to
    // check (Radix's outside-click detection vs. Plotly's own legend
    // interaction), so it's a legitimate, test-only DOM cleanup rather
    // than a workaround for anything this feature's mechanism does.
    await page.evaluate(() => document.querySelector('.modebar-container')?.remove())
    await legendEntry.click()

    // Plotly updates its internal trace state slightly after the click
    // event fires (its own legend-click handler), so poll rather than
    // read once immediately — reading too early would just observe the
    // pre-click state and look like nothing happened.
    await expect
      .poll(async () => {
        const tracesNow = await page.evaluate(() => {
          const gd = document.querySelector('.js-plotly-plot')
          return gd
            ? (gd as unknown as { data: { visible?: boolean | 'legendonly' }[] }).data.map(
                (t) => t.visible ?? true,
              )
            : []
        })
        return tracesNow
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
    await expandTrigger(page, 'Total Households').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The overlay blocks the click from ever reaching the tab — Playwright
    // retries actionability until this times out, proving the click never
    // went through (not just that it didn't happen to be clicked).
    await expect(
      page.getByRole('tab', { name: 'Detail' }).click({ timeout: 2_000 }),
    ).rejects.toThrow()
    await expect(dialog).toBeVisible() // still open — the tab switch never went through
    // Not asserted via getByRole here: while the modal is genuinely open,
    // Radix correctly marks the rest of the page aria-hidden (the same
    // hideOthers() mechanism research.md §1a discusses) — a role-based
    // query for the card behind the dialog would find nothing by design,
    // not because the card is actually gone. A raw CSS locator (bypassing
    // accessibility-tree filtering) confirms it's still there.
    await expect(page.locator('h3', { hasText: 'Total Households' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await page.getByRole('tab', { name: 'Detail' }).click()
    await expect(page.getByText('Average Trip Distance')).toBeVisible()
  })
})

test.describe('User Story 2 - Return to the dashboard without losing panel state', () => {
  test('expand-then-collapse on an already-loaded panel shows no loading state and identical data', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.getByText('1,500')).toBeVisible() // already loaded

    await expandTrigger(page, 'Total Households').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.animate-pulse')).toHaveCount(0)
    await expect(dialog.getByText('1,500')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.animate-pulse')).toHaveCount(0)
    await expect(page.getByText('1,500')).toBeVisible()
  })

  test('expanding and collapsing a panel never triggers an additional data query', async ({
    page,
  }) => {
    // Deterministic, not timing-based — an earlier version of this test
    // tried to catch a panel's query "in flight" via a delayed network
    // response, but DuckDB-WASM's httpfs fully caches these tiny fixture
    // files' bytes the first time any query touches them (often during
    // the boot-time CREATE VIEW schema resolution itself), so a panel's
    // own SELECT frequently resolves with no new network request at all —
    // a route-level delay doesn't reliably create an observable in-flight
    // window. Counting actual query() calls (services/duckdb.ts's
    // __debugQueryLog, added for this test) proves the real guarantee
    // (FR-008) directly, regardless of timing.
    await boot(page)
    await expect(page.getByText('1,500')).toBeVisible()

    const countFor = (needle: string) =>
      page.evaluate(
        (n) => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes(n)).length,
        needle,
      )

    const before = await countFor('total_households')
    expect(before).toBeGreaterThan(0) // sanity: the panel really did query at least once

    await expandTrigger(page, 'Total Households').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('1,500')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()

    const after = await countFor('total_households')
    expect(after).toBe(before) // no additional query across the whole round trip
  })

  test('a panel in its error state shows the same error state when expanded', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Detail' }).click()
    await expect(page.getByText("Couldn't load this value")).toBeVisible()

    await expandTrigger(page, 'Broken Panel (intentional)').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Couldn't load this value")).toBeVisible()
  })

  test('a panel in its empty state shows the same empty state when expanded', async ({ page }) => {
    await boot(page)
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NONEXISTENT'))
    await expect(page.getByText('No data for this selection')).toBeVisible()

    await expandTrigger(page, 'Mode Share by Purpose').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('No data for this selection')).toBeVisible()

    // Restore, so this test doesn't leak filter state to any test that
    // happens to share a worker/page (Playwright gives each test a fresh
    // page here, but restoring is cheap and removes any doubt).
    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
  })

  test('changing a filter while a panel is expanded updates the expanded view', async ({ page }) => {
    await boot(page)
    await expandTrigger(page, 'Mode Share by Purpose').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'NONEXISTENT'))
    await expect(dialog.getByText('No data for this selection')).toBeVisible()

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'all'))
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()
  })
})

test.describe('User Story 3 - Charts render correctly sized inside the expanded view', () => {
  test('expanding a chart panel resizes it to fill the dialog, not its original card size', async ({
    page,
  }) => {
    await boot(page)
    const cardChart = page.locator('.js-plotly-plot')
    await expect(cardChart).toBeVisible()
    const cardBox = await cardChart.boundingBox()
    expect(cardBox).not.toBeNull()

    await expandTrigger(page, 'Mode Share by Purpose').click()
    const dialog = page.getByRole('dialog')
    const dialogChart = dialog.locator('.js-plotly-plot')
    await expect(dialogChart).toBeVisible()

    // Give the ResizeObserver a beat to fire and Plotly.Plots.resize() to
    // apply before measuring.
    await page.waitForTimeout(300)

    // Height reliably grows (400px fixed card height vs. h-[90vh]).
    // Width is compared against the dialog's own content container
    // rather than against the card's width: this fixture's chart panel
    // is configured width: 1.0 (full row width), so the collapsed card
    // can already be nearly as wide as the viewport — the meaningful
    // claim isn't "wider than before" but "fills the dialog it's
    // actually in," which this checks directly (FR-009).
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
    await expect(page.locator('.js-plotly-plot')).toBeVisible()
    await page.evaluate(() => {
      document.querySelector('.js-plotly-plot')?.setAttribute('data-preexpand-identity', 'same-node')
    })

    await expandTrigger(page, 'Mode Share by Purpose').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()

    // Exactly one chart container exists on the whole page (not
    // duplicated), and it's the same node that carried the marker set
    // before expanding — proof of relocation, not remount.
    await expect(page.locator('.js-plotly-plot')).toHaveCount(1)
    await expect(page.locator('.js-plotly-plot[data-preexpand-identity="same-node"]')).toHaveCount(1)
  })

  test('collapsing an expanded chart panel returns it to correct card-sized rendering', async ({
    page,
  }) => {
    await boot(page)
    const cardChart = page.locator('.js-plotly-plot')
    await expect(cardChart).toBeVisible()
    const cardBoxBefore = await cardChart.boundingBox()

    await expandTrigger(page, 'Mode Share by Purpose').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.js-plotly-plot')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()

    await page.waitForTimeout(300)
    await expect(page.locator('.js-plotly-plot')).toHaveCount(1)
    await expect(cardChart).toBeVisible()
    const cardBoxAfter = await cardChart.boundingBox()
    expect(cardBoxAfter!.width).toBeCloseTo(cardBoxBefore!.width, 0)
    expect(cardBoxAfter!.height).toBeCloseTo(cardBoxBefore!.height, 0)
  })
})
