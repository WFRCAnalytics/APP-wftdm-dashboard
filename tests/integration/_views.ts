import type { Locator, Page } from '@playwright/test'

/** Picks a view in a tile's view control, whichever form it takes: a switch (labels or icons) or a menu (narrow tiles). */
export async function chooseView(page: Page, scope: Locator | Page, name: string): Promise<void> {
  const button = scope.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true })
  if (await button.count()) return button.first().click()
  await scope.getByRole('combobox', { name: 'View' }).first().click()
  await page.getByRole('option', { name, exact: true }).click()
}
