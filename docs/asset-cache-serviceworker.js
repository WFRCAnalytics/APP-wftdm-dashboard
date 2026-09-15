// Minimal, hand-rolled service worker — two related but distinct caching
// strategies, both existing to close the same real gap: GitHub Pages' own
// Cache-Control: max-age=600 and conditional revalidation already cover a
// same-session revisit; the real gap is a revisit far enough apart
// (days/weeks — this app's own real expected usage pattern, a WFRC
// planner, not a within-minutes return) that the BROWSER'S OWN regular
// HTTP cache entry may have been evicted entirely under normal storage
// pressure, leaving no validator to revalidate against — forcing a genuine
// full re-fetch. The Cache Storage API this worker uses is a separate,
// developer-managed store that does NOT honor or expire against HTTP
// Cache-Control headers at all (confirmed directly via MDN: "The caching
// API doesn't honor HTTP caching headers" — entries persist until
// explicitly deleted or the origin's own storage quota is exceeded), so it
// survives exactly the case the browser's regular HTTP cache doesn't
// reliably survive. NOT related to, and does not replace,
// coi-serviceworker.js (removed — it existed only for COOP/COEP
// cross-origin isolation, confirmed unused).
//
// Deliberately NOT a header-injection service worker (that's what
// coi-serviceworker.js was, and why removing it also removed a real,
// confirmed double-reload on every fresh visit: injecting headers onto the
// DOCUMENT response itself only works if the worker was already
// controlling the page BEFORE that navigation started, forcing a reload to
// activate). This worker never touches the document response — only later
// sub-resource fetches for the target files below — so no such reload is
// needed here; confirmed directly against Chrome's own Workbox
// documentation AND live testing (fresh-profile Playwright runs, 1
// navigation/1 load event, every time): a cache-first-only worker's
// first-ever page load is served from network before the worker is even
// installed, and it begins intercepting matching requests on subsequent
// requests/reloads with no explicit reload call anywhere in this file.
//
// A real, confirmed verification-methodology gotcha found while testing
// this: Playwright's page.on('request')/('response') fire for EVERY
// request the PAGE makes, including one this worker fully satisfies from
// Cache Storage with zero real network activity — they do not by
// themselves distinguish a true cache hit from a real fetch. The correct
// signal, confirmed directly: response.fromServiceWorker() (true once
// this worker is controlling and handled the request) combined with
// request.serviceWorker() on any request THIS worker itself issues
// internally (null unless the worker's own fallback fetch() call below
// actually ran) — only when the latter is null AND the former is true is
// it a genuine cache hit, not a network round trip the worker happened to
// intermediate. A first draft of this file also added `{ ignoreVary: true
// }` to cache.match() below, believing (from the flawed, page-event-only
// signal) that a real `Vary: Origin` header on this app's own responses
// was causing permanent cache misses — re-tested with the correct signal
// above and confirmed that was never true: plain cache.match(request), no
// options, matches correctly every time from the second visit onward.
const CACHE_NAME = 'wftdm-duckdb-assets-v1'

// Strategy 1 — cache-first, no revalidation, ever. Safe ONLY because these
// are the two possible DuckDB-WASM binary pairs (mvp/eh) this app's own
// vite.config.ts ?url-imports: Vite's own standard output naming
// (confirmed via this project's own real build output, e.g.
// "duckdb-eh-9ubY-jlA.wasm") means a real content change always produces a
// NEW url — this pattern is never asked to reconcile "same URL, different
// bytes" at all. An old, no-longer-referenced entry is just dead weight in
// the cache below, never served incorrectly, since nothing ever requests
// it again.
const IMMUTABLE_PATTERN = /\/duckdb-(?:mvp|eh)-[\w-]+\.wasm$|\/duckdb-browser-(?:mvp|eh)\.worker-[\w-]+\.js$/

// Strategy 2 — cache, but validated on every request. The real demo
// Parquet/GeoParquet files (public/demo-scenarios/, public/demo-geometry/)
// are exactly the case the pattern above is NOT safe for: their filenames
// are STABLE, never hash-versioned (e.g.
// "activitysim-baseline__summary_kpis" — really
// ".../demo-scenarios/activitysim-baseline/summary/summary_kpis.parquet"
// on the wire), because they're published by re-running the post-processor
// against updated model output, not rebuilt by Vite. A pure cache-first
// rule on these would risk silently serving stale data forever the moment
// a real model re-run changes a file's content at the same URL — the
// worker has no way to know the bytes it's holding are wrong, since
// nothing about the URL itself would ever change. See handleValidated()
// below for the real fix: every cache hit is revalidated against the live
// server via a conditional GET (If-None-Match/If-Modified-Since) before
// being trusted, so a real content change is always caught, and a genuine
// 304 (unchanged) still avoids re-transferring the file's body — cheap
// insurance, not a full re-fetch every time.
//
// Scoped to exactly the two real, git-tracked, non-fixture content roots
// (confirmed via CLAUDE.md's own config-file-set section) — never
// public/scenarios/public/observed/public/dashboard-config, which are all
// gitignored, ephemeral, fixture-populated-only paths this worker has no
// business caching at all.
const VALIDATED_PATTERN = /\/demo-scenarios\/[^/]+\/summary\/[^/]+\.parquet$|\/demo-geometry\/[^/]+\.geoparquet$/

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (IMMUTABLE_PATTERN.test(request.url)) {
    event.respondWith(handleImmutable(request))
    return
  }

  // A Range-bearing GET against a matching URL is DuckDB-WASM's own
  // internal range-probing attempt (services/duckdb.ts's registerFileURL()
  // path — confirmed real and, on this app's own GitHub Pages deployment,
  // confirmed to fail due to a real, separate, already-documented Fastly
  // CDN bug: Range + gzip negotiation together corrupt byte offsets
  // against the compressed representation, not the logical file — see
  // project-docs/PIPELINE.md). That failure is what triggers the app's own
  // registerFileURLViaFullFetch() fallback, a plain, non-Range fetch() —
  // THAT is the request this worker's caching is meant to accelerate.
  // Serving a cached FULL 200 response in place of an expected 206 Partial
  // Content here would hand DuckDB-WASM's own range-detection logic a
  // response shape it never asked for and doesn't expect — left
  // completely untouched, passing straight to the network exactly as it
  // would with no service worker installed at all.
  if (VALIDATED_PATTERN.test(request.url) && !request.headers.has('Range')) {
    event.respondWith(handleValidated(request))
  }
})

async function handleImmutable(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  // Cache miss: an ordinary network fetch, returned byte-identical to
  // what a request with no service worker at all would have produced —
  // cache.put() only ever sees a clone, never alters the response this
  // handler actually returns.
  const response = await fetch(request)
  if (response.ok) {
    cache.put(request, response.clone())
  }
  return response
}

/**
 * Cache-then-validate: a cache hit is never trusted outright — it's
 * revalidated against the live server via a conditional GET on every
 * request, using whichever validator the cached response actually carries
 * (ETag preferred, Last-Modified as a fallback — GitHub Pages sends both
 * on every real response, confirmed directly, so the "neither present"
 * branch below is defensive-only, not expected to fire in practice).
 *
 * `cache: 'no-store'` on the revalidation fetch is deliberate — this must
 * be a REAL round trip to the live server, not something the browser's
 * own HTTP cache could short-circuit back to us unasked.
 *
 * A genuine 304 Not Modified (no body — confirmed directly via curl
 * against the real deployed origin before writing this) means the cached
 * bytes are still correct: return them, no re-transfer needed. A real 200
 * means the content actually changed at this same URL — exactly the case
 * this whole strategy exists to catch — cache the new response and return
 * it, never the stale one. A network failure (offline) or a real server
 * error falls back to the cache rather than breaking an otherwise-working
 * experience over a transient problem; the cached copy was correct as of
 * its own last successful validation.
 */
async function handleValidated(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  if (!cached) {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  }

  const etag = cached.headers.get('ETag')
  const lastModified = cached.headers.get('Last-Modified')
  if (!etag && !lastModified) {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  }

  const revalidateHeaders = new Headers()
  if (etag) revalidateHeaders.set('If-None-Match', etag)
  else revalidateHeaders.set('If-Modified-Since', lastModified)

  let networkResponse
  try {
    networkResponse = await fetch(request.url, {
      headers: revalidateHeaders,
      cache: 'no-store',
      credentials: request.credentials,
      mode: request.mode === 'navigate' ? 'same-origin' : request.mode,
    })
  } catch {
    return cached
  }

  if (networkResponse.status === 304) return cached
  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone())
    return networkResponse
  }
  return cached
}
