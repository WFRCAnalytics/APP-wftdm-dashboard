// Minimal, hand-rolled cache-first service worker — DuckDB-WASM's own
// large, self-hosted, rarely-changing binaries only (the .wasm/.worker.js
// pair Vite emits for whichever bundle selectBundle() picks — mvp or eh —
// confirmed ~34-39MB combined per real build output). NOT related to, and
// does not replace, coi-serviceworker.js (removed — it existed only for
// COOP/COEP cross-origin isolation, confirmed unused: no SharedArrayBuffer,
// no threaded DuckDB bundle configured anywhere in this app).
//
// Why this exists at all, despite GitHub Pages' own Cache-Control:
// max-age=600 already covering same-session revisits, AND GitHub Pages
// already supporting conditional revalidation (a real, confirmed ETag on
// every response — a revisit just past 10 minutes costs one cheap 304
// round trip, not a re-download): the real gap is a revisit far enough
// apart (days/weeks — this app's own real expected usage pattern, a WFRC
// planner, not a within-minutes return) that the BROWSER'S OWN regular
// HTTP cache entry may have been evicted entirely under normal storage
// pressure, leaving no validator to revalidate against — forcing a genuine
// full re-fetch of the whole bundle. The Cache Storage API this worker
// uses is a separate, developer-managed store that does NOT honor or
// expire against HTTP Cache-Control headers at all (confirmed directly via
// MDN: "The caching API doesn't honor HTTP caching headers" — entries
// persist until explicitly deleted or the origin's own storage quota is
// exceeded), so it survives exactly the case the browser's regular HTTP
// cache doesn't reliably survive.
//
// Deliberately NOT a header-injection service worker (that's what
// coi-serviceworker.js was, and why removing it also removed a real,
// confirmed double-reload on every fresh visit: injecting headers onto the
// DOCUMENT response itself only works if the worker was already
// controlling the page BEFORE that navigation started, forcing a reload to
// activate). This worker never touches the document response — only later
// sub-resource fetches for the four target files — so no such reload is
// needed here; confirmed directly against Chrome's own Workbox
// documentation AND live testing (fresh-profile Playwright runs, 1
// navigation/1 load event, every time): a cache-first-only worker's
// first-ever page load is served from network before the worker is even
// installed, and it begins intercepting matching requests on subsequent
// requests/reloads with no explicit reload call anywhere in this file.
//
// Content-hashed filenames (Vite's own standard output naming — confirmed
// via this project's own real build output, e.g.
// "duckdb-eh-9ubY-jlA.wasm") make this safe with NO explicit cache
// versioning/invalidation logic: a version bump produces a URL this worker
// has never seen, which is simply cached fresh under its own new key — an
// old, no-longer-referenced entry is just dead weight in the named cache
// below, never served incorrectly, since nothing ever requests it again.
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

// Matches only the two possible DuckDB-WASM binary pairs (mvp/eh) this
// app's own vite.config.ts ?url-imports — never a Parquet file, never app
// JS/CSS, never anything scenario-specific. Deliberately narrow: this
// worker's entire purpose is these few large, immutable binaries, not a
// general-purpose app cache.
const CACHEABLE_PATTERN = /\/duckdb-(?:mvp|eh)-[\w-]+\.wasm$|\/duckdb-browser-(?:mvp|eh)\.worker-[\w-]+\.js$/

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !CACHEABLE_PATTERN.test(request.url)) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached

      // Cache miss: an ordinary network fetch, returned byte-identical to
      // what a request with no service worker at all would have produced
      // — cache.put() only ever sees a clone, never alters the response
      // this handler actually returns.
      const response = await fetch(request)
      if (response.ok) {
        cache.put(request, response.clone())
      }
      return response
    }),
  )
})
