import { test, expect, type Page, type Locator } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 015-theme-toggle. See quickstart.md and
// contracts/theme-toggle.md. Uses Playwright's page.emulateMedia() to
// control the reported OS-level prefers-color-scheme deterministically —
// no reliance on the CI machine's own real OS setting.
//
// Control shape revised after initial shipping, following real user
// feedback: an icon-only DropdownMenu trigger (aria-label "Theme: <Mode>"),
// not the original three-always-visible-button Tabs control — see
// themeToggle.tsx's own header comment for the full reasoning. Helpers
// below target the dropdown's real ARIA roles (menu/menuitemradio).

async function boot(page: Page, colorScheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme })
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function isDark(page: Page) {
  return page.evaluate(() => document.documentElement.classList.contains('dark'))
}

function themeTriggerButton(page: Page): Locator {
  return page.getByRole('button', { name: /^Theme: / })
}

async function currentThemeMode(page: Page): Promise<string> {
  const label = await themeTriggerButton(page).getAttribute('aria-label')
  return label?.replace('Theme: ', '') ?? ''
}

async function openThemeMenu(page: Page) {
  await themeTriggerButton(page).click()
  await expect(page.getByRole('menu')).toBeVisible()
}

function themeMenuItem(page: Page, mode: 'System' | 'Light' | 'Dark') {
  return page.getByRole('menuitemradio', { name: mode })
}

async function selectTheme(page: Page, mode: 'System' | 'Light' | 'Dark') {
  await openThemeMenu(page)
  await themeMenuItem(page, mode).click()
}

async function gotoDetailTab(page: Page) {
  const detailTab = page.getByRole('tablist').first().getByRole('tab', { name: 'Detail' })
  if (await detailTab.count()) await detailTab.click()
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

/** Duplicated locally from graphicWalkerPanel.spec.ts (not exported there)
 * — same real, confirmed rbd keyboard-drag technique and shelf-crossing
 * arrow count, reused here only to create in-progress local panel state to
 * check survives a theme switch (US2 Scenario 3), not to re-test
 * Graphic Walker's own behavior. */
async function dragFieldToShelf(page: Page, card: Locator, draggableId: string, arrows: number) {
  const source = card.locator(`[data-rbd-draggable-id="${draggableId}"]`)
  await source.focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(250)
  for (let i = 0; i < arrows; i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
  }
  await page.keyboard.press('Space')
  await page.waitForTimeout(600)
}

const ARROWS_TO_ROWS_SHELF = 5

test.describe('User Story 1 - Dashboard opens matching the viewer\'s system theme', () => {
  test('boots dark when prefers-color-scheme is dark, before and after mount', async ({ page }) => {
    await boot(page, 'dark')
    expect(await isDark(page)).toBe(true)
    expect(await currentThemeMode(page)).toBe('System')
  })

  test('boots light when prefers-color-scheme is light', async ({ page }) => {
    await boot(page, 'light')
    expect(await isDark(page)).toBe(false)
  })

  test('tracks a live OS-preference change while in System mode, no reload', async ({ page }) => {
    await boot(page, 'light')
    expect(await isDark(page)).toBe(false)

    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(async () => {
      expect(await isDark(page)).toBe(true)
    }).toPass({ timeout: 5000 })
    expect(navigated).toBe(false)
  })
})

test.describe('User Story 2 - Viewer manually overrides the theme', () => {
  test('selecting Light overrides an emulated dark OS preference immediately', async ({ page }) => {
    await boot(page, 'dark')
    expect(await isDark(page)).toBe(true)

    await selectTheme(page, 'Light')
    expect(await isDark(page)).toBe(false)
    expect(await currentThemeMode(page)).toBe('Light')
  })

  test('a manual Dark override holds priority over a later OS-preference change', async ({ page }) => {
    await boot(page, 'light')
    await selectTheme(page, 'Dark')
    expect(await isDark(page)).toBe(true)

    // No listener is attached to react to this at all while mode !==
    // 'system' (research.md §5) — the class must stay exactly as the
    // manual choice left it.
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(500)
    expect(await isDark(page)).toBe(true)
  })

  test('toggling theme mode restyles an open graphic-walker panel without losing its in-progress state', async ({
    page,
  }) => {
    await boot(page, 'light')
    await gotoDetailTab(page)
    const card = panelCard(page, 'Free-form Visual Analytics')
    await card.waitFor({ state: 'visible', timeout: 15000 })

    await dragFieldToShelf(page, card, 'dimension_purpose', ARROWS_TO_ROWS_SHELF)
    await expect(card.getByText('purpose', { exact: true })).toHaveCount(3, { timeout: 5000 })

    await selectTheme(page, 'Dark')
    expect(await isDark(page)).toBe(true)
    // Same in-progress chart, not a fresh mount — the shelf chip is still
    // showing, alongside the field-list item.
    await expect(card.getByText('purpose', { exact: true })).toHaveCount(3)
  })
})

test.describe('User Story 3 - Viewer returns to following the system automatically', () => {
  test('selecting System after a manual override resumes live OS-preference tracking', async ({ page }) => {
    await boot(page, 'light')
    await selectTheme(page, 'Dark')
    expect(await isDark(page)).toBe(true)

    await selectTheme(page, 'System')
    expect(await isDark(page)).toBe(false) // resolves to the still-emulated 'light' OS preference

    // A fresh listener was actually re-attached, not just a one-time
    // resolution — a subsequent OS change is tracked live again.
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(async () => {
      expect(await isDark(page)).toBe(true)
    }).toPass({ timeout: 5000 })
  })

  test('exactly one of System/Light/Dark shows as checked in the menu at any time', async ({ page }) => {
    await boot(page, 'light')
    await openThemeMenu(page)
    await expect(themeMenuItem(page, 'System')).toHaveAttribute('data-state', 'checked')
    await expect(themeMenuItem(page, 'Light')).toHaveAttribute('data-state', 'unchecked')
    await expect(themeMenuItem(page, 'Dark')).toHaveAttribute('data-state', 'unchecked')
    await page.keyboard.press('Escape')

    await selectTheme(page, 'Dark')
    expect(await currentThemeMode(page)).toBe('Dark')
    await openThemeMenu(page)
    await expect(themeMenuItem(page, 'Dark')).toHaveAttribute('data-state', 'checked')
    await expect(themeMenuItem(page, 'System')).toHaveAttribute('data-state', 'unchecked')
    await expect(themeMenuItem(page, 'Light')).toHaveAttribute('data-state', 'unchecked')
    await page.keyboard.press('Escape')
  })
})

test.describe('Polish & cross-cutting', () => {
  test('a manual override does not survive a page reload — resets to System', async ({ page }) => {
    await boot(page, 'light')
    await selectTheme(page, 'Dark')
    expect(await isDark(page)).toBe(true)

    await page.reload()
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })

    expect(await currentThemeMode(page)).toBe('System')
    // 'light' is still the emulated preference for this page/context.
    expect(await isDark(page)).toBe(false)
  })

  test('a manual override in one tab does not affect another tab', async ({ browser }) => {
    const context1 = await browser.newContext({ colorScheme: 'light' })
    const context2 = await browser.newContext({ colorScheme: 'light' })
    try {
      const page1 = await context1.newPage()
      const page2 = await context2.newPage()
      await boot(page1, 'light')
      await boot(page2, 'light')

      await selectTheme(page1, 'Dark')
      expect(await isDark(page1)).toBe(true)
      expect(await isDark(page2)).toBe(false)
    } finally {
      await context1.close()
      await context2.close()
    }
  })

  test('a manual override survives switching dashboard tabs', async ({ page }) => {
    await boot(page, 'light')
    await selectTheme(page, 'Dark')
    expect(await isDark(page)).toBe(true)

    await gotoDetailTab(page)
    expect(await isDark(page)).toBe(true)
    expect(await currentThemeMode(page)).toBe('Dark')
  })
})
