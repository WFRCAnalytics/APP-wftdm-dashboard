import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 063 redesign, P10: the Settings modal as the Corridor Pro prototype draws it (project-docs/redesign/02-layout-and-components.md
// section 4). Runs against the real demo content and names no scenario in particular, so it survives the demo data being
// regenerated: it only needs at least two independent scenarios to be loaded.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForFunction(
    () => (window.__wftdm?.appState.list().filter((s) => s.status === 'ready' && s.kind === 'scenario').length ?? 0) >= 2,
    null,
    { timeout: 45_000 },
  )
}

async function openSettings(page: Page, tab?: string) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  if (tab) await page.getByRole('tab', { name: tab }).click()
}

test.describe('Settings modal shell', () => {
  test.use({ viewport: { width: 1500, height: 900 } })

  test('is a 1040x720 dialog with a 210px rail of five tabs and a Close row', async ({ page }) => {
    await boot(page)
    await openSettings(page)
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    const box = await dialog.boundingBox()
    expect(Math.round(box!.width)).toBe(1040)
    expect(Math.round(box!.height)).toBe(720)
    await expect(dialog).toHaveCSS('border-top-left-radius', '26px')

    const tablist = dialog.getByRole('tablist', { name: 'Settings sections' })
    for (const name of ['Appearance', 'Scenarios', 'Basemap', 'Assistant', 'Documentation']) {
      const tab = tablist.getByRole('tab', { name })
      await expect(tab).toBeVisible()
      expect(Math.round((await tab.boundingBox())!.height)).toBe(40)
    }
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible()
    // The body starts 210px from the dialog's left edge.
    const panel = dialog.getByRole('tabpanel')
    expect(Math.round((await panel.boundingBox())!.x - box!.x)).toBe(211)
  })

  test('arrow keys move between tabs; Esc closes and focus returns to the Settings button', async ({ page }) => {
    await boot(page)
    const opener = page.getByRole('button', { name: 'Settings' })
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()
    // Focus moved inside the dialog.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)

    await page.getByRole('tab', { name: 'Appearance' }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('tab', { name: 'Scenarios' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Documentation' })).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('a click on the scrim closes it', async ({ page }) => {
    await boot(page)
    await openSettings(page)
    await page.mouse.click(5, 5)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('below 900px the rail becomes a horizontal row of tabs', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 800 })
    await boot(page)
    await openSettings(page)
    const a = await page.getByRole('tab', { name: 'Appearance' }).boundingBox()
    const b = await page.getByRole('tab', { name: 'Basemap' }).boundingBox()
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2)
    expect(b!.x).toBeGreaterThan(a!.x + a!.width)
  })
})

test.describe('Appearance tab', () => {
  test.use({ viewport: { width: 1500, height: 900 }, colorScheme: 'light' })

  test('Theme offers Light, Dark and System; System follows the OS preference live', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Appearance')
    const theme = page.getByRole('group', { name: 'Theme' })
    await expect(theme.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await theme.getByRole('button', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    // An explicit choice ignores the OS.
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await theme.getByRole('button', { name: 'System' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('interface colours show a hex readout, presets set all three, Reset clears them', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Appearance')
    const hex = (role: string) => page.getByTestId(`interface-color-hex-${role}`)
    await page.getByRole('button', { name: 'Use the Plum colours' }).click()
    await expect(hex('primary')).toHaveText('#6d3fc8')
    await expect(hex('secondary')).toHaveText('#0c8f6f')
    await expect(hex('accent')).toHaveText('#d9534f')
    await page.getByRole('button', { name: 'Reset', exact: true }).first().click()
    await expect(hex('primary')).not.toHaveText('#6d3fc8')
  })

  test('Type is four radio cards; text size runs 85 to 125 in steps of 5; Reset appearance restores both', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Appearance')
    const fonts = page.getByRole('radiogroup', { name: 'Font' })
    await expect(fonts.getByRole('radio')).toHaveCount(4)
    await expect(fonts.getByRole('radio', { name: /Schibsted Grotesk/ })).toHaveAttribute('aria-checked', 'true')
    await fonts.getByRole('radio', { name: /System UI/ }).click()
    await expect(fonts.getByRole('radio', { name: /System UI/ })).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--font-body')))
      .toContain('system-ui')

    const slider = page.getByRole('slider', { name: 'Text size' })
    await slider.focus()
    await page.keyboard.press('End')
    await expect(page.getByText('125%', { exact: true })).toBeVisible()
    await page.keyboard.press('Home')
    await expect(page.getByText('85%', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Reset', exact: true }).last().click()
    await expect(page.getByText('100%', { exact: true })).toBeVisible()
    await expect(fonts.getByRole('radio', { name: /Schibsted Grotesk/ })).toHaveAttribute('aria-checked', 'true')
  })

  test('the colour-blind-safe switch is a labelled switch', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Appearance')
    const sw = page.getByRole('switch', { name: 'Colour-blind-safe scenario palette' })
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('Scenarios tab', () => {
  test.use({ viewport: { width: 1500, height: 900 } })

  /** The real names of the listed rows, in order. */
  const rowNames = (page: Page) =>
    page
      .getByTestId('scenario-load-list')
      .getByTestId('scenario-name')
      .evaluateAll((inputs) => inputs.map((el) => el.getAttribute('placeholder')!))

  test('lists only independent scenarios: no observed data, calibration rounds or hidden runs', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Scenarios')
    const names = await rowNames(page)
    expect(names.length).toBeGreaterThanOrEqual(2)
    const kinds = await page.evaluate(
      (list) => list.map((n) => window.__wftdm!.appState.get(n)?.kind ?? 'observed'),
      names,
    )
    for (const k of kinds) expect(k).toBe('scenario')
  })

  test('a card has grip, swatch, name, Include switch, baseline control and up/down buttons', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Scenarios')
    const [first, second] = await rowNames(page)
    const row = page.getByTestId(`scenario-row-${second}`)
    await expect(row.getByRole('button', { name: `Reorder ${second}` })).toBeVisible()
    await expect(row.getByRole('button', { name: `Color for ${second}` })).toBeVisible()
    await expect(row.getByRole('textbox', { name: `Custom label for ${second}` })).toBeVisible()
    await expect(row.getByRole('switch')).toBeVisible()
    await expect(row.getByRole('button', { name: `Mark ${second} as baseline scenario` })).toBeVisible()
    await expect(row.getByRole('button', { name: `Move ${second} up` })).toBeEnabled()
    await expect(row.getByRole('button', { name: `Move ${second} down` })).toBeVisible()
    await expect(page.getByTestId(`scenario-row-${first}`).getByRole('button', { name: `Move ${first} up` })).toBeDisabled()
  })

  test('the down and up buttons reorder the listed scenarios through the shared reorder path', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Scenarios')
    const before = await rowNames(page)
    await page.getByRole('button', { name: `Move ${before[0]} down` }).click()
    await expect.poll(() => rowNames(page)).toEqual([before[1], before[0], ...before.slice(2)])
    await page.getByRole('button', { name: `Move ${before[0]} up` }).click()
    await expect.poll(() => rowNames(page)).toEqual(before)
  })

  test('Set as baseline moves the Baseline chip', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Scenarios')
    const names = await rowNames(page)
    const target = names[names.length - 1]
    await page.getByRole('button', { name: `Mark ${target} as baseline scenario` }).click()
    await expect(page.getByTestId(`baseline-chip-${target}`)).toContainText('Baseline')
    await expect(page.getByTestId(`baseline-chip-${target}`).getByRole('button')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline())).toBe(target)
  })

  test('Include toggles the compare set; Compare all includes every listed scenario', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Scenarios')
    const names = await rowNames(page)
    const row = page.getByTestId(`scenario-row-${names[1]}`)
    await row.getByRole('switch').click()
    const state = (n: string) => page.evaluate((name) => window.__wftdm!.appState.get(name)!.active, n)
    const toggled = await state(names[1])
    await row.getByRole('switch').click()
    expect(await state(names[1])).toBe(!toggled)

    await page.getByRole('button', { name: 'Compare all' }).click()
    for (const n of names) expect(await state(n)).toBe(true)
  })

  test('typing a name and choosing a colour store viewer overrides; Reset colours and names clears them', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Scenarios')
    const [first] = await rowNames(page)
    const input = page.getByRole('textbox', { name: `Custom label for ${first}` })
    await input.fill('Renamed')
    await expect.poll(() => page.evaluate((n) => window.__wftdm!.appState.get(n)!.label, first)).toBe('Renamed')
    await page.evaluate((n) => window.__wftdm!.appState.setColorOverride(n, '#ff0000'), first)
    await expect.poll(() => page.evaluate((n) => window.__wftdm!.appState.get(n)!.colorOverride, first)).toBe('#ff0000')

    await page.getByRole('button', { name: 'Reset colours and names' }).click()
    await expect(input).toHaveValue('')
    expect(await page.evaluate((n) => window.__wftdm!.appState.get(n)!.colorOverride, first)).toBeUndefined()
  })
})

test.describe('Basemap tab', () => {
  test.use({ viewport: { width: 1500, height: 900 } })

  test('style cards on the left, a preview card on the right; nothing applies until Apply', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Basemap')
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    const cards = dialog.getByRole('radiogroup', { name: 'CARTO Vector Tiles' })
    const voyager = cards.getByRole('radio', { name: 'Voyager' })
    const cardBox = await voyager.boundingBox()
    const apply = dialog.getByRole('button', { name: 'Apply' })
    const previewBox = await apply.boundingBox()
    expect(previewBox!.x).toBeGreaterThan(cardBox!.x + cardBox!.width)

    await expect(apply).toBeDisabled()
    await expect(dialog.getByText(/^Applied now:/)).toContainText('Positron')
    await voyager.click()
    await expect(voyager).toHaveAttribute('aria-checked', 'true')
    await expect(apply).toBeEnabled()
    // The preview describes the staged style while "Applied now" still names the live one.
    await expect(dialog.getByText(/^Applied now:/)).toContainText('Positron')
    await dialog.getByRole('button', { name: 'Revert' }).click()
    await expect(apply).toBeDisabled()
    await expect(voyager).toHaveAttribute('aria-checked', 'false')

    await voyager.click()
    await apply.click()
    await expect(dialog.getByText(/^Applied now:/)).toContainText('Voyager')
    await expect(voyager.getByTestId('style-in-use')).toBeVisible()
  })

  test('Protomaps styles are disabled with a "Needs a PMTiles source" caption exactly when no source is configured', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Basemap')
    const protomaps = page.getByRole('radiogroup', { name: 'Protomaps' })
    const configured = (await page.getByTestId('protomaps-source-status').count()) > 0
    if (configured) {
      await expect(protomaps.getByRole('radio').first()).toBeEnabled()
      await expect(protomaps.getByText('Needs a PMTiles source')).toHaveCount(0)
    } else {
      await expect(protomaps.getByRole('radio').first()).toBeDisabled()
      await expect(protomaps.getByText('Needs a PMTiles source')).toHaveCount(5)
    }
  })
})

test.describe('Documentation tab', () => {
  test.use({ viewport: { width: 1500, height: 900 } })

  test('explains focus and compare, the compare table, years, rounds, observed data and shortcuts', async ({ page }) => {
    await boot(page)
    await openSettings(page, 'Documentation')
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog.getByRole('heading', { name: 'How each chart compares' })).toBeVisible()
    await expect(dialog.getByRole('table')).toBeVisible()
    await expect(dialog.getByRole('row')).toHaveCount(7)
    for (const topic of ['Focus and compare', 'Model years', 'Calibration rounds', 'Observed data', 'Reading many scenarios', 'Shortcuts', 'About the data']) {
      await expect(dialog.getByRole('heading', { name: topic })).toHaveCount(1)
    }
    await expect(page.getByRole('button', { name: 'Documentation' })).toHaveCount(0)
  })
})
