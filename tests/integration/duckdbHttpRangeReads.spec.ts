import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 056-lazy-tab-scoped-loading follow-up investigation — services/duckdb.ts's
// initDuckDB() now calls db.open({filesystem: {allowFullHTTPReads: false,
// reliableHeadRequests: true, forceFullHTTPReads: false}}), and
// registerFileURL() gained a manual fetch()+registerFileBuffer() fallback
// for a server that fails HTTP range-request detection entirely. Both
// confirmed empirically before this spec existed (real browser network
// captures against a real ~24MB synthetic Parquet file and a deliberately
// range-incapable test server — see this feature's own PR/session record):
// allowFullHTTPReads: true was tried and rejected because it disables range
// reads UNCONDITIONALLY, even on a fully range-capable server, not just as
// a rare-case safety net. This spec pins the real, load-bearing behavior a
// query-result-only assertion can't distinguish from an accidental full
// download that happens to return correct rows.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REAL_FIXTURE_PARQUET = path.resolve(
  __dirname,
  '../../public/demo-scenarios/activitysim-baseline/summary/summary_kpis.parquet',
)

async function boot(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForSelector('h1:has-text("Summary")', { timeout: 15_000 })
}

test.describe('registerFileURL() HTTP range-request behavior', () => {
  test('a real Parquet file is read via a genuine 206 Partial Content response, not a full download', async ({
    page,
  }) => {
    await boot(page)

    // A fresh, never-before-fetched view name AVOIDS reusing the landing
    // tab's own boot-time registration of this same real file (Summary's
    // own 056-lazy-tab-scoped-loading fan-out already includes
    // summary_kpis) — but the URL itself is still the same physical file,
    // so filter network capture on the actual fetched URL, not the view
    // name (the view name never appears in the URL at all).
    const responses: { status: number; range: string | null; contentRange: string | null }[] = []
    page.on('response', async (res) => {
      if (!res.url().endsWith('/activitysim-baseline/summary/summary_kpis.parquet')) return
      const headers = await res.allHeaders()
      responses.push({
        status: res.status(),
        range: res.request().headers()['range'] ?? null,
        contentRange: headers['content-range'] ?? null,
      })
    })

    const rows = await page.evaluate(async () => {
      await window.__wftdm!.registerFileURL(
        'rangereadtest__summary_kpis',
        '/APP-wftdm-dashboard/demo-scenarios/activitysim-baseline/summary/summary_kpis.parquet',
      )
      const r = await window.__wftdm!.query('SELECT total_households FROM "rangereadtest__summary_kpis"')
      return JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
    })

    // Real data still resolves correctly...
    expect(rows).toEqual([{ total_households: '5000' }])

    // ...but the mechanism itself is the thing under test: at least one real
    // 206 response, carrying a real Content-Range header, must have
    // occurred — a plain 200 full-content response would also return
    // correct rows, which is exactly why this can't be a query-result-only
    // assertion (spec.md's own instruction for this test).
    const partialResponses = responses.filter((r) => r.status === 206 && r.contentRange !== null)
    expect(partialResponses.length).toBeGreaterThan(0)
    // Every response actually observed for this view must have been
    // requested with a Range header — confirms the range path was taken
    // throughout, not just for one incidental request among others.
    expect(responses.every((r) => r.range !== null)).toBe(true)
  })

  test('a server that ignores Range headers entirely still loads correctly via the manual fallback, with a clear diagnostic warning', async ({
    page,
  }) => {
    const realBytes = readFileSync(REAL_FIXTURE_PARQUET)

    // Simulate a genuinely range-incapable server: always return the full
    // file with 200, regardless of any Range header sent — real static
    // hosts with this behavior exist (this app's own troubleshoot findings
    // cite DuckDB-WASM's own documented caveats on this exact point).
    await page.route('**/APP-wftdm-dashboard/incapable-test/summary_kpis.parquet', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        headers: { 'content-length': String(realBytes.byteLength) },
        body: realBytes,
      })
    })

    await boot(page)

    const consoleWarnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && /does not support HTTP range requests/.test(msg.text())) {
        consoleWarnings.push(msg.text())
      }
    })

    const result = await page.evaluate(async () => {
      await window.__wftdm!.registerFileURL('rangeincapabletest__x', '/APP-wftdm-dashboard/incapable-test/summary_kpis.parquet')
      const rows = await window.__wftdm!.query('SELECT total_households FROM "rangeincapabletest__x"')
      return JSON.parse(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
    })

    // No thrown error, and correct real data despite the incapable server —
    // the manual fallback, not DuckDB-WASM's own built-in one (confirmed
    // disabled, allowFullHTTPReads stays false), is what recovers this.
    expect(result).toEqual([{ total_households: '5000' }])
    expect(consoleWarnings.length).toBeGreaterThan(0)
    expect(consoleWarnings[0]).toContain('rangeincapabletest__x')
    expect(consoleWarnings[0]).toContain(`${realBytes.byteLength} bytes`)
  })

  test('a genuinely missing file still rejects — the fallback never silently swallows a real 404', async ({
    page,
  }) => {
    await boot(page)

    const result = await page.evaluate(async () => {
      try {
        await window.__wftdm!.registerFileURL(
          'missingfiletest__x',
          '/APP-wftdm-dashboard/demo-scenarios/does-not-exist-xyz-956.parquet',
        )
        await window.__wftdm!.query('SELECT 1 FROM "missingfiletest__x" LIMIT 1')
        return { threw: false }
      } catch (e) {
        return { threw: true, message: e instanceof Error ? e.message : String(e) }
      }
    })

    expect(result.threw).toBe(true)
  })
})
