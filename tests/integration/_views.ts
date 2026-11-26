import type { Locator, Page } from '@playwright/test'

/**
 * Picks a view in a tile's view control, whichever form it takes: a switch (labels or icons) or a menu (a tile with little
 * room in its header). With several tiles in `scope`, the first one offering the view is used: menus are opened in turn
 * until one lists it.
 */
export async function chooseView(page: Page, scope: Locator | Page, name: string): Promise<void> {
  const button = scope.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true })
  const menus = scope.getByRole('combobox', { name: 'View' })
  // a menu that has just closed keeps the rest of the page aria-hidden for a moment: wait until a view control shows again
  for (let tries = 0; tries < 25 && (await button.count()) === 0 && (await menus.count()) === 0; tries++) await page.waitForTimeout(200)
  if (await button.count()) return button.first().click()
  const n = await menus.count()
  for (let i = 0; i < n; i++) {
    await menus.nth(i).click()
    // the list draws a moment after the click (and the last one may still be fading out): wait for an open list, then give the
    // option a moment to appear before deciding this menu does not offer it
    const open = page.locator('[role="listbox"][data-state="open"]')
    await open.first().waitFor()
    const option = open.getByRole('option', { name, exact: true })
    if (await option.first().waitFor({ timeout: 1500 }).then(() => true, () => false)) return option.first().click()
    await page.keyboard.press('Escape')
  }
  throw new Error(`no view control offers "${name}" (${n} View menus)`)
}
