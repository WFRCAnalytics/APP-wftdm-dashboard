import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Shared Compare as, Export from the expanded dialog, and Export all
// (project-docs/redesign/10-toolbar-layout-export-proposal.md, questions 6 and 7) on the real demo content.

async function boot(page: Page, path = '/') {
  await page.goto(path)
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

async function setCompare(page: Page, on: boolean) {
  const toggle = page.getByTestId('control-compare')
  if (((await toggle.getAttribute('aria-checked')) === 'true') !== on) await toggle.click()
}

async function openPage(page: Page, name: string) {
  await page.hover('[data-sidebar=sidebar]')
  await page.getByRole('tab', { name }).first().click()
}

test.describe('shared Compare as', () => {
  test('a section can lift Compare as into the tab strip; it shows only while Compare is on', async ({ page }) => {
    await page.route('**/dashboard-4-mode-choice.yaml', async (route) => {
      const body = await (await route.fetch()).text()
      const lifted = body.replace('rows: [row_time_mix] }', 'rows: [row_time_mix], shared_controls: [strategy] }')
      expect(lifted).not.toBe(body)
      await route.fulfill({ body: lifted, contentType: 'text/yaml' })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await boot(page)
    await setCompare(page, true)
    await openPage(page, 'Mode choice')
    await page.getByRole('tab', { name: 'Through the day', exact: true }).click()
    const shared = page.getByTestId('shared-controls')
    await expect(shared).toBeVisible({ timeout: 30_000 })
    await expect(shared.getByRole('group', { name: 'Compare as' })).toBeVisible()
    // the tile no longer carries its own Compare as
    await expect(page.getByTestId('tab-body').getByRole('group', { name: 'Compare as' })).toHaveCount(0)
    const one = shared.getByRole('button', { name: 'One at a time' })
    const side = shared.getByRole('button', { name: 'Side by side' })
    await expect(one).toHaveAttribute('aria-pressed', 'true')
    await side.click()
    await expect(side).toHaveAttribute('aria-pressed', 'true')
    await expect(one).toHaveAttribute('aria-pressed', 'false')

    await setCompare(page, false)
    await expect(page.getByTestId('shared-controls')).toHaveCount(0)
  })
})

test.describe('Export from the expanded dialog', () => {
  test('the dialog has its own Export menu, and it exports the expanded chart', async ({ page }) => {
    await boot(page, '/?layout=scroll')
    await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Expand Mode share' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Export Mode share' }).click()
    const [csv] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('menuitem', { name: /data \(CSV\)/ }).click()])
    expect(csv.suggestedFilename()).toMatch(/^mode-share-.*\.csv$/)
    expect(readFileSync((await csv.path())!, 'utf8')).toContain('ActivitySim Baseline')

    await dialog.getByRole('button', { name: 'Export Mode share' }).click()
    const [png] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('menuitem', { name: /image \(PNG\)/ }).click()])
    const buf = readFileSync((await png.path())!)
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(buf.length).toBeGreaterThan(8_000)
  })
})

test.describe('Export all', () => {
  const entries = (buf: Buffer) => {
    const names: string[] = []
    const end = buf.length - 22
    const count = buf.readUInt16LE(end + 10)
    let at = buf.readUInt32LE(end + 16)
    for (let i = 0; i < count; i++) {
      const len = buf.readUInt16LE(at + 28)
      const extra = buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
      names.push(buf.subarray(at + 46, at + 46 + len).toString('utf8'))
      at += 46 + len + extra
    }
    return names
  }

  test('a tabbed page exports the tiles of the open tab as one ZIP of CSV files', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await boot(page)
    await openPage(page, 'Mode choice')
    await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('page-export').getByRole('button', { name: 'Export all' }).click()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /All data/ }).click()])
    expect(dl.suggestedFilename()).toMatch(/\.zip$/)
    const names = entries(readFileSync((await dl.path())!))
    expect(names.some((n) => n.startsWith('mode-share'))).toBe(true)
  })

  test('a scrolling page exports every tile as PNG pictures', async ({ page }) => {
    await boot(page, '/?layout=scroll')
    await openPage(page, 'Mode choice')
    await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('page-export').getByRole('button', { name: 'Export all' }).click()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /All images/ }).click()])
    const names = entries(readFileSync((await dl.path())!))
    expect(names.length).toBeGreaterThanOrEqual(2)
    expect(names.every((n) => n.endsWith('.png'))).toBe(true)
  })
})

test.describe('scenario picker', () => {
  test('clicking a scenario name does what its radio or checkbox does', async ({ page }) => {
    await boot(page)
    await setCompare(page, false)
    await page.getByTestId('scenario-picker-button').click()
    const rows = page.getByTestId('scenario-picker').locator('li[data-testid^="picker-row-"]')
    expect(await rows.count()).toBeGreaterThan(1)
    const second = rows.nth(1)
    await second.locator('span.truncate').first().click()
    await expect(second.getByRole('radio')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    await setCompare(page, true)
    await page.getByTestId('scenario-picker-button').click()
    const box = rows.nth(0).getByRole('checkbox')
    const before = await box.getAttribute('aria-checked')
    await rows.nth(0).locator('span.truncate').first().click()
    await expect(box).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true')
  })
})
