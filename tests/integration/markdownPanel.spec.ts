import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __xss_fired?: boolean
  }
}

// Real-browser tests for 006-markdown-panel.
//
// 040-test-suite-migration: migrated off the retired
// tests/fixtures/dashboard-config/dashboard-1-summary.yaml (deleted in
// T011 — its own `row_markdown` panels: a rich "Methodology Notes" with
// headings/emphasis/lists/a link/a GFM table, plus XSS/empty/whitespace
// edge cases). Every real demo markdown panel today is a plain-paragraph
// gap note (no headings/lists/tables/code spans at all) — none has the
// richness this file's own typography/rendering coverage needs, so a
// new, genuinely real "Methodology Notes" panel was authored on the
// Summary tab (dashboard-1-summary.yaml's own new `row_methodology`),
// documenting this project's own real straight-line-distance-proxy
// caveat (already on record elsewhere in this codebase, e.g.
// zonemapPanel.spec.ts's own header comment) rather than any fabricated
// content. The XSS/empty/whitespace edge cases already existed, real, in
// `dashboard-8-test.yaml`'s own `row_markdown_edge` (Foundation phase) —
// this migration only retargets titles, EXCEPT the "legitimate markdown
// around unsafe fragments" case, which needed two short, genuinely
// descriptive sentences added around the payload (the real panel
// originally had none) to keep that assertion meaningful.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function gotoTestTab(page: Page) {
  await page.getByRole('tab', { name: 'Test' }).click()
}

test.describe('User Story 1 - Author renders formatted prose in a dashboard tab', () => {
  test('renders headings, emphasis, lists, and a link as real HTML elements', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Methodology Notes')

    await expect(card.getByRole('heading', { name: 'Straight-Line Distance Proxy' })).toBeVisible()
    await expect(card.locator('strong', { hasText: 'haversine straight-line distance' })).toBeVisible()
    await expect(card.locator('em', { hasText: 'approximate, not authoritative' })).toBeVisible()
    await expect(card.locator('ol li', { hasText: 'final_trips.csv' })).toBeVisible()
    await expect(card.locator('ul li', { hasText: 'intrazonal' })).toBeVisible()
    await expect(card.getByRole('link', { name: 'ActivitySim documentation' })).toBeVisible()
    // A raw markdown code span (`final_trips.csv`) renders as a real
    // <code> element, not literal backticks as text.
    await expect(card.locator('code', { hasText: 'final_trips.csv' })).toBeVisible()
  })

  test('a GFM table renders as a real <table> structure', async ({ page }) => {
    await boot(page)
    const card = panelCard(page, 'Methodology Notes')
    const table = card.locator('table')
    await expect(table).toBeVisible()
    await expect(table.locator('thead th', { hasText: 'Tolerance' })).toBeVisible()
    await expect(
      table.locator('tbody tr', { hasText: 'Trip length distribution' }).locator('td').last(),
    ).toHaveText('±10%')
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
      .getByRole('heading', { name: 'Straight-Line Distance Proxy' })
      .evaluate((el) => getComputedStyle(el).fontFamily)
    expect(markdownHeadingFont).toBe(cardTitleFont)

    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    const markdownParagraphFont = await card
      .locator('p', { hasText: 'Several distance-based metrics' })
      .evaluate((el) => getComputedStyle(el).fontFamily)
    expect(markdownParagraphFont).toBe(bodyFont)
  })

  test('a plain markdown link gets target="_blank" and rel="noopener noreferrer"', async ({
    page,
  }) => {
    await boot(page)
    const card = panelCard(page, 'Methodology Notes')
    const link = card.getByRole('link', { name: 'ActivitySim documentation' })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('inherits 004\'s expand-to-dialog mechanism with identical content', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'Expand Methodology Notes' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Straight-Line Distance Proxy' })).toBeVisible()
    await expect(dialog.locator('table')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
    // Still there, unchanged, back in the inline card.
    await expect(
      panelCard(page, 'Methodology Notes').getByRole('heading', {
        name: 'Straight-Line Distance Proxy',
      }),
    ).toBeVisible()
  })
})

test.describe('User Story 2 - Dashboard stays safe when markdown content is untrusted', () => {
  test('a <script> tag does not execute and is absent from the DOM', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Markdown XSS Payload (must be sanitized)')
    await expect(card.getByRole('heading', { name: 'Sanitized Heading' })).toBeVisible()
    await expect(card.locator('script')).toHaveCount(0)
    const fired = await page.evaluate(() => window.__xss_fired)
    expect(fired).toBeUndefined()
  })

  test('an onerror attribute is stripped and never fires', async ({ page }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Markdown XSS Payload (must be sanitized)')
    const img = card.locator('img')
    // The <img> element itself may or may not survive sanitization
    // (DOMPurify permits <img> by default) — what matters is that if it's
    // present, it carries no onerror handler, and either way the payload
    // never fires.
    if (await img.count()) {
      await expect(img).not.toHaveAttribute('onerror', /.*/)
    }
    const fired = await page.evaluate(() => window.__xss_fired)
    expect(fired).toBeUndefined()
  })

  test('legitimate markdown renders correctly alongside neutralized unsafe fragments', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Markdown XSS Payload (must be sanitized)')
    await expect(
      card.getByText('This paragraph is legitimate markdown and should render normally.'),
    ).toBeVisible()
    await expect(
      card.getByText('This paragraph comes after the unsafe fragments and should also'),
    ).toBeVisible()
  })
})

test.describe('User Story 3 - Panel behaves consistently with the rest of the registry', () => {
  test('a markdown panel alongside valuebox/plotly/recharts panels renders without error, standard chrome', async ({
    page,
  }) => {
    await boot(page)
    // Real Summary tab composition: valuebox + recharts + plotly +
    // (now) markdown together — the same "coexists cleanly with every
    // other real panel type" guarantee the retired fixture's own
    // valuebox/plotly/table trio proved, adapted to the real tab's own
    // actual panel-type mix (no table panel exists on this tab).
    await expect(page.getByText('Households', { exact: true })).toBeVisible() // valuebox
    await expect(page.getByText('Total Trips by Mode', { exact: true })).toBeVisible() // recharts
    await expect(page.getByText('Average Trip Distance by Purpose', { exact: true })).toBeVisible() // plotly
    const markdownCard = panelCard(page, 'Methodology Notes')
    await expect(markdownCard.getByRole('heading', { name: 'Methodology Notes' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Expand Methodology Notes' })).toBeVisible()
  })

  test('missing content: renders a defined empty state, not a blank card or crash', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Markdown Empty Content')
    await expect(card.getByText('No content configured')).toBeVisible()
  })

  test('whitespace-only content: renders the identical empty state as missing content', async ({
    page,
  }) => {
    await boot(page)
    await gotoTestTab(page)
    const card = panelCard(page, 'Markdown Whitespace Only')
    await expect(card.getByText('No content configured')).toBeVisible()
  })
})
