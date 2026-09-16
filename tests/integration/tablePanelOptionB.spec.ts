import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// TABLE-PANEL-PROPOSAL.md's Option B — column-visibility toggling,
// icon-based sort indicators, and pagination polish (first/last jump +
// a "Showing X-Y of Z rows" caption) — plus formatValue.ts's own bare-
// format-string fix (§2 of that same document). Deliberately targets
// REAL, published demo content directly (dashboard-3-tour-models.yaml's
// "Mandatory Tour Frequency by Person Type" panel — a real, bare-format
// (`,.0f`) table column, exactly the case that was silently broken
// before this fix) rather than the fixture-config path
// `tests/integration/tablePanel.spec.ts` depends on — that file has
// been substantially, pre-existingly broken since `040-test-suite-
// migration` (CLAUDE.md's own `057-observable-plot-conversion` entry
// records the full, already-triaged count), unrelated to this feature;
// matching the same real-demo-content-bypass technique `056`'s
// `graphicWalkerPanel.spec.ts` rewrite already established for the
// identical class of gap.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

async function gotoTourTab(page: Page) {
  await page.getByRole('tab', { name: 'Tour' }).click()
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

const REAL_TITLE = 'Mandatory Tour Frequency by Person Type'

test.describe('TABLE-PANEL-PROPOSAL.md Option B — column visibility, sort iconography, pagination polish', () => {
  test('a bare (unbraced) format string renders comma-separated, not a raw unformatted number (formatValue.ts fix)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTourTab(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    // Real, live cross-check — never a hardcoded expected value: the
    // panel's own "Persons" column uses `format: ",.0f"` (dashboard-3-
    // tour-models.yaml), the exact bare form the original regex
    // silently failed to match.
    const rawTotal = await page.evaluate(() =>
      window.__wftdm!.query(
        `SELECT persons FROM "activitysim-density-variant__mandatory_tour_freq_summary" WHERE mandatory_tour_frequency = 'work1' AND person_type = 'Full-time worker'`,
      ),
    )
    const expected = Number((rawTotal as Array<{ persons: number }>)[0].persons).toLocaleString('en-US')

    const cellTexts = await card.locator('tbody tr').first().locator('td').allTextContents()
    // Scenario, Frequency, Person Type, Persons — the last cell is the
    // formatted numeric value.
    expect(cellTexts[cellTexts.length - 1]).toBe(expected)
    expect(cellTexts[cellTexts.length - 1]).toContain(',')
  })

  test('the column-visibility menu lists every real column, hiding one removes it from the header and every row — and the menu stays open across multiple toggles', async ({
    page,
  }) => {
    await boot(page)
    await gotoTourTab(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    const headersBefore = await card.locator('thead th').allTextContents()
    expect(headersBefore).toEqual(['Scenario', 'Frequency', 'Person Type', 'Persons'])

    await card.getByRole('button', { name: 'Toggle column visibility' }).click()
    const menuItems = page.getByRole('menuitemcheckbox')
    await expect(menuItems).toHaveCount(4)

    // Hide "Frequency"
    await page.getByRole('menuitemcheckbox', { name: 'Frequency' }).click()

    // The menu must still be open (Radix's own default CheckboxItem
    // behavior closes it on every select — TablePanel.tsx's own
    // `onSelect` preventDefault is what keeps it open here) so a second
    // toggle in the same interaction works too.
    await expect(page.getByRole('menuitemcheckbox', { name: 'Person Type' })).toBeVisible()
    await page.getByRole('menuitemcheckbox', { name: 'Person Type' }).click()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)

    const headersAfter = await card.locator('thead th').allTextContents()
    expect(headersAfter).toEqual(['Scenario', 'Persons'])

    // Every body row lost both hidden columns' own cells too, not just
    // the header.
    const firstRowCellCount = await card.locator('tbody tr').first().locator('td').count()
    expect(firstRowCellCount).toBe(2)
  })

  test('sort indicators are real icons (not literal Unicode glyphs), and clicking a header sorts and updates aria-sort', async ({
    page,
  }) => {
    await boot(page)
    await gotoTourTab(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    const firstHeaderButton = card.locator('thead th').first().locator('button')
    await expect(firstHeaderButton.locator('svg')).toHaveCount(1)
    // The literal Unicode glyphs this replaced must be gone.
    await expect(firstHeaderButton).not.toContainText('▲')
    await expect(firstHeaderButton).not.toContainText('▼')

    const firstHeader = card.locator('thead th').first()
    await expect(firstHeader).not.toHaveAttribute('aria-sort', /.+/)

    await firstHeaderButton.click()
    await expect(firstHeader).toHaveAttribute('aria-sort', 'ascending')
    await firstHeaderButton.click()
    await expect(firstHeader).toHaveAttribute('aria-sort', 'descending')
  })

  test('an unsorted, sortable column shows a neutral indicator on hover (not only after being clicked)', async ({
    page,
  }) => {
    await boot(page)
    await gotoTourTab(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    const secondHeaderButton = card.locator('thead th').nth(1).locator('button')
    const icon = secondHeaderButton.locator('svg')
    await expect(icon).toHaveCSS('opacity', '0')
    await secondHeaderButton.hover()
    await expect(icon).toHaveCSS('opacity', '1')
  })

  test('pagination shows a real "Showing X-Y of Z rows" caption plus working first/last jump buttons', async ({
    page,
  }) => {
    await boot(page)
    await gotoTourTab(page)
    const card = panelCard(page, REAL_TITLE)
    await expect(card.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    const caption = card.getByText(/Showing \d+–\d+ of \d+ rows/)
    await expect(caption).toBeVisible()
    const captionText = (await caption.textContent())!
    const match = captionText.match(/Showing (\d+)–(\d+) of (\d+) rows/)
    expect(match).not.toBeNull()
    const [, first, last] = match!
    expect(Number(first)).toBe(1)
    expect(Number(last)).toBeGreaterThan(0)

    const firstPageBtn = card.getByRole('button', { name: 'First page' })
    const lastPageBtn = card.getByRole('button', { name: 'Last page' })
    const nextPageBtn = card.getByRole('button', { name: 'Next page' })
    await expect(firstPageBtn).toBeDisabled()

    await lastPageBtn.click()
    await expect(nextPageBtn).toBeDisabled()
    await expect(firstPageBtn).toBeEnabled()

    await firstPageBtn.click()
    await expect(caption).toContainText('Showing 1–')
  })
})
