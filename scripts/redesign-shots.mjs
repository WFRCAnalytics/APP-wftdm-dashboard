// Redesign baseline screenshots (project-docs/redesign/07-implementation-plan.md, P0 task 4).
//
// Takes one full-page screenshot of every dashboard tab in light and dark, so the
// redesign can be compared against what the app looked like before it started.
// This is a standalone script, NOT a Playwright spec, on purpose: the default
// `npm run test:integration` run matches **/*.spec.ts and must never produce
// image files.
//
// Usage:
//   node scripts/redesign-shots.mjs [outDir] [baseUrl]
//
// With no baseUrl the script starts its own Vite dev server on 127.0.0.1:5200 and
// stops it at the end. The file watcher is disabled for that server on purpose: on
// Windows with Node 26 Vite's watcher can throw EBUSY and take the server down.
// Pass a baseUrl to use a server you already run instead.
//
// Defaults: outDir = specs/063-ui-redesign/baseline-shots
//
// Screenshots are not committed (see the .gitignore in the output folder).
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const outDir = resolve(process.argv[2] ?? 'specs/063-ui-redesign/baseline-shots')
const givenUrl = process.argv[3]
const baseUrl = givenUrl ?? 'http://127.0.0.1:5200/APP-wftdm-dashboard/'
const viewport = { width: 1500, height: 900 }
const settleMs = 4500 // DuckDB-WASM boot + lazy Parquet registration + chart draw

mkdirSync(outDir, { recursive: true })
const keep = join(outDir, '.gitignore')
if (!existsSync(keep)) writeFileSync(keep, '*\n!.gitignore\n')

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tab'

let server = null
if (!givenUrl) {
  server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 5200, strictPort: true, watch: null } })
  await server.listen()
}
const browser = await chromium.launch()
const report = []
for (const colorScheme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport, colorScheme })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`) })

  await page.goto(baseUrl)
  await page.waitForSelector('[role="tab"]', { timeout: 60_000 })
  await page.waitForTimeout(settleMs)

  const tabs = page.getByRole('tab')
  const count = await tabs.count()
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i)
    const label = (await tab.getAttribute('aria-label')) || (await tab.innerText()).trim() || `tab-${i + 1}`
    await tab.click()
    await page.waitForTimeout(settleMs)
    const file = join(outDir, `${colorScheme}-${String(i + 1).padStart(2, '0')}-${slug(label)}.png`)
    await page.screenshot({ path: file, fullPage: true })
    report.push(`${colorScheme} ${i + 1}/${count} ${label} -> ${file}`)
  }
  report.push(`${colorScheme}: ${errors.length} console/page errors${errors.length ? '\n  ' + errors.slice(0, 8).join('\n  ') : ''}`)
  await context.close()
}
await browser.close()
if (server) await server.close()
console.log(report.join('\n'))
