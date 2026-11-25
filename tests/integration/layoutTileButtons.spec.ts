import { expect, test } from '@playwright/test'

// A tile's header tools (Export, Expand) are one kind of button (components/ui/tile-icon-button.ts): the same size and
// colour, in light and in dark mode. Expand used to be a different, larger button in the full text colour.
test('tile Export and Expand buttons match in both themes', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/#/network')
  const exportBtn = page.locator('button[aria-label^="Export "]').first()
  await expect(exportBtn).toBeVisible({ timeout: 90_000 })
  const title = (await exportBtn.getAttribute('aria-label'))!.replace(/^Export /, '')
  const expandBtn = page.getByRole('button', { name: `Expand ${title}` })
  const look = (l: typeof exportBtn) =>
    l.evaluate((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { color: cs.color, w: Math.round(r.width), h: Math.round(r.height), radius: cs.borderTopLeftRadius }
    })
  for (const dark of [false, true]) {
    await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark)
    const a = await look(exportBtn)
    const b = await look(expandBtn)
    expect(b, dark ? 'dark' : 'light').toEqual(a)
    expect(a.w).toBe(30)
  }
})
