import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 058-hierarchical-chart-panels — User Story 3: a viewer cannot tell the
// treemap/sunburst panel types use a different rendering technology.
// Verified via real, automated getComputedStyle() checks in both themes —
// matching rechartsPanel.spec.ts's/graphicWalkerPanel.spec.ts's own
// established dual-theme verification technique (`document.documentElement
// .classList.add/remove('dark')` — the same real mechanism
// useColorScheme() observes, no toggle UI needed in this test harness).

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

async function currentChartTokens(page: Page): Promise<string[]> {
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

test.describe('User Story 3 - A viewer cannot tell these charts use a different rendering technology', () => {
  test('light mode: every fill on both new panel types resolves to a real --chart-1..5 value', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)

    const treemapRects = panelCard(page, 'Trip Purpose to Mode Breakdown (Treemap)').locator(
      'g[data-node-name] > rect',
    )
    await expect(treemapRects).toHaveCount(10, { timeout: 10_000 })
    const treemapFills = await treemapRects.evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))

    const sunburstArcs = panelCard(page, 'Trip Purpose to Mode Breakdown (Sunburst)').locator(
      'path[data-node-name]',
    )
    await expect(sunburstArcs).toHaveCount(60, { timeout: 10_000 })
    const sunburstFills = await sunburstArcs.evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))

    const tokenColors = await currentChartTokens(page)
    for (const fill of treemapFills) {
      expect(tokenColors).toContain(fill)
    }
    for (const fill of sunburstFills) {
      expect(tokenColors).toContain(fill)
    }
    // Never the SVG default black fallback — the real, confirmed failure
    // mode a missing/broken color resolution would produce.
    expect(treemapFills).not.toContain('rgb(0, 0, 0)')
    expect(sunburstFills).not.toContain('rgb(0, 0, 0)')
  })

  test('dark mode: every fill remains resolved to the current (dark) --chart-1..5 values, and stays legible', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const firstTreemapRect = panelCard(page, 'Trip Purpose to Mode Breakdown (Treemap)').locator(
      'g[data-node-name] > rect',
    )
    await firstTreemapRect.first().waitFor({ state: 'visible', timeout: 10_000 })
    const lightFirstFill = await firstTreemapRect.first().evaluate((el) => getComputedStyle(el).fill)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    // The host's own redraw effect (keyed on useColorScheme()) re-resolves
    // colors against the new theme — wait for the fill to change from its
    // own real light-mode value (captured live above, never hardcoded)
    // before asserting further, matching this project's own "wait for a
    // real signal, not an arbitrary timeout" discipline.
    await expect
      .poll(async () => firstTreemapRect.first().evaluate((el) => getComputedStyle(el).fill))
      .not.toBe(lightFirstFill)

    const darkTokenColors = await currentChartTokens(page)

    const treemapFills = await panelCard(page, 'Trip Purpose to Mode Breakdown (Treemap)')
      .locator('g[data-node-name] > rect')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))
    const sunburstFills = await panelCard(page, 'Trip Purpose to Mode Breakdown (Sunburst)')
      .locator('path[data-node-name]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))

    for (const fill of treemapFills) {
      expect(darkTokenColors).toContain(fill)
    }
    for (const fill of sunburstFills) {
      expect(darkTokenColors).toContain(fill)
    }

    // Label text stays legible — currentColor inherits this app's real
    // cascading text color from its own closest HTML ancestor (the
    // `.hierarchical-chart-container` div), never a hardcoded light-only
    // value (research.md §5). Compared against that same real ancestor's
    // own computed `color` — not `document.body`'s, which a real,
    // confirmed check found resolves to a genuinely DIFFERENT (if very
    // close) value: `--foreground` is applied at a closer level (the
    // panel card), not the bare body element.
    const [treemapLabelColor, containerTextColor] = await Promise.all([
      panelCard(page, 'Trip Purpose to Mode Breakdown (Treemap)')
        .locator('g[data-node-name] text')
        .first()
        .evaluate((el) => getComputedStyle(el).fill),
      panelCard(page, 'Trip Purpose to Mode Breakdown (Treemap)')
        .locator('.hierarchical-chart-container')
        .evaluate((el) => getComputedStyle(el).color),
    ])
    expect(treemapLabelColor).toBe(containerTextColor)

    await page.evaluate(() => document.documentElement.classList.remove('dark'))
  })

  test('typography: labels use this app\'s established body font, not an ad hoc treatment', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)

    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)

    const treemapLabelFont = await panelCard(page, 'Trip Purpose to Mode Breakdown (Treemap)')
      .locator('g[data-node-name] text')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily)
    expect(treemapLabelFont).toBe(bodyFont)

    const sunburstLabelFont = await panelCard(page, 'Trip Purpose to Mode Breakdown (Sunburst)')
      .locator('text')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily)
    expect(sunburstLabelFont).toBe(bodyFont)
  })
})
