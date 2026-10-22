import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Tile export (project-docs/redesign/10-toolbar-layout-export-proposal.md section D) on the real demo content.

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

async function download(page: Page, tile: string, item: RegExp) {
  await page.getByRole('button', { name: `Export ${tile}` }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()])
  const path = await dl.path()
  return { name: dl.suggestedFilename(), buf: readFileSync(path!) }
}

test.describe('tile export', () => {
  test('CSV holds the rows the chart drew, one row per scenario and mode', async ({ page }) => {
    await boot(page)
    await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    const { name, buf } = await download(page, 'Mode share', /data \(CSV\)/)
    expect(name).toMatch(/^mode-share-.*\.csv$/)
    const text = buf.toString('utf8').replace(/^﻿/, '')
    const lines = text.trim().split('\r\n')
    expect(lines[0]).toContain('scenario')
    expect(lines.length).toBeGreaterThan(5)
    expect(text).toContain('ActivitySim Baseline')
  })

  test('SVG is standalone: no theme variables, the title and the footer are in it', async ({ page }) => {
    await boot(page)
    await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    const { name, buf } = await download(page, 'Mode share', /image \(SVG\)/)
    expect(name.endsWith('.svg')).toBe(true)
    const svg = buf.toString('utf8')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Mode share')
    expect(svg).toContain('Source:')
    expect(svg).not.toContain('var(--')
    expect(svg).toContain('Walk and bike')
  })

  test('PNG is a real image at twice the size', async ({ page }) => {
    await boot(page)
    await expect(page.locator('[data-chart-kind="mode-bars"] svg').first()).toBeVisible({ timeout: 30_000 })
    const { buf } = await download(page, 'Mode share', /image \(PNG\)/)
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(buf.length).toBeGreaterThan(8_000)
  })

  test('a map tile exports as PNG (not SVG), with its pixels', async ({ page }) => {
    await boot(page)
    await page.hover('[data-sidebar=sidebar]')
    await page.getByRole('tab', { name: 'Network' }).click()
    const tile = 'Where transit is used'
    await expect(page.locator('.maplibregl-map').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: `Export ${tile}` }).click()
    await expect(page.getByRole('menuitem', { name: /image \(SVG\)/ })).toBeDisabled()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /image \(PNG\)/ }).click()])
    const buf = readFileSync((await dl.path())!)
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(buf.length).toBeGreaterThan(20_000)
  })
})
