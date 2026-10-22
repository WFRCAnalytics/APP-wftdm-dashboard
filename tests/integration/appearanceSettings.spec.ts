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
    const toggle = page.getByRole('switch', { name: 'Colour-blind-safe scenario palette' })
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
    await expect(page.getByRole('switch', { name: 'Colour-blind-safe scenario palette' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  test('only the Switch itself toggles it — clicking the label text does nothing', async ({ page }) => {
    await boot(page)
    await openAppearanceTab(page)
    const toggle = page.getByRole('switch', { name: 'Colour-blind-safe scenario palette' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    // Clicking the visible title text must NOT toggle it — it's a plain
    // <span>, not a <label htmlFor>, specifically so it carries no native
    // click-to-toggle association.
    await page.getByText('Colour-blind-safe scenario palette', { exact: true }).click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    // The Switch itself still works.
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  test('also recolors an unpinned, scenario-colored chart’s own default cycling', async ({ page }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Mode Choice' }).click()
    const card = panelCard(page, 'Trip Mode Share by Scenario')
    await expect(card).toBeVisible()

    await openAppearanceTab(page)
    await page.getByRole('switch', { name: 'Colour-blind-safe scenario palette' }).click()
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
    await page.keyboard.press('End') // jumps to max (125)
    await expect(page.getByText('125%')).toBeVisible()

    const maxFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
    expect(parseFloat(maxFontSize)).toBeGreaterThan(parseFloat(baselineFontSize))

    await page.keyboard.press('Home') // jumps to min (85)
    await expect(page.getByText('85%')).toBeVisible()
    const minFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
    expect(parseFloat(minFontSize)).toBeLessThan(parseFloat(baselineFontSize))

    // The Settings modal itself must still be usable at the smallest size.
    await expect(page.getByRole('tab', { name: 'Scenarios' })).toBeVisible()

    await boot(page)
    const resetFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
    expect(resetFontSize).toBe(baselineFontSize)
  })
})

// WCAG contrast helpers evaluated in the page, so colors resolve exactly as the browser sees them.
async function contrastBetween(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(([x, y]) => {
    const lum = (c: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, bl] = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl
    }
    const [l1, l2] = [lum(x), lum(y)]
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }, [a, b])
}
const contrastOnWhite = (page: Page, c: string) => contrastBetween(page, c, '#ffffff')

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
    // services/theme.ts adapts the deployer color for the theme: light mode darkens it to 4.5:1 on white.
    expect(primaryBefore).toMatch(/^#[0-9a-f]{6}$/)
    expect(await contrastOnWhite(page, primaryBefore)).toBeGreaterThanOrEqual(4.5)

    await openAppearanceTab(page)
    await page.getByTestId('interface-color-swatch-primary').click()
    const hexInput = page.getByLabel('Hex color')
    await expect(hexInput).toBeVisible()
    await hexInput.fill('00ff00')

    const primaryAfterOverride = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    )
    expect(primaryAfterOverride.toLowerCase()).not.toBe(primaryBefore.toLowerCase())
    expect(await contrastOnWhite(page, primaryAfterOverride)).toBeGreaterThanOrEqual(4.5)
    // Whatever the adapted fill is, the foreground must be legible on it.
    const foregroundAfterOverride = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary-foreground').trim(),
    )
    expect(await contrastBetween(page, foregroundAfterOverride, primaryAfterOverride)).toBeGreaterThanOrEqual(4.5)

    await page.getByRole('button', { name: 'Reset to default' }).click()
    const primaryAfterReset = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    )
    expect(primaryAfterReset).toBe(primaryBefore)

    // Set the override again, then reload — the override must be gone,
    // but the deployer default (re-fetched from the routed index.json)
    // must still apply.
    await hexInput.fill('00ff00')
    await boot(page)
    const primaryAfterReload = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    )
    expect(primaryAfterReload).toBe(primaryBefore)
  })

})

test.describe('User Story 3 - live OS theme reactivity (real bug fix)', () => {
  // Deterministic starting preference — Playwright's own default (no
  // explicit colorScheme) is environment-dependent; this test needs a
  // known "before" state to flip away from.
  test.use({ colorScheme: 'light' })

  // A real, confirmed bug: with no override/deployer default configured,
  // the swatch's own tokens.css fallback (interfaceColorControl.tsx's
  // getComputedStyle read) had no reactive subscription to theme changes
  // at all — it only got fresh values as a side effect of some UNRELATED
  // re-render. A live OS-level prefers-color-scheme flip while Theme mode
  // is "System" (the app's own matchMedia listener mutates `.dark`
  // directly on document.documentElement, no React state involved) left
  // the swatch showing a stale color until the viewer happened to trigger
  // some other re-render — e.g. clicking "Dark" explicitly, which then
  // read the now-current value and made it look like the CLICK is what
  // changed the color, not a stale display catching up. Fixed by having
  // interfaceColorControl.tsx also call useColorScheme() (this test uses
  // Chrome DevTools Protocol's Emulation.setEmulatedMedia to flip the
  // real prefers-color-scheme media feature live, with zero clicks).
  test('an unconfigured swatch reacts live to a real OS-level theme change while Theme mode is System, with no click', async ({
    page,
  }) => {
    await boot(page)
    await openAppearanceTab(page)
    await expect(page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')

    const swatch = page.getByTestId('interface-color-swatch-primary')
    const before = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }],
    })

    await expect
      .poll(() => swatch.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(before)
    await expect(swatch).toHaveCSS('background-color', 'rgb(201, 214, 242)') // dark --primary, #c9d6f2
  })
})

test.describe('User Story 4 - Fonts', () => {
  test('selecting a font changes only that role live; an unreachable request fails soft; reload clears every selection', async ({
    page,
  }) => {
    await boot(page)
    await openAppearanceTab(page)

    // The custom-font inputs sit in a disclosure under the four type cards.
    await page.getByText('Custom fonts', { exact: true }).click()
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
    await page.getByText('Custom fonts', { exact: true }).click()
    await expect(page.locator('#font-picker-body')).toHaveValue('')
    await expect(page.locator('#font-picker-heading')).toHaveValue('')
  })
})
