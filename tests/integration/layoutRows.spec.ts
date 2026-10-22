import { test, expect, type Page } from '@playwright/test'

// Layout rules of project-docs/redesign/10-toolbar-layout-export-proposal.md, on the real demo content.

async function boot(page: Page) {
  await page.goto('/?layout=scroll')
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

test.describe('the control bar is one row', () => {
  for (const width of [1100, 1280, 1440, 1920]) {
    test(`at ${width}px, Compare on and off, scrolled and not`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await boot(page)
      const heights = new Set<number>()
      for (const compare of [true, false]) {
        const toggle = page.getByTestId('control-compare')
        if ((await toggle.getAttribute('aria-checked')) === 'true' !== compare) await toggle.click()
        for (const y of [0, 600]) {
          await page.evaluate((top) => window.scrollTo(0, top), y)
          await page.waitForTimeout(450)
          const box = await page.getByTestId('control-bar').boundingBox()
          expect(box, 'control bar visible').not.toBeNull()
          heights.add(Math.round(box!.height))
          // every control sits on one line: all children share the same vertical centre (within 2px)
          const centres = await page.getByTestId('control-bar').evaluate((el) =>
            [...el.querySelectorAll(':scope > *, :scope > .contents > *')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top + r.height / 2)),
          )
          expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(2)
        }
      }
      expect(heights.size, `bar heights ${[...heights].join(', ')}`).toBe(1)
    })
  }

  test('focus, compared scenarios and reference are chosen in one popover', async ({ page }) => {
    await boot(page)
    const chip = page.getByTestId('scenario-picker-button')
    await expect(chip).toContainText('+2')
    await chip.click()
    await expect(page.getByRole('button', { name: /^Reference ActivitySim: TAZ 1 Density/ })).toBeVisible()
    await page.getByRole('button', { name: /^Focus ActivitySim: TAZ 1 Density/ }).click()
    await expect(page.getByTestId('scenario-chip-focus')).toContainText('Density')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('scenario-picker')).toHaveCount(0)
  })
})

test('the Compare toggle does not move when Compare is switched, and Show greys out', async ({ page }) => {
  await boot(page)
  const toggle = page.getByTestId('control-compare')
  const xs: number[] = []
  await page.waitForTimeout(800)
  for (let i = 0; i < 3; i++) {
    xs.push(Math.round((await toggle.boundingBox())!.x))
    await toggle.click()
    await page.waitForTimeout(350)
  }
  expect(new Set(xs).size, `toggle x ${xs.join(', ')}`).toBe(1)
  await expect(page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Values' })).toBeDisabled()
})

test('the scenarios popover hangs under its chip, scrolled or not', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await boot(page)
  await page.waitForTimeout(800)
  for (const y of [0, 500]) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(500)
    const chip = page.getByTestId('scenario-picker-button')
    await chip.click()
    const pop = page.getByTestId('scenario-picker')
    await expect(pop).toBeVisible()
    await page.waitForTimeout(200)
    const c = (await chip.boundingBox())!
    const p = (await pop.boundingBox())!
    expect(Math.abs(p.x - c.x), `left edges at scrollY ${y}`).toBeLessThanOrEqual(2)
    expect(p.y - (c.y + c.height), `gap under the chip at scrollY ${y}`).toBeGreaterThanOrEqual(4)
    expect(p.y - (c.y + c.height)).toBeLessThanOrEqual(14)
    await page.keyboard.press('Escape')
  }
})
