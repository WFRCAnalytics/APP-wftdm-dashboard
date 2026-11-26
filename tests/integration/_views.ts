import type { Locator, Page } from '@playwright/test'

/**
 * Picks a view in a tile's view control, whichever form it takes: a switch (labels or icons) or a menu (a tile with little
 * room in its header). With several tiles in `scope`, the first one offering the view is used: menus are opened in turn
 * until one lists it.
 */
export async function chooseView(page: Page, scope: Locator | Page, name: string): Promise<void> {
  const button = scope.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true })
  if (await button.count()) return button.first().click()
  const menus = scope.getByRole('combobox', { name: 'View' })
  const n = await menus.count()
  for (let i = 0; i < n; i++) {
    await menus.nth(i).click()
    const option = page.getByRole('option', { name, exact: true })
    if (await option.count()) return option.click()
    await page.keyboard.press('Escape')
  }
  throw new Error(`no view control offers "${name}"`)
}
