import { test, expect, type Page } from '@playwright/test'

// Layout rules of project-docs/redesign/10-toolbar-layout-export-proposal.md, on the real demo content.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

/** Heights of the tile cards in every non-KPI row of the active page. */
async function rowCardHeights(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid^="row_"]')].map((row) => ({
      row: row.dataset.testid,
      heights: [...row.children].map((c) => Math.round((c.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height ?? 0)),
    })),
  )
}

test.describe('tiles in a row share one height', () => {
  for (const compare of [true, false]) {
    test(`every row on every page, Compare ${compare ? 'on' : 'off'}`, async ({ page }) => {
      await boot(page)
      const toggle = page.getByTestId('control-compare')
      if ((await toggle.getAttribute('aria-checked')) === 'true' !== compare) await toggle.click()
      const tabs = ['Summary', 'Person and household', 'Tour models', 'Mode choice', 'Network']
      for (const name of tabs) {
        await page.hover('[data-sidebar=sidebar]')
        await page.getByRole('tab', { name }).click()
        await page.waitForTimeout(600)
        for (const { row, heights } of await rowCardHeights(page)) {
          if (heights.length < 2 || heights.some((h) => h === 0)) continue
          expect(new Set(heights).size, `${name} / ${row}: ${heights.join(', ')}`).toBe(1)
        }
      }
    })
  }
})
