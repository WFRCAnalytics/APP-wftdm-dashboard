import { expect, test, type Locator } from '@playwright/test'

// The flow map's volume filter (panels/FlowFilterLegend.tsx, panels/flowProvider.ts): a histogram of the lines the map
// draws (clustered at the current zoom) with a two-handle range slider, bottom-left in the map. Each handle hides one end
// of the lines; clustering is untouched; "Reset" shows every line again.
const count = async (map: Locator, attr: string) => Number(await map.getAttribute(attr))

test('flow map volume filter hides drawn lines at both ends and resets', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/network')
  await page.getByRole('tablist', { name: 'Page sections' }).getByRole('tab', { name: 'Trip desire lines' }).click()
  const filter = page.getByTestId('flow-filter')
  await expect(filter).toBeVisible({ timeout: 90_000 })
  const map = page.locator('.flowmap-chart').first()
  // zoom in a little, so there are enough lines to filter
  const mapBox = (await map.boundingBox())!
  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
  await page.waitForTimeout(1500)
  await expect.poll(() => count(map, 'data-lines-drawn')).toBeGreaterThan(1)
  const drawn = await count(map, 'data-lines-drawn')
  // clustering is on: no more lines drawn than zone pairs
  expect(drawn).toBeLessThanOrEqual(await count(map, 'data-flow-count'))
  await expect(filter).toContainText(`All ${drawn.toLocaleString('en-US')} lines`)
  await expect(filter.getByRole('button', { name: 'Reset' })).toBeHidden()

  // the filter sits inside the map, bottom-left
  const box = (await filter.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(mapBox.x)
  expect(box.y + box.height).toBeLessThanOrEqual(mapBox.y + mapBox.height)
  await page.screenshot({ path: info.outputPath('flow-filter-full.png'), clip: mapBox })
  await filter.screenshot({ path: info.outputPath('flow-filter-card-full.png') })

  // raise the low handle: the smallest lines go
  await filter.getByRole('slider', { name: 'Smallest line shown' }).focus()
  for (let i = 0; i < 25; i++) await page.keyboard.press('PageUp')
  await expect.poll(() => count(map, 'data-lines-shown')).toBeLessThan(drawn)
  const afterLow = await count(map, 'data-lines-shown')
  await expect(filter).toContainText(`${afterLow.toLocaleString('en-US')} of ${drawn.toLocaleString('en-US')} lines`)

  // lower the high handle as well: the largest go too
  await filter.getByRole('slider', { name: 'Largest line shown' }).focus()
  for (let i = 0; i < 25; i++) await page.keyboard.press('PageDown')
  await expect.poll(() => count(map, 'data-lines-shown')).toBeLessThan(afterLow)
  // hiding lines never re-clusters: the same lines are drawn
  expect(await count(map, 'data-lines-drawn')).toBe(drawn)
  await page.screenshot({ path: info.outputPath('flow-filter-trimmed.png'), clip: mapBox })
  await filter.screenshot({ path: info.outputPath('flow-filter-card.png') })

  // the theme switch keeps the filter
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(500)
  await filter.screenshot({ path: info.outputPath('flow-filter-card-dark.png') })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))

  await filter.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => count(map, 'data-lines-shown')).toBe(drawn)
  await expect(filter.getByRole('button', { name: 'Reset' })).toBeHidden()
})
