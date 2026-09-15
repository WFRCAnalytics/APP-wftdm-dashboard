import { readFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Follow-up to asset-cache-serviceworker.js's own real, confirmed
// investigation this session: public/demo-scenarios/public/demo-geometry
// Parquet/GeoParquet filenames are STABLE (never hash-versioned, unlike the
// DuckDB-WASM binaries that file's own IMMUTABLE_PATTERN already covers) —
// a real model re-run can change a file's bytes at the exact same URL. This
// spec proves the VALIDATED_PATTERN strategy (cache, but revalidate via a
// conditional GET on every hit) actually behaves correctly: caches on first
// fetch, serves from cache when the live server confirms nothing changed
// (a real 304), and — the case that actually matters here — re-fetches and
// updates the cache the moment the live server reports the content really
// did change, rather than serving stale data forever.
//
// A REAL local HTTP server is used as the mock origin, NOT page.route() —
// a real, confirmed limitation found while writing this spec (Playwright's
// own docs, quoted directly): once a service worker is active and
// controlling, its OWN internal fetch() calls (exactly what
// handleValidated() below issues for revalidation) become invisible to
// page.route()/context.route() entirely — "it adds its own Service Worker
// that takes over the network requests, hence making them invisible to
// browserContext.route() and page.route()." A real server is reached
// genuinely, sidestepping that gap outright. The mock is deliberately
// CROSS-ORIGIN (a separate localhost port) purely for test convenience —
// services/duckdb.ts's registerFileURL() accepts any absolute URL, so the
// real app (served normally by the shared dev server) can register a file
// living on this separate origin with no changes to app code. This makes
// the mock's own CORS exposure headers (Access-Control-Expose-Headers) a
// TEST-HARNESS-ONLY concern: the real production deployment serves
// demo-scenarios/demo-geometry from the exact same origin as the app
// itself, so ETag/Last-Modified are always fully visible there with no
// CORS involved at all.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REAL_BYTES_V1 = readFileSync(
  path.resolve(__dirname, '../../public/demo-scenarios/activitysim-baseline/summary/summary_kpis.parquet'),
)
const REAL_BYTES_V2 = readFileSync(
  path.resolve(__dirname, '../../public/demo-scenarios/activitysim-density-variant/summary/summary_kpis.parquet'),
)

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  await page.waitForSelector('h1:has-text("Summary")', { timeout: 15_000 })
}

interface MockOrigin {
  url: string
  requests: { method: string; ifNoneMatch: string | null; respondedStatus: number }[]
  setContent(etag: string, body: Buffer): void
  close(): Promise<void>
}

/**
 * A real local HTTP server standing in for the live origin — real
 * conditional-GET semantics (a matching If-None-Match gets a bare 304, a
 * mismatched one gets a full 200), matching what a real curl round-trip
 * against the live deployed site already confirmed GitHub Pages/Fastly
 * does correctly for this exact file before this feature was implemented.
 * No Range/Accept-Ranges handling at all — deliberately: this always looks
 * like a server DuckDB-WASM's own internal range detection gives up on
 * immediately, so every real request that reaches it is the app's own
 * plain, non-Range registerFileURLViaFullFetch() fallback
 * (duckdbHttpRangeReads.spec.ts's own "range-incapable server" test
 * already proves that fallback path works correctly on its own — this
 * spec is only testing the service worker layered in front of it).
 */
function startMockOrigin(initialBody: Buffer, initialEtag: string): Promise<MockOrigin> {
  let etag = initialEtag
  let body = initialBody
  const requests: MockOrigin['requests'] = []
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'ETag, Last-Modified, Content-Length',
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      // If-None-Match is not a CORS-safelisted request header, so a real
      // cross-origin revalidation request triggers a real preflight.
      res.writeHead(204, {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'If-None-Match, If-Modified-Since, Range',
      })
      res.end()
      return
    }

    const ifNoneMatch = req.headers['if-none-match'] ?? null
    if (ifNoneMatch === etag) {
      requests.push({ method: req.method ?? '', ifNoneMatch, respondedStatus: 304 })
      res.writeHead(304, { ...corsHeaders, ETag: etag })
      res.end()
      return
    }

    requests.push({ method: req.method ?? '', ifNoneMatch, respondedStatus: 200 })
    res.writeHead(200, {
      ...corsHeaders,
      'Content-Type': 'application/octet-stream',
      ETag: etag,
      'Last-Modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
      'Content-Length': String(body.byteLength),
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(body)
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}/demo-scenarios/sw-cache-test/summary/summary_kpis.parquet`,
        requests,
        setContent(newEtag, newBody) {
          etag = newEtag
          body = newBody
        },
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

// total_vmt, not total_households — a real, confirmed finding while
// writing this test: total_households (5000) and total_persons (8212) are
// IDENTICAL between these two real scenario files (the density variant
// only raises TAZ 1 employment, never touching regional household/person
// counts) — checked directly before picking a column, not assumed.
// total_vmt genuinely differs (15212.34... vs 15293.18...), a real
// consequence of the density variant's own different destination choices.
async function queryTotalVmt(page: Page, viewName: string, url: string): Promise<number> {
  return page.evaluate(
    async ({ viewName, url }) => {
      await window.__wftdm!.registerFileURL(viewName, url)
      const rows = await window.__wftdm!.query(`SELECT total_vmt FROM "${viewName}"`)
      return Number(rows[0].total_vmt)
    },
    { viewName, url },
  )
}

test.describe('asset-cache-serviceworker.js — validated caching for stable-filename Parquet/GeoParquet data', () => {
  test('first visit fetches and caches; second visit serves from cache after a real 304 validation; a genuine content change is detected and re-fetched', async ({
    page,
  }) => {
    const origin = await startMockOrigin(REAL_BYTES_V1, '"sw-test-v1"')

    try {
      // --- Visit 1: cold. No service worker controlling this load yet
      // (055's own already-documented finding: a worker's first-ever
      // install happens during, not before, the page that triggers it) —
      // the fetch goes straight to the mock origin. ---
      await boot(page)
      const value1 = await queryTotalVmt(page, 'swcache__v1', origin.url)
      expect(value1).toBeCloseTo(15212.34007752122, 2) // real, confirmed baseline value
      expect(origin.requests.length).toBeGreaterThan(0)
      expect(origin.requests[origin.requests.length - 1].respondedStatus).toBe(200)

      // Give the worker a moment to finish installing/activating/claiming —
      // clients.claim() in the 'activate' handler is what lets it take
      // control mid-session, not only on the next navigation.
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 })

      const requestsBeforeVisit2 = origin.requests.length

      // --- Visit 2: same profile, a real reload — this is the "returning
      // visitor" case the whole worker exists for. The service worker is
      // now controlling: real fetches for this URL are intercepted, and
      // the Cache Storage entry from visit 1 exists. ---
      // Filtered to GET only — DuckDB-WASM's own HEAD probe (see below)
      // also resolves to a response for this same URL and isn't what this
      // test cares about. A real, confirmed finding made while writing
      // this test: unlike the two-event model this file's own header
      // comment describes for the IMMUTABLE strategy (an outer page-
      // visible response plus a separately observable SW-internal fetch,
      // distinguished via request.serviceWorker()), a validated cache hit
      // produces exactly ONE page-visible response event — status 200 (the
      // cached body handleValidated() ultimately returns), fromSW true.
      // The internal conditional-GET/304 exchange never surfaces as its
      // own event at all; it's entirely internal to the worker's own
      // script. The mock origin's own request log below is therefore the
      // real, definitive proof that a genuine revalidation round trip
      // happened (not a blind, unvalidated cache trust) — not a second
      // page-level response event, which doesn't exist for this strategy.
      const responseLog: { fromSW: boolean; status: number }[] = []
      page.on('response', (res) => {
        if (!res.url().endsWith('/sw-cache-test/summary/summary_kpis.parquet')) return
        if (res.request().method() !== 'GET') return
        responseLog.push({ fromSW: res.fromServiceWorker(), status: res.status() })
      })

      await boot(page)
      const value2 = await queryTotalVmt(page, 'swcache__v2', origin.url)
      expect(value2).toBeCloseTo(15212.34007752122, 2) // same real content, correctly served

      // The mock origin sees two requests per real visit, not one — a real,
      // confirmed distinction found while writing this test, not assumed:
      // DuckDB-WASM's own internal reliableHeadRequests probe always issues
      // a HEAD first, method !== 'GET', so both this worker's existing
      // IMMUTABLE_PATTERN handler and the new VALIDATED_PATTERN one bail
      // out immediately for it (`if (request.method !== 'GET') return`) —
      // it always reaches the network directly, uncached, by design (a
      // bodyless HEAD has nothing worth caching). The actual GET — the one
      // this feature exists to accelerate — is the one that matters here:
      // it carried the real If-None-Match from the cached response and got
      // a genuine 304 back (unchanged content), never a silent zero-network
      // cache hit the way the immutable WASM strategy is.
      const newRequests = origin.requests.slice(requestsBeforeVisit2)
      expect(newRequests.filter((r) => r.method === 'HEAD').length).toBe(1)
      const revalidationGets = newRequests.filter((r) => r.method === 'GET')
      expect(revalidationGets.length).toBe(1)
      expect(revalidationGets[0].ifNoneMatch).toBe('"sw-test-v1"')
      expect(revalidationGets[0].respondedStatus).toBe(304)

      // The outer, page-observed response for this URL was satisfied by
      // the service worker (fromServiceWorker() true) — the correct,
      // established signal this file's own header comment describes for
      // distinguishing a worker-handled response from an ordinary network
      // one. Its status is 200 (the cached body), not 304 — the 304 is an
      // internal detail of how the worker decided to trust that cached
      // body, never something the page itself sees.
      expect(responseLog.length).toBe(1)
      expect(responseLog[0].fromSW).toBe(true)
      expect(responseLog[0].status).toBe(200)

      // --- Visit 3: the real content at this same stable URL genuinely
      // changes server-side (a real model re-run) — the exact case a pure
      // cache-first strategy would get permanently wrong. ---
      origin.setContent('"sw-test-v2"', REAL_BYTES_V2)
      const requestsBeforeVisit3 = origin.requests.length

      await boot(page)
      const value3 = await queryTotalVmt(page, 'swcache__v3', origin.url)

      // Real, different data — the whole point of this test. Not a
      // hardcoded second magic number (this app's own real demo content
      // can legitimately be regenerated) — just genuinely different from
      // the real, known-cached value.
      expect(value3).not.toBe(value1)
      expect(Number.isFinite(value3)).toBe(true)

      const visit3Gets = origin.requests.slice(requestsBeforeVisit3).filter((r) => r.method === 'GET')
      expect(visit3Gets.length).toBe(1)
      // The conditional GET still carried the OLD (now-stale) ETag from
      // the cache — proving the worker genuinely asked before trusting it
      // — and the live server correctly said "no, that's not current
      // anymore" via a real 200, not a 304.
      expect(visit3Gets[0].ifNoneMatch).toBe('"sw-test-v1"')
      expect(visit3Gets[0].respondedStatus).toBe(200)

      // --- Visit 4: confirm the NEW content is now what's cached (the
      // updated cache entry sticks, this isn't a one-time fluke). ---
      const requestsBeforeVisit4 = origin.requests.length
      await boot(page)
      const value4 = await queryTotalVmt(page, 'swcache__v4', origin.url)
      expect(value4).toBe(value3)
      const visit4Gets = origin.requests.slice(requestsBeforeVisit4).filter((r) => r.method === 'GET')
      expect(visit4Gets.length).toBe(1)
      expect(visit4Gets[0].ifNoneMatch).toBe('"sw-test-v2"')
      expect(visit4Gets[0].respondedStatus).toBe(304)
    } finally {
      await origin.close()
    }
  })

  test('installing/activating the worker never forces an extra navigation or reload — same standard as the existing IMMUTABLE_PATTERN verification', async ({
    page,
  }) => {
    const origin = await startMockOrigin(REAL_BYTES_V1, '"sw-test-v1"')

    try {
      let navigations = 0
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations += 1
      })

      await boot(page)
      await queryTotalVmt(page, 'swcache__reloadcheck', origin.url)
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 })

      // Exactly the one real navigation this test itself performed — no
      // worker-triggered reload snuck in (the real, confirmed regression
      // class coi-serviceworker.js caused and this worker's own header
      // comment documents avoiding by construction: never touching the
      // document response itself).
      expect(navigations).toBe(1)
    } finally {
      await origin.close()
    }
  })
})
