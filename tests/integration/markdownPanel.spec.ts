import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __xssFired?: boolean
  }
}

// Real-browser tests for 006-markdown-panel, extending
// dashboardShell.spec.ts's/tablePanel.spec.ts's pattern (real DuckDB-WASM,
// fixture Parquet, fixture dashboard-config — even though this panel type
// itself issues no query at all). See quickstart.md and
// contracts/markdown-panel.md.
//
// Fixture shape (tests/fixtures/dashboard-config/dashboard-1-summary.yaml's
// row_markdown):
// - "Methodology Notes": headings, bold/italic, ordered/unordered lists, a
//   plain link (no author-written target:/rel:), a GFM table.
// - "Markdown XSS Payload (intentional)": a literal <script> tag, an
//   onerror-bearing <img>, legitimate markdown before and after both.
// - "Markdown Empty (intentional)": no content: key at all.
// - "Markdown Whitespace-Only (intentional)": content: "   ".

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

test.describe('User Story 1 - Author renders formatted prose in a dashboard tab', () => {
  test('renders headings, emphasis, lists, and a link as real HTML elements', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Methodology Notes')

    await expect(card.getByRole('heading', { name: 'Highway Assignment Validation' })).toBeVisible()
    await expect(card.locator('strong', { hasText: 'UDOT AADT counts' })).toBeVisible()
    await expect(card.locator('em', { hasText: '±10%' })).toBeVisible()
    await expect(card.locator('ol li', { hasText: 'Observed counts' })).toBeVisible()
    await expect(card.locator('ul li', { hasText: 'Freeway' })).toBeVisible()
    await expect(card.getByRole('link', { name: 'UDOT traffic count program' })).toBeVisible()
    // A raw markdown code span (`summary_kpis.parquet`) renders as a real
    // <code> element, not literal backticks as text.
    await expect(card.locator('code', { hasText: 'summary_kpis.parquet' })).toBeVisible()
  })

  test('a GFM table renders as a real <table> structure', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Methodology Notes')
    const table = card.locator('table')
    await expect(table).toBeVisible()
    await expect(table.locator('thead th', { hasText: 'Threshold' })).toBeVisible()
    await expect(table.locator('tbody tr', { hasText: 'Arterial' }).locator('td').last()).toHaveText(
      '±15%',
    )
  })

  test('rendered headings/body use the dashboard\'s own typography, not marked.js defaults', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Methodology Notes')

    // Compare against this same card's own title (CardTitle, font-heading)
    // and the document body's global font-body default — real elements
    // already known to carry the app's design-token typography.
    const cardTitleFont = await card
      .getByRole('heading', { name: 'Methodology Notes' })
      .evaluate((el) => getComputedStyle(el).fontFamily)
    const markdownHeadingFont = await card
      .getByRole('heading', { name: 'Highway Assignment Validation' })
      .evaluate((el) => getComputedStyle(el).fontFamily)
    expect(markdownHeadingFont).toBe(cardTitleFont)

    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    const markdownParagraphFont = await card
      .locator('p', { hasText: 'Screenline volumes' })
      .evaluate((el) => getComputedStyle(el).fontFamily)
    expect(markdownParagraphFont).toBe(bodyFont)
  })

  test('a plain markdown link gets target="_blank" and rel="noopener noreferrer"', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Methodology Notes')
    const link = card.getByRole('link', { name: 'UDOT traffic count program' })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('inherits 004\'s expand-to-dialog mechanism with identical content', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Expand Methodology Notes' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Highway Assignment Validation' })).toBeVisible()
    await expect(dialog.locator('table')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    // Still there, unchanged, back in the inline card.
    await expect(
      panelCard(page, 'Methodology Notes').getByRole('heading', {
        name: 'Highway Assignment Validation',
      }),
    ).toBeVisible()
  })
})

test.describe('User Story 2 - Dashboard stays safe when markdown content is untrusted', () => {
  test('a <script> tag does not execute and is absent from the DOM', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Markdown XSS Payload (intentional)')
    await expect(card.getByRole('heading', { name: 'Still Renders Safely' })).toBeVisible()
    await expect(card.locator('script')).toHaveCount(0)
    const fired = await page.evaluate(() => window.__xssFired)
    expect(fired).toBeUndefined()
  })

  test('an onerror attribute is stripped and never fires', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Markdown XSS Payload (intentional)')
    const img = card.locator('img')
    // The <img> element itself may or may not survive sanitization
    // (DOMPurify permits <img> by default) — what matters is that if it's
    // present, it carries no onerror handler, and either way the payload
    // never fires.
    if (await img.count()) {
      await expect(img).not.toHaveAttribute('onerror', /.*/)
    }
    const fired = await page.evaluate(() => window.__xssFired)
    expect(fired).toBeUndefined()
  })

  test('legitimate markdown renders correctly alongside neutralized unsafe fragments', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Markdown XSS Payload (intentional)')
    await expect(
      card.getByText('This paragraph is legitimate markdown and should render normally.'),
    ).toBeVisible()
    await expect(
      card.getByText('This paragraph comes after the unsafe fragments and should also'),
    ).toBeVisible()
  })
})

test.describe('User Story 3 - Panel behaves consistently with the rest of the registry', () => {
  test('a markdown panel alongside valuebox/plotly/table panels renders without error, standard chrome', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.getByText('Total Households')).toBeVisible() // valuebox
    await expect(page.getByText('Mode Share by Purpose')).toBeVisible() // plotly
    await expect(panelCard(page, 'Screenline Validation').locator('table')).toBeVisible() // table
    const markdownCard = panelCard(page, 'Methodology Notes')
    await expect(markdownCard.getByRole('heading', { name: 'Methodology Notes' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Expand Methodology Notes' })).toBeVisible()
  })

  test('missing content: renders a defined empty state, not a blank card or crash', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Markdown Empty (intentional)')
    await expect(card.getByText('No content configured')).toBeVisible()
  })

  test('whitespace-only content: renders the identical empty state as missing content', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Markdown Whitespace-Only (intentional)')
    await expect(card.getByText('No content configured')).toBeVisible()
  })
})
