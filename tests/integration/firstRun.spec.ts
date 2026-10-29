import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect, type Page } from '@playwright/test'

// 070-demo-build-flag: a normal build (no demo content, no deployment folder), served by scripts/serve-first-run.ts (project `firstrun`).
// Nothing but the app is in it, so the app must say what is missing instead of showing an empty shell or any demo content.
const SITE_DIR = resolve('test-results/firstrun-dist/dashboard-config')

test.describe.configure({ mode: 'serial' })
test.afterEach(() => rmSync(SITE_DIR, { recursive: true, force: true }))

async function open(page: Page) {
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver|WebGL|Failed to load resource|404/.test(m.text())) errors.push(m.text())
  })
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('/')
  await expect(page.getByTestId('first-run')).toBeVisible({ timeout: 60_000 })
  return { errors, requests }
}

test('with no site configuration it says so, where it looked and what to do', async ({ page }) => {
  const { errors, requests } = await open(page)
  await expect(page.getByRole('heading', { name: 'No site configuration was found' })).toBeVisible()
  await expect(page.getByTestId('first-run-folder')).toContainText('dashboard-config/')
  await expect(page.getByText('npm run build:demo')).toBeVisible()
  // nothing of the demo: not its title, not its tabs, and no request for a demo file
  await expect(page.getByText('WFRC')).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(0)
  expect(requests.filter((u) => u.includes('demo-'))).toEqual([])
  expect(errors).toEqual([])
})

test('a site file that lists no pages is told apart from a missing one', async ({ page }) => {
  mkdirSync(SITE_DIR, { recursive: true })
  writeFileSync(resolve(SITE_DIR, 'dashboard-config.yaml'), 'version: 1\ntitle: Agency Dashboard\npages: []\n')
  const { errors, requests } = await open(page)
  await expect(page.getByRole('heading', { name: 'The site lists no pages' })).toBeVisible()
  expect(requests.filter((u) => u.includes('demo-'))).toEqual([])
  expect(errors).toEqual([])
})

test('a deployment with a page shows its own title and page and nothing else', async ({ page }) => {
  mkdirSync(SITE_DIR, { recursive: true })
  writeFileSync(resolve(SITE_DIR, 'dashboard-config.yaml'), 'version: 1\ntitle: Agency Dashboard\npages: [dashboard-a.yaml]\n')
  writeFileSync(resolve(SITE_DIR, 'dashboard-a.yaml'), 'header:\n  tab: Overview\n  title: Overview\nlayout:\n  row_one:\n    - type: markdown\n      title: Hello\n      content: Agency content\n')
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('first-run')).toHaveCount(0)
  await expect(page).toHaveTitle('Agency Dashboard')
  expect(requests.filter((u) => u.includes('demo-'))).toEqual([])
})
