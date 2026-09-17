import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 061-appearance-controls — real-browser coverage for all four Appearance
// tab additions, built incrementally by user story. Reuses this project's
// established boot()/panelCard() conventions (settingsModal.spec.ts,
// scenarioColorOverride.spec.ts) against real demo content — no fixture
// dependency.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__wftdm!.appState.get('activitysim-baseline')?.status === 'ready',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function openAppearanceTab(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Appearance' }).click()
}

test.describe('User Story 1 - Colorblind-safe preference', () => {
  test('toggling recolors a default-scheme chart live, leaves an explicit-scheme chart untouched, resets on reload', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Mode Choice' }).click()

    const explicitCard = panelCard(page, 'Trip Purpose to Mode Flow')
    const defaultCard = panelCard(page, 'Trip Purpose to Mode Flow (No Color Scheme)')
    await expect(explicitCard).toBeVisible()
    await expect(defaultCard).toBeVisible()

    const explicitFillBefore = await explicitCard
      .locator('.sankey-chart rect[data-node-id]')
      .first()
      .getAttribute('fill')

    await openAppearanceTab(page)
    const toggle = page.getByRole('switch', { name: 'Prefer colorblind-safe palettes' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    // Close the modal to inspect the panels behind it.
    await page.keyboard.press('Escape')

    const defaultFillAfter = await defaultCard
      .locator('.sankey-chart rect[data-node-id]')
      .first()
      .getAttribute('fill')
    // schemeSet2's own real first color.
    expect(defaultFillAfter).toBe('#66c2a5')

    const explicitFillAfter = await explicitCard
      .locator('.sankey-chart rect[data-node-id]')
      .first()
      .getAttribute('fill')
    expect(explicitFillAfter).toBe(explicitFillBefore)

    // Reload — the preference is session-only, never persisted.
    await boot(page)
    await openAppearanceTab(page)
    await expect(page.getByRole('switch', { name: 'Prefer colorblind-safe palettes' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  test('also recolors an unpinned, scenario-colored chart’s own default cycling', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Mode Choice' }).click()
    const card = panelCard(page, 'Trip Mode Share by Scenario')
    await expect(card).toBeVisible()

    await openAppearanceTab(page)
    await page.getByRole('switch', { name: 'Prefer colorblind-safe palettes' }).click()
    await page.keyboard.press('Escape')

    const firstVertexFill = await card.locator('.radar-chart circle[data-series]').first().getAttribute('fill')
    expect(firstVertexFill).toBe('#66c2a5')
  })
})

test.describe('User Story 2 - Text size', () => {
  test('dragging the slider resizes interface text live, both extremes stay legible, resets on reload', async ({
    page,
  }) => {
    await boot(page)
    await openAppearanceTab(page)

    const baselineFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)

    const slider = page.getByRole('slider', { name: 'Text size' })
    await slider.focus()
    await page.keyboard.press('End') // jumps to max (150)
    await expect(page.getByText('150%')).toBeVisible()

    const maxFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
    expect(parseFloat(maxFontSize)).toBeGreaterThan(parseFloat(baselineFontSize))

    await page.keyboard.press('Home') // jumps to min (80)
    await expect(page.getByText('80%')).toBeVisible()
    const minFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
    expect(parseFloat(minFontSize)).toBeLessThan(parseFloat(baselineFontSize))

    // The Settings modal itself must still be usable at the smallest size.
    await expect(page.getByRole('tab', { name: 'Scenarios' })).toBeVisible()

    await boot(page)
    const resetFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
    expect(resetFontSize).toBe(baselineFontSize)
  })
})

test.describe('User Story 3 - Primary / Secondary / Accent colors', () => {
  test('a deployer default applies with no override; a viewer override takes precedence live; reset reverts; text stays legible; reload clears only the override', async ({
    page,
  }) => {
    // Route the real dashboard-config/index.json endpoint (empty/
    // gitignored in this dev/test environment) to supply a deployer
    // default for Primary — the same page.route() injection technique
    // scenarioColorOverride.spec.ts already established for scenarioPalette.
    await page.route('**/dashboard-config/index.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ dashboards: [], primaryColor: '#1447e6' }),
      }),
    )
    await boot(page)

    const primaryBefore = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    )
    expect(primaryBefore).toBe('#1447e6')

    await openAppearanceTab(page)
    await page.getByTestId('interface-color-swatch-primary').click()
    const hexInput = page.getByLabel('Hex color')
    await expect(hexInput).toBeVisible()
    await hexInput.fill('00ff00')

    const primaryAfterOverride = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    )
    expect(primaryAfterOverride.toLowerCase()).toBe('#00ff00')
    // A light green background must pair with a legible (black) foreground.
    const foregroundAfterOverride = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary-foreground').trim(),
    )
    expect(foregroundAfterOverride.toLowerCase()).toBe('#000000')

    await page.getByRole('button', { name: 'Reset to default' }).click()
    const primaryAfterReset = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    )
    expect(primaryAfterReset).toBe('#1447e6')

    // Set the override again, then reload — the override must be gone,
    // but the deployer default (re-fetched from the routed index.json)
    // must still apply.
    await hexInput.fill('00ff00')
    await boot(page)
    const primaryAfterReload = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    )
    expect(primaryAfterReload).toBe('#1447e6')
  })
})

test.describe('User Story 4 - Fonts', () => {
  test('selecting a font changes only that role live; an unreachable request fails soft; reload clears every selection', async ({
    page,
  }) => {
    await boot(page)
    await openAppearanceTab(page)

    const bodyInput = page.locator('#font-picker-body')
    await bodyInput.fill('Merriweather')

    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-body')))
      .toContain('Merriweather')
    // Heading/monospace are untouched.
    const headingFont = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-heading'),
    )
    expect(headingFont).not.toContain('Merriweather')

    // Route the Google Fonts CSS endpoint to fail, simulating offline —
    // the dashboard must keep rendering legibly (no thrown error, no
    // broken text) rather than reflecting the failed selection.
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
    const headingInput = page.locator('#font-picker-heading')
    await headingInput.fill('Some Font')
    await expect(page.locator('body')).toBeVisible()

    await boot(page)
    await openAppearanceTab(page)
    await expect(page.locator('#font-picker-body')).toHaveValue('')
    await expect(page.locator('#font-picker-heading')).toHaveValue('')
  })
})
